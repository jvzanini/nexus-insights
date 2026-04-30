# Nexus Insights — Pré-agregação de relatórios — Design Spec (v3 — final)

> **Status:** v3 — final, pronta para o plan.
> **Data:** 2026-04-30
> **Autor:** João Vitor Zanini (Claude — autônomo, modo total)
> **Topic:** mover relatórios de "query on-demand no Chatwoot" para "leitura de fatos pré-agregados no banco interno", com refresh assíncrono e SSE de invalidação. Incluído também o **hotfix** do incidente Bad Gateway (já aplicado em commit separado).

---

## Histórico (v1 → v2 → v3)

- **v1**: proposta inicial — uma tabela ampla `chatwoot_facts_daily` com colunas fixas para cada métrica + uma `chatwoot_facts_hourly` para visões intra-dia. Job único "refresh-all" rodando a cada 5 min.
- **Pente fino #1** (review próprio): identificadas as seguintes lacunas:
  1. **Explosão de cardinalidade** em "uma linha por (account, date, dimensions)" — cada combinação de `(inbox_id, team_id, agent_id, status)` vira linha. Para 2 contas com ~30 inboxes × 6 teams × 12 agents × 4 status × 365 dias dá ~9 milhões de linhas. Inviável.
  2. **Job único "refresh-all"** é frágil: se uma query travar, todas as métricas ficam paradas.
  3. **Falta de tratamento de "edição retroativa"** no Chatwoot (raro, mas mensagens podem ter `created_at` ajustado, conversas reabertas etc.).
  4. **Sem fallback** para o caso do banco interno estar com dados velhos (lag > 30 min) — o usuário precisa saber.
  5. **Sem mapeamento explícito** de quais relatórios atuais migram para pré-agregação e quais ficam on-demand.
  6. **Falta concorrência** com o "Hotfix Bad Gateway" — esse trabalho é pré-requisito porque enquanto o container reinicia, qualquer pré-agregação fica desatualizada.
  7. **CSAT / SLA / Reporting Events** — `reporting_events` no Chatwoot tem schema próprio (event-based) que não cabe no modelo de "fatos diários" simples.
- **v2**: aplicadas correções de #1 a #7. Mudanças principais:
  - Modelo "**cubo vertical**" — uma tabela por dimensão isolada (`facts_daily_by_account`, `facts_daily_by_inbox`, `facts_daily_by_agent`, `facts_daily_by_team`, `facts_hourly_by_account`). Evita explosão combinatorial; cada relatório consulta a tabela de sua dimensão principal.
  - Jobs separados por dimensão (5 jobs paralelos com retry independente).
  - Janela de "rebuild" dos últimos 7 dias todo refresh para capturar edições retroativas.
  - `facts_meta` — tabela de controle com `last_refresh_at` por (account, dimension), exposta no `/api/health` e nos relatórios (badge "atualizado há X min").
  - Mapping explícito relatório-por-relatório (§5).
  - Hotfix Bad Gateway documentado como pré-requisito (`§0`).
  - `reporting_events` permanece on-demand para CSAT/SLA específicos (com cache mais curto), porque seu volume é baixo e o schema event-based não compensa pré-agregar.
