# Plan — Pré-agregação de relatórios — v3 (final)

> **Spec:** `docs/superpowers/specs/2026-04-30-pre-agregacao-design.md`
> **Versão de release:** v0.8.0 (release de infraestrutura, sem novos relatórios)
> **Modo de execução:** `superpowers:subagent-driven-development` — cada task em subagent fresh, com TDD onde cabe (`superpowers:test-driven-development`).
> **Estado anterior:** v0.7.0 em produção. Hotfix Bad Gateway (commit ecbc3c4) já deployado.

---

## Histórico (v1 → v2 → v3)

- **v1:** lista linear de 22 tasks, granularidade alta.
- **Pente fino #1:** identificadas dependências e ordem que estavam erradas (worker antes da migration), tasks sem critério de aceite, migrações de relatório agrupadas demais. Algumas tasks eram trabalho >1h (ruim para subagent fresh).
- **v2:** reorganizado em 6 marcos lógicos com dependências explícitas. Cada task tem: (a) escopo, (b) arquivos tocados, (c) critério de aceite, (d) testes a escrever, (e) tempo estimado. Tasks de migração de relatório quebradas em 4 PRs lógicos (visão geral, equipe, distribuição, origem).
- **Pente fino #2:**
  1. Faltava task explícita para gerar Prisma client após migration (afeta builds subsequentes).
  2. UI de jobs em /configuracoes precisa de RBAC (super_admin only); estava implícito.
  3. Job `housekeeping-old-buckets` precisa rodar **antes** do backfill, senão pode estourar disco.
  4. SSE de invalidação só faz sentido depois de pelo menos 1 relatório migrado — reordenado.
  5. "Smoke test em produção" estava no fim — adicionado smoke test intermediário após cada marco.
  6. Faltava critério "ausência de Bad Gateway por 24h" pré e pós-migração para demonstrar que o objetivo foi atingido.
  7. Tasks de "atualizar docs" estavam no fim; devem ser **continuamente atualizadas** durante a execução, não só no fim — revertido para 1 task final consolidada **mas** cada task de implementação tem entry no CHANGELOG drafted no momento.
- **v3:** versão consolidada para execução autônoma.

---

## Marcos

| # | Marco | Tasks | Bloqueado por |
|---|-------|-------|---------------|
| **M1** | **Schema + leitura** — tabelas vazias no banco interno + camada `facts.ts` lendo delas | T1, T2 | (nada) |
| **M2** | **Jobs de refresh** — 4 queues + worker funcional + invocação manual via UI | T3, T4, T5, T6, T7 | M1 |
| **M3** | **Backfill** — popular 90 dias de histórico em produção | T8 | M2 |
| **M4** | **Migração de relatórios** — 8 relatórios passando a ler de `facts.*` | T9, T10, T11, T12 | M3 |
| **M5** | **SSE + freshness UI** — invalidação em tempo "quase real" + badge | T13, T14 | M4 |
| **M6** | **Encerramento** — health check, UI de jobs, docs, deploy, smoke test 24h | T15, T16, T17 | M5 |

---

## Tasks

### M1 — Schema + leitura

#### T1 — Migration Prisma das tabelas de facts

- **Escopo:** criar 6 tabelas (§3 da spec) via Prisma migration; gerar client.
- **Arquivos:**
  - `prisma/schema.prisma` — adicionar 6 models: `ChatwootFactsDailyByAccount`, `ChatwootFactsDailyByInbox`, `ChatwootFactsDailyByAgent`, `ChatwootFactsDailyByTeam`, `ChatwootFactsHourlyByAccount`, `ChatwootFactsMeta`.
  - `prisma/migrations/<timestamp>_pre_agregacao/migration.sql` (gerada).
  - `src/generated/prisma/*` (regenerada).
- **Critério de aceite:**
  - `npx prisma migrate dev --name pre_agregacao` roda sem erro.
  - `prisma generate` roda sem erro.
  - `npm run typecheck` passa.
  - Tabelas existem com índices corretos (PK + idx em `(account_id, bucket_date DESC)`).
- **Testes:** smoke test manual via `psql`.
- **Tempo:** ~30 min.

#### T2 — Camada de leitura `src/lib/chatwoot/facts.ts`

- **Escopo:** funções `readFactsDaily`, `readFactsHourly`, `readFactsMeta` (assinaturas em §6.1 da spec).
- **Arquivos:**
  - `src/lib/chatwoot/facts.ts` (novo).
  - `src/lib/chatwoot/__tests__/facts.test.ts` (novo, TDD).
