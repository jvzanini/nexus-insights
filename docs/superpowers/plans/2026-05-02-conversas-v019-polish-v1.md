# Plan v1: Conversas v0.19 Polish

> **Status**: v1 — passa por pente-fino #1 antes de v2.

**Goal:** Aplicar 8 ajustes em `/relatorios/conversas` em cima da v0.17.0.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, base-ui, @tanstack/react-virtual, react-day-picker, exceljs, Jest+RTL.

---

## Tasks (granulares, TDD)

### T1: filter-state.page

Add field `page?: number` em `FilterState`. Update serialize/deserialize. Tests: 7 cenários.

### T2: conversas-list — count(*) paralelo + offset

Add `page?, pageSize?` em `conversasList`. Promise.all rows + count. Cache key inclui page/pageSize.

### T3: fetchConversas — page, pageSize, total

Reescrever output: total, page, pageSize, totalPages.

### T4: page.tsx — passa page e pageSize=1000

Lê `?page=` e passa pra fetchConversas.

### T5: ConversasPagination

Componente novo. Algoritmo elipsis. Tests.

### T6: ConversasTable — recebe paginação

Remove banner amarelo, cursor, onRowCountChange. Adiciona total/page/pageSize/totalPages/onPageChange.

### T7: ConversasPageClient — handlePageChange

Implementa router.push com page novo.

### T8: AdvancedFilters — pushUrl zera page

Todos os handlers passam page=undefined em pushUrl.

### T9: AdvancedFilters — banner pending exclui search + hint

`pendingDiffExSearch` + hint sutil.

### T10: page.tsx — skip-link sr-only

Remove `focus:not-sr-only`.

### T11: FilterChipListPopover (NEW)

Popover com lista. Tests.

### T12: AppliedFiltersChips — usa FilterChipListPopover quando >= 2

Resolver names de inboxes/teams/etc. Statuses/priorities via local map.

### T13: AppliedFiltersChips — X mais destrutivo

Classes hover.

### T14: AdvancedFilters — handleRemoveOne

Novo callback.

### T15: ConversaDrillDown — visual polish

Border-l violet, sem ver-mais, cap 200, animação fade-in.

### T16: PeriodPills — fix showOutsideDays

Remove a prop.

### T17: PeriodPills — reset minDate por accountId

Novo useEffect.

### T18: Tour — step atalhos + bump v3 + data-tour=atalhos

Em conversas-tour.ts e advanced-filters.tsx.

### T19: Bump versão + CHANGELOG + STATUS

v0.18.0 → v0.19.0.

### T20: Verification + push + deploy

typecheck, jest, build, gh run list, push, portainer-fix, /api/health, smoke.
