# Spec v2: Conversas v0.23 — Polish + Bug Fixes

> **Data**: 2026-05-03
> **Status**: v2 (passou por pente-fino #1 com 25 achados; pente-fino #2 a seguir)

---

## 0. Achados do pente-fino #1 aplicados

1. v1 não mostrava root cause da busca → §3.1 explicita o fix (page.tsx linha 58-71).
2. v1 dizia "investigar" single-day → §3.2 propõe hipóteses concretas + plano de teste.
3. totalPages=4 ambíguo → §3.9 explicita: 4 → "1 2 3 4" (sem elipsis).
4. Dropdown das reticências sem detalhe → §3.10 detalha Popover + lista vertical scrollable.
5. Anti-duplicação sorting + remoção → §3.3 esclarece comportamento.
6. Badge ⏎ Enter sem detalhe visual → §3.5 detalha (kbd + cores).
7. Paginação no mobile → §3.8 detalha overflow.
8. X adesivo: remove ou expande? → §3.16 confirma "remove o chip inteiro do toolbar".
9. Hint Enter quando apertado → §3.5 absoluto OR badge inline (decisão: badge inline).
10. Search live-update? → §3.1 NÃO (Enter required).
11. Feedback visual limpar-todos → §3.14.
12. Edge case: limpar-todos sem filtros → §3.14.
13. Calendar range partial → §3.7 (mantém comportamento atual).
14. Persistência paginação URL → §3.8 (já existe `?page=`).
15. X adesivo SUBSTITUI lixeirinhas → §3.16.
16. "Mostrando X-Y de Z" quando total < pageSize → §3.7 detalha.
17. Search 0 resultados fallback → §3.1.
18. Strings tour → §3.17 detalhadas.
19. "Remover duplicação Ordenação 3" → §3.6 esclarece.
20. Símbolo Enter → §3.5 decide texto "Enter ↵" inline.
21. Reset focus em onPageChange → §3.10 não.
22. exportConversasAction com search → §3.1 (já recebe via filters).
23. Limpar-só-filtros zera atalhos? → §3.14 NÃO (atalhos são separados).
24. Reset page quando search aplicada → §3.1 (sim, via pushUrl).
25. Tests TDD por feature → §6.

---

## 1. Objetivo

18 ajustes do super_admin no `/relatorios/conversas`, incluindo 3 bugs críticos.

---

## 2. Stack
- Next.js 16, React 19, TypeScript strict.
- Tailwind v4, base-ui (Popover), react-day-picker v9.
- Jest + jest-mock-extended + RTL.

---

## 3. Escopo funcional

### 3.1 BUG CRÍTICO — Busca não funciona

**Root cause**: `src/app/(protected)/relatorios/conversas/page.tsx` linhas 58-71 constrói `reportFilters` SEM o campo `search`:

```ts
const reportFilters: ReportFilters = {
  period,
  inboxIds: filterState.inboxIds.length ? filterState.inboxIds : undefined,
  // ... outros campos
  excludeMatrixIA,
};
```

`filterState.search` existe (deserializeFilterState lê `?q=`), mas é descartado. Backend nunca recebe.

**Fix** (1 linha):
```ts
const reportFilters: ReportFilters = {
  period,
  // ... existentes
  search: filterState.search,  // ← novo
  excludeMatrixIA,
};
```

**Comportamento esperado pós-fix**:
- Enter no input search dispara filtragem combinada com período + filtros + sort + atalhos.
- Search 0 resultados: empty state existente já cobre (`Nenhuma conversa encontrada · Limpar filtros`).
- Search reseta page=1 (pushUrl em advanced-filters já zera page).
- exportConversasAction continua funcional (recebe `args.filters` que agora tem search).

### 3.2 BUG CRÍTICO — Single-day filter retorna 0

**Reprodução**: filtrar período custom 2025-03-21 a 2025-03-21 retorna 0 conversas, mas 2025-03-21 a 2025-03-22 retorna 3 conversas com `created_at` em 21/03.

**Investigação**:
- `getPeriodInTz("custom", { start: "2025-03-21", end: "2025-03-21" })` em `datetime-core.ts:86-100`:
  - `startInTz = toZonedTime("2025-03-21", "America/Sao_Paulo")`
  - `endInTz = toZonedTime("2025-03-21", "America/Sao_Paulo")`
  - `startLocal = startOfDay(startInTz)` = 21/03 00:00 SP
  - `endLocal = endOfDay(endInTz)` = 21/03 23:59:59.999 SP
  - Retorna `{start: 21/03 03:00 UTC, end: 22/03 02:59:59.999 UTC}`
- SQL em `buildBaseFilter`: `c.created_at >= start AND c.created_at < end`.
- Conversas com `created_at` entre 21/03 03:00 UTC e 22/03 02:59:59.999 UTC deveriam ser retornadas.

**Hipótese 1**: `toZonedTime("2025-03-21", "America/Sao_Paulo")` interpreta "2025-03-21" como UTC midnight (00:00 UTC), depois converte pra SP (-3h = 20/03 21:00 SP). `startOfDay` retorna 20/03 00:00 SP. `endOfDay` retorna 20/03 23:59:59 SP. Range UTC: `[20/03 03:00 UTC, 21/03 02:59:59.999 UTC]`. Conversas em 21/03 03:00 UTC+ ficam fora.

Plano de teste pra confirmar hipótese:
1. Test unit em `datetime-core.test.ts` que valida `getPeriodInTz("custom", { start: "2025-03-21", end: "2025-03-21" })` retorna `{start: 21/03 03:00 UTC, end: 22/03 02:59:59.999 UTC}` (não 20/03).
2. Se fail: o bug está em `toZonedTime` interpretando string como UTC.

**Fix proposto**:
- Em `datetime-core.ts case "custom"`: substituir `toZonedTime(customRange.start, tz)` por uma construção explícita que respeite o input como data local SP:
  ```ts
  const startInTz = parseISODateToZoned(customRange.start, tz);
  const endInTz = parseISODateToZoned(customRange.end, tz);
  ```
  Onde `parseISODateToZoned("2025-03-21", "America/Sao_Paulo")` cria uma Date que representa "21/03 00:00 SP" diretamente (não passando por UTC).

  Implementação simples: `new Date(year, month-1, day)` cria Date em local browser TZ (que pode diferir do servidor). No servidor (Node), usar `fromZonedTime("2025-03-21T00:00:00", tz)`.

- TDD: test primeiro, depois fix.

### 3.3 BUG CRÍTICO — Sorting permite duplicar coluna

`<SortingDialog>` em `src/components/reports/sorting-dialog.tsx`: ao adicionar critério N, todas as opções aparecem mesmo as já usadas em critérios 1..N-1.

**Fix**: filtrar `options` excluindo `key` já presentes em critérios anteriores.

**Comportamento esperado**:
- Critério 1: dropdown com TODAS opções.
- Critério 2: dropdown SEM a opção do critério 1.
- Critério N: dropdown SEM as opções de 1..N-1.
- Quando user remove critério N, a opção volta a ser disponível nos outros.
- Reordenamento (drag-drop ou up/down) recalcula opções automaticamente.

### 3.4 Layout barra de busca não quebra ao digitar

**Bug**: hint `<span className="block">Aperte Enter para buscar</span>` adiciona altura ao container flex do input, fazendo `<Search>` icon descer e botões adjacentes (presets, atalhos, filtros, ordenação, exportar) descerem juntos.

**Fix**: hint vai pra dentro do input como badge absoluto `⏎ Enter`, NÃO `<span>` block embaixo.

### 3.5 Badge ⏎ Enter (estilo Command+K)

Substitui o hint atual ("Aperte Enter para buscar"):

```tsx
<div className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
  Pressione
  <kbd className="font-semibold text-violet-500 tabular-nums">↵ Enter</kbd>
</div>
```

**Visibilidade**:
- SEMPRE visível (não condicional ao `searchPending`).
- Padding-right do `<Input>` aumentado pra 110px pra acomodar o badge.
- Quando user digita, NÃO altera layout (badge é absoluto).

**Cor da palavra "Enter"**: violet-500 (consistente com paleta da plataforma).

### 3.6 Toolbar tabela — remover duplicação "Ordenação 3"

Hoje, dentro do toolbar interno da `<ConversasTable>`, há um chip "Ordenação · 3 [X]" que duplica o que já está no `<AppliedFiltersChips>` do bloco de configuração.

**Fix**: remover o chip clean-up duplicado. Manter apenas no AppliedFiltersChips.

### 3.7 Toolbar tabela — formato "Mostrando X-Y de Z conversas"

```tsx
<span className="text-xs text-muted-foreground tabular-nums">
  Mostrando{" "}
  <strong className="text-foreground">
    {Math.min((page - 1) * pageSize + 1, total).toLocaleString("pt-BR")}
    -
    {Math.min(page * pageSize, total).toLocaleString("pt-BR")}
  </strong>{" "}
  de{" "}
  <strong className="text-foreground">{total.toLocaleString("pt-BR")}</strong>{" "}
  conversa{total === 1 ? "" : "s"}
</span>
```

Exemplos:
- total=7183, page=1, pageSize=1000 → "Mostrando 1-1.000 de 7.183 conversas"
- total=7183, page=8, pageSize=1000 → "Mostrando 7.001-7.183 de 7.183 conversas"
- total=500, page=1, pageSize=1000 → "Mostrando 1-500 de 500 conversas"
- total=0 → "0 conversas" (cap especial: não há "1-0")

### 3.8 Paginação no TOPO da tabela

Mover `<ConversasPagination>` do rodapé pra dentro do toolbar superior (junto ao "Mostrando X-Y").

**Layout do toolbar**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Mostrando 1-1.000 de 7.183 conversas    [Pagination]    [Cols] │
└─────────────────────────────────────────────────────────────────┘
```

Mobile: pagination wrap pra próxima linha.

URL state `?page=N` mantém (já existe).

### 3.9 Paginação — algoritmo simplificado

```ts
function buildPageItems(page: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 0) return [];
  if (totalPages === 1) return [1];
  if (totalPages === 2) return [1, 2];
  if (totalPages === 3) return [1, 2, 3];
  if (totalPages === 4) return [1, 2, 3, 4];

  // 5+ páginas:
  if (page === 1) return [1, "ellipsis", totalPages];
  if (page === totalPages) return [1, "ellipsis", totalPages];
  // atual no meio:
  return [1, "ellipsis", page, "ellipsis", totalPages];
}
```

**Mudança crítica vs v0.19**: na v0.19 mostrava `[1, 2, 3, ..., N]` quando atual=1; v0.23 simplifica pra `[1, ..., N]`. As páginas próximas ao atual ficam acessíveis via dropdown da reticência.

### 3.10 Reticências = dropdown clicável (Popover)

Cada reticência (`...`) renderiza:
```tsx
<Popover>
  <PopoverTrigger>
    <button aria-label="Selecionar página" className="...">
      ...
    </button>
  </PopoverTrigger>
  <PopoverContent className="w-32 p-1">
    <ul role="list" className="max-h-64 overflow-y-auto">
      {pagesInRange.map(p => (
        <li key={p}>
          <button onClick={() => onPageChange(p)} className="...">
            {p}
          </button>
        </li>
      ))}
    </ul>
  </PopoverContent>