- **Pente fino #2** (review mais profundo):
  1. **TZ / DST**: agregação por dia depende de timezone. Tem que ser feita em America/Sao_Paulo, não UTC. Caso contrário, o relatório "diário" mistura horas de dois dias diferentes para o usuário final.
  2. **Janela rolante x dias finalizados**: o "dia de hoje" muda enquanto o tempo passa — ele é uma métrica viva. Precisa estar no facts_hourly + ser somado em runtime para o `daily` de hoje.
  3. **Multi-account com diferentes timezones**: hoje só usamos São Paulo, mas a Matrix tem subsidiárias. Modelo precisa permitir TZ por account no futuro (não bloqueante hoje, mas não pintar em pedra).
  4. **Inboxes/teams/agents apagados ou renomeados**: `id` do Chatwoot é estável; nome muda. Pré-agregar apenas `id`; resolver `name` via `meta-cache` em runtime.
  5. **Conversas reabertas (status oscilando 0→1→0)**: a métrica "resolvidas no dia X" deve considerar `last_activity_at` do **estado=1** mais recente — caso contrário, conversas reabertas ficam contadas duas vezes em dias diferentes. Documentar o critério (vamos usar `last_activity_at` enquanto `status=1` no fim do bucket).
  6. **Agente Nex usa LLM tools que consultam dados**: ferramentas do Nex podem ler do banco interno em vez do Chatwoot quando o relatório for pré-agregado — duplo benefício (latência + custo).
  7. **Riscos operacionais**: replication slot do Chatwoot não é usado aqui (é polling), então não há risco de slot abandonado. Mas o **statement_timeout** das queries do worker precisa ser maior que o do app (vamos com 60s no worker, 30s mantido no app).
  8. **Backfill inicial de 90 dias** pode levar tempo. Plan tem que prever rodar uma vez manualmente após o primeiro deploy.
  9. **Estratégia de invalidação SSE**: ao terminar um job, publicar `report:invalidated` no canal `nexus-insights:realtime` com a lista de chaves invalidadas (que combinam com o `cacheKey()` existente). Frontend já consome esse canal em `/api/events`.
  10. **Frontend deve mostrar timestamp** "Dados de HH:MM" para deixar claro que NÃO é tempo real estrito.
- **v3 (final)**: aplicadas todas as correções acima. Versão consolidada para gerar plan.

---

## 0. Pré-requisito: hotfix Bad Gateway (já aplicado)

Antes de pré-agregação fazer sentido, o app precisa parar de cair. Causa raiz **já corrigida** em commit separado (ecbc3c4):

- `docker/Dockerfile` — `--chown=nextjs:nodejs` em todos os COPY + `mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next` antes do `USER nextjs`.
- `prisma/seed.ts` — Prisma 7 + adapter-pg exige `new PrismaClient({ adapter })`.
- `src/instrumentation.ts` (novo) — handlers globais de `unhandledRejection` e `uncaughtException` que apenas logam, evitando que erros background derrubem o processo.

Verificação após deploy: ausência de `EACCES` nos logs por 1h e `/api/health` 200.

---

## 1. Contexto

### 1.1 Problema atual

Toda página de relatório consulta o **banco do Chatwoot** (read-only, hospedado em outra VPS) em runtime — através de `chatwootQuery()` em `src/lib/chatwoot/pool.ts`, que **serializa globalmente** todas as queries do processo Next por causa da limitação `CONNECTION LIMIT 5` no usuário `chatwoot_leitura`. Sob carga real (vários usuários abrindo dashboards simultaneamente), as queries se enfileiram, latência cresce e o Traefik responde Bad Gateway antes que a fila resolva. Além disso, **toda página re-consulta o Chatwoot** mesmo quando os dados não mudaram (cache atual com TTL 30s ajuda mas não resolve a serialização).

### 1.2 Princípios

1. **Carga no Chatwoot deve ser previsível** — não escalar com nº de usuários.
2. **Latência percebida ≤ 200ms** para relatórios (excluindo "primeira carga sem cache").
3. **Não exigir mudanças no servidor Chatwoot** — sem replicação lógica, sem triggers, sem publication.
4. **Tempo de implementação razoável** — ~3 dias úteis de trabalho focado.
5. **Compatibilidade com filtros existentes** — toolbar/drawer/multiselect continuam funcionando exatamente como hoje.
6. **Fallback gracioso** — se o pré-agregador atrasa, relatórios mostram dados "atualizados há X min"; se trava por > 1h, alertar via toast.
7. **SSE para tempo "quase real"** — quando um job termina, frontend recebe evento e atualiza sem reload.

---

## 2. Decisão arquitetural

**Modelo: pré-agregação assíncrona com cubo vertical + cache pull-through + SSE de invalidação.**

### 2.1 Por que não replicação lógica (CDC)

Avaliada e descartada para esta release:

