---
agent: claude-conversas-v019
started_at: 2026-05-02T03:55-03:00
target_version: v0.19.0
status: in_progress
---

## Tópico
Polimento + hotfixes do `/relatorios/conversas` em cima da v0.17.0 (8 ajustes diretos do super_admin via screenshots): drill-down visual mais bonito, paginação 1.000-em-1.000 com indicador de total, busca UX (sem banner pending no draft + hint sutil + bug do skip-link), chips +N com lista expansível em popover, X dos chips mais visível, calendar sem outside days + selected highlight contido no mês, minDate dinâmica por accountId verificada, tour ganha step "atalhos".

## Arquivos que provavelmente vou tocar
- src/app/(protected)/relatorios/conversas/page.tsx (passar pageSize/page + total)
- src/app/(protected)/relatorios/conversas/layout.tsx (skip link — investigar)
- src/lib/actions/reports/conversas.ts (assinatura: page, pageSize, returns total)
- src/lib/chatwoot/queries/conversas-list.ts (count(*) + paginação clássica em vez de cursor)
- src/components/reports/conversas-table.tsx (paginação numerada, remove banner amarelo, remove infinite/virtual scroll? mantém virtual com pageSize=1000)
- src/components/reports/conversa-drill-down.tsx (visual polish minimal)
- src/components/reports/advanced-filters.tsx (busca: hint sutil; remove "filtro pendente" ou separa search; investiga skip-link banner)
- src/components/reports/applied-filters-chips.tsx (+N expansível popover)
- src/components/reports/period-pills.tsx (passa accountId verifica)
- src/components/ui/calendar.tsx (showOutsideDays=false; selected fica contido no mês)
- src/lib/tours/conversas-tour.ts (adiciona step "atalhos")
- NEW: src/components/reports/filter-chip-list-popover.tsx
- NEW: src/components/reports/conversas-pagination.tsx
- package.json (bump 0.18.0 → 0.19.0)
- CHANGELOG.md (release notes v0.19.0)
- docs/STATUS.md
- docs/superpowers/specs/2026-05-02-conversas-v019-polish-design.md (NEW)
- docs/superpowers/plans/2026-05-02-conversas-v019-polish.md (NEW)

## Arquivos compartilhados que VOU modificar
- package.json, CHANGELOG.md, docs/STATUS.md (versão e release notes — sem outros agentes ativos no momento)
- src/components/ui/calendar.tsx (compartilhado mas no momento sem agente paralelo competindo; entregue na v0.16.0 com showOutsideDays=false default global, mas user ainda vê bug → investigar)

## Decisões / contexto importante
- **Workflow rigoroso**: spec v1→v2→v3 (2 pente-finos) + plan v1→v2→v3 + subagent-driven-development com TDD por task + ui-ux-pro-max em toda task UI.
- **Paginação 1.000**: substitui cursor pagination + infinite scroll por paginação clássica numerada (1, 2, 3...). Backend retorna `{ rows, total, page, pageSize }`. UI: setinhas + page numbers (com elipses se >7 páginas) + "Total: X conversas". Padrão pageSize: 1000.
- **Virtualização**: mantida (até 1000 rows ainda exige virtualização pra performance).
- **Busca pending**: remover banner "filtros pendentes" quando o ÚNICO diff entre draft e applied é o `search`. Hint sutil abaixo do input "Aperte Enter para buscar" só aparece quando draft.search != applied.search.
- **Skip-link "Pular para a tabela"**: investigar onde aparece (provavelmente na page.tsx como `<a className="sr-only focus:not-sr-only">`). Manter funcionalidade a11y, mas não deve aparecer visualmente após Enter no input. Provável fix: trocar focus management ou ajustar CSS pra esconder em certos contextos.
- **Chips +N popover**: Popover (base-ui) que abre ao clicar no chip (a área toda do chip vira clicável quando há +N), com lista vertical de items + X em cada um pra remover individualmente. Click outside fecha. Animação fade-in 150ms.
- **X chips mais visível**: aumentar contraste (border-destructive/30 + bg-destructive/10 no hover, ou icon stroke maior).
- **Calendar `showOutsideDays={false}`**: já é o default desde v0.16.0 mas o user vê bug. Investigar se PeriodPills não está sobrescrevendo (ele passa `showOutsideDays` sem `={false}` → ativa true).
- **minDate dinâmico**: já é dinâmico por accountId via `getMinReportDate(accountId)` em PeriodPills. Verificar se está chamando corretamente quando o usuário troca conta no sidebar. Se sim, o "21 de março de 2025" exibido pelo user deve ser real do banco da conta atual — confirmar ou debugar.
- **Tour atalhos**: adicionar step apontando para `[data-tour='presets']` OR criar `data-tour='atalhos'` específico para `<QuickFiltersPopover>`. Verificar HTML atual.
- **Versão**: v0.19.0 (powerbi pegou v0.18.0).

## Bloqueios
- (nenhum — sem outros agentes ativos no momento)