</Popover>
```

`pagesInRange` =:
- Reticência ÚNICA (atual=1 ou atual=N): páginas 2..N-1.
- Reticência ESQUERDA (entre 1 e atual): páginas 2..atual-1.
- Reticência DIREITA (entre atual e N): páginas atual+1..N-1.

### 3.11 Atual com chevron + dropdown

Quando o número da página atual NÃO é 1 nem N (ou seja, atual está no meio da lista exibida), o botão do número atual mostra um chevron pra abrir um Popover com TODAS as páginas (1..N), com a atual destacada (✓).

```tsx
<Popover>
  <PopoverTrigger>
    <button aria-current="page" className="...">
      {page}
      <ChevronDown className="h-3 w-3 ml-1" />
    </button>
  </PopoverTrigger>
  <PopoverContent>
    <ul>...</ul>
  </PopoverContent>
</Popover>
```

Quando atual=1 ou atual=N: SEM chevron (botão simples).

### 3.12 Calendar — diminuir tamanho

`src/components/ui/calendar.tsx` ajusta classes do day cell:
- text-sm → text-xs (caixa do número).
- Cell width/height: -10% (de h-9 w-9 → h-8 w-8).
- Header (mês/ano): mantém.

**Justificativa**: user pediu "ajuste sutil, uma unidade".

### 3.13 Calendar — defaultMonth = hoje

`src/components/reports/period-pills.tsx` no PickerPanel:

```tsx
<Calendar
  ...
  defaultMonth={range?.from ?? today /* não minDate */}
  ...