| Critério | CDC (replicação lógica) | Pré-agregação |
|----------|------------------------|---------------|
| Carga no Chatwoot em uso | Quase zero (só WAL) | Baixa fixa (~N queries/min) |
| Carga no Chatwoot ocioso | Constante (slot ativo) | Constante (jobs cron) |
| Latência percebida | <1s (real-time) | 1–5min (intervalo do job) |
| Risco de derrubar Chatwoot | **Médio** (slot abandonado → disco cheio) | Baixíssimo |
| Custo de implementação | Alto + manutenção a cada upgrade do Chatwoot | Médio |
| Sobrevive a Chatwoot off | Não (replicação trava) | Sim (lê facts já gravados) |

**Veredicto:** para o volume e perfil deste projeto (KPIs/agregações para dashboard), pré-agregação ganha em todos os critérios práticos. CDC fica como opção futura **se** aparecer requisito de drill-down em mensagens individuais com filtros muito flexíveis.

### 2.2 Por que cubo vertical

Tabela "ampla" (`account_id, date, inbox_id, team_id, agent_id, status, metrics`) explode em cardinalidade — combinação de dimensões = produto cartesiano. Tabela "estreita" (`account_id, date, metrics`) não permite ranking por dimensão.

**Cubo vertical** = uma tabela por dimensão de interesse, cada uma com `(account_id, date [, hour], dimension_id, metrics)`. Cada relatório consulta a tabela da sua dimensão principal. Cardinalidade controlada (~365 dias × 30 inboxes = 11k linhas/conta, vs 9M no modelo amplo).

---

## 3. Schema das tabelas

Todas no banco interno (Postgres do Nexus Insights), gerenciadas via Prisma migrations.

### 3.1 `chatwoot_facts_daily_by_account`

| coluna             | tipo            | observação |
|--------------------|-----------------|------------|
| `account_id`       | int             | Chatwoot account ID |
| `bucket_date`      | date            | TZ America/Sao_Paulo |
| `received`         | int             | conversations criadas no dia |
| `resolved`         | int             | conversations com status=1 e last_activity_at no dia |
| `open_at_eod`      | int             | snapshot fim-do-dia (status=0) |
| `pending_at_eod`   | int             | snapshot fim-do-dia (status=2) |
| `messages_in`      | int             | mensagens inbound criadas no dia |
| `messages_out`     | int             | mensagens outbound criadas no dia |
| `unique_contacts`  | int             | DISTINCT contact_id no dia |
| `frt_p50_seconds`  | int (nullable)  | percentile 50 first_response no dia |
| `frt_p90_seconds`  | int (nullable)  | percentile 90 first_response no dia |
| `rt_p50_seconds`   | int (nullable)  | percentile 50 resolution no dia |
| `created_at`       | timestamptz     | row created |
| `updated_at`       | timestamptz     | last refresh |

PK composta: `(account_id, bucket_date)`. Índice em `(account_id, bucket_date DESC)`.

### 3.2 `chatwoot_facts_daily_by_inbox`

Mesmas métricas da §3.1, granularidade adicional `inbox_id`. PK `(account_id, bucket_date, inbox_id)`.

### 3.3 `chatwoot_facts_daily_by_agent`

Mesmas métricas, granularidade `agent_id` (= `users.id` do Chatwoot). PK `(account_id, bucket_date, agent_id)`.
Inclui `is_active_at_eod boolean` para distinguir agents desativados.

### 3.4 `chatwoot_facts_daily_by_team`

Mesmas métricas, granularidade `team_id`. PK `(account_id, bucket_date, team_id)`. `team_id` nullable: linhas com NULL representam "sem departamento".

### 3.5 `chatwoot_facts_hourly_by_account`

| coluna             | tipo            | observação |
|--------------------|-----------------|------------|
| `account_id`       | int             | |
| `bucket_date`      | date            | TZ America/Sao_Paulo |
| `bucket_hour`      | smallint (0–23) | TZ America/Sao_Paulo |
| `received`         | int             | |
| `resolved`         | int             | |
| `messages_in`      | int             | |
| `messages_out`     | int             | |
| `unique_contacts`  | int             | |
| `created_at`       | timestamptz     | |
| `updated_at`       | timestamptz     | |

