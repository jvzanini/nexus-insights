---
agent: claude-l4-relatorios-queries
started_at: 2026-05-04T01:10Z
target_version: v0.37.0
status: in_progress
---

## Tópico
L4 do plan multi-tenant fase 1 — refator queries dos relatórios *-content (8 queries + tests + callers em components/pages).

## Arquivos que vou tocar
- `src/lib/chatwoot/queries/leads-recebidos.ts` (+ test)
- `src/lib/chatwoot/queries/matrix-ia.ts` (+ test)
- `src/lib/chatwoot/queries/por-departamento.ts` (+ test)
- `src/lib/chatwoot/queries/por-estado.ts` (+ test)
- `src/lib/chatwoot/queries/ranking-atendentes.ts` (+ test)
- `src/lib/chatwoot/queries/tempos-resposta.ts` (+ test)
- `src/lib/chatwoot/queries/volumetria-dow.ts` (+ test)
- `src/lib/chatwoot/queries/volumetria-heatmap.ts` (+ test)
- callers em `src/components/reports/dashboards/*-content.tsx` e tabelas
- `src/app/(protected)/relatorios/origem-ia/page.tsx`

## Áreas que NÃO vou tocar
- `dashboard-data`, `dashboard-drill-down`, `dashboard-kpis`, `home-summary`, `status-distribution` (L2 dashboard).
- `conversas-list`, `meta-cache`, `meta-cache-for-user` (L3 conversas).
- `mensagens-nao-respondidas`.
- `docs/agents/HISTORY.md`.
- `package.json` (release task L9).
