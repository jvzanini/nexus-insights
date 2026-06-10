# STATUS — Nexus Insights (Matrix Fitness Group)

> Última atualização: 2026-06-10

---

## Versão atual em produção

**v0.56.2** — deployada em 2026-06-10 (direto na `main`). Dashboard/relatórios sempre no ar: servem o último dado conhecido (`${key}:last`, TTL 24h) quando o Chatwoot recusa conexão ("too many connections for role chatwoot_leitura"). Causa medida: role read-only com CONNECTION LIMIT=5 (servidor max_connections=400) — correção de capacidade complementar = `ALTER ROLE chatwoot_leitura CONNECTION LIMIT 30` (admin do banco).

> v0.56.1 (2026-06-10): crash de login no primeiro acesso (mustChangePassword) — redirect direto + error boundaries.
> v0.56.0 (2026-06-10): edição de e-mail de usuários (senha preservada) + resiliência do carregamento (retry timeout pool + single-flight).

**Fluxo de trabalho:** este projeto trabalha **sempre direto na `main`** (sessão única, sem worktrees) — ver `CLAUDE.md §8.5` / `AGENTS.md`.

---

## Estado do sistema

| Componente | Estado | Observação |
|---|---|---|
| App Next.js | ✅ Live | v0.56.2 |
| Worker BullMQ (polling delta) | ✅ Live | polling 30s per-connection |
| Pré-agregação | ✅ Live | refresh on-demand + cron 30min fallback |
| Banco (Prisma + Postgres) | ✅ | leitura direta Chatwoot (read-only) |
| Redis / BullMQ | ✅ | filas delta-sync + refresh-by-* |
| CI/CD GitHub Actions | ✅ | push main → deploy automático Portainer |

---

## Últimas releases (resumo)

| Versão | Data | Descrição |
|---|---|---|
| v0.56.2 | 2026-06-10 | Dashboard/relatórios sempre no ar: servem último dado conhecido em falha de conexão (`${key}:last` 24h) — corrige "too many connections for role" |
| v0.56.1 | 2026-06-10 | Crash de login no primeiro acesso (mustChangePassword): redirect direto p/ trocar-senha (sem hop) + error boundaries (protected + global) |
| v0.56.0 | 2026-06-10 | Edição de e-mail de usuários (senha preservada) + resiliência do carregamento (retry de timeout do pool + single-flight no cache) |
| v0.55.4 | 2026-06-05 | RBAC: menu/rota "Usuários" restritos a super_admin (temporário, reversível) |
| v0.55.3 | 2026-06-05 | Export XLSX: header de atributo usa a chave original (`Atributo: status_atendimento`) |
| v0.55.2 | 2026-06-05 | Export XLSX: colunas País/Estado-Cidade após Documento, "Estado"→"Caixa de entrada", headers de atributo legíveis |
| v0.55.1 | 2026-06-05 | Conversas: integração completa de País/Estado-Cidade (badge contador, chips ativos, export XLSX, reset) |
| v0.55.0 | 2026-06-05 | Conversas: País e Estado/Cidade do contato (drilldown + filtros Simples/Avançado), normalização canônica `location.ts` |
| v0.54.0 | 2026-05-08 | Dashboard: "Em atendimento", donut Total, auto-reload, cards menores |
| v0.53.0 | 2026-05-07 | Agente Nex: semântica de período, label exact-match, unanswered status=0 |
| v0.52.0 | 2026-05-06 | Consumo full-period; Agente Nex: CPF, etiquetas, out-of-scope |
| v0.51.0 | 2026-05-06 | Dashboard: retry pool, stale banner, polling wired, gráfico período completo |
| v0.50.x | 2026-05-06 | Agente Nex: calibração automática (46 cenários, 100%) |
| v0.49.0 | 2026-05-06 | Agente Nex: auto-calibração de prompt + filtro etiqueta + sugestões max 3 |
| v0.48.1 | 2026-05-06 | `truncateToNow()`: gráfico para no dia/hora atual; espaçamento atendentes |
| v0.48.0 | 2026-05-05 | "Novas", acumulado carry-forward, "Hoje", range semana, badges kpiTotals |
| v0.47.0 | 2026-05-05 | Open+Pending drill-down refeito, agent drill-down por atendente |
| v0.46.0 | 2026-05-05 | Correções visuais e semânticas drill-downs |
| v0.45.0 | 2026-05-05 | ReceivedDrillDown com chart + toggle distribuição |
| v0.44.0 | 2026-05-05 | Fix bucket formula timestamp without tz + badges de série |
| v0.43.0 | 2026-05-04 | Fix sqlChart resolved, settings DB restaurados, weekStartsOn configurável |
| v0.42.0 | 2026-05-04 | Padrão canônico de dados (created_at/last_activity_at, CTEs, semana seg-dom) |
| v0.41.1 | 2026-05-04 | Hotfix: usersSync usa `au.role` (não `u.role`) |
| v0.41.0 | 2026-05-04 | Polling delta universal — substitui webhook event-driven |

