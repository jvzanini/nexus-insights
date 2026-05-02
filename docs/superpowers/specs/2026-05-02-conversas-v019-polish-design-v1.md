# Spec v1: Conversas v0.19 — Polish + Hotfixes

> **Data**: 2026-05-02
> **Versão alvo**: v0.19.0
> **Sessão**: claude-conversas-v019
> **Status**: v1 (versão inicial — passa por pente-fino #1 antes de v2)

---

## 1. Objetivo

Aplicar 8 ajustes em cima da v0.17.0 reportados pelo super_admin via screenshots, todos no relatório `/relatorios/conversas`.

---

## 2. Escopo funcional

### 2.1 Drill-down visual mais bonito

Reorganizar layout sem cores extras. Manter tudo visível (sem "Ver mais"/"Recolher"). Adicionar borda esquerda violeta sutil. Espaçamento ajustado.

### 2.2 Paginação 1.000-em-1.000

Substituir cursor pagination por paginação clássica com numbered pages. Backend retorna `total`. Indicador "Total: X conversas" no toolbar. Setinhas + números de página.

### 2.3 Busca UX

- Banner "filtros pendentes" não deve aparecer ao digitar no input search.
- Hint sutil "Aperte Enter para buscar" abaixo do input.
- Investigar bug do skip-link "Pular para a tabela de conversas" aparecendo após Enter.

### 2.4 Chips +N expansíveis

Chip "Caixa de entrada: AL-Alagoas +2" precisa virar Popover clicável que mostra a lista completa.

### 2.5 X dos chips mais visível

Hover mais destacado.

### 2.6 Calendar overflow days

Não permitir seleção/highlight em dias fora do mês mostrado. Bug está em `period-pills.tsx:205` que passa `showOutsideDays` sem valor (= true).

### 2.7 minDate dinâmica por accountId

Garantir que `getMinReportDate(accountId)` invoca corretamente quando troca conta no sidebar.

### 2.8 Tour ganha step "atalhos"

Adicionar step para `<QuickFiltersPopover>`.

---

## 3. Arquitetura

### 3.1 Backend

`fetchConversas` ganha `page`, `pageSize`. Retorna `total`. `conversasList` faz `count(*)` paralelo + `OFFSET/LIMIT`.

### 3.2 Componentes

- `<ConversasTable>` recebe `total`, `page`, `pageSize`, `onPageChange`.
- `<ConversasPagination>` (NEW): paginação numerada.
- `<FilterChipListPopover>` (NEW): popover de lista para chips com +N.
- `<ConversaDrillDown>` (PATCH): visual polish.
- `<AdvancedFilters>` (PATCH): pending exclui search, hint sutil.
- `<AppliedFiltersChips>` (PATCH): usa FilterChipListPopover quando >= 2 items; X mais destacado.
- `<PeriodPills>` (PATCH): remove `showOutsideDays`; reset minDate quando accountId muda.
- `conversas-tour.ts` (PATCH): step atalhos.

### 3.3 Versão

v0.19.0 (powerbi pegou v0.18.0).

---

## 4. Testes

- Unit: `fetchConversas` retorna total; `<ConversasPagination>` renderiza ranges com elipsis; `<FilterChipListPopover>` lista N items.
- Component: `<ConversaDrillDown>` mostra TODOS atributos; `<AdvancedFilters>` digitar search NÃO mostra banner pending; `<AppliedFiltersChips>` >= 2 vira popover.
- Smoke: filtrar período + filtros + busca; trocar conta no sidebar.

---

## 5. Plano de release

Push → CI → portainer-fix → /api/health → smoke → avisar user.
