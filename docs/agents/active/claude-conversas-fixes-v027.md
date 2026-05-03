---
agent: claude-conversas-fixes-v027
started_at: 2026-05-03T15:55-03:00
target_version: v0.27.0
status: in_progress
---

## Tópico
Fixes de regressões/feedback v0.25 em /relatorios/conversas — 8 itens reportados pelo João depois da v0.25.0 LIVE.

## Arquivos que vou tocar
- src/components/reports/conversas-page-client.tsx (PAGE_SIZE_CLIENT 100→1000)
- src/components/reports/conversas-pagination.tsx (volta algoritmo c/ ellipsis + EllipsisDropdown)
- src/components/reports/__tests__/conversas-pagination.test.tsx (atualiza tests)
- src/components/reports/advanced-filters.tsx (input busca: lupa roxa quando ativa + X canto direito; remove tag "Filtrando"; X chips Filtros/Ordenação volta estilo fosco)
- src/components/reports/__tests__/advanced-filters-x-style.test.tsx (atualiza expectativas)
- src/lib/reports/match-search-client.ts (REMOVE heurística isPhoneOrDocLike — match contíguo respeitando ordem)
- src/lib/reports/__tests__/match-search-client.test.ts (atualiza casos: "11 98765-4321" deixa de bater "+55 (11) 98765-4321"; mantém formatos contíguos)
- src/components/ui/calendar.tsx (cursor-pointer no day — afeta todos os calendários)
- src/components/reports/conversas-table.tsx (table-layout: fixed + larguras explícitas; renomear "Abrir conversa no Chatwoot" → "Abrir conversa no Nexus Chat")
- src/lib/tours/conversas-tour.ts (reordenar steps + renomear Chatwoot → Nexus Chat)

## Arquivos compartilhados que VOU modificar
- package.json (bump 0.25.0 → 0.27.0 — pula 0.26 ocupada pelo agente paralelo)
- CHANGELOG.md (entrada v0.27.0)
- docs/STATUS.md (release v0.27.0 no topo)

## Decisões / contexto importante
- v0.26.0 está LIVE em produção (agente paralelo claude-agente-nex-polish-v026 finalizou, sessão encerrada).
- package.json local ainda diz 0.25.0 (agente paralelo NÃO bumpou — só passou input pro portainer-fix). Vou bumpar pra 0.27.0 e alinhar.
- 8 fixes apontados via screenshots. Workflow: plan v1→v2→v3 (2 pentes-finos REAIS) + subagent-driven-development com TDD + ui-ux-pro-max em toda task UI + verification + code review.
- Skip brainstorming: requisitos claros e específicos (autorizado pelo João previamente em sessões similares).

## Bloqueios
- (vazio)