- **Critério de aceite:**
  - Funções retornam tipos tipados.
  - Filtros de período/dimensão validados via Zod.
  - Suporte a `excludeMatrixIA` em runtime (subtrai inbox 31 do total).
- **Testes:**
  - `readFactsDaily` retorna soma correta com mock de `pgPool.query`.
  - `readFactsDaily` aplica `excludeMatrixIA` corretamente.
  - `readFactsHourly` ordena por (date, hour) ASC.
  - `readFactsMeta` calcula `lagSeconds` corretamente.
- **Tempo:** ~1h.

---

### M2 — Jobs de refresh

#### T3 — Job `refresh-by-account` + util compartilhado

- **Escopo:** primeiro dos 4 jobs de pré-agregação (template para os outros).
- **Arquivos:**
  - `src/worker/jobs/pre-agregacao/refresh-by-account.ts` (novo).
  - `src/worker/jobs/pre-agregacao/shared.ts` (novo) — helpers comuns: `getAccountsToRefresh()`, `withMetaUpdate()`, `rollingDays(7)`.
  - `src/worker/jobs/pre-agregacao/__tests__/refresh-by-account.test.ts` (novo).
  - `src/lib/queue.ts` — registrar nova queue `refresh-by-account`.
- **SQL:** uma INSERT...ON CONFLICT por dia, agregando do Chatwoot e gravando em `chatwoot_facts_daily_by_account` + `chatwoot_facts_hourly_by_account`.
- **Critério de aceite:**
  - Para cada account ativa (descobre via `UserAccountAccess` distinct), calcula 7 dias rolling.
  - Atualiza `chatwoot_facts_meta` ao final (success ou failure).
  - Em caso de erro, `last_error` populado, mas job não levanta exceção (BullMQ retry cuida).
  - Statement_timeout 60s.
- **Testes:**
  - upsert idempotente (rodar 2x dá mesmo resultado).
  - falha em 1 account não afeta outras.
  - meta atualizado em ambos os caminhos.
- **Tempo:** ~2h.

#### T4 — Jobs `refresh-by-inbox` e `refresh-by-team`

- **Escopo:** ambos seguem o mesmo padrão de T3, com SQL agrupando adicionalmente por `inbox_id`/`team_id`.
- **Arquivos:**
  - `src/worker/jobs/pre-agregacao/refresh-by-inbox.ts` + tests.
  - `src/worker/jobs/pre-agregacao/refresh-by-team.ts` + tests.
  - `src/lib/queue.ts` — 2 queues novas.
- **Critério de aceite:** idênticos a T3, com dimensão extra na PK.
- **Testes:** mesmos cenários.
- **Tempo:** ~1h30 (compartilha shared.ts).

#### T5 — Job `refresh-by-agent`

- **Escopo:** mesmo padrão; agrupa por `assignee_id` (nullable — NULL vira `agent_id=0` placeholder OU é descartado; **decisão: descartar**, ranking não inclui órfãs).
- **Arquivos:**
  - `src/worker/jobs/pre-agregacao/refresh-by-agent.ts` + tests.
  - `src/lib/queue.ts` — 1 queue nova.
- **Critério de aceite:** idem T3; órfãs (assignee_id NULL) excluídas da agregação por agente, mas contadas no `by_account`.
- **Tempo:** ~45 min.

#### T6 — Job `housekeeping-old-buckets`

- **Escopo:** delete em `chatwoot_facts_*` para `bucket_date < CURRENT_DATE - retention_days`.
- **Arquivos:**
  - `src/worker/jobs/pre-agregacao/housekeeping.ts` + tests.
  - `src/lib/queue.ts` — usar queue existente `housekeeping`.
- **Critério de aceite:**
  - Lê `audit.retention_days` da `app_settings` (default 90).
  - DELETE em batch.
  - Loga `[housekeeping] deleted N rows from facts_*`.
- **Tempo:** ~30 min.

#### T7 — Worker registra todos os jobs + cron schedules

- **Escopo:** `src/worker/index.ts` cria os Workers e registra **repeatable jobs** (BullMQ `addBulk` com `repeat`).
- **Arquivos:**
  - `src/worker/index.ts` — adicionar workers e schedules.
  - Atualizar `src/lib/queue.ts` se faltou algo.
- **Critério de aceite:**
  - 5 workers ativos: `refresh-by-account`, `refresh-by-inbox`, `refresh-by-agent`, `refresh-by-team`, `housekeeping`.
  - Cron schedule:
    - `refresh-by-*` — a cada 5 min (cron `*/5 * * * *`).
    - `housekeeping` — diariamente às 03:00 (cron `0 3 * * *`).
  - Logs ao startup mostram lista completa.
  - Graceful shutdown fecha todos os workers.
