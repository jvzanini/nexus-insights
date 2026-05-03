---
agent: claude-l7-use-facts-realtime
started_at: 2026-05-03T22:30-03:00
target_version: v0.35.0
status: in_progress
---
## Tópico
L7 do plan multi-tenant fase 1 — useFactsRealtime + Visão Geral.

## Arquivos que vou tocar
- src/components/reports/use-facts-realtime.ts (e test)
- src/components/reports/facts-freshness.tsx (e test)
- src/app/(protected)/relatorios/visao-geral/page.tsx
- (também os outros consumidores de FactsFreshness para não quebrar build:
  src/app/(protected)/relatorios/{distribuicao,equipe,origem-ia,performance}/page.tsx,
  src/components/dashboard/dashboard-content.tsx)
