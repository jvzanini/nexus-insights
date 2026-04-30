# Runbook — Pré-agregação de relatórios

> **Release:** v0.8.0+. **Spec:** `docs/superpowers/specs/2026-04-30-pre-agregacao-design.md`. **Plan:** `docs/superpowers/plans/2026-04-30-pre-agregacao.md`.

## Resumo do pipeline

5 jobs BullMQ no container `nexus-insights_worker`:

| Job                       | Cron                  | O que faz |
|---------------------------|-----------------------|-----------|
| `refresh-by-account`      | `*/5 * * * *` (5 min) | Agrega 7 dias rolling em `chatwoot_facts_daily_by_account` + `chatwoot_facts_hourly_by_account`. |
| `refresh-by-inbox`        | `*/5 * * * *`         | Mesma janela, granularidade `inbox_id`. |
| `refresh-by-agent`        | `*/5 * * * *`         | Granularidade `agent_id` (orphan `assignee_id IS NULL` excluído). |
| `refresh-by-team`         | `*/5 * * * *`         | Granularidade `team_id` (sentinela `0` = "sem team"). |
| `housekeeping-old-buckets`| `0 3 * * *` (diário)  | DELETE de buckets > `audit.retention_days` (default 90). |

Status por dimensão é gravado em `chatwoot_facts_meta` (campos `last_refresh_at`, `last_attempt_at`, `last_error`, `oldest_bucket_date`, `newest_bucket_date`). Após sucesso, o worker publica `{ type: "facts:refreshed", dimension, accountId }` em Redis Pub/Sub no canal `nexus-insights:realtime` — o front-end escuta via `/api/events` e atualiza a UI.

## Pré-requisito de produção (uma vez): comando do worker

> **IMPORTANTE — leia antes do primeiro deploy da v0.8.0.**

A imagem agora copia o source do worker para `/app/worker/index.ts` e usa `tsx` (presente nas devDependencies que o Dockerfile instala) para executar TypeScript em runtime. O `docker/entrypoint.sh` detecta automaticamente quando o cmd contém `tsx` ou `worker` e **pula migrations/seed** (essas são responsabilidade exclusiva do container `app`, evitando race condition).

Se a stack de produção (no Portainer) tem o service `worker` com command apontando para um caminho compilado antigo (ex.: `["node", "/app/.next/server/chunks/worker.js"]` ou `["node", "/app/dist/worker/index.js"]`), **atualize uma vez** no Portainer:

1. Portainer → Stacks → `nexus-insights` → "Editor".
2. No service `worker`, mudar `command:` para:
   ```yaml
   command: ["npx", "tsx", "/app/worker/index.ts"]
   ```
3. "Update the stack" → "Re-pull image and redeploy".

Sem essa mudança, o worker não inicia e os jobs cron nunca rodam. `/configuracoes/jobs` mostra "Sem dados de pré-agregação" indefinidamente.

## Primeiro deploy

Após a stack subir com a v0.8.0:

1. **Verificar saúde**: `curl https://insights.nexusai360.com/api/health` → `{ "status": "ok", ... }`. Se `status` ≠ ok, ver troubleshooting abaixo.
2. **Verificar worker rodando**: no Portainer (Stacks → nexus-insights → service `worker`), os logs devem mostrar `[worker] Schedules registered: refresh-by-* every 5min, housekeeping daily 03:00`.
3. **Backfill manual**: super_admin abre `/configuracoes/jobs` e clica em **"Backfill 90 dias"** para cada uma das 4 dimensões (`by_account`, `by_inbox`, `by_agent`, `by_team`). Isso popula as tabelas com 90 dias de histórico. Sem esse passo, os relatórios migrados (`volumetria-heatmap`, `volumetria-dow`) só mostram dados a partir do momento em que o worker rodou pela primeira vez.
4. **Aguardar a 1ª passada cron**: até 5 min depois do deploy, o worker roda automaticamente os 4 jobs. Em `/configuracoes/jobs`, badges devem virar **fresh** (verde).

## Operação contínua

