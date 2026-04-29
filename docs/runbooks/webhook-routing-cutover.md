# Runbook: cutover do pipeline webhook-ingest

Migração de `src/app/api/webhook/[webhookKey]/route.ts` para pipeline gerenciado
pelo `@nexusai360/webhook-routing` (via `PrismaWebhookAdapter` + flag
`USE_PACKAGE_PIPELINE`).

## Pré-deploy (uma vez, no merge)

1. Confirmar `USE_PACKAGE_PIPELINE` ausente em produção (default off = `handleInlinePost`).
2. Aplicar migration `inbound_unique_dedupe` — **obrigatória** antes de ativar flag:

   ```bash
   # Checar duplicatas pré-existentes:
   psql "$DATABASE_URL" -c "
     SELECT count(*) FROM (
       SELECT company_id, dedupe_key FROM inbound_webhooks
       GROUP BY 1,2 HAVING count(*) > 1
     ) t;
   "

   # Se > 0, cleanup (mantém o mais antigo):
   psql "$DATABASE_URL" -c "
     DELETE FROM inbound_webhooks WHERE id NOT IN (
       SELECT MIN(id) FROM inbound_webhooks GROUP BY company_id, dedupe_key
     );
   "

   # Aplicar migration:
   npx prisma migrate deploy
   ```

3. Smoke staging com `USE_PACKAGE_PIPELINE=true` por 24h:

   ```bash
   WEBHOOK_URL="https://staging.example.com/api/webhook/<key>" \
   META_APP_SECRET="<secret>" \
   node scripts/smoke-webhook.mjs
   ```

   Validar em staging:
   - Logs `[webhook-ingest]` sem erros repetidos.
   - `processing_status` das últimas 1h majoritariamente `queued` / `received`.
   - `route_deliveries` sendo criadas e processadas pelo worker.

## Cutover prod

1. Setar `USE_PACKAGE_PIPELINE=true` no env de produção (Portainer / orquestrador).
2. Reiniciar serviço Next + worker.
3. Monitorar 15 min:

   ```sql
   SELECT processing_status, count(*) FROM inbound_webhooks
   WHERE created_at > now() - interval '15 min' GROUP BY 1;
   ```

   Esperado: predominância `queued` / `received`, contagem ±10% do baseline
   pré-cutover. `no_routes` estável.

4. **Abortar cutover se**:
   - Erro rate > 5% (5xx no endpoint).
   - Divergência > 20% na contagem de `processing_status=queued` vs baseline.
   - Pico sustentado de `processing_status=received` sem transição para `queued`
     (indica falha no enqueue BullMQ).

## Rollback rápido (sem redeploy)

1. Setar `USE_PACKAGE_PIPELINE=false` no env.
2. Reiniciar serviço Next + worker.
3. Pipeline volta para `handleInlinePost` (helpers legacy intactos).
4. Investigar logs `[webhook-ingest]` e `[webhook-adapter]` antes de tentar de novo.

## Limpeza (após 7d estáveis)

PR-C fará:
1. Deletar `src/app/api/webhook/[webhookKey]/route-inline.ts`.
2. Remover flag `USE_PACKAGE_PIPELINE` de `route.ts` (pipeline do pacote
   passa a ser o único caminho).
3. Deletar `src/lib/webhook/legacy/` (normalizer + deduplicator + testes).
4. Atualizar CHANGELOG (entry `[PR-C]`).
