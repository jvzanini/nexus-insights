---
agent: claude-dashboard-v013-hotfix
started_at: 2026-05-01T00:35-03:00
target_version: v0.13.1
status: in_progress
---

## Tópico
Hotfix: dashboard não abre após v0.13.0 ("aparece uma mensagem de erro e não aparece nada"). Investigar e corrigir.

## Arquivos prováveis suspeitos
- src/components/dashboard/dashboard-content.tsx (mudou em T6 e T8)
- src/components/dashboard/conversations-line-chart.tsx (rewrite total em T11)
- src/components/dashboard/drill-down-contents.tsx (refactor em T8)
- src/lib/actions/dashboard.ts (mudou em T5+T6)
- src/lib/actions/dashboard-drill-down.ts (mudou em T6 e T7)
- src/app/(protected)/dashboard/page.tsx (page server component)

## Bloqueios
- (vazio)