- Painel `/configuracoes/jobs` é a fonte oficial de status. Atualiza automaticamente a cada 5s.
- Para forçar um refresh fora do cron: clicar **"Rodar agora"** na linha da dimensão.
- Para refazer o histórico (ex.: bug de cálculo, índice criado tarde): clicar **"Backfill 90 dias"** novamente — UPSERT idempotente.

## Troubleshooting

### Badge "Sem dados de pré-agregação" persistente

**Causa**: backfill nunca foi executado, ou worker não está rodando.
**Fix**:
1. Verificar logs do `nexus-insights_worker`: `docker service logs nexus-insights_worker --tail 100`. Devem aparecer mensagens `[worker.refresh-by-X] done`.
2. Se não, restart: `docker service update --force nexus-insights_worker`.
3. Se ainda não, verificar Redis: `docker exec -it nexus-insights_redis.<task> redis-cli ping` → `PONG`.
4. Rodar backfill manual via UI.

### Badge "Atualizado há 30+ min" (lagging, vermelho)

**Causa**: job está falhando em loop ou queue está parada.
**Fix**:
1. Em `/configuracoes/jobs`, ver coluna "Último erro" — mensagem do erro persiste em `chatwoot_facts_meta.last_error`.
2. Causa comum: `statement timeout` no Chatwoot (query > 30s). Soluções:
   - Verificar se Chatwoot DB está sob carga (lentidão geral).
   - Considerar aumentar `statement_timeout` no `chatwoot_pool` (atualmente 30s — ver `src/lib/chatwoot/pool.ts`).
3. Causa comum 2: schema do Chatwoot mudou (upgrade) — coluna usada nas queries não existe mais. Inspecionar erro específico.

### Worker logando `Failed to register schedules: ...`

**Causa**: BullMQ `upsertJobScheduler` não conseguiu se conectar ao Redis ao subir.
**Fix**: confirmar `REDIS_URL` no service `worker`; restart do worker.

### Tabelas inchando além do esperado

**Causa**: `housekeeping` parou de rodar.
**Fix**:
1. Verificar `chatwoot_facts_meta` para a dimensão `housekeeping` (não — housekeeping não escreve em meta; usa só logs).
2. Logs: `docker service logs nexus-insights_worker | grep housekeeping`. Se ausente nas últimas 24h, restart.
3. Manual: rodar `DELETE FROM chatwoot_facts_daily_by_account WHERE bucket_date < CURRENT_DATE - 90;` (e equivalente para as outras 4 tabelas).

### Estimativas de espaço

- 1 dia × 1 account = **1 linha** em `chatwoot_facts_daily_by_account` (~150 bytes).
- 1 dia × 1 account × 24 horas = **24 linhas** em `chatwoot_facts_hourly_by_account` (~100 bytes cada → ~2.4 KB).
- 1 dia × 1 account × 30 inboxes = **30 linhas** em `chatwoot_facts_daily_by_inbox` (~150 bytes cada → ~4.5 KB).
- Etc. Estimativa total para 90 dias × 2 accounts × 30 inboxes × 6 teams × 12 agents = **~50 MB**. Insignificante.

## Limites conhecidos

- `triggerBackfill({ dimension, days })` enfileira `{ days }` em `job.data` mas as funções `processRefreshByX` ainda **ignoram esse campo** — janela rolling fixa de 7 dias permanece. TODO documentado no header de `src/lib/actions/jobs.ts`. Próxima release vai estender as funções para usar `job.data.days ?? 7`.
- `open_at_eod` / `pending_at_eod` só são gravados para o dia atual (snapshot live). Para dias passados ficam zerados. Reconstruir snapshot histórico exigiria armazenar evento por evento — fora do escopo da v0.8.0.
- `excludeMatrixIA` em `readFactsHourly` é no-op (não temos hourly-by-inbox). A subtração de inbox 31 só funciona em `readFactsDaily(by_account)`.

## Histórico de incidentes

- **2026-04-30 (v0.8.0)**: incidente Bad Gateway recorrente em produção causado por `EACCES` no `.next/cache` (container rodava como `nextjs` sem permissão na pasta criada por root no COPY). Resolvido no commit `ecbc3c4` antes da release v0.8.0 propriamente dita.
