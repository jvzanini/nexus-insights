# Runbook — Webhook Nexus Chat (Fase 2)

Operação do endpoint `/api/webhooks/nexus-chat/[token]` introduzido pela Fase 2 do épico Multi-tenant Realtime. Procedimentos voltados a **super_admin** + ops Chatwoot.

> Spec: `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase2-webhook-design.md`.
> Plan: `docs/superpowers/plans/2026-05-03-multi-tenant-realtime-fase2-webhook.md`.
> Runbook anterior: `docs/runbooks/multi-tenant-realtime.md` (Fase 1).

---

## 1. Cadastrar webhook no painel admin do Nexus Chat (Chatwoot)

Para cada **account** dentro de cada instalação Nexus Chat:

1. Acesse `/configuracoes/conexoes` no Nexus Insights (super_admin).
2. Abra o Dialog de Edit da connection.
3. Bloco **Webhook** mostra a URL e o secret (gerado UMA VEZ ao criar/regenerar).
4. **Copie URL e secret** (não recarregue a página antes — secret some).
5. No Chatwoot da instalação, navegue: **Configurações → Integrações → Webhooks → Add new webhook**.
6. Configure:
   - **URL**: cole a URL copiada (`https://insights.nexusai360.com/api/webhooks/nexus-chat/<token>`).
   - **Secret**: cole o secret copiado.
   - **Subscribe to events**: marque os 5 eventos canônicos:
     - `conversation_created`
     - `conversation_updated`
     - `conversation_resolved`
     - `message_created`
     - `conversation_status_changed`
7. Salve. O Chatwoot já começa a enviar webhooks.

**Repita o processo para cada account** dentro daquela instalação. Mesma URL + mesmo secret pra todas as accounts (o app roteia internamente pelo `account.id` no payload).

## 2. Validar com `curl` manual

```bash
# Computar HMAC-SHA256 do payload de teste
SECRET="seu-secret-aqui"
PAYLOAD='{"event":"conversation_created","account":{"id":9}}'
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

# Disparar webhook
curl -X POST "https://insights.nexusai360.com/api/webhooks/nexus-chat/<token>" \
  -H "Content-Type: application/json" \
  -H "x-chatwoot-hmac-sha256: $SIG" \
  -d "$PAYLOAD"
```

Esperado: `200 OK` com `{"ok":true}`.

Se `404`: token inválido ou connection paused/deleted.
Se `401`: HMAC inválido (secret errado ou payload alterado).
Se `429`: rate limit (>100 req/min).

## 3. Como regenerar secret (rotação)

Quando precisar invalidar um secret (ex.: vazamento, rotação periódica):

1. `/configuracoes/conexoes` → Edit → Bloco Webhook → Botão **"Regenerar secret"**.
2. AlertDialog confirma — confirmar.
3. Novo secret aparece no Alert success.
4. **Copie o novo secret IMEDIATAMENTE**.
5. Vá no painel Chatwoot, Edit do webhook, cole o novo secret, salve.

A partir desse momento o secret antigo é inválido — Chatwoot que ainda tente HMAC com o antigo recebe `401`.

## 4. Verificar latência: query SQL em audit_logs

```sql
-- Webhooks recebidos nos últimos 30 min (sample 1/100 — multiplicar)
SELECT
  details->>'connectionId' AS connection_id,
  details->>'accountId' AS account_id,
  details->>'event' AS event,
  details->>'durationMs' AS duration_ms,
  created_at
FROM audit_logs
WHERE action = 'webhook_received'
  AND created_at > NOW() - INTERVAL '30 minutes'
ORDER BY created_at DESC
LIMIT 50;

-- HMAC rejections (últimas 24h)
SELECT * FROM audit_logs
WHERE action = 'webhook_rejected_hmac'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Rate limit hits (últimas 24h)
SELECT * FROM audit_logs
WHERE action = 'webhook_rejected_rate_limit'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

Lembre-se: `webhook_received` é sample 1/100 — log estruturado em stdout do app captura **todos** (filtrar por `kind:"webhook_received"` em logs Portainer).

## 5. Troubleshooting

### `404 Not Found`
- Token inválido (não existe em `nexus_chat_connections`).
- Connection com `status='paused'` ou `deletedAt != null`.
- Connection sem `webhook_secret_enc` (não foi gerado).

Diagnóstico:
```sql
SELECT id, name, status, deleted_at, webhook_token IS NOT NULL AS has_webhook,
       webhook_secret_enc IS NOT NULL AS has_secret