- **Testes:** smoke test local rodando worker com Redis local (sem Chatwoot real, com pool mockado).
- **Tempo:** ~1h.

---

### M3 — Backfill

#### T8 — Script de backfill + UI superficial

- **Escopo:**
  - Script `src/worker/scripts/backfill.ts` que enfileira jobs com `--days=N` por account.
  - Página `/configuracoes/jobs` (super_admin only) com botões "Backfill 90 dias" e "Rodar agora" para cada job.
- **Arquivos:**
  - `src/worker/scripts/backfill.ts` (novo).
  - `src/app/(protected)/configuracoes/jobs/page.tsx` (novo).
  - `src/components/settings/jobs-panel.tsx` (novo).
  - `src/lib/actions/jobs.ts` (novo) — Server Actions para enfileirar manualmente.
- **Critério de aceite:**
  - UI restrita a `platformRole=super_admin`.
  - Botões mostram último resultado (sucesso/falha + lag).
  - Ao clicar, enfileira job com timestamp e mostra toast.
  - Backfill não bloqueia: enfileira N jobs (1 por dia) com prioridade baixa.
  - **UI obrigatoriamente passa pela skill `ui-ux-pro-max:ui-ux-pro-max`** antes da implementação.
- **Tempo:** ~2h.

---

### M4 — Migração de relatórios

> Cada subtask abaixo segue o mesmo template: (1) ler do `facts.*` em vez do Chatwoot pool, (2) manter o `withCache` com TTL menor (60s), (3) adicionar smoke test "dado vs estado anterior", (4) regression test para garantir que filtros continuam funcionando.

#### T9 — Migrar relatórios de visão geral

- **Escopo:** `home-summary`, `dashboard-data`, `dashboard-kpis`, `status-distribution`.
- **Arquivos:**
  - `src/lib/chatwoot/queries/home-summary.ts` — refatorar para usar `readFactsHourly` + `readFactsDaily` para os 5 KPIs (mantém `reporting_events` para p50 24h).
  - `src/lib/chatwoot/queries/dashboard-data.ts` — refatorar para usar `readFactsDaily` em todas as agregações; `recent` continua direto no Chatwoot.
  - `src/lib/chatwoot/queries/dashboard-kpis.ts` — totalmente sobre `readFactsDaily`.
  - `src/lib/chatwoot/queries/status-distribution.ts` — sobre `readFactsDaily` (sums por status).
  - Tests atualizados.
- **Critério de aceite:**
  - Outputs idênticos aos da versão atual (smoke test).
  - Latência local (cache hit) < 50ms.
  - Filtros existentes continuam funcionando.
- **Tempo:** ~3h.

#### T10 — Migrar relatórios de equipe

- **Escopo:** `ranking-atendentes`, `por-departamento`, `tempos-resposta`.
- **Arquivos:**
  - `src/lib/chatwoot/queries/ranking-atendentes.ts` — `readFactsDaily` filtrado por agent.
  - `src/lib/chatwoot/queries/por-departamento.ts` — `readFactsDaily` filtrado por team.
  - `src/lib/chatwoot/queries/tempos-resposta.ts` — `readFactsDaily` (já tem p50/p90 gravados).
- **Tempo:** ~2h.

#### T11 — Migrar relatórios de distribuição e origem

- **Escopo:** `volumetria-dow`, `volumetria-heatmap`, `leads-recebidos`, `matrix-ia`.
- **Arquivos:**
  - `src/lib/chatwoot/queries/volumetria-dow.ts` — group by extract(dow from bucket_date).
  - `src/lib/chatwoot/queries/volumetria-heatmap.ts` — `readFactsHourly` com pivot dow × hour.
  - `src/lib/chatwoot/queries/leads-recebidos.ts` — `readFactsDaily` (filtro por referrer ainda on-demand para um sub-detalhe).
  - `src/lib/chatwoot/queries/matrix-ia.ts` — `readFactsDaily` filtrado por inbox 31.
- **Tempo:** ~2h.

#### T12 — Confirmar relatórios on-demand mantidos

- **Escopo:** revisar `dashboard-drill-down`, `por-estado`, `mensagens-nao-respondidas`, `conversas-list` — confirmar que TTL do `withCache` continua adequado (30–60s) e adicionar comentário explicando por que não foram pré-agregados.
- **Arquivos:** os 4 acima.
- **Critério de aceite:** comentário em cada arquivo explicando "ON-DEMAND: motivo X".
- **Tempo:** ~30 min.

---

### M5 — SSE + freshness UI

