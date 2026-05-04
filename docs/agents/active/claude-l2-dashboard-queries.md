---
agent: claude-l2-dashboard-queries
started_at: 2026-05-04T01:03Z
target_version: v0.37.0
status: in_progress
---

## Tópico
L2 do plan multi-tenant fase 1 — refator das queries do Dashboard para receber
`connectionId: string` como primeiro parâmetro e usar `queryNexusChat` em vez
de `getChatwootPool`.

## Arquivos que vou tocar
- `src/lib/chatwoot/queries/dashboard-data.ts` (+ test associado quando existir)
- `src/lib/chatwoot/queries/dashboard-drill-down.ts` (+ test)
- `src/lib/chatwoot/queries/dashboard-kpis.ts` (+ test)
- `src/lib/chatwoot/queries/home-summary.ts` (+ test)
- `src/lib/chatwoot/queries/status-distribution.ts` (+ test)
- `src/lib/chatwoot/__tests__/dashboard-data-chart-invariant.test.ts` (atualizar)
- callers em `src/components/dashboard/*` e `src/components/reports/dashboards/*`
- pages em `src/app/(protected)/dashboard/page.tsx` e
  `src/app/(protected)/relatorios/visao-geral/page.tsx`
- `docs/agents/active/claude-l2-dashboard-queries.md` (criar/excluir)

## Áreas que NÃO vou tocar
- `conversas-list.ts`, `meta-cache.ts`, `meta-cache-for-user.ts` (Conversas).
- `leads-recebidos`, `matrix-ia`, `por-departamento`, `por-estado`,
  `ranking-atendentes`, `tempos-resposta`, `volumetria-dow`,
  `volumetria-heatmap` (Relatórios *-content).
- `mensagens-nao-respondidas.ts` (Mensagens não respondidas).
- `docs/agents/HISTORY.md`.
- `package.json` (release task L9).