PK `(account_id, bucket_date, bucket_hour)`. Cobre heatmap dia × hora e KPIs ao vivo do dia atual.

### 3.6 `chatwoot_facts_meta`

Controle por dimensão.

| coluna              | tipo         | observação |
|---------------------|--------------|------------|
| `dimension`         | text         | `by_account`, `by_inbox`, `by_agent`, `by_team`, `hourly_by_account` |
| `account_id`        | int          | |
| `last_refresh_at`   | timestamptz  | última vez que terminou OK |
| `last_attempt_at`   | timestamptz  | última tentativa (sucesso ou falha) |
| `last_error`        | text (null)  | mensagem do último erro |
| `oldest_bucket_date`| date         | data mais antiga já agregada |
| `newest_bucket_date`| date         | data mais recente |

PK `(dimension, account_id)`. Lido por `/api/health` (lag global) e por badges nos relatórios.

---

## 4. Jobs e cadência

Implementados como BullMQ jobs no worker (`src/worker/jobs/pre-agregacao/`).

| Job                       | Cadência | O que faz |
|---------------------------|----------|-----------|
| `refresh-by-account`      | a cada **5 min** | refresca **últimos 7 dias** (rolling) na `facts_daily_by_account` + dia atual em `facts_hourly_by_account` |
| `refresh-by-inbox`        | a cada **5 min** | mesma janela, granularidade inbox |
| `refresh-by-agent`        | a cada **5 min** | mesma janela, granularidade agent |
| `refresh-by-team`         | a cada **5 min** | mesma janela, granularidade team |
| `backfill-90-days`        | sob demanda (manual após primeiro deploy) | rebuild dos últimos 90 dias para todas as dimensões |
| `housekeeping-old-buckets`| a cada **24h** (madrugada) | DELETE de buckets > `audit.retention_days` (default 90) |

### 4.1 Estratégia "últimos 7 dias rolling"

A cada execução, cada job roda essa sequência:

```sql
-- pseudo-SQL
WITH days AS (
  SELECT generate_series(
    CURRENT_DATE - INTERVAL '6 days',
    CURRENT_DATE,
    INTERVAL '1 day'
  )::date AS d
)
INSERT INTO chatwoot_facts_daily_by_account (...)
SELECT ... FROM chatwoot.conversations WHERE ... AND date_part = d
ON CONFLICT (account_id, bucket_date) DO UPDATE SET ...
```

Os 7 dias cobrem edições retroativas raras (conversas reabertas, mensagens com `created_at` ajustado). O custo é constante — 7 dias × 1 query agregada = trivial.

### 4.2 Concorrência

- 4 jobs principais (`by_account`, `by_inbox`, `by_agent`, `by_team`) rodam **em paralelo**, mas **cada um respeita o pool serializado** do `chatwootQuery()` — então no Chatwoot eles formam uma fila de no máximo 4 queries pendentes por execução.
- `concurrency: 1` no worker BullMQ por queue (não queremos 2 instâncias do mesmo job rodando concorrentemente).
- Retry: BullMQ default (3 tentativas, exponential backoff).
- Statement_timeout no pool do Chatwoot para o worker: **60s** (vs 30s do app). Worker pode esperar mais.

### 4.3 Locking

Jobs usam o lock implícito do BullMQ (`stalledInterval`). Sem locks adicionais necessários.

---

## 5. Mapeamento relatório-por-relatório