/>
```

`today` em vez de `minDate` quando não há range setado. minDate continua sendo usado pra `startMonth` (lower bound do navigation).

### 3.14 FiltersDialog — abrir tudo fechado + Limpar todos só de filtros + header dinâmico

**Edit 1**: state inicial das seções accordion. Identificar o useState do "open" sections em `filters-dialog.tsx` e setar `[]` (array vazio) por default.

**Edit 2**: handler "Limpar todos":
- Hoje provavelmente chama `handleReset` que reseta TUDO + fecha modal.
- Trocar por: chama um novo `handleClearFilters` que zera APENAS:
  - `inboxIds`, `teamIds`, `assigneeIds`, `statuses`, `priorities`, `labelIds`.
  - NÃO toca `period`, `customRange`, `sortStack`, `quickFilters`, `mode`, `conditionGroup`.
- Atualiza `draft` (não `applied` — usuário ainda precisa clicar "Aplicar").
- Modal **mantém aberto**.
- Feedback visual: toast "Filtros limpos" OR rerender silencioso (decisão: silencioso, o próprio diálogo já mostra zero seleções).

**Edit 3**: Header do modal:
```tsx
<DialogTitle>
  Filtros {draft.mode === "advanced" ? "avançados" : "simples"}
</DialogTitle>
```

(hoje provavelmente está hardcoded "Filtros avançados".)

### 3.15 (mantém §3.14, sem mudanças)

### 3.16 X "adesivo" nos chips Filtros/Ordenação do toolbar — REMOVER lixeirinhas separadas

Hoje em `<AppliedFiltersChips>` ou `<AdvancedFilters>`:
- Botão "Limpar filtros" (link com ícone Trash2).
- Botão "Limpar ordenação" (link com ícone Trash2).

**Fix**:
- REMOVER ambos botões "Limpar filtros" e "Limpar ordenação".
- ADICIONAR botão X bolinha vazada na quina superior direita do chip "Filtros · N" e do chip "Ordenação · N" (esses chips ficam no toolbar do bloco de configuração).

**Posicionamento do X "adesivo"**:
```tsx
<div className="relative inline-block">
  <Button>...Filtros · N...</Button>
  {appliedCount > 0 ? (
    <button
      type="button"
      onClick={handleResetFilters}
      aria-label="Limpar filtros"
      className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
    >
      <X className="h-2.5 w-2.5" aria-hidden />
    </button>
  ) : null}
