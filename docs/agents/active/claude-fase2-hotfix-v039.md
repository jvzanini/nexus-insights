---
agent: claude-fase2-hotfix-v039
started_at: 2026-05-04T03:30-03:00
target_version: v0.39.0
status: in_progress
---

## Tópico
Hotfix Fase 2: remover HMAC completamente (Account Webhooks Chatwoot não suportam — pesquisa concluída), simplificar UI (só URL), mover sidebar (Bancos de dados no nível superior, Jobs de pré-agregação removido), substituir Sheet de bindings por page dedicada `/bancos-de-dados/[id]`.

## Arquivos
- src/app/api/webhooks/nexus-chat/[token]/route.ts (remover HMAC + tests)
- src/lib/nexus-chat/webhook-credentials.ts (só token)
- src/lib/actions/nexus-chat/connections.ts (remover regenerateConnectionWebhookSecret + secretPlain)
- src/lib/nexus-chat/seed.ts (backfill só token)
- src/lib/constants/nav.ts (Bancos de dados +; Jobs -)
- src/app/(protected)/bancos-de-dados/page.tsx (nova)
- src/app/(protected)/bancos-de-dados/[id]/page.tsx (nova — page bindings)
- src/app/(protected)/configuracoes/conexoes/page.tsx (redirect 308)
- src/components/settings/nexus-chat/connection-form-dialog.tsx (UI sem secret)
- src/components/settings/nexus-chat/binding-list-sheet.tsx (DELETAR)
- src/components/settings/nexus-chat/connection-list.tsx (badge atualizado)

## Coordenação
- Working tree limpo no início.
- v0.38.0 LIVE em produção (3adbddc + 9e298e7).
- Sou único agente ativo nesta sessão.