| Relatório atual                     | Fonte hoje (Chatwoot) | Pós-pré-agregação                                    | Cadência | TTL extra (cache pull-through) |
|-------------------------------------|-----------------------|------------------------------------------------------|----------|--------------------------------|
| `home-summary` (dashboard live)     | 6 queries/req         | `facts_daily_by_account` + `facts_hourly` + 1 query reporting_events (p50 24h) | 5 min | 30s (mantém percepção ao vivo)  |
| `dashboard-data` (visão geral)      | 10 queries/req        | `facts_daily_by_account` + `facts_daily_by_inbox` + `facts_daily_by_team` + `facts_daily_by_agent` (top) + 1 query recent_conversations | 5 min | 60s |
| `dashboard-kpis`                    | 5 queries/req         | `facts_daily_by_account` (sums) | 5 min | 60s |
| `dashboard-drill-down`              | filtros dinâmicos     | **on-demand** (filtros muito livres; cache 60s mantém) | n/a | 60s |
| `status-distribution`               | 1 query/req           | `facts_daily_by_account` (rollup) | 5 min | 60s |
| `volumetria-dow`                    | 1 query/req           | `facts_daily_by_account` (group by dow) | 5 min | 5min |
| `volumetria-heatmap`                | 1 query/req           | `facts_hourly_by_account` (group by hora × dow) | 5 min | 5min |
| `tempos-resposta`                   | reporting_events      | `facts_daily_by_account` (p50/p90 já gravados) | 5 min | 60s |
| `ranking-atendentes`                | 1 query/req           | `facts_daily_by_agent` (sum no período) | 5 min | 60s |
| `por-departamento`                  | 1 query/req           | `facts_daily_by_team` | 5 min | 60s |
| `por-estado` (geográfico)           | join com contacts     | **on-demand** (envolve join com contacts; baixo volume) | n/a | 5min |
| `mensagens-nao-respondidas`         | snapshot              | **on-demand** (snapshot dinâmico) | n/a | 60s |
| `conversas-list` (lista detalhada)  | row-level             | **on-demand** (filtros muito livres; row-level) | n/a | 30s |
| `leads-recebidos`                   | aggregation           | `facts_daily_by_account` (filter referrer) | 5 min | 60s |
| `matrix-ia` (inbox 31)              | 1 query/req           | `facts_daily_by_inbox` filtrado para inbox 31 | 5 min | 60s |

**8 relatórios saem de "consulta direta" e passam a ler do banco interno**. Os 4 que continuam on-demand (`dashboard-drill-down`, `por-estado`, `mensagens-nao-respondidas`, `conversas-list`) são os que têm filtros muito flexíveis ou row-level — não cabem em pré-agregação. Para esses, o cache atual (30–60s) basta.

---

## 6. Estratégia de leitura no app

### 6.1 Camada nova: `src/lib/chatwoot/facts.ts`

```ts
// Pseudocódigo
export async function readFactsDaily(args: {
  accountId: number;
  start: Date;
  end: Date;
  dimension?: "account" | "inbox" | "agent" | "team";
  dimensionFilter?: { ids?: number[] };
}): Promise<FactsRow[]> { … }

export async function readFactsHourly(args: {
  accountId: number;
  start: Date;
  end: Date;
}): Promise<HourlyRow[]> { … }

export async function readFactsMeta(args: {
  accountId: number;
}): Promise<{ lastRefreshAt: Date; lagSeconds: number }> { … }
```

Cada relatório migrado importa daqui. Continua usando o `withCache` para deduplicar requests no mesmo segundo (TTL curto).

### 6.2 Filtros

- **Período (start, end)**: vira `WHERE bucket_date BETWEEN $1 AND $2`.
- **Inbox/team/agent**: vira `WHERE dimension_id = ANY($n)`.
- **`excludeMatrixIA`**: passa a ser tratado **na hora da agregação** (job pula inbox 31 quando settings.toggle = OFF para o usuário). Como o toggle hoje é por usuário (super_admin vê tudo), e a pré-agregação é **agnóstica de usuário**, fazemos o seguinte: agregamos **sempre** com Matrix IA incluso, e a exclusão acontece em runtime (subtrai a linha de inbox 31 da agregação). Custo: uma subquery/filter trivial.

### 6.3 Badge "Atualizado há X min"