---

## Arquitetura atual (v0.41+)

### Polling delta (substituiu webhook em v0.41)
- Worker BullMQ `chatwoot-sync-delta` executa a cada `pollingIntervalSeconds` (default 30s, mín 20s).
- 10 table-syncs em `src/lib/chatwoot/sync/table-syncs/` comparam `updated_at`/`id` com cursores em `chatwoot_sync_cursors`.
- Quando detecta mudança → enfileira jobs `refresh-by-*` (pré-agregação).
- Sweep diário 03:00 BRT detecta IDs órfãos.
- UI super_admin: `/bancos-de-dados/[id]?tab=sincronizacao` (4 KPIs + runs polling 5s).

### Pré-agregação
- 6 tabelas de fatos: `chatwoot_facts_daily_by_*` + `chatwoot_facts_hourly_by_account` + `chatwoot_facts_meta`.
- Worker rebaixado para fallback 30min — disparo principal é on-demand via runDeltaSync.
- Pub/Sub Redis `facts:refreshed` → frontend `useFactsRealtime` (debounce 5s) → `router.refresh()`.

### Regras canônicas de dados (v0.42 — ver `docs/runbooks/canonical-data-rules.md`)
- **Recebidas/Novas**: `c.created_at` — única métrica por created_at.
- **Abertas/Pendentes/Resolvidas**: `c.last_activity_at` — conversa com movimentação no período.
- **Semana**: segunda → domingo (`weekStartsOn=1`), configurável via app_settings.
- **Matrix IA inbox_id = 31**: usar `chatwootMatrixIaClause()` — nunca literal `31`.
- **Cache keys**: sufixo `-canonical-v0.4x` — incrementar ao mudar semântica.

### Dashboard (v0.48+)
- Gráfico principal (`ConversationsLineChart`): 4 séries cumulativas (carry-forward), truncadas no momento atual.
- Badge de série usa `kpiTotals` do backend: Novas/Resolvidas = soma eventos; Abertas/Pendentes = snapshot.
- Seletor período: Hoje / Semana / Mês. PeriodNavigator com navegação ←/→.
- Drill-downs: Novas, Resolvidas, Abertas+Pendentes, Taxa Resolução, Sem Resposta, Por Departamento, Por Atendente, Por Status.

---

## Pendências / próximos passos

- Nenhuma pendência técnica crítica conhecida.
- Dashboard v0.48.1 estável e validado.

---

## Arquivos chave

| Arquivo | Propósito |
|---|---|
| `src/lib/reports/canonical.ts` | Glossário canônico de dados |
| `src/lib/chatwoot/queries/dashboard-data.ts` | KPIs + gráfico principal |
| `src/lib/chatwoot/queries/dashboard-drill-down.ts` | Todos os drill-downs |
| `src/components/dashboard/conversations-line-chart.tsx` | Gráfico principal + helpers |
| `src/components/dashboard/drill-down-contents.tsx` | Conteúdo dos drill-down dialogs |
| `src/lib/chatwoot/sync/` | Polling delta table-syncs |
| `docs/runbooks/canonical-data-rules.md` | Runbook regras canônicas |
| `docs/runbooks/polling-delta-sync.md` | Runbook polling delta |
| `docs/runbooks/pre-agregacao.md` | Runbook pré-agregação |