#### T13 — SSE de invalidação

- **Escopo:** worker publica evento ao terminar cada job; frontend escuta e refresca.
- **Arquivos:**
  - `src/lib/realtime.ts` — adicionar tipo `facts:refreshed`.
  - `src/worker/jobs/pre-agregacao/shared.ts` — após commit do refresh, `publishRealtimeEvent({ type: "facts:refreshed", ... })`.
  - `src/components/realtime/use-realtime.ts` (existe? se não, criar) — hook para escutar e disparar `router.refresh()` dos relatórios da dimensão.
  - Cada layout de relatório do M4 usa o hook.
- **Critério de aceite:**
  - Após job rodar, dashboard atualiza sem refresh manual em <2s.
  - Toggle SSE em /configuracoes (`realtime.sse_enabled`) controla se o hook é ativado.
- **Tempo:** ~2h.

#### T14 — Componente `<FactsFreshness />`

- **Escopo:** badge "Atualizado há X min" com cor (verde / amarelo / vermelho) no header de cada relatório migrado.
- **Arquivos:**
  - `src/components/reports/facts-freshness.tsx` (novo).
  - Layouts dos relatórios — adicionar no header.
- **Critério de aceite:**
  - Lê `lastRefreshAt` do `readFactsMeta`.
  - Cores: verde (<10min), amarelo (10–30min), vermelho (>30min) + toast.
  - Tooltip ao hover: "Última agregação: HH:MM" + botão "Atualizar agora" (só super_admin).
  - **UI obrigatoriamente passa pela skill `ui-ux-pro-max:ui-ux-pro-max`**.
- **Tempo:** ~2h.

---

### M6 — Encerramento

#### T15 — `/api/health` estendido + UI de jobs final

- **Escopo:** já implementadas em T7 e T8 — esta task só estende `/api/health` com seção `chatwoot_facts` e finaliza a UI de jobs com poll de 5s.
- **Arquivos:**
  - `src/app/api/health/route.ts` — adicionar bloco `chatwoot_facts`.
  - `src/components/settings/jobs-panel.tsx` — poll de status.
- **Tempo:** ~1h.

#### T16 — Verification + Code review

- **Escopo:**
  - `superpowers:verification-before-completion` — rodar typecheck, lint (warnings ok), `npm test`, build local.
  - `superpowers:requesting-code-review` — review das mudanças desde v0.7.0.
- **Critério de aceite:**
  - Typecheck verde.
  - Tests verdes (incluindo novos).
  - Build local sem erro.
  - Code review sem blockers.
- **Tempo:** ~1h.

#### T17 — Docs + bump versão + deploy + smoke test

- **Escopo:**
  - `CHANGELOG.md` — entrada v0.8.0.
  - `docs/STATUS.md` — atualizar versão atual + lista de relatórios migrados.
  - `CLAUDE.md` — adicionar seção "Pré-agregação" no padrão arquitetural.
  - `docs/runbooks/pre-agregacao.md` (novo) — operação, troubleshooting, backfill.
  - `package.json` → version "0.8.0".
  - `.env.production` → `APP_VERSION=v0.8.0`.
  - Memória do projeto (`memory/`) — `project_v0.8.0_release.md` + atualizar `MEMORY.md`.
  - Commit + push → CI/CD redeploy.
  - Backfill manual em produção (super_admin click).
  - Smoke test: abrir cada relatório migrado, verificar latência + freshness badge.
  - Monitorar produção por 1h+: ausência de Bad Gateway, lag < 10min em todas as dimensões.
- **Tempo:** ~2h.

---

## Resumo de tempo

| Marco | Tempo estimado |
|-------|----------------|
| M1    | ~1h30          |
| M2    | ~5h            |
| M3    | ~2h            |
| M4    | ~7h30          |
| M5    | ~4h            |
| M6    | ~4h            |
| **Total** | **~24h**     |

Tempo real depende da estabilidade do Chatwoot DB durante o backfill e da pertinência dos índices existentes lá.

---

## Critérios de pronto (consolidados)

- [ ] M1 → 6 tabelas existem em produção, `facts.ts` com testes verdes.
- [ ] M2 → 5 workers rodando 24/7, schedules ativos, logs limpos.
- [ ] M3 → 90 dias × 2 contas backfilled; `facts_meta` populado.
- [ ] M4 → 8 relatórios lendo de `facts.*`; outputs idênticos ao baseline.
- [ ] M5 → SSE entrega evento em <2s; badge presente em todos os 8.
- [ ] M6 → docs/memória/CHANGELOG/versão atualizados; produção 24h sem Bad Gateway; lag < 10min observado.