Componente `<FactsFreshness lastRefreshAt={...} />` exibido no header de cada relatório migrado. Cor:
- Verde se lag < 10 min;
- Amarelo se 10–30 min;
- Vermelho se > 30 min (com toast "Dados podem estar desatualizados").

### 6.4 SSE de invalidação

Worker publica em `nexus-insights:realtime`:

```json
{ "type": "facts:refreshed", "dimension": "by_account", "accountId": 9 }
```

Frontend (já consumindo `/api/events`) escuta esse type novo, dispara `router.refresh()` ou `mutate()` (SWR/RSC) seletivamente — só os relatórios da dimensão refrescada.

---

## 7. Migrations Prisma

`prisma/migrations/<timestamp>_pre_agregacao/migration.sql`:

```sql
CREATE TABLE chatwoot_facts_daily_by_account (...);
CREATE TABLE chatwoot_facts_daily_by_inbox (...);
CREATE TABLE chatwoot_facts_daily_by_agent (...);
CREATE TABLE chatwoot_facts_daily_by_team (...);
CREATE TABLE chatwoot_facts_hourly_by_account (...);
CREATE TABLE chatwoot_facts_meta (...);

CREATE INDEX idx_facts_daily_acct_date ON chatwoot_facts_daily_by_account (account_id, bucket_date DESC);
CREATE INDEX idx_facts_daily_inbox ON chatwoot_facts_daily_by_inbox (account_id, bucket_date DESC, inbox_id);
-- … etc.
```

E modelos Prisma equivalentes em `schema.prisma`.

---

## 8. Operação

### 8.1 Health check estendido

`/api/health` adiciona seção `chatwoot_facts`:

```json
{
  "status": "ok",
  "checks": {
    "chatwoot_facts": {
      "by_account": { "lag_seconds": 142, "status": "fresh" },
      "by_inbox": { "lag_seconds": 156, "status": "fresh" },
      ...
    }
  }
}
```

`status`: `fresh` (<10min), `stale` (10–30min), `lagging` (>30min).

### 8.2 Métricas e logs

- Cada job loga: `[refresh-by-X] account=Y duration=Zms rows_upserted=N`.
- Falhas: `[refresh-by-X] FAIL account=Y err=...` + retry automático.
- Admin pode rodar manualmente via `/configuracoes/jobs` (página nova restrita a super_admin) — botões "Rodar agora" para cada job + "Backfill 90 dias".

### 8.3 Backfill inicial

Após o primeiro deploy desta release, super_admin rodará:

```bash
# via UI: Configurações → Jobs → "Backfill 90 dias"
# OU via shell no container:
docker exec -it nexus-insights_worker.<task-id> node /app/worker/scripts/backfill.js --days=90
```

Tempo esperado: 5–15 min para 90 dias × 2 contas. Não bloqueia o app.

### 8.4 Troubleshooting

| Sintoma | Causa provável | Fix |
|---------|----------------|-----|
| Relatórios mostrando "Atualizado há 30+ min" | Job travado/com lag | Verificar logs do worker; rodar job manualmente |
| `chatwoot_facts_meta` com `last_error` | Query de agregação falhou | Investigar erro específico (timeout, permissão) |
| Lag persistente > 1h | Worker container down | Restart do service `nexus-insights_worker` |
| Backfill demorando demais | Conexão lenta com Chatwoot DB | Reduzir `--days` para chunks menores (30d) |

---

## 9. Riscos e mitigações

| Risco | Severidade | Mitigação |
|-------|------------|-----------|
| Schema do Chatwoot muda em upgrade | Médio | Queries em arquivos isolados com testes; mudança detectada por tests no CI antes de prod. |
| Job com bug grava dados errados em todas as contas | Alto | Cada job opera em um account_id de cada vez; falha em uma não afeta as outras. Smoke test no fim de cada job (sanity check: total > 0). |
| Banco interno cresce indefinidamente | Baixo | `housekeeping-old-buckets` (retenção 90 dias). Estimativa: ~50MB/ano. |
| Frontend não recebe SSE e mostra dados velhos | Médio | Badge de freshness sempre visível + polling continua como fallback (intervalo maior, ex: 60s). |
| Worker container morre e ninguém percebe | Alto | `/api/health` retorna `lag_seconds`; alerta se > 30min. |
| Inconsistência entre `facts_daily_by_account` e soma de `facts_daily_by_inbox` | Médio | Validação periódica (job housekeeping faz check); divergência > 1% loga warning. |
| Estatística percentil (p50/p90) calculada fora de janela rolante | Baixo | Recalcula sempre os últimos 7 dias completos a cada refresh. |

