---
agent: claude-conversas-polish-v025
started_at: 2026-05-03T14:00-03:00
target_version: v0.25.0
status: in_progress
---

## Tópico
Polimento /relatorios/conversas — 7 ajustes de UX/UI + bug crítico da busca

## Arquivos que provavelmente vou tocar
- src/components/reports/advanced-filters.tsx (SORT_OPTIONS + chips Filtros/Ordenação X estilo)
- src/components/reports/applied-filters-chips.tsx (Etiquetas sem parênteses + summarize labels)
- src/components/reports/sorting-dialog.tsx ("Adicionar critério" sem coluna pré-selecionada)
- src/components/reports/conversas-pagination.tsx (algoritmo simplificado sem reticências quando atual no meio)
- src/components/reports/period-pills.tsx (cursor pointer)
- src/components/ui/calendar.tsx (cursor pointer nas setinhas/dias)
- src/components/reports/conversas-page-client.tsx (busca client-side via state local)
- src/components/reports/conversas-table.tsx (filtragem client-side por search + highlight)
- src/app/(protected)/relatorios/conversas/page.tsx (search sai do reportFilters)
- src/lib/chatwoot/queries/conversas-list.ts (search server-side desabilitada/removida)
- src/lib/chatwoot/conversas-search.ts (deprecate ou simplificar — virar utilitário client)

## Arquivos compartilhados que VOU modificar
- package.json (bump v0.25.0)
- CHANGELOG.md (entrada v0.25.0)
- docs/STATUS.md (release v0.25.0)

## Decisões / contexto importante
- Workflow rigoroso: brainstorming → spec v1→v2→v3 → plan v1→v2→v3 → subagent-driven-development com TDD → ui-ux-pro-max em toda task UI → verification-before-completion → code review → finishing-a-development-branch.
- Busca client-side: arquitetura nova (sai do SQL, vira filtro local sobre rows já carregados).
- Bug do label "Documento": coluna existe na tabela mas falta entry na SORT_OPTIONS.
- Branch: main (commits direto, padrão do projeto).

## Bloqueios
- (vazio)