</div>
```

Mesmo padrão pro chip Ordenação.

**Comportamento**:
- Click no X: limpa todos os filtros do grupo (reseta para vazio).
- Hover: bolinha vira vermelha.
- Idle: bolinha cinza/transparente com X cinza.
- A11y: aria-label explícito.

### 3.17 Tour atualizado

`src/lib/tours/conversas-tour.ts`:
- Bump id `conversas-v3` → `conversas-v4`.
- Atualizar/adicionar step "paginacao":
  - targetSelector: `[data-tour='pagination-top']`
  - title: "Total + paginação"
  - description: "No topo da tabela: total de conversas, indicador 'Mostrando X-Y de Z' e navegação entre páginas (clique em '...' pra escolher página específica)."
  - placement: "bottom"
- Atualizar step "table" pra refletir novo formato.

---

## 4. Arquitetura

### 4.1 Componentes
```
src/components/reports/
├── advanced-filters.tsx              (PATCH — badge Enter, X adesivo nos chips Filtros/Ordenação, remove lixeirinhas separadas)
├── conversas-table.tsx               (PATCH — toolbar com paginação no topo + Mostrando X-Y de Z; remove chip Ordenação 3 duplicado; remove paginação do rodapé)
├── conversas-pagination.tsx          (REWRITE — algoritmo simplificado + Popover dropdown reticências + Popover atual no meio)
├── filters-dialog.tsx                (PATCH — sections fechadas inicial + handleClearFilters separado + header dinâmico)
├── sorting-dialog.tsx                (PATCH — anti-duplicação)
├── period-pills.tsx                  (PATCH — defaultMonth=today)
└── applied-filters-chips.tsx         (PATCH — remove botões "Limpar filtros"/"Limpar ordenação")

src/components/ui/
└── calendar.tsx                       (PATCH — fontes -1)

src/app/(protected)/relatorios/conversas/
└── page.tsx                           (PATCH — search no reportFilters)

src/lib/datetime-core.ts                (PATCH — fix custom range single-day)
src/lib/tours/conversas-tour.ts         (PATCH — bump v4 + step pagination-top)

package.json, CHANGELOG.md, docs/STATUS.md
```

---

## 5. Testes

### 5.1 Unit
- `datetime-core.test.ts`: cenário single-day (start === end) retorna range correto.
- `conversas-pagination.test.tsx`: novo algoritmo (1, 1-2, 1-2-3, 1-2-3-4, 1...N atual=1, 1...mid...N).
- `sorting-dialog.test.tsx`: opções já usadas excluídas dos critérios subsequentes.
- `filter-state.test.ts`: search em ?q= sobrevive.

### 5.2 Component
- `advanced-filters.test.tsx`: badge Enter visível; layout não quebra ao digitar.
- `filters-dialog.test.tsx`: "Limpar todos" só zera filtros, mantém modal, não fecha.
- `conversas-table.test.tsx`: formato "Mostrando X-Y de Z"; sem chip Ordenação 3 duplicado; paginação no topo.
- `applied-filters-chips.test.tsx`: X adesivo nos chips Filtros/Ordenação; sem lixeirinhas separadas.

### 5.3 Smoke E2E manual
1. Filtrar período + filtros + busca "joão" + sort → resultado correto.
2. Single-day 21/03/2025 → retorna 3 conversas.
3. Paginação 4+ páginas → reticência clicável abre lista.
4. FiltersDialog: abrir, todas fechadas; expandir Caixa; "Limpar todos" zera só filtros.
5. Sorting: critério 1=Departamento, 2 não mostra Departamento.
6. X adesivo nos chips → limpa o grupo.
7. Layout busca não quebra ao digitar.

---

## 6. Versão
v0.23.0.