FROM nexus_chat_connections;
```

### `401 Unauthorized`
- Header `x-chatwoot-hmac-sha256` ausente OU
- HMAC computado pelo Chatwoot ≠ HMAC esperado pelo app.

Causas comuns:
- Secret diferente entre Chatwoot e Nexus Insights (regenerou aqui mas esqueceu de atualizar lá).
- Body modificado entre Chatwoot e app (proxy reescreveu? raríssimo).
- Encoding diferente (UTF-8 esperado).

Diagnóstico: ver audit `webhook_rejected_hmac` (mostra `reason: "missing_header"` ou `"mismatch"`).

### `429 Too Many Requests`
- >100 req/min no mesmo token.
- Causa: tráfego anormal (loop no Chatwoot? ataque? cliente novo onboardado com replay massivo?).

Diagnóstico: `Retry-After: 60` no response. Aguardar 1 min, depois investigar logs.

### `200 OK` mas dados não atualizam no painel
- Possível causa: `account_id` no payload não tem binding em `company_chat_bindings` (binding desabilitado ou nunca criado).
- Diagnóstico: ver audit `webhook_no_binding` (sample 1/100).
- Fix: super_admin cria binding em `/configuracoes/conexoes`.

### Webhook quieto (não chegou nada faz tempo)
- `last_webhook_at` é o timestamp do último webhook recebido (campo populado pelo endpoint).
- Cron fallback de 30 min cobre.

Diagnóstico:
```sql
SELECT name, last_webhook_at,
       NOW() - last_webhook_at AS quietude
FROM nexus_chat_connections
WHERE deleted_at IS NULL AND status = 'active';
```

Se `quietude > 1 hour` em horário comercial: algo errado no Chatwoot (webhook desativado? URL errada?). Validar com `curl` (item 2).

## 6. Rate limit por token (100/min)

Hard limit. Definido em `route.ts` constante `RATE_LIMIT_PER_MINUTE = 100`.

Volume real Chatwoot Matrix:
- ~6.000 conversas/mês = 200/dia = 8/hora pico.
- 1 conversa = ~3-5 eventos (created + updated + resolved + 1-3 messages).
- Total estimado: ~25-40 eventos/h por account.
- Margem 100/min = 6.000/h vs ~40/h real → 150x safety.

Se chegar perto do limite: review se há loop ou múltiplos clientes compartilhando token.

## 7. Replay attack — ausência de timestamp

Chatwoot **não** envia timestamp no header. HMAC sobre o body cobre integridade mas não previne replay (atacante repete request com mesmo body+sig).

Mitigação:
- Token é privado (URL com 32 bytes random — não-enumerável).
- Tráfego é HTTPS (capturar exige MITM no Chatwoot ou no Hostinger).
- Replay duplica trabalho mas não corrompe (jobs `refresh-by-*` são idempotentes via UPSERT).

Aceito como trade-off; documentar pra cliente se ficar sensível.

## 8. Cron fallback 30 min

Mesmo se webhook quebrar, cron fallback dispara 4 jobs (refresh-by-account/inbox/agent/team) a cada 30 min para todas as bindings ativas. Desligar webhook por 1 dia → dados ficam ~30 min stale (vs ~5 min na v0.36 antiga).

Schedulers: `facts-refresh-by-{account,inbox,agent,team}-fallback` em `*/30 * * * *`.

## 9. Detectar webhook quieto automaticamente (futuro)

Não há alerta automático na Fase 2. Idéia para próxima fase: checar a cada 1h se `last_webhook_at < NOW() - 1 hour` em horário comercial. Se sim, audit log + (futuro) email.

## 10. Smoke test pós-deploy v0.38.0

Após cada release que toque webhook:

```bash
# 1. Endpoint acessível externamente
curl -I https://insights.nexusai360.com/api/webhooks/nexus-chat/teste-token-invalido
# Esperado: HTTP/2 404 (não 502 Bad Gateway, não 500)

# 2. Health check
curl -s https://insights.nexusai360.com/api/health | jq .
# Esperado: status=ok, version=v0.38.0, connections[0].name=Padrão (legado)

# 3. Audit logs novos
psql "$DATABASE_URL" -c "
SELECT action, COUNT(*)
FROM audit_logs
WHERE action LIKE 'webhook%'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY action
"
# Esperado (após Chatwoot disparar): webhook_received aparece (mesmo que sample 1/100)

# 4. Cron fallback rodando 30 min
# Esperar 35 min pós-deploy. Logs do worker (Portainer) mostram:
#   [worker.refresh-by-account] done repeat:facts-refresh-by-account-fallback:* { ... }
```

## 11. Referências

- Spec Fase 2: `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase2-webhook-design.md`
- Plan Fase 2: `docs/superpowers/plans/2026-05-03-multi-tenant-realtime-fase2-webhook.md`
- Runbook Fase 1: `docs/runbooks/multi-tenant-realtime.md`
- Endpoint: `src/app/api/webhooks/nexus-chat/[token]/route.ts`
- HMAC utility: `crypto.createHmac` + `crypto.timingSafeEqual` (Node.js nativo).
- Pool dinâmico: `src/lib/nexus-chat/pool.ts`.
