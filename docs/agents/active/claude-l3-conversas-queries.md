---
agent: claude-l3-conversas-queries
started_at: 2026-05-04T01:05:00Z
target_version: v0.37.0
status: in_progress
---

## Tópico
L3 do plan multi-tenant fase 1 — refator queries de Conversas + meta-cache para receber `connectionId` como primeiro parâmetro.

## Arquivos
- src/lib/chatwoot/queries/conversas-list.ts
- src/lib/chatwoot/queries/meta-cache.ts
- src/lib/chatwoot/queries/meta-cache-for-user.ts
- src/lib/chatwoot/queries/__tests__/conversas-list.test.ts
- src/lib/chatwoot/queries/__tests__/meta-cache.test.ts (novo)
- src/lib/chatwoot/queries/__tests__/meta-cache-for-user.test.ts
- src/lib/actions/reports/conversas.ts
- src/lib/actions/reports/conversas-export.ts
- src/lib/actions/reports/__tests__/conversas.test.ts
- src/lib/actions/reports/__tests__/conversas-export.test.ts
- src/app/(protected)/relatorios/conversas/page.tsx
- src/app/(protected)/relatorios/mensagens-nao-respondidas/page.tsx
- src/lib/actions/users.ts (defensivo — resolve connectionId por account)
