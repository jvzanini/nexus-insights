# Runbook — Polling Delta Sync (v0.41+)

> **Release:** v0.41.0+. Substitui o runbook `webhook-nexus-chat.md` (removido).

## 1. Visão geral

O **polling delta universal** substitui o webhook event-driven do Chatwoot. Um worker BullMQ executa a cada N segundos (default **30s**, mín **20s**, configurável per-connection) e compara `updated_at`/`id` em **10 tabelas** do banco do Chatwoot vs cursor armazenado em `chatwoot_sync_cursors`. Se houver mudança, **enfileira jobs `refresh-by-*`** da pré-agregação que populam `chatwoot_facts_*`. O frontend escuta `facts:refreshed` no Redis Pub/Sub via `useFactsRealtime` e dispara `router.refresh()`.

Vantagens vs webhook:

- Funciona com **qualquer Chatwoot** (self-hosted, cloud, sem suporte a webhook, ou com rede privada).
- Sem dependência de assinatura HMAC, autenticação opaca por token na URL, retentativa pelo Chatwoot etc.
- Latência previsível (≤ pollingIntervalSeconds + ~10s pré-agregação).
- Detecta DELETEs via sweep diário (impossível via webhook).

## 2. Componentes

- **`src/lib/chatwoot/sync/`**:
  - `cursor.ts` — leitura/gravação de cursor por `(connectionId, accountId, tableName)`.
  - `types.ts` — tipos compartilhados.
  - `table-syncs/*` — 10 syncers (1 por tabela alvo).
  - `run-delta-sync.ts` — orquestrador de 1 run (executa os 10 syncers e enfileira refresh).
  - `run-full-sweep.ts` — sweep diário (lista IDs no Chatwoot, detecta órfãos no nosso banco).
- **`src/worker/jobs/chatwoot-sync/`**:
  - `delta-sync.ts` — processor BullMQ.
  - `full-sweep.ts` — processor BullMQ (cron `0 3 * * *` BRT).
  - `scheduler.ts` — tick de **5s** que checa quais conexões têm `lastSyncAt + pollingIntervalSeconds < now()` e enfileira.
  - `queues.ts` — definições de filas BullMQ.
- **Server Actions**:
  - `src/lib/actions/nexus-chat/connections.ts` → `updateConnectionPollingInterval()`
  - `src/lib/actions/nexus-chat/sync-stream.ts` → `listRecentSyncRuns()`
  - `src/lib/actions/nexus-chat/health-metrics.ts` → `getConnectionHealthSnapshot()`
- **UI**:
  - `/bancos-de-dados/[id]?tab=sincronizacao` — runs em tempo real (polling 5s).
  - `/bancos-de-dados/[id]?tab=saude` — heartbeat + erros recentes.
  - Edit Connection Dialog — campo `pollingIntervalSeconds`.

## 3. Configuração

- **`pollingIntervalSeconds`** per-connection, ajustado no Edit Connection Dialog.
- Mínimo: **20s** (defesa em profundidade via `polling_interval_min_20s` CHECK constraint no Postgres).
- Padrão: **30s**.
- Mudança detectada pelo scheduler em **≤5s** (próximo tick). Sem invalidação de pool.

## 4. Cron diário (full sweep)

- Executa às **03:00 BRT** (`pattern: "0 3 * * *", tz: "America/Sao_Paulo"`).
- Para cada connection ativa, lista IDs no Chatwoot e detecta órfãos no nosso banco:
  - **v1**: só detecta e loga via audit (`polling_full_sweep_completed`).
  - **v2** (futuro): deleta órfãos automaticamente.

## 5. Audit

| Action | Sample rate | Notas |
|---|---|---|
| `polling_sync_completed` | **1/100** | Volume alto — 1 a cada N runs. |
| `polling_sync_failed` | **100%** | Raro, sempre logar. |
| `polling_full_sweep_started` | **100%** | 1x/dia por connection. |
| `polling_full_sweep_completed` | **100%** | 1x/dia por connection. |
| `polling_interval_updated` | **100%** | Mudança manual no Edit Dialog. |

## 6. SLA esperado

- **Latência fim-a-fim**: `pollingIntervalSeconds + ~10s pré-agregação`.
- Default 30s → ~40-45s p99.
- Configurável: 20s mín → ~30s overhead p99.
- Sweep diário: detecta órfãos com até **24h de atraso** (aceitável; DELETEs no Chatwoot são raros).

## 7. Troubleshooting

### Heartbeat "Sem registro" / `lastSyncAt` antigo

1. Validar worker rodando:
   ```bash
   docker logs nexus-insights_worker | grep "scheduler tick"
   ```
   Deve aparecer a cada 5s. Se não aparece, restart do service.
2. Validar conexão ativa:
   ```sql
   SELECT id, status, deleted_at FROM nexus_chat_connections;
   ```
   Esperado: `status='active'` AND `deleted_at IS NULL`.
3. Validar bindings habilitados:
   ```sql
   SELECT * FROM company_chat_bindings WHERE connection_id = X AND enabled = true;
   ```

### Probe falha "ECONNREFUSED"

- Banco do Chatwoot inacessível. Validar credenciais/host/porta no Edit Dialog.
- Verificar firewall, VPN, rede docker.
- O probe early-aborts: gera **1 audit `polling_sync_failed` por run** em vez de 20 (1 por tabela).

### Jobs travados (status="lagging")

- Abrir aba **Jobs** em `/bancos-de-dados/[id]`.
- Clicar **"Rodar agora"** pra disparar refresh manual.
- Se persistir, ver `chatwoot_facts_meta.last_error` para a `(accountId, dimensão)` problemática.

### Cursor errado / dados faltando

- Sweep full diário detecta IDs órfãos. Para forçar agora:
  ```bash
  bullmq:add chatwoot-sync-sweep sweep-conn '{"connectionId":"X"}'
  ```
- Em casos extremos, deletar cursor pra forçar backfill da tabela toda:
  ```sql
  DELETE FROM chatwoot_sync_cursors WHERE connection_id = X AND table_name = 'Y';
  ```
  Próximo tick faz backfill completo (pode levar minutos para tabelas grandes).

## 8. Checklist Pós-Deploy

```
- [ ] /api/health retorna v0.41.0
- [ ] Login + abrir /bancos-de-dados (linha clicável funcional)
- [ ] /bancos-de-dados/[id]?tab=sincronizacao mostra runs aparecendo dentro de 1 min
- [ ] PEDIR AO JOÃO: acessar painel admin do Nexus Chat e REMOVER o webhook
      cadastrado (endpoint /api/webhooks/nexus-chat/<token> dá 404 agora; o
      Chatwoot vai retentar para sempre 4xx, gera lixo). Caminho:
      Configurações → Integrações → Webhooks → Apagar.
- [ ] Validar tour funcional em todas as 4 abas + lista raiz + Edit Dialog
      (clicar nos botões "?" — devem abrir overlay destacando elementos)
```

## 9. Comandos úteis (operação)

Acompanhar runs em tempo real:

```bash
docker logs -f nexus-insights_worker | grep "delta-sync"
```

Listar conexões e seu status:

```bash
psql ... -c "SELECT id, name, last_sync_at, polling_interval_seconds FROM nexus_chat_connections;"
```

Inspecionar cursores:

```bash
psql ... -c "SELECT connection_id, account_id, table_name, last_synced_at, last_error FROM chatwoot_sync_cursors ORDER BY connection_id, account_id, table_name;"
```
