# Spec v3 (final): Conversas v0.23 — Polish + Bug Fixes

> **Data**: 2026-05-03
> **Status**: v3 final (passou por pente-fino #1 com 25 achados + pente-fino #2 com 33 achados)

---

## 0. Histórico double-check

### Pente-fino #1 (sobre v1) — 25 achados aplicados em v2
(Detalhado em §0 da v2; não repito.)

### Pente-fino #2 (sobre v2) — 33 achados aplicados em v3

1. §3.2 hipótese TZ insuficiente → v3 propõe **TDD primeiro** (test que reproduz o bug exato em datetime-core.test) antes de assumir causa.
2. §3.7 edge case `total < pageSize` esclarecido.
3. §3.7 edge case `total=0` → "0 conversas".
4. §3.9 atual=2 com totalPages=5 → mostra `[1, "ellipsis", 2, "ellipsis", 5]` (mantém regra simples).
5. §3.10 dropdown reticência: ranges precisos por posição.
6. §3.10 Esc/click-fora fecham (default base-ui Popover).
7. §3.11 chevron tamanho/padding definidos: `<ChevronDown className="h-3 w-3 ml-1" />`.
8. §3.12 -1 unidade decidido concretamente: text-sm → text-xs; h-9 w-9 → h-8 w-8.
9. §3.13 `today = new Date()` sem cache.
10. §3.14 state das seções investigado — usa `<Accordion type="multiple" defaultValue={[]}>` ou similar; a fix depende da implementação atual.
11. §3.14 handleClearFilters limpa SOMENTE: inboxIds, teamIds, assigneeIds, statuses, priorities, labelIds. Mantém: search, period, customRange, mode, conditionGroup. sortStack/quickFilters fora do FilterState.
12. §3.14 header dinâmico baseado em `draft.mode` (não applied).
13. §3.16 X adesivo bg base/foreground definido pra contraste WCAG.
14. §3.16 overflow:visible no botão pai.
15. §3.16 a11y: X é tab-stop separado.
16. §3.17 wrapper `data-tour='pagination-top'` adicionado.
17. §3.5 símbolo: usar `↵` (ENTER U+21B5), texto "Pressione · ↵ Enter".
18. §3.5 padding-right do Input ajustado pra acomodar badge.
19. §3.5 badge sempre visível.
20. §3.6 chip "Ordenação · 3" duplicado em conversas-table.tsx — confirmado via grep.
21. §3.7 indicador apenas leitura.
22. §3.8 mobile: flex-wrap no toolbar.
23. §3.16 edge appliedCount=0 → X não renderizado.
24. §3.3 sorting anti-duplicação derivado do critério atual (recalcula em cada render).
25. §3.15 numbering duplicado removido em v3.
26. §3.10 dropdown reticência usa `<ul role="list">` simples (não listbox).
27. §3.11 chevron na atual no meio → mesmo Popover (consistente).
28. §3.5 violet-500 conferido com paleta global (já usado em outros lugares).
29. §3.16 animação fade-in/scale-in motion-safe.
30. §3.14 sem feedback toast no "Limpar todos" (silencioso).
31. §3.4 Enter no Input dispara `handleApply` (mantém comportamento atual).
32. §3.7 `toLocaleString("pt-BR")` confirmado.
33. §3.5 contraste WCAG: violet-500 sobre bg-muted/40 verificado pra dark+light mode.

---

## 1. Objetivo

18 ajustes do super_admin no `/relatorios/conversas`, incluindo 3 bugs críticos:
- **Busca não filtra** (`reportFilters` em page.tsx descarta `search`).
- **Single-day filter retorna 0** (TZ ou borda em `getPeriodInTz`).
- **Sorting permite duplicar coluna** em múltiplos critérios.

---

## 2. Stack
Next.js 16, React 19, TypeScript strict, Tailwind v4, base-ui, react-day-picker v9, Jest+RTL.

---

## 3. Escopo funcional

### 3.1 BUG CRÍTICO — Busca não funciona

**Root cause confirmado** em `src/app/(protected)/relatorios/conversas/page.tsx:58-71`:
```ts
const reportFilters: ReportFilters = {
  period,
  inboxIds: filterState.inboxIds.length ? filterState.inboxIds : undefined,
  teamIds: filterState.teamIds.length ? filterState.teamIds : undefined,
  assigneeIds: filterState.assigneeIds.length ? filterState.assigneeIds : undefined,
  statuses: filterState.statuses.length ? filterState.statuses : undefined,
  priorities: filterState.priorities.length ? filterState.priorities : undefined,
  labelIds: filterState.labelIds.length ? filterState.labelIds : undefined,
  excludeMatrixIA,
  // FALTA: search: filterState.search,
};
```

**Fix**: adicionar `search: filterState.search ?? undefined,` antes de `excludeMatrixIA`.

### 3.2 BUG CRÍTICO — Single-day filter

**TDD primeiro**: criar test `src/lib/__tests__/datetime-single-day.test.ts` que reproduz o bug:

```ts
import { getPeriodInTz } from "@/lib/datetime-core";

describe("getPeriodInTz custom — single day SP", () => {
  it("21/03/2025 → 21/03/2025 retorna range com 24h em SP", () => {
    const r = getPeriodInTz("custom", { start: "2025-03-21", end: "2025-03-21" }, "America/Sao_Paulo");
    // Espera: start = 2025-03-21 00:00 SP = 2025-03-21 03:00 UTC
    // Espera: end   = 2025-03-22 00:00 SP = 2025-03-22 03:00 UTC (ou 23:59:59.999 SP)
    expect(r.start.toISOString()).toBe("2025-03-21T03:00:00.000Z");
    expect(r.end.toISOString()).toMatch(/^2025-03-22T(02:59:59\.999|03:00:00\.000)Z$/);
  });
});
```

Rodar test. Se PASS: bug é em outro lugar (talvez SQL `c.created_at < end` exclude). Se FAIL: confirma TZ bug, fix em datetime-core.

**Plano de fix condicional**:
- Se TZ bug: trocar `toZonedTime(string, tz)` por construção explícita usando `parse(str, "yyyy-MM-dd", new Date())` + `fromZonedTime`.
- Se SQL: ajustar `buildBaseFilter` pra usar `c.created_at <= end` (inclusive) OR adicionar 1ms ao end.

**Smoke pós-fix**: filtrar 21/03/2025 single-day em produção retorna conversas que aparecem em filtro 21/03→22/03.

### 3.3 BUG CRÍTICO — Sorting anti-duplicação

`src/components/reports/sorting-dialog.tsx`:

**Comportamento atual**: cada critério `<select>` mostra TODAS opções, mesmo que coluna já esteja em outro critério.

**Fix**: filtrar `options` por critério:
```ts
function getAvailableOptions(allOptions, currentCriteria, currentIdx) {
  const usedKeys = new Set(
    currentCriteria
      .filter((_, idx) => idx !== currentIdx)
      .map((c) => c.key),
  );
  return allOptions.filter((o) => !usedKeys.has(o.key));
}
```

Quando user remove critério N, opção volta automaticamente nos outros (recompute).

### 3.4 Layout barra busca não quebra

`src/components/reports/advanced-filters.tsx`:

Hoje (causa do bug):
```tsx
<div data-tour="search">
  <Search ... />
  <Input ... />
  {searchPending ? <span className="block">Aperte Enter para buscar</span> : null}
</div>
```

O `<span className="block">` adiciona altura → layout quebra.

**Fix**: badge absoluto dentro do input wrapper (não muda altura do flex):
```tsx
<div data-tour="search" className="relative w-full max-w-[320px] min-w-[200px] sm:flex-none">
  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
  <Input
    type="search"
    value={draft.search ?? ""}
    onChange={...}
    onKeyDown={...}
    placeholder="Buscar..."
    aria-label="Buscar conversas"
    className="h-10 pl-9 pr-[112px]"
  />
  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
    Pressione
    <kbd className="font-semibold text-violet-500 tabular-nums">↵ Enter</kbd>
  </span>
</div>
```

### 3.5 Badge ⏎ Enter (estilo Command+K)

(Já incluído em §3.4 acima — código completo lá.)

**Visibilidade**: SEMPRE (não condicional ao searchPending). Removo o hint `{searchPending ? <span>...</span> : null}` do código atual.

**Cores**:
- Container: `border-border bg-muted/40 text-muted-foreground`.
- Texto "Pressione": muted-foreground.
- "↵ Enter" (kbd): `text-violet-500 font-semibold`.

**Acessibilidade**: badge é `pointer-events-none` (decorativo); aria-label do input já existe.

### 3.6 Toolbar tabela — remover duplicação "Ordenação · 3"

Em `src/components/reports/conversas-table.tsx` há um toolbar interno que inclui:
```tsx
{sortStack.length > 0 ? (
  <Button variant="ghost" size="xs" onClick={clearSort} ...>
    <X /> Ordenação <span>{sortStack.length}</span>
  </Button>
) : null}
```

**Fix**: remover esse bloco inteiro. AppliedFiltersChips no toolbar de cima já cuida disso.

### 3.7 Toolbar tabela — formato "Mostrando X-Y de Z conversas"

Substituir o atual "Total: X · página N de M" por:

```tsx
<span className="text-xs text-muted-foreground tabular-nums">
  {total === 0 ? (
    <>0 conversas</>
  ) : (
    <>
      Mostrando{" "}
      <strong className="text-foreground">
        {((page - 1) * pageSize + 1).toLocaleString("pt-BR")}
        {"-"}
        {Math.min(page * pageSize, total).toLocaleString("pt-BR")}
      </strong>{" "}
      de{" "}
      <strong className="text-foreground">{total.toLocaleString("pt-BR")}</strong>{" "}
      conversa{total === 1 ? "" : "s"}
    </>
  )}
</span>
```

### 3.8 Paginação no TOPO

`<ConversasPagination>` é movida do rodapé pra dentro do toolbar superior:

```tsx
<div data-tour="pagination-top" className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/10 px-3 py-2.5">
  <span className="...">Mostrando X-Y de Z...</span>
  <ConversasPagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
  <ColumnsToggle ... />
</div>
```

Mobile: flex-wrap permite quebrar pra próxima linha.

Footer: REMOVE o `<ConversasPagination>` que estava lá.

### 3.9 Paginação — algoritmo simplificado

```ts
function buildPageItems(page: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 0) return [];
  if (totalPages === 1) return [1];
  if (totalPages === 2) return [1, 2];
  if (totalPages === 3) return [1, 2, 3];
  if (totalPages === 4) return [1, 2, 3, 4];
  // 5+
  if (page === 1 || page === totalPages) return [1, "ellipsis", totalPages];
  return [1, "ellipsis", page, "ellipsis", totalPages];
}
```

### 3.10 Reticências = Popover dropdown

Cada `"ellipsis"` renderiza:

```tsx
function EllipsisDropdown({
  pages,
  onSelect,
}: { pages: number[]; onSelect: (p: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props) => (
          <button
            {...props}
            type="button"
            aria-label="Selecionar página"
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-border/50 px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
          >
            …
          </button>
        )}
      />
      <PopoverContent className="w-32 p-1 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=open]:duration-150">
        <ul role="list" className="max-h-64 overflow-y-auto">
          {pages.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => { onSelect(p); setOpen(false); }}
                className="flex w-full items-center justify-center rounded-md px-2 py-1.5 text-sm tabular-nums hover:bg-muted"
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
```

**Cálculo das `pages` por posição da reticência**:
- Items: `[1, "ellipsis", N]` (atual=1 ou N): pages = `2..N-1`.
- Items: `[1, "ellipsis", page, "ellipsis", N]` (atual no meio):
  - Reticência esquerda (idx=1): pages = `2..page-1`.
  - Reticência direita (idx=3): pages = `page+1..N-1`.

### 3.11 Atual no meio — chevron + Popover

Quando atual NÃO é 1 nem N (meio), o número renderiza como Popover trigger igual a §3.10, mas a lista é `1..N` com a atual destacada (✓):

```tsx
<button {...} aria-current="page" className="...">
  {page}
  <ChevronDown className="h-3 w-3 ml-1" aria-hidden />
</button>
```

Lista no PopoverContent:
```tsx
<ul role="list" className="max-h-64 overflow-y-auto">
  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
    <li key={p}>
      <button onClick={() => { onPageChange(p); setOpen(false); }} className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm tabular-nums hover:bg-muted", p === page && "bg-violet-500/15 text-violet-500 font-semibold")}>
        {p}
        {p === page ? <Check className="h-3 w-3" /> : null}
      </button>
    </li>
  ))}
</ul>
```

Quando atual=1 ou atual=N: SEM chevron (botão simples).

### 3.12 Calendar — diminuir tamanho

`src/components/ui/calendar.tsx`:
- text-sm → text-xs nos `day` e `weekday` cells.
- Cell size: `h-9 w-9` → `h-8 w-8` (ou tokens equivalentes da DayPicker v9).
- Mantém: header (mês/ano), nav buttons.

### 3.13 Calendar — defaultMonth = today

`src/components/reports/period-pills.tsx` em `PickerPanel`:

```tsx
const today = useMemo(() => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}, []);

// dentro do <Calendar ...>
defaultMonth={range?.from ?? today /* não minDate */}
```

`startMonth` continua sendo `minDate` (lower bound de navegação).

### 3.14 FiltersDialog — sections fechadas + Limpar todos só de filtros + header dinâmico

`src/components/reports/filters-dialog.tsx`:

**Edit 1** — sections inicial fechadas:

Localizar onde o accordion/collapsible state é inicializado. Provavelmente algo como:
```tsx
const [openSections, setOpenSections] = useState<string[]>(["inboxIds"]); // bug
```

Trocar por:
```tsx
const [openSections, setOpenSections] = useState<string[]>([]);
```

(OR se for `<Accordion defaultValue="inboxIds">`, trocar pra `<Accordion defaultValue={[]} type="multiple">`.)

**Edit 2** — handler "Limpar todos":

Hoje provavelmente chama `onClear` (que reseta TUDO). Criar handler local que limpa SOMENTE filtros do FilterState:

```tsx
const handleClearOnlyFilters = useCallback(() => {
  setDraft((prev) => ({
    ...prev,
    inboxIds: [],
    teamIds: [],
    assigneeIds: [],
    statuses: [],
    priorities: [],
    labelIds: [],
    // mantém: search, period, customRange, mode, conditionGroup
  }));
  // NÃO fecha modal (não chama onOpenChange(false)).
  // NÃO chama onClear (que reseta período fora do dialog).
}, []);
```

Substituir o onClick do botão "Limpar todos" pra usar `handleClearOnlyFilters`.

**Edit 3** — Header dinâmico:

```tsx
<DialogTitle>
  Filtros {draft.mode === "advanced" ? "avançados" : "simples"}
</DialogTitle>
```

### 3.15 Chips X "adesivo" no toolbar

`src/components/reports/advanced-filters.tsx` — linhas dos botões "Filtros · N" e "Ordenação · N":

**Edit**: envolver cada botão em `<div className="relative inline-block">` e adicionar X bolinha quando `appliedCount > 0` (ou `sortCount > 0`):

```tsx
<div className="relative inline-block">
  <Button
    data-tour="filters-chip"
    type="button"
    variant="outline"
    size="sm"
    onClick={() => setFiltersOpen(true)}
    className={cn("relative h-10 px-4", appliedCount > 0 && "border-violet-500/40 text-foreground")}
  >
    <Filter aria-hidden />
    Filtros
    {appliedCount > 0 ? <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 tabular-nums">{appliedCount}</Badge> : null}
  </Button>
  {appliedCount > 0 ? (
    <button
      type="button"
      onClick={() => handleResetFilters()}
      aria-label="Limpar todos os filtros"
      className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-all hover:scale-110 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-150"
    >
      <X className="h-2.5 w-2.5" aria-hidden />
    </button>
  ) : null}
</div>
```

`handleResetFilters()` zera somente filtros do FilterState (mesmo handler de §3.14 mas a partir do toolbar — ou apenas chama `handleReset` se ele só limpa filtros — DEPENDE da implementação atual).

Mesmo padrão pro botão "Ordenação · N" usando `clearSort()` no onClick.

### 3.16 Remover lixeirinhas separadas

Em `src/components/reports/applied-filters-chips.tsx`:

Hoje renderiza:
```tsx
{chips.length > 0 ? (
  <button onClick={onClearAll}>
    <Trash2 /> Limpar filtros
  </button>
) : null}

{sortChips.length > 0 && onClearAllSort ? (
  <button onClick={onClearAllSort}>
    <Trash2 /> Limpar ordenação
  </button>
) : null}
```

**REMOVER ambos** — substituídos pelo X adesivo nos chips do toolbar (§3.15).

### 3.17 Highlight visual da busca em violet (NEW — complemento do user)

Quando há `applied.search` ativo, destacar em **violet** o trecho encontrado em cada célula visível da tabela e do drill-down.

**Comportamento**:
- Match: case-insensitive, **contains** (não prefix). Exemplo: search="170" → match em `#1701`, `#5170`, `1.700`, `170-345-678` (CPF).
- Cobertura visual: TODAS as colunas e células do drill-down (WhatsApp, Etiquetas, Atributos).
- Estilo do highlight: `bg-violet-500/15 text-violet-500 font-semibold rounded-sm px-0.5` (sutil, sem fundo gritante).
- Implementação: helper `highlightSearch(text, term)` retorna ReactNode com `<mark>` envolvendo cada match:
  ```tsx
  function HighlightedText({ text, term }: { text: string; term?: string }) {
    if (!term?.trim() || !text) return <>{text}</>;
    const lower = text.toLowerCase();
    const lowerTerm = term.toLowerCase();
    const parts: ReactNode[] = [];
    let lastIdx = 0;
    let idx = lower.indexOf(lowerTerm);
    let counter = 0;
    while (idx !== -1) {
      if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
      parts.push(
        <mark
          key={`m${counter++}`}
          className="rounded-sm bg-violet-500/15 px-0.5 font-semibold text-violet-500"
        >
          {text.slice(idx, idx + lowerTerm.length)}
        </mark>,
      );
      lastIdx = idx + lowerTerm.length;
      idx = lower.indexOf(lowerTerm, lastIdx);
    }
    if (lastIdx < text.length) parts.push(text.slice(lastIdx));
    return <>{parts}</>;
  }
  ```
- Aplicação por célula: cada `render` de `ColumnDef` em `conversas-table.tsx` recebe `searchTerm` opcional e usa `<HighlightedText>` no texto. Idem `<ConversaDrillDown>` para WhatsApp/etiquetas/atributos.
- Performance: `lower.indexOf` é O(n) por célula. Em 1000 rows × 14 colunas = 14k operações por render. Aceitável (cada string típica < 100 chars).
- Acessibilidade: `<mark>` é semântico e anunciado por screen readers como "destacado".
- ID da conversa: search "170" → match em `#1701` mostrando `#1**170**1` com `170` violet. (chave: aceita prefix-match no display_id porque é substring de `#170...`).

**Edge cases**:
- term vazio ou só whitespace → retorna texto original sem highlight.
- term longer que text → sem match.
- Caracteres especiais (regex chars): usa `indexOf` (não regex), portanto seguro.

### 3.18 Tour atualizado

`src/lib/tours/conversas-tour.ts`:
- Bump `id: "conversas-v3"` → `"conversas-v4"`.
- Atualizar step `table` removendo menção a "página N de M":
  ```
  description: "Cada linha mostra contato, departamento, atendente, status, prioridade e tempos. Cores indicam urgência (âmbar acima de 4h, vermelho acima de 24h)."
  ```
- Adicionar step `pagination-top` (substitui step `table` se necessário, OU vem antes):
  ```ts
  {
    id: "pagination-top",
    targetSelector: "[data-tour='pagination-top']",
    title: "Total + paginação",
    description: "No topo da tabela: total de conversas, indicador 'Mostrando X-Y de Z' e navegação entre páginas. Clique em '...' para escolher página específica.",
    placement: "bottom",
  },
  ```

---

## 4. Arquitetura

### 4.1 Componentes

```
src/app/(protected)/relatorios/conversas/
└── page.tsx                          (PATCH §3.1 — search no reportFilters)

src/components/reports/
├── advanced-filters.tsx              (PATCH §3.4-3.5, §3.15 — badge Enter, X adesivo, REMOVE hint span)
├── applied-filters-chips.tsx         (PATCH §3.16 — REMOVE lixeirinhas separadas)
├── conversas-table.tsx               (PATCH §3.6-3.8 — remove Ordenação 3 dup, formato Mostrando X-Y, paginação no topo)
├── conversas-pagination.tsx          (REWRITE §3.9-3.11 — algoritmo simplificado + Popover reticência + Popover atual)
├── filters-dialog.tsx                (PATCH §3.14 — sections fechadas + handleClearOnlyFilters + header dinâmico)
├── sorting-dialog.tsx                (PATCH §3.3 — anti-duplicação)
└── period-pills.tsx                  (PATCH §3.13 — defaultMonth=today)

src/components/ui/
└── calendar.tsx                       (PATCH §3.12 — fontes -1, h-8 w-8)

src/lib/
├── datetime-core.ts                   (PATCH §3.2 — fix custom range single-day [conditional])
└── tours/conversas-tour.ts            (PATCH §3.17 — bump v4 + step pagination-top)

package.json, CHANGELOG.md, docs/STATUS.md (release files)
```

### 4.2 Fluxo de busca pós-fix

```
User digita "joão" + Enter
  ↓
Input onKeyDown: handleApply()
  ↓
setApplied + pushUrl({...applied, page: undefined})
  ↓
URL: ?q=joão (sem ?page)
  ↓
Server page.tsx re-render: deserializeFilterState → filterState.search = "joão"
  ↓
reportFilters = { ..., search: "joão", ... }   ← FIX da v0.23
  ↓
fetchConversas → conversasList → buildBaseFilter + buildConversasSearchClause
  ↓
SQL ILIKE %joão% em todas colunas + JOIN tags
  ↓
Resultados retornados, página 1.
```

---

## 5. Modelo de dados
Sem alterações de schema.

---

## 6. Testes

### 6.1 Unit
- `datetime-single-day.test.ts` (NEW): reproduz bug single-day, valida fix.
- `conversas-pagination.test.tsx` (REWRITE): novo algoritmo (1, 1-2, 1-2-3, 1-2-3-4, 1...N atual=1, 1...N atual=N, 1...mid...N).
- `sorting-dialog.test.tsx` (NEW/PATCH): opções já usadas excluídas.
- `filter-state.test.ts`: search em ?q= sobrevive ida e volta.

### 6.2 Component
- `advanced-filters.test.tsx`: badge ↵ Enter visível; layout não quebra ao digitar; X adesivo na quina dos chips Filtros/Ordenação.
- `filters-dialog.test.tsx`: sections fechadas inicial; Limpar todos só zera filtros, NÃO fecha modal, NÃO mexe em período/ordenação; header dinâmico.
- `conversas-table.test.tsx`: formato "Mostrando X-Y de Z"; sem chip Ordenação 3 dup; paginação no topo (não no rodapé).
- `applied-filters-chips.test.tsx`: SEM botões "Limpar filtros" e "Limpar ordenação".

### 6.3 Smoke E2E manual (pós-deploy)
1. Filtrar período 1-30 abr + caixa Alagoas + busca "joão" + sort departamento → resultados certos.
2. Single-day 21/03/2025 → retorna 3 conversas.
3. Paginação 8 páginas, atual=1: ver `[1, ..., 8]`, click reticência abre dropdown 2..7.
4. Atual=4 (meio): `[1, ..., 4 ▾, ..., 8]`, click no 4 abre dropdown 1..8.
5. FiltersDialog: abrir, seções fechadas; expandir Caixa; "Limpar todos" zera caixa, mantém modal aberto, período/ordenação intactos.
6. Sorting: critério 1=Departamento, 2 não mostra Departamento.
7. X adesivo nos chips Filtros/Ordenação → limpa o grupo.
8. Layout busca não quebra ao digitar; badge ↵ Enter sempre visível.
9. Calendar: abre no mês atual + próximo (não março/2025); tamanho menor.
10. Tour `conversas-v4` mostra step "Total + paginação".

---

## 7. Plano de release

1. spec v3 ✓ → plan v3 → subagent-driven-development.
2. typecheck, jest, build verde.
3. push origin/main + portainer-fix v0.23.0.
4. /api/health verifica.
5. Smoke E2E.
6. Avisar user.

CHANGELOG entry:
```md
## [v0.23.0] 2026-05-03 — Conversas Polish (busca funciona, single-day fix, paginação no topo, badge Enter, X adesivo, sorting anti-dup)
```

---

## 8. Versão
v0.23.0 (v0.22.0 LIVE).