---

## 10. Critérios de aceite

1. **Performance:** páginas migradas carregam em **< 200ms** (p50, com cache hit) e **< 1s** (p95, cache miss lendo do banco interno).
2. **Carga no Chatwoot:** medida em queries/min — **redução ≥ 80%** vs estado atual em uso real.
3. **Lag:** `last_refresh_at` < 10 min em 99% das observações.
4. **Cobertura:** 8 relatórios migrados (lista §5), 4 mantidos on-demand com TTL apropriado.
5. **Acessibilidade dos dados:** badge "Atualizado há X min" visível em todos os relatórios migrados.
6. **Observabilidade:** `/api/health` mostra status por dimensão; UI de Jobs permite rerun manual.
7. **Resiliência:** se Chatwoot ficar offline, dashboard continua funcionando com últimos facts gravados (com banner amarelo).
8. **Testes:** cobertura unitária dos jobs (mocks de pool); 1 teste E2E por relatório migrado.
9. **Documentação:** runbook em `docs/runbooks/pre-agregacao.md`; CHANGELOG atualizado; CLAUDE.md menciona o novo padrão.

---

## 11. Out-of-scope desta release

- **CDC / replicação lógica** — fica como opção futura.
- **Pré-agregação por estado/cidade** (`por-estado`) — fica on-demand por enquanto (requer join com `contacts` não disponível no `facts`).
- **CSAT / SLA agregados** — `reporting_events` permanece on-demand; pré-agregação dessas métricas fica para v0.9.
- **Relatórios novos da v0.8** (Pulse Semanal, FCR, Forecast etc.) — esses já nascem usando `readFactsDaily()`, mas o **escopo desta release é apenas a refatoração da base atual**.
- **Backfill mais antigo que 90 dias** — caso queira histórico maior, ajusta `audit.retention_days` e roda backfill com flag `--days=N`.
- **Migração para outro banco** (BigQuery/ClickHouse) — fora de escopo. Postgres do nexus é suficiente.

---

## 12. Plano de rollout

1. Hotfix Bad Gateway → **deployado** (commit ecbc3c4).
2. Migrations Prisma + tabelas vazias → deploy.
3. Jobs BullMQ implementados + worker rodando → deploy.
4. Backfill manual de 90 dias → super_admin executa via UI.
5. Migração relatório-por-relatório (`home-summary` primeiro, mais simples; depois `dashboard-data`, depois ranking/heatmap/etc.) — **uma PR por relatório** ou um único PR consolidado conforme escolha do plan.
6. SSE de invalidação ligado.
7. Badge de freshness em todos os relatórios.
8. Verificação em produção (carga no Chatwoot, latência, lag).
9. CHANGELOG / docs / memória atualizados.

---

## 13. Definição de pronto

- [ ] Migration aplicada em produção sem erro.
- [ ] Worker rodando com 4 queues ativas (visível no Bull Board OU em `/api/health`).
- [ ] `chatwoot_facts_meta` populado para 2 accounts.
- [ ] 8 relatórios migrados retornam dados idênticos aos da versão on-demand (smoke test manual).
- [ ] Badge "Atualizado há X min" presente em todos os relatórios migrados.
- [ ] `/api/health` mostra `chatwoot_facts.{by_X}.status = "fresh"` para todas as dimensões.
- [ ] CHANGELOG, runbook, CLAUDE.md, memória atualizados.
- [ ] Smoke test em produção: abrir cada relatório, verificar latência < 1s, ausência de Bad Gateway por 24h.
