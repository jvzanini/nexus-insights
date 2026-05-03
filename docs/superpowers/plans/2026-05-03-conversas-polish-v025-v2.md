# Conversas Polish v0.25.0 — Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 7 ajustes em `/relatorios/conversas` — 6 polish + busca client-side global (opção B alinhada com João) + 1 bug fix descoberto (HighlightedText sem normalize de acentos).

**Architecture:** Polish localizado nos componentes da Conversas. Busca migra de SQL ILIKE → filtro client-side puro sobre rows hidratadas (cap 50k). Paginação vira UI slicing.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · base-ui · @tanstack/react-virtual · Lucide.

---

## §0. Histórico double-check

### Pente fino #1 (sobre v1) — 12 achados aplicados em v2

1. T3 não precisa mexer em CustomSelect (já aceita `placeholder`).
2. T3 anti-dup ignora `key === ""` explicitamente.
3. T5 lista de arquivos completa (12 arquivos).
4. **BUG novo descoberto** — HighlightedText não normaliza NFD. Busca "joao" não destaca "João". Adicionada T12.5.
5. T6 lista todos os tests existentes a atualizar.
6. T8 nota sobre TTFB lento na primeira carga em "Todos" populado.
7. T8 esclarece `total` (SQL count, banner cap) vs `filteredCount` (tabela, sortedRows.length).
8. T11 tooltip no Export quando searchClient ativo.
9. T12 empty state com "ou limpe a busca".
10. T11 Esc + preventDefault reforçado para Safari.
11. T7 phoneVariants deduplica.
12. §5 Riscos ganha plano de rollback explícito.

---

## §1. Decisões arquiteturais

### 1.1 Busca client-side global (opção B)

- `search` sai dos `reportFilters` que vão para SQL. Vira state local em `ConversasPageClient` (`searchClient`).
- `page.tsx` carrega `pageSize: 50_000` (cap defensivo). Cache key Redis fica idêntica (sem `q=...`).
- Se `total (SQL count) > 50_000` → banner amarelo informativo.
- Pipeline na tabela: `searchedRows = matchSearchClient(rows, searchClient)` → `filteredRows = applyConditions(searchedRows, conditionGroup)` → `sortedRows = sort(filteredRows, sortStack)` → `pagedRows = slice(sortedRows, pageClient, pageSizeClient=100)`.
- Mudança de `searchClient`/filters/sort reseta `pageClient=1`.
- Algoritmo `matchSearchClient`: case-insensitive + ignora acentos via `normalize("NFD").replace(/\p{Mn}/gu, "")`. Match OR sobre 11 campos (ver §1.3).
- `<HighlightedText>` corrigido para usar mesma normalização (T12.5) — sem isso, match acharia mas highlight não pintaria.
- URL não recebe mais `?q=...`. Breaking aceitável (search sempre foi efêmera).
- **Export** ignora `searchClient` (export usa filtros aplicados server-side). Tooltip no botão quando search ativa: "A exportação inclui os filtros aplicados, não a busca atual."

### 1.2 Polish (6 ajustes)

| # | Componente | Mudança |
|---|---|---|
| 1 | `advanced-filters.tsx:429-509` | X dos chips Filtros/Ordenação: `h-5 w-5` + ícone `h-3 w-3`; idle: borda + bg-card; hover: `bg-destructive`, `text-white`, `ring-2 ring-destructive/30 ring-offset-1 ring-offset-card`, `scale-110`. |
| 2 | Toda a seção conversas (12 arquivos — ver §2) | `cursor-pointer` em todo `<button>` clicável. `disabled:cursor-not-allowed`. |
| 3 | `sorting-dialog.tsx:69-72` | `addRule()` cria `{ key: "", direction: "asc" }`. `<CustomSelect>` recebe `placeholder="Selecione uma coluna"`. Apply desabilitado se algum rule tem `key === ""`. Anti-dup ignora `""`. |
| 4 | `advanced-filters.tsx:73-85` | `SORT_OPTIONS` ganha `{ key: "document", label: "Documento" }` na posição 2 (após "name") e fica `export const`. |
| 5 | `applied-filters-chips.tsx:181-188` | Etiquetas usam `summarize("Etiquetas", applied.labelIds, meta.labels ?? [])`. |
| 6 | `conversas-pagination.tsx:30-41` | `buildPageItems` simplificado (sem reticências). `<EllipsisDropdown>` deletado. |

### 1.3 Algoritmo `matchSearchClient` — campos cobertos

OR-match sobre haystack normalizado:
1. `display_id` (com e sem `#`)
2. `contact.name`
3. `contact.phone_number` (raw + formatado via `formatPhone` + só dígitos) — deduplicado
4. `contact.identifier` (raw + formatado via `detectDocument().formatted`) — deduplicado
5. `inbox.name`
6. `team.name`
7. `assignee.name`
8. Status pt-BR via `STATUS_LABELS[status]`
9. Prioridade pt-BR via `PRIORITY_LABELS[priority]`
10. `labels[].name` (cada etiqueta concatenada)
11. `custom_attributes` JSON-stringify ignorando keys com prefixo `_`

**Datas (Criado em / Última atualização) FORA** — fora do escopo desta release.

---

## §2. File Structure

### Modificações

| Arquivo | Mudança |
|---|---|
| `src/app/(protected)/relatorios/conversas/page.tsx` | `pageSize: 50_000`; `search` removido de `reportFilters`; banner cap. |
| `src/components/reports/conversas-page-client.tsx` | State `searchClient` + `pageClient`; reset ao mudar; remove `handlePageChange` server. |
| `src/components/reports/advanced-filters.tsx` | Input controlado + Esc + tooltip Export; `SORT_OPTIONS` exportada com Documento; X destrutivo. |
| `src/components/reports/applied-filters-chips.tsx` | Etiquetas via `summarize`. |
| `src/components/reports/sorting-dialog.tsx` | addRule sem pré-seleção + placeholder + Apply guard + anti-dup ignora `""`. |
| `src/components/reports/conversas-pagination.tsx` | Algoritmo simplificado; remove `<EllipsisDropdown>`. |
| `src/components/reports/conversas-table.tsx` | Pipeline `match → conditions → sort → slice`; receberecebe `searchClient`; paginação UI. |
| `src/components/reports/filters-dialog.tsx` | `cursor-pointer` em buttons. |
| `src/components/reports/filter-chip-list-popover.tsx` | `cursor-pointer` em buttons. |
| `src/components/reports/quick-filters-popover.tsx` | `cursor-pointer` em buttons. |
| `src/components/reports/presets-popover.tsx` | `cursor-pointer` em buttons. |
| `src/components/reports/period-pills.tsx` | `cursor-pointer` em pills. |
| `src/components/reports/conversa-drill-down.tsx` | `cursor-pointer` em close/expand buttons. |
| `src/components/ui/calendar.tsx` | `cursor-pointer` em days + nav (via classNames). |
| `src/components/ui/columns-toggle.tsx` | `cursor-pointer`. |
| `src/components/reports/export-button.tsx` | `cursor-pointer` + tooltip quando search ativa (T11). |
| `src/lib/utils/highlight-text.tsx` | Normalize NFD para match (T12.5 — bug fix). |
| `src/lib/chatwoot/queries/conversas-list.ts` | Remove `searchClause`; bumpa `MAX_LIMIT 10_000 → 50_000`. |
| `src/lib/chatwoot/conversas-search.ts` | JSDoc `@deprecated`. |
| `package.json` | `0.24.0 → 0.25.0`. |
| `CHANGELOG.md` | Entrada v0.25.0. |
| `docs/STATUS.md` | Release v0.25.0. |

### Novos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/reports/match-search-client.ts` | Algoritmo de match. |
| `src/lib/reports/__tests__/match-search-client.test.ts` | Sanity tests TDD. |

---

## §3. Tasks

### Task 1: SORT_OPTIONS exportada + Documento

**Files:**
- Modify: `src/components/reports/advanced-filters.tsx:73-85`
- Test: `src/components/reports/__tests__/advanced-filters-sort-options.test.ts` (novo)

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "@jest/globals";
import { SORT_OPTIONS } from "@/components/reports/advanced-filters";

describe("SORT_OPTIONS v0.25", () => {
  it("inclui chave 'document' com label 'Documento' após 'name'", () => {
    const keys = SORT_OPTIONS.map((o) => o.key);
    const idxName = keys.indexOf("name");
    const idxDoc = keys.indexOf("document");
    expect(idxDoc).toBeGreaterThan(idxName);
    const doc = SORT_OPTIONS.find((o) => o.key === "document");
    expect(doc?.label).toBe("Documento");
  });
});
```

- [ ] **Step 2:** `npx jest src/components/reports/__tests__/advanced-filters-sort-options.test.ts` → expect FAIL (export missing).

- [ ] **Step 3: Edit `advanced-filters.tsx:73`**

```ts
export const SORT_OPTIONS: SortRuleOption[] = [
  { key: "display_id", label: "#" },
  { key: "name", label: "Nome" },
  { key: "document", label: "Documento" },
  { key: "inbox", label: "Estado" },
  { key: "team", label: "Departamento" },
  { key: "assignee", label: "Atendente" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Prioridade" },
  { key: "waiting_seconds", label: "Sem resposta há" },
  { key: "open_seconds", label: "Aberta há" },
  { key: "created_at", label: "Criado em" },
  { key: "last_activity_at", label: "Última atualização" },
];
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/components/reports/advanced-filters.tsx src/components/reports/__tests__/advanced-filters-sort-options.test.ts
git commit -m "feat(conversas): T1 v0.25 — SORT_OPTIONS exporta + adiciona Documento

Bug: ordenar via header da coluna 'Documento' resultava em chip com label
'document' (em inglês), porque sortOptions do AppliedFiltersChips não
encontrava entry e usava rule.key como fallback.

Fix: adiciona { key: 'document', label: 'Documento' } em SORT_OPTIONS,
posição 2 (após Nome). Constante exportada para teste/reuso."
```

---

### Task 2: AppliedFiltersChips — Etiquetas sem `(N)`

**Files:**
- Modify: `src/components/reports/applied-filters-chips.tsx:181-188`
- Test: `src/components/reports/__tests__/applied-filters-chips.test.tsx` (estende)

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { AppliedFiltersChips } from "@/components/reports/applied-filters-chips";
import { EMPTY_FILTER_STATE } from "@/lib/reports/filter-state";

it("Etiquetas seguem padrão summarize (sem parênteses)", () => {
  render(
    <AppliedFiltersChips
      meta={{
        inboxes: [], teams: [], assignees: [],
        labels: [
          { id: 1, name: "hg" }, { id: 2, name: "vip" },
          { id: 3, name: "novo" }, { id: 4, name: "bloqueado" },
        ],
      }}
      applied={{ ...EMPTY_FILTER_STATE, labelIds: [1, 2, 3, 4] }}
      onRemove={() => {}}
      onClearAll={() => {}}
      onRemoveOne={() => {}}
    />,
  );
  expect(screen.queryByText(/Etiquetas \(4\)/)).toBeNull();
  expect(screen.getByText(/Etiquetas: hg \+3/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Edit `applied-filters-chips.tsx:181-188`**

```tsx
if (applied.labelIds.length) {
  chips.push({
    key: "labelIds",
    label: summarize("Etiquetas", applied.labelIds, meta.labels ?? []),
  });
}
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(conversas): T2 v0.25 — Etiquetas sem (N), padroniza summarize

Antes: chip 'Etiquetas (4): hg +3' (parênteses N quebravam padrão).
Depois: 'Etiquetas: hg +3' usando summarize() — mesmo padrão de
Caixa de entrada/Departamento/Atendente/Status/Prioridade.
meta.labels já era resolvido em resolveItems()."
```

---

### Task 3: SortingDialog — Adicionar critério sem coluna pré-selecionada

**Files:**
- Modify: `src/components/reports/sorting-dialog.tsx`
- Test: `src/components/reports/__tests__/sorting-dialog.test.tsx` (estende)

- [ ] **Step 1: Failing tests (3)**

```tsx
const options = [
  { key: "name", label: "Nome" },
  { key: "document", label: "Documento" },
];

it("addRule cria critério com key vazio + placeholder visível", () => {
  render(<SortingDialog open onOpenChange={() => {}} applied={[]} options={options} onApply={() => {}} onClear={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Adicionar critério/i }));
  expect(screen.getByText(/Selecione uma coluna/i)).toBeInTheDocument();
});

it("Aplicar desabilitado quando há critério com key vazio", () => {
  render(<SortingDialog open onOpenChange={() => {}} applied={[]} options={options} onApply={() => {}} onClear={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Adicionar critério/i }));
  expect(screen.getByRole("button", { name: /Aplicar/i })).toBeDisabled();
});

it("anti-dup: 2 critérios com key vazio funcionam (não trava UI)", () => {
  render(<SortingDialog open onOpenChange={() => {}} applied={[]} options={options} onApply={() => {}} onClear={() => {}} />);
  const addBtn = screen.getByRole("button", { name: /Adicionar critério/i });
  fireEvent.click(addBtn);
  fireEvent.click(addBtn);
  expect(screen.getAllByText(/Selecione uma coluna/i).length).toBe(2);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Edit `sorting-dialog.tsx`**

```tsx
// addRule:
const addRule = () => {
  setDraft((p) => [...p, { key: "", direction: "asc" }]);
};

// hasInvalidRule (logo após calculo de isDirty):
const hasInvalidRule = draft.some((r) => r.key === "");

// usedByOthers (linha 112) — ignora "":
const usedByOthers = new Set(
  draft
    .filter((_, i) => i !== idx)
    .map((c) => c.key)
    .filter((k) => k !== ""),
);

// CustomSelect (linha 127) — passa placeholder:
<CustomSelect
  value={rule.key}
  onChange={(k) => setKey(idx, k)}
  options={fieldOptions}
  placeholder="Selecione uma coluna"
  triggerClassName="h-9 text-sm"
/>

// Aplicar (linha 217):
<Button
  type="button"
  size="sm"
  onClick={() => { onApply(draft); onOpenChange(false); }}
  disabled={!isDirty || hasInvalidRule}
>
  <ArrowUpDown aria-hidden />
  Aplicar
</Button>
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(conversas): T3 v0.25 — sort dialog 'Adicionar critério' sem coluna pré-selecionada

Antes: addRule selecionava available[0] automaticamente.
Depois: cria { key: '', direction: 'asc' }; CustomSelect mostra
placeholder 'Selecione uma coluna'; Aplicar desabilitado se algum
critério tem key vazio. Anti-dup ignora '' explicitamente."
```

---

### Task 4: X destrutivo nos chips Filtros/Ordenação

**Files:**
- Modify: `src/components/reports/advanced-filters.tsx:461-470, 499-508`
- Test: `src/components/reports/__tests__/advanced-filters-x-style.test.tsx` (novo)

- [ ] **Step 1: Failing smoke test**

```tsx
// Mock mínimo de presetsApi.
const stubPresetsApi = {
  presets: [], isAtCap: false, create: jest.fn(),
  rename: jest.fn(), remove: jest.fn(),
  validateName: () => null,
};

it("X dos chips Filtros e Ordenação tem classes destrutivas", () => {
  render(<AdvancedFilters
    inboxes={[]} teams={[]} assignees={[]} labels={[]}
    initial={{ ...EMPTY_FILTER_STATE, inboxIds: [1] }}
    sortStack={[{ key: "name", direction: "asc" }]}
    onSortStackChange={() => {}}
    quickFilters={new Set()}
    onToggleQuick={() => {}} onRemoveQuick={() => {}}
    currentChatwootUserId={null}
    presetsApi={stubPresetsApi}
    onApplyPreset={() => {}} onOpenPresetsManager={() => {}}
    appliedReportFilters={{ period: { start: "2026-04-01", end: "2026-04-30" } }}
    tableRowCount={10}
    searchClient="" onSearchClientChange={() => {}}
  />);
  const xFilters = screen.getByRole("button", { name: /Limpar todos os filtros/i });
  const xSort = screen.getByRole("button", { name: /Limpar ordenação/i });
  for (const el of [xFilters, xSort]) {
    const cls = el.className;
    expect(cls).toMatch(/h-5 w-5/);
    expect(cls).toMatch(/hover:bg-destructive/);
    expect(cls).toMatch(/hover:text-white/);
    expect(cls).toMatch(/hover:ring-2/);
  }
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Edit ambos os X buttons (linhas 461-470 e 499-508) — substituir className**

```tsx
className="absolute -right-1.5 -top-1.5 z-10 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-all hover:scale-110 hover:border-destructive hover:bg-destructive hover:text-white hover:ring-2 hover:ring-destructive/30 hover:ring-offset-1 hover:ring-offset-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-150"
```

E ícone interno: `<X className="h-3 w-3" aria-hidden="true" />`.

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(conversas): T4 v0.25 — X destrutivo nos chips Filtros/Ordenação

Antes: X h-4 w-4, ícone h-2.5 w-2.5, hover só mudava cor.
Depois: h-5 w-5 + ícone h-3 w-3; hover ganha bg-destructive,
text-white, ring-2 destructive/30, ring-offset-1 ring-offset-card,
scale-110 — visual sólido conforme imagem 3 do feedback."
```

---

### Task 5: Cursor pointer global na seção Conversas

**Files (12 arquivos):**
- Modify: `src/components/reports/period-pills.tsx`
- Modify: `src/components/reports/conversas-pagination.tsx`
- Modify: `src/components/reports/conversas-table.tsx` (column headers)
- Modify: `src/components/reports/sorting-dialog.tsx` (botões internos)
- Modify: `src/components/reports/applied-filters-chips.tsx` (X dos chips)
- Modify: `src/components/reports/filters-dialog.tsx`
- Modify: `src/components/reports/filter-chip-list-popover.tsx`
- Modify: `src/components/reports/quick-filters-popover.tsx`
- Modify: `src/components/reports/presets-popover.tsx`
- Modify: `src/components/reports/conversa-drill-down.tsx`
- Modify: `src/components/ui/columns-toggle.tsx`
- Modify: `src/components/ui/calendar.tsx` (via classNames prop do react-day-picker)
- Test: `src/components/reports/__tests__/cursor-pointer-audit.test.tsx` (novo)

- [ ] **Step 1: Audit grep (não falha — só lista)**

```bash
grep -rn "<button" src/components/reports/ src/components/ui/calendar.tsx src/components/ui/columns-toggle.tsx src/components/ui/popover.tsx 2>/dev/null | grep -v "cursor-" | grep -v "test"
```

- [ ] **Step 2: Sanity test (representante por componente)**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "@jest/globals";
import { PeriodPills } from "@/components/reports/period-pills";
import { ConversasPagination } from "@/components/reports/conversas-pagination";

const checkAllButtons = (testName: string) =>
  it(`${testName} — buttons clicáveis têm cursor-pointer; disabled têm cursor-not-allowed`, () => {
    for (const btn of screen.getAllByRole("button")) {
      const cls = btn.className;
      if (btn.hasAttribute("disabled")) {
        expect(cls).toMatch(/cursor-not-allowed|disabled:cursor-not-allowed/);
      } else {
        expect(cls).toMatch(/cursor-pointer/);
      }
    }
  });

describe("Cursor pointer audit v0.25", () => {
  it("PeriodPills", () => {
    render(<PeriodPills value="hoje" onChange={() => {}} />);
    for (const btn of screen.getAllByRole("button")) {
      expect(btn.className).toMatch(/cursor-pointer/);
    }
  });
  it("ConversasPagination atual=5 totalPages=8", () => {
    render(<ConversasPagination page={5} totalPages={8} onPageChange={() => {}} />);
    for (const btn of screen.getAllByRole("button")) {
      const cls = btn.className;
      if (btn.hasAttribute("disabled")) {
        expect(cls).toMatch(/cursor-not-allowed|disabled:cursor-not-allowed/);
      } else {
        expect(cls).toMatch(/cursor-pointer/);
      }
    }
  });
});
```

- [ ] **Step 3: Run, expect FAIL.**

- [ ] **Step 4: Adicionar `cursor-pointer` em todos os buttons da auditoria**

Modificações pontuais (Edit por arquivo, não replace_all global). Pra `disabled`, garantir `disabled:cursor-not-allowed` ou `cursor-not-allowed` no estado disabled.

Calendar via `classNames` prop:
```tsx
<Calendar
  ...
  classNames={{
    day: "cursor-pointer",
    nav_button: "cursor-pointer",
    button_previous: "cursor-pointer",
    button_next: "cursor-pointer",
  }}
/>
```

- [ ] **Step 5: Run, expect PASS.**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(conversas): T5 v0.25 — cursor-pointer global na seção Conversas

PeriodPills, Calendar (dias + nav), ConversasPagination, sorting-dialog,
applied-filters-chips, filters-dialog, filter-chip-list-popover,
quick-filters-popover, presets-popover, conversas-table headers,
conversa-drill-down, columns-toggle. disabled:cursor-not-allowed
nos disabled. Padroniza affordance visual."
```

---

### Task 6: Paginação simplificada

**Files:**
- Modify: `src/components/reports/conversas-pagination.tsx`
- Test: `src/components/reports/__tests__/conversas-pagination.test.tsx` (REESCREVE seções de tests existentes que cobriam ellipsis)

- [ ] **Step 1: Atualizar tests existentes + adicionar novos**

```ts
import { buildPageItems } from "@/components/reports/conversas-pagination"; // export it

describe("buildPageItems v0.25 (simplificado)", () => {
  it("totalPages 0: []", () => expect(buildPageItems(1, 0)).toEqual([]));
  it("totalPages 1: [1]", () => expect(buildPageItems(1, 1)).toEqual([1]));
  it("totalPages 2: [1,2]", () => expect(buildPageItems(1, 2)).toEqual([1, 2]));
  it("totalPages 3: [1,2,3]", () => expect(buildPageItems(2, 3)).toEqual([1, 2, 3]));
  it("totalPages 4: [1,2,3,4]", () => expect(buildPageItems(3, 4)).toEqual([1, 2, 3, 4]));
  it("atual=1 com 8 págs: [1,8]", () => expect(buildPageItems(1, 8)).toEqual([1, 8]));
  it("atual=8 com 8 págs: [1,8]", () => expect(buildPageItems(8, 8)).toEqual([1, 8]));
  it("atual=5 com 8 págs: [1,5,8]", () => expect(buildPageItems(5, 8)).toEqual([1, 5, 8]));
  it("atual=2 com 5 págs: [1,2,5]", () => expect(buildPageItems(2, 5)).toEqual([1, 2, 5]));
});

describe("ConversasPagination v0.25 (render)", () => {
  it("não renderiza dropdown de reticência", () => {
    render(<ConversasPagination page={5} totalPages={8} onPageChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /Selecionar página/i })).toBeNull();
  });
  it("atual no meio é Popover dropdown", () => {
    render(<ConversasPagination page={5} totalPages={8} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Página atual 5/i })).toBeInTheDocument();
  });
});
```

(Apagar tests antigos que faziam asserções sobre `"…"` ou `EllipsisDropdown`.)

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Substituir `buildPageItems` em conversas-pagination.tsx**

```ts
export function buildPageItems(page: number, totalPages: number): number[] {
  if (totalPages <= 0) return [];
  if (totalPages === 1) return [1];
  if (totalPages === 2) return [1, 2];
  if (totalPages === 3) return [1, 2, 3];
  if (totalPages === 4) return [1, 2, 3, 4];
  if (page === 1 || page === totalPages) return [1, totalPages];
  return [1, page, totalPages];
}
```

- [ ] **Step 4: Deletar `<EllipsisDropdown>` + `rangeToPages` (não usados)**

- [ ] **Step 5: Atualizar render — sem ramo `it === "ellipsis"`**

```tsx
{items.map((it) => {
  const isCurrent = page === it;
  const isEdge = it === 1 || it === totalPages;
  if (isCurrent && !isEdge) {
    return <CurrentPageDropdown key={it} page={page} totalPages={totalPages} onPageChange={onPageChange} />;
  }
  return (
    <button
      key={it}
      type="button"
      onClick={() => onPageChange(it)}
      aria-current={isCurrent ? "page" : undefined}
      aria-label={`Ir para página ${it}`}
      className={cn(
        "inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-md border px-3 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
        isCurrent
          ? "border-violet-500/40 bg-violet-500/15 font-semibold text-violet-500"
          : "border-border/50 text-foreground hover:border-border hover:bg-muted",
      )}
    >
      {it}
    </button>
  );
})}
```

(Setas chevron also `cursor-pointer` + `disabled:cursor-not-allowed`.)

- [ ] **Step 6: Run all, expect PASS.**
- [ ] **Step 7: Commit**

```bash
git commit -m "feat(conversas): T6 v0.25 — paginação simplificada sem reticências

Antes: [1, '...', page, '...', N] com 2 EllipsisDropdowns.
Depois: [1, page, N] direto; atual no meio continua sendo Popover dropdown
que abre lista 1..N. Bordas (atual=1|N): [1, N]. Mais limpo, menos cliques."
```

---

### Task 7: matchSearchClient — algoritmo + tests TDD

**Files:**
- Create: `src/lib/reports/match-search-client.ts`
- Create: `src/lib/reports/__tests__/match-search-client.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from "@jest/globals";
import { matchSearchClient, buildHaystack, normalize } from "@/lib/reports/match-search-client";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const baseRow: ConversaRow = {
  id: 1,
  display_id: 12345,
  contact: {
    id: 1,
    name: "João Silva",
    phone_number: "+5511987654321",
    identifier: "07041511111",
    additional_attributes: null,
  },
  inbox: { id: 1, name: "AP-Amapá" },
  team: { id: 1, name: "Comercial" },
  assignee: { id: 1, name: "Allyda Costa" },
  status: 0,           // Aberta
  priority: 1,         // Media
  created_at: "2026-04-30T10:00:00Z",
  last_activity_at: "2026-04-30T11:00:00Z",
  last_message_type: 0,
  last_message_at: "2026-04-30T11:00:00Z",
  last_incoming_at: "2026-04-30T11:00:00Z",
  last_outgoing_at: null,
  custom_attributes: { plano: "Gold", obs: "Cliente VIP" },
  waiting_seconds: 3600,
  open_seconds: null,
  labels: [{ name: "hg", color: "#fff" }, { name: "vip", color: "#000" }],
};

describe("normalize", () => {
  it("lowercase + remove acentos", () => {
    expect(normalize("João")).toBe("joao");
    expect(normalize("AÇÃO")).toBe("acao");
  });
});

describe("matchSearchClient", () => {
  it("vazio/whitespace/undefined retorna todas", () => {
    expect(matchSearchClient([baseRow], "")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "   ")).toHaveLength(1);
    expect(matchSearchClient([baseRow], undefined)).toHaveLength(1);
    expect(matchSearchClient([baseRow], null as unknown as string)).toHaveLength(1);
  });
  it("display_id sem #", () => expect(matchSearchClient([baseRow], "12345")).toHaveLength(1));
  it("display_id com #", () => expect(matchSearchClient([baseRow], "#12345")).toHaveLength(1));
  it("nome com/sem acento + case", () => {
    expect(matchSearchClient([baseRow], "joao")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "João")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "SILVA")).toHaveLength(1);
  });
  it("telefone com/sem máscara", () => {
    expect(matchSearchClient([baseRow], "5511987654321")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "11 98765-4321")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "987654321")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "98765-4321")).toHaveLength(1);
  });
  it("CPF com/sem máscara", () => {
    expect(matchSearchClient([baseRow], "07041511111")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "070.415.111-11")).toHaveLength(1);
  });
  it("inbox/team/assignee com acento", () => {
    expect(matchSearchClient([baseRow], "amapa")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "comercial")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "allyda")).toHaveLength(1);
  });
  it("status pt-BR", () => {
    expect(matchSearchClient([baseRow], "Aberta")).toHaveLength(1);
    expect(matchSearchClient([{ ...baseRow, status: 1 }], "Resolvida")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "Resolvida")).toHaveLength(0);
  });
  it("prioridade pt-BR", () => {
    expect(matchSearchClient([baseRow], "Media")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "Urgente")).toHaveLength(0);
  });
  it("label", () => expect(matchSearchClient([baseRow], "vip")).toHaveLength(1));
  it("custom_attributes key e value", () => {
    expect(matchSearchClient([baseRow], "Gold")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "plano")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "Cliente VIP")).toHaveLength(1);
  });
  it("ignora keys com prefixo _", () => {
    const r = { ...baseRow, custom_attributes: { _internal_id: "abc123" } };
    expect(matchSearchClient([r], "abc123")).toHaveLength(0);
  });
  it("não match", () => expect(matchSearchClient([baseRow], "xyz-naoexiste")).toHaveLength(0));
  it("performance: 50k rows < 500ms", () => {
    const big = Array.from({ length: 50_000 }, (_, i) => ({ ...baseRow, id: i, display_id: i }));
    const t0 = performance.now();
    matchSearchClient(big, "12345");
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
```

- [ ] **Step 2: Run, expect FAIL (module not found).**

- [ ] **Step 3: Implementar `match-search-client.ts`**

```ts
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/chatwoot/conversas-translations";
import { formatPhone } from "@/lib/utils/format-phone";
import { detectDocument } from "@/lib/utils/format-document";

/** Lowercase + remove acentos via NFD + descarte de combining marks. */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
}

/** Variações de phone: raw, formatted, só dígitos. Deduplicado. */
function phoneVariants(phone: string | null): string[] {
  if (!phone) return [];
  const raw = phone;
  const formatted = formatPhone(phone) || "";
  const digits = phone.replace(/\D/g, "");
  return Array.from(new Set([raw, formatted, digits])).filter(Boolean);
}

/** Variações de document: raw + formatted (CPF/CNPJ). Deduplicado. */
function documentVariants(contact: ConversaRow["contact"]): string[] {
  const detected = detectDocument({
    identifier: contact.identifier,
    additional_attributes: contact.additional_attributes,
  });
  return Array.from(
    new Set([contact.identifier ?? "", detected?.formatted ?? "", detected?.raw ?? ""]),
  ).filter(Boolean);
}

/** Stringify custom_attributes ignorando keys com prefixo _. */
function customAttrsToText(ca: Record<string, unknown> | null): string {
  if (!ca) return "";
  return Object.entries(ca)
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" | ");
}

/** Concatena todos os campos relevantes em uma string única normalizada. */
export function buildHaystack(row: ConversaRow): string {
  const parts: string[] = [
    String(row.display_id),
    `#${row.display_id}`,
    row.contact.name ?? "",
    ...phoneVariants(row.contact.phone_number),
    ...documentVariants(row.contact),
    row.inbox.name ?? "",
    row.team.name ?? "",
    row.assignee.name ?? "",
    STATUS_LABELS[row.status] ?? "",
    row.priority != null ? PRIORITY_LABELS[row.priority] ?? "" : "",
    ...row.labels.map((l) => l.name),
    customAttrsToText(row.custom_attributes),
  ];
  return normalize(parts.join(" || "));
}

/** Filtra rows por busca client-side global. */
export function matchSearchClient(
  rows: ConversaRow[],
  search: string | null | undefined,
): ConversaRow[] {
  const trimmed = (search ?? "").trim();
  if (!trimmed) return rows;
  const needle = normalize(trimmed);
  return rows.filter((row) => buildHaystack(row).includes(needle));
}
```

- [ ] **Step 4: Run, expect all PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/match-search-client.ts src/lib/reports/__tests__/match-search-client.test.ts
git commit -m "feat(conversas): T7 v0.25 — matchSearchClient + sanity tests

Algoritmo OR sobre 11 campos (display_id ±#, name, phone com/sem
máscara, identifier CPF/CNPJ com/sem máscara, inbox/team/assignee,
status pt-BR, prioridade pt-BR, labels[], custom_attributes ignorando _).
Normaliza acentos via NFD + remove combining marks. Performance 50k
rows < 500ms (medido)."
```

---

### Task 8: page.tsx — pageSize 50k + remove search dos reportFilters + banner cap

**Files:**
- Modify: `src/app/(protected)/relatorios/conversas/page.tsx`
- Modify: `src/lib/chatwoot/queries/conversas-list.ts:90` (MAX_LIMIT)

- [ ] **Step 1: Edit `page.tsx:58-72` (remove search)**

```tsx
const reportFilters: ReportFilters = {
  period,
  inboxIds: filterState.inboxIds.length ? filterState.inboxIds : undefined,
  teamIds: filterState.teamIds.length ? filterState.teamIds : undefined,
  assigneeIds: filterState.assigneeIds.length ? filterState.assigneeIds : undefined,
  statuses: filterState.statuses.length ? filterState.statuses : undefined,
  priorities: filterState.priorities.length ? filterState.priorities : undefined,
  labelIds: filterState.labelIds.length ? filterState.labelIds : undefined,
  excludeMatrixIA,
  // search removido: agora é client-side (T10).
};
```

- [ ] **Step 2: Edit `page.tsx:87-93` (pageSize 50k)**

```tsx
fetchConversas({
  filters: reportFilters,
  accountId,
  page: 1,
  pageSize: 50_000,
}),
```

- [ ] **Step 3: Edit `page.tsx:107-110` (rows + over cap)**

```tsx
const conversasTotal = conversasResult.total ?? 0;
const conversasOverCap = conversasTotal > 50_000;
```

(Não precisa mais de `conversasPage`, `conversasPageSize`, `conversasTotalPages` — paginação é client.)

- [ ] **Step 4: Edit `page.tsx:131-133` (banner cap)**

```tsx
{conversasOverCap ? (
  <div role="status" aria-live="polite" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
    Período retornou {conversasTotal.toLocaleString("pt-BR")} conversas (acima do cap de 50.000 pra busca global).
    Mostrando as primeiras 50.000. Refine o período ou os filtros para incluir mais.
  </div>
) : null}
```

- [ ] **Step 5: Edit `page.tsx:137-156` (props simplificadas)**

```tsx
<ConversasPageClient
  inboxes={inboxes}
  teams={teams}
  assignees={assignees}
  labels={labels}
  filterState={filterState}
  accountId={accountId}
  initialRows={conversasResult.rows}
  reportFilters={reportFilters}
  conditionGroup={
    filterState.mode === "advanced" ? filterState.conditionGroup : undefined
  }
  currentChatwootUserId={null}
/>
```

- [ ] **Step 6: Edit `conversas-list.ts:90`**

```ts
const MAX_LIMIT = 50_000;
```

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```

(Espero erros em ConversasPageClient — que vão ser resolvidos em T10.)

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(conversas): T8 v0.25 — page.tsx pageSize 50k + remove search dos reportFilters

- pageSize 1000 → 50_000 (cap defensivo).
- search removido de reportFilters (não vai mais pra SQL).
- Banner amarelo quando total > 50.000.
- MAX_LIMIT em conversas-list.ts elevado de 10k → 50k.
- Cache key Redis estável durante busca (era invalidada por keystroke).

Trade-off conhecido: TTFB primeira carga em 'Todos' populado pode subir
de ~500ms (1k rows) para 5-10s (50k rows + JOINs). Cache 30s amortiza
nas seguintes."
```

---

### Task 9: conversas-list.ts — remove search clause + deprecate helper

**Files:**
- Modify: `src/lib/chatwoot/queries/conversas-list.ts:22, 193-200, 334, 348`
- Modify: `src/lib/chatwoot/conversas-search.ts` (deprecate JSDoc)

- [ ] **Step 1: Remover import + uso do helper**

```ts
// :22 — deletar:
// import { buildConversasSearchClause } from "../conversas-search";

// :193-200 — deletar bloco searchClause inteiro.

// :334 e :348 — remover ` AND ${searchClause.sql}` (concat condicional).
```

- [ ] **Step 2: Adicionar JSDoc @deprecated em conversas-search.ts**

```ts
/**
 * @deprecated v0.25.0 — busca migrou para client-side em
 * `src/lib/reports/match-search-client.ts`. Helper preservado para
 * compatibilidade dos tests existentes; não usar em novo código.
 */
export function buildConversasSearchClause(...)
```

- [ ] **Step 3: Run conversas-list tests, expect no regressões**

```bash
npx jest src/lib/chatwoot/queries/__tests__/conversas-list.test.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(conversas): T9 v0.25 — conversas-list.ts remove search SQL clause

buildConversasSearchClause não é mais chamado. Helper marcado @deprecated;
tests existentes preservados. WHERE base inalterado."
```

---

### Task 10: ConversasPageClient — searchClient + paginação client

**Files:**
- Modify: `src/components/reports/conversas-page-client.tsx`

- [ ] **Step 1: Edit interface Props**

```tsx
interface Props {
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  labels: MetaItem[];
  filterState: FilterState;
  accountId: number;
  initialRows: ConversaRow[];
  reportFilters: FetchConversasInput["filters"];
  conditionGroup?: ConditionGroup;
  currentChatwootUserId: number | null;
}
```

(Removidos: `total`, `page`, `pageSize`, `totalPages`.)

- [ ] **Step 2: State local + reset**

```tsx
const PAGE_SIZE_CLIENT = 100;
const [searchClient, setSearchClient] = useState<string>("");
const [pageClient, setPageClient] = useState<number>(1);
const [filteredCount, setFilteredCount] = useState<number>(initialRows.length);

useEffect(() => {
  setPageClient(1);
}, [searchClient, filterState, sortStack, quickFilters]);
```

- [ ] **Step 3: Passar pra `<AdvancedFilters>` e `<ConversasTable>`**

```tsx
<AdvancedFilters
  ...
  searchClient={searchClient}
  onSearchClientChange={setSearchClient}
  tableRowCount={filteredCount}
/>
<ConversasTable
  initialRows={initialRows}
  pageClient={pageClient}
  pageSizeClient={PAGE_SIZE_CLIENT}
  onPageClientChange={setPageClient}
  onFilteredCountChange={setFilteredCount}
  accountId={accountId}
  filters={reportFilters}
  sortStack={sortStack}
  onSortStackChange={setSortStack}
  conditionGroup={composedConditionGroup}
  searchClient={searchClient}
/>
```

- [ ] **Step 4: Remover `handlePageChange`/`useRouter`**

(URL não recebe mais `?page=N`.)

- [ ] **Step 5: typecheck**

(Erros vão sumir após T11/T12 atualizarem AdvancedFilters/ConversasTable.)

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(conversas): T10 v0.25 — ConversasPageClient searchClient + paginação client

State local: searchClient (string) + pageClient (number).
Reset pageClient=1 quando search/filters/sort/quickFilters mudam.
filteredCount notificado pela tabela e propagado pro Export.
handlePageChange server-side deletado (paginação é UI agora)."
```

---

### Task 11: AdvancedFilters — input controlado + Esc + tooltip Export

**Files:**
- Modify: `src/components/reports/advanced-filters.tsx`
- Test: `src/components/reports/__tests__/advanced-filters-search.test.tsx` (novo)

- [ ] **Step 1: Failing tests**

```tsx
it("Enter no input chama onSearchClientChange", () => {
  const onSearchClientChange = jest.fn();
  render(<AdvancedFilters {...baseProps} searchClient="" onSearchClientChange={onSearchClientChange} />);
  const input = screen.getByLabelText(/Buscar conversas/i);
  fireEvent.change(input, { target: { value: "070" } });
  expect(onSearchClientChange).toHaveBeenLastCalledWith("070");
});

it("Esc limpa searchClient (preventDefault)", () => {
  const onSearchClientChange = jest.fn();
  render(<AdvancedFilters {...baseProps} searchClient="070" onSearchClientChange={onSearchClientChange} />);
  const input = screen.getByLabelText(/Buscar conversas/i);
  const event = createEvent.keyDown(input, { key: "Escape" });
  fireEvent(input, event);
  expect(onSearchClientChange).toHaveBeenCalledWith("");
  expect(event.defaultPrevented).toBe(true);
});

it("ExportButton tem tooltip explicando que ignora search", () => {
  render(<AdvancedFilters {...baseProps} searchClient="joao" onSearchClientChange={() => {}} />);
  // ExportButton renderiza <button> com title quando searchClient != "".
  const exportBtn = screen.getByRole("button", { name: /Exportar/i });
  expect(exportBtn).toHaveAttribute("title", expect.stringMatching(/inclui os filtros aplicados, não a busca/i));
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Edit interface + JSX**

```tsx
export interface AdvancedFiltersProps {
  ...
  searchClient: string;
  onSearchClientChange: (next: string) => void;
}

// no input:
<Input
  type="search"
  value={searchClient}
  onChange={(e) => onSearchClientChange(e.currentTarget.value)}
  onKeyDown={(e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onSearchClientChange("");
    }
  }}
  placeholder="Buscar..."
  aria-label="Buscar conversas"
  className="h-10 cursor-text pl-9 pr-[112px]"
/>

// ExportButton:
<ExportButton
  filters={appliedReportFilters}
  accountId={accountId ?? 9}
  rowCount={tableRowCount}
  searchClientActive={searchClient.trim() !== ""}
/>
```

- [ ] **Step 4: Edit `export-button.tsx` — aceitar `searchClientActive` e renderizar `title` quando true**

```tsx
interface Props {
  ...
  searchClientActive?: boolean;
}

<button
  ...
  title={searchClientActive ? "A exportação inclui os filtros aplicados, não a busca atual." : undefined}
>
  ...
</button>
```

- [ ] **Step 5: Remover `updateSearch`/`draft.search` lógica que sobrava**

(`pendingDiff` continua excluindo search via `withoutSearch` — comportamento já correto.)

- [ ] **Step 6: Run tests, expect PASS.**
- [ ] **Step 7: Commit**

```bash
git commit -m "feat(conversas): T11 v0.25 — input search controlado + Esc + tooltip Export

- Input value/onChange ligados a searchClient/onSearchClientChange via prop.
- Esc limpa busca (preventDefault para evitar comportamento Safari nativo).
- ExportButton ganha title 'A exportação inclui os filtros aplicados, não
  a busca atual' quando search ativa — clarifica que export é server-side."
```

---

### Task 12: ConversasTable — pipeline match → conditions → sort → slice

**Files:**
- Modify: `src/components/reports/conversas-table.tsx`
- Test: `src/components/reports/__tests__/conversas-table.test.tsx` (estende)

- [ ] **Step 1: Failing tests**

```tsx
it("filtra por searchClient e mostra contador correto", () => {
  const rows = [
    { ...baseRow, contact: { ...baseRow.contact, name: "Ana" } },
    { ...baseRow, id: 2, display_id: 22, contact: { ...baseRow.contact, name: "Beto" } },
    { ...baseRow, id: 3, display_id: 33, contact: { ...baseRow.contact, name: "Carlos" } },
  ];
  render(<ConversasTable {...baseProps} initialRows={rows} searchClient="ana" />);
  expect(screen.getByText(/Mostrando 1-1 de 1 conversa/)).toBeInTheDocument();
});

it("paginação client: 250 rows com pageSize=100 → atual=2 mostra 101-200", () => {
  const rows = Array.from({ length: 250 }, (_, i) => ({ ...baseRow, id: i, display_id: i }));
  render(<ConversasTable {...baseProps} initialRows={rows} pageClient={2} pageSizeClient={100} />);
  expect(screen.getByText(/Mostrando 101-200 de 250/)).toBeInTheDocument();
});

it("empty state com search ativa sugere limpar busca", () => {
  render(<ConversasTable {...baseProps} initialRows={[baseRow]} searchClient="zzznaoexiste" />);
  expect(screen.getByText(/limpe a busca/i)).toBeInTheDocument();
});

it("highlight roxo aparece nas células das colunas matched", () => {
  render(<ConversasTable {...baseProps} initialRows={[baseRow]} searchClient="João" />);
  const marks = screen.getAllByText("João");
  expect(marks.some((m) => m.tagName === "MARK")).toBe(true);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Edit interface + pipeline**

```tsx
import { matchSearchClient } from "@/lib/reports/match-search-client";

interface ConversasTableProps {
  initialRows: ConversaRow[];
  pageClient: number;
  pageSizeClient: number;
  onPageClientChange: (page: number) => void;
  onFilteredCountChange?: (count: number) => void;
  accountId: number;
  filters: FetchConversasInput["filters"];
  sortStack: SortRule[];
  onSortStackChange: (next: SortRule[]) => void;
  conditionGroup?: ConditionGroup;
  searchClient: string;
}

export function ConversasTable({
  initialRows, pageClient, pageSizeClient, onPageClientChange,
  onFilteredCountChange, accountId, sortStack, onSortStackChange,
  conditionGroup, searchClient,
}: ConversasTableProps) {
  const [rows, setRows] = useState<ConversaRow[]>(initialRows);
  // ...
  const searchedRows = useMemo(
    () => matchSearchClient(rows, searchClient),
    [rows, searchClient],
  );
  const filteredRows = useMemo(() => {
    if (!conditionGroup?.conditions?.length) return searchedRows;
    return applyConditions(searchedRows, conditionGroup);
  }, [searchedRows, conditionGroup]);

  const sortedRows = useMemo(() => {
    if (sortStack.length === 0) return filteredRows;
    // (sort lógico atual sobre filteredRows)
  }, [filteredRows, sortStack]);

  const totalFiltered = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSizeClient));
  const safePage = Math.min(Math.max(1, pageClient), totalPages);
  const pagedRows = useMemo(
    () => sortedRows.slice((safePage - 1) * pageSizeClient, safePage * pageSizeClient),
    [sortedRows, safePage, pageSizeClient],
  );

  useEffect(() => {
    onFilteredCountChange?.(totalFiltered);
  }, [totalFiltered, onFilteredCountChange]);
```

- [ ] **Step 4: Toolbar usa `totalFiltered` + `safePage`**

```tsx
const showingFrom = totalFiltered === 0 ? 0 : (safePage - 1) * pageSizeClient + 1;
const showingTo = Math.min(safePage * pageSizeClient, totalFiltered);
const total = totalFiltered;
// ... rest do toolbar identico, mas usando totalFiltered/safePage/totalPages local.
<ConversasPagination
  page={safePage}
  totalPages={totalPages}
  onPageChange={onPageClientChange}
  className="..."
/>
```

- [ ] **Step 5: Virtualizer usa `pagedRows`**

```tsx
const rowVirtualizer = useVirtualizer({ count: pagedRows.length, ... });
```

- [ ] **Step 6: Render usa `pagedRows`**

(Trocar `sortedRows` → `pagedRows` no render.)

- [ ] **Step 7: HighlightedText recebe `searchClient` (renomear searchTerm prop interno)**

(Substituir todos os `term={searchTerm}` por `term={searchClient}`.)

- [ ] **Step 8: Empty state — texto adaptativo**

```tsx
<p className="mt-1 text-xs text-muted-foreground">
  {searchClient.trim()
    ? "Nenhum resultado para a busca. Ajuste os filtros ou limpe a busca."
    : "Ajuste os filtros para ver mais resultados."}
</p>
```

- [ ] **Step 9: Run all, expect PASS.**
- [ ] **Step 10: Commit**

```bash
git commit -m "feat(conversas): T12 v0.25 — ConversasTable pipeline client + paginação UI

- Pipeline: match (searchClient) → conditionGroup → sort → slice por página.
- Counter 'Mostrando X-Y de Z' reflete totalFiltered.
- Paginação UI sobre dados hidratados; ConversasPagination consome
  safePage/totalPages calculados localmente.
- HighlightedText recebe searchClient — destaque imediato em todas as
  colunas (visíveis e drill-down).
- Empty state adaptativo com 'limpe a busca' quando search ativa."
```

---

### Task 12.5: HighlightedText — normalize NFD (bug fix)

**Files:**
- Modify: `src/lib/utils/highlight-text.tsx`
- Test: `src/lib/utils/__tests__/highlight-text.test.tsx` (estende)

- [ ] **Step 1: Failing tests novos**

```tsx
import { render } from "@testing-library/react";
import { HighlightedText } from "@/lib/utils/highlight-text";

it("destaca match ignorando acentos (busca 'joao' destaca 'João')", () => {
  const { container } = render(<HighlightedText text="João Silva" term="joao" />);
  const mark = container.querySelector("mark");
  expect(mark).not.toBeNull();
  expect(mark?.textContent).toBe("João");
});

it("destaca match ignorando case (busca 'AçÃO' destaca 'ação')", () => {
  const { container } = render(<HighlightedText text="Plano de ação" term="AçÃO" />);
  const mark = container.querySelector("mark");
  expect(mark?.textContent).toBe("ação");
});

it("preserva texto original (acentos no render)", () => {
  const { container } = render(<HighlightedText text="São Paulo" term="sao" />);
  expect(container.textContent).toBe("São Paulo");
});

it("texto sem term retorna texto cru", () => {
  const { container } = render(<HighlightedText text="abc" term="" />);
  expect(container.textContent).toBe("abc");
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Reescrever HighlightedText**

```tsx
import type { ReactNode } from "react";

interface Props {
  text: string | null | undefined;
  term?: string;
}

/** Lowercase + remove acentos. Mantém length por char (NFD com remoção de combining marks tem length variável; usamos walk caractere a caractere). */
function buildIndexMap(text: string): { normalized: string; map: number[] } {
  // map[i] = índice do caractere ORIGINAL para o i-ésimo caractere do normalized.
  let normalized = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const norm = ch.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
    for (let j = 0; j < norm.length; j++) {
      normalized += norm[j];
      map.push(i);
    }
  }
  return { normalized, map };
}

export function HighlightedText({ text, term }: Props) {
  if (text == null) return null;
  const trimmed = term?.trim();
  if (!trimmed) return <>{text}</>;

  const { normalized, map } = buildIndexMap(text);
  const lowerTerm = trimmed.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
  if (!lowerTerm) return <>{text}</>;

  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let counter = 0;
  let idx = normalized.indexOf(lowerTerm);
  while (idx !== -1) {
    const startOrig = map[idx]!;
    const endOrig = (map[idx + lowerTerm.length - 1] ?? text.length - 1) + 1;
    if (startOrig > lastIdx) parts.push(text.slice(lastIdx, startOrig));
    parts.push(
      <mark
        key={`m${counter++}`}
        className="rounded-sm bg-violet-500/15 px-0.5 font-semibold text-violet-500"
      >
        {text.slice(startOrig, endOrig)}
      </mark>,
    );
    lastIdx = endOrig;
    idx = normalized.indexOf(lowerTerm, idx + lowerTerm.length);
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

export default HighlightedText;
```

- [ ] **Step 4: Run all highlight-text tests, expect PASS.**
- [ ] **Step 5: Commit**

```bash
git commit -m "fix(highlight): T12.5 v0.25 — HighlightedText normaliza NFD (acentos)

Bug existente: busca 'joao' encontrava match em matchSearchClient mas
HighlightedText não destacava 'João' (lowercase só, sem normalize NFD).

Fix: walk char a char construindo index map (normalizedIdx → originalIdx),
permite slice do texto ORIGINAL com índices do match no normalizado.
Preserva acentos no render. Cobre case + acentos."
```

---

### Task 13: bump v0.25.0 + CHANGELOG + STATUS

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Bump version → `"version": "0.25.0"`**

- [ ] **Step 2: Entry CHANGELOG (padrão das releases anteriores)**

- [ ] **Step 3: STATUS.md no topo**

- [ ] **Step 4: typecheck + jest full**

```bash
npm run typecheck && npm test
```

- [ ] **Step 5: Commit (sem push ainda)**

```bash
git commit -m "chore(release): v0.25.0 — Conversas Polish + busca client-side global

7 ajustes em /relatorios/conversas:
- T1: SORT_OPTIONS adiciona Documento (label pt-BR no chip).
- T2: Etiquetas no chip sem (N).
- T3: Sort dialog 'Adicionar critério' sem coluna pré-selecionada.
- T4: X destrutivo nos chips Filtros/Ordenação.
- T5: cursor-pointer global na seção.
- T6: Paginação simplificada [1, page, N] sem reticências.
- T7-T12: Busca client-side global (cap 50k, normalize NFD).
- T12.5: Bug fix HighlightedText normalize.

Quebra UX: ?q=... na URL não é mais hidratado (search é efêmera/local).
Cap 50k aplicado: total > 50.000 mostra banner; primeiras 50k carregadas.
TTFB primeira carga em 'Todos' populado pode subir; cache 30s amortiza."
```

- [ ] **Step 6: Push (após confirmação João — deploy automático)**

---

## §4. Edge Cases

- **Cap 50.000:** banner não bloqueia uso — só avisa. Paginação/sort/visualização funcionam.
- **Stale Chatwoot:** banner stale + busca client funciona em cache.
- **Sort key="":** Apply desabilitado.
- **Phone +55 11 98765-4321:** match em `5511987654321`, `987654321`, `98765-4321`.
- **CPF 070.415.111-11:** match em `070.415.111-11` E `07041511111`.
- **Acentos:** "joao" matches "João" (algoritmo + highlight).
- **Custom attributes JSON:** match em chave (`plano`) E valor (`Gold`); ignora keys com `_`.
- **Empty state com search:** "Nenhum resultado para a busca. Ajuste os filtros ou limpe a busca."
- **searchClient persiste entre paginações:** sim.
- **searchClient persiste entre mudanças de filter/sort:** sim (só reseta page=1).
- **searchClient zera quando muda período:** NÃO (decisão: search persiste; user limpa via X/Esc).
- **Dark + light mode:** X destrutivo testado em ambos; ring-offset-card adapta.

---

## §5. Riscos e Rollback

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Performance pipeline 50k rows | Baixa | Medido em T7 (< 500ms). |
| Memória browser ~3-5MB JSON | Baixa | Aceitável; React virtualizer cuida do render. |
| TTFB primeira carga 5-10s em "Todos" populado | Média | Cache Redis 30s; user vê StaleBanner se Chatwoot fora; loading skeleton já existe. |
| URL `?q=...` favorita deixa de hidratar | Aceito | Documentado no CHANGELOG; search sempre foi efêmera. |
| Regressão Export | Baixa | Export usa server-side aplicado; tooltip clarifica. |
| Bug HighlightedText novo (mapping de índices) | Média | T12.5 com 4 tests dedicados. |

**Plano de rollback:**
1. `git revert <SHA da release>` no main.
2. `git push origin main` → CI redeploy automático.
3. Verificar `/api/health` volta a `version=v0.24.0`.
4. Cache Redis: invalidar via `redis-cli FLUSHDB` no container do redis (cache-keys mudam de hash quando search volta pros filters; sem flush, quem clicar busca pode ver primeira tela cached pré-rollback — ~30s).

---

## §6. Self-Review v2

- [x] Cada task tem files/test/steps/code blocks/commit.
- [x] T1 SORT_OPTIONS export — única dependência é o test (não há outro consumer).
- [x] T7 algoritmo cobre 11 campos listados em §1.3.
- [x] Cap 50_000 alinhado entre page.tsx (T8) e MAX_LIMIT (T8).
- [x] T10/T11/T12 dependências cabeadas: searchClient flui T10 → T11 (input) + T12 (pipeline).
- [x] Tests TDD em todas as tasks.
- [x] DRY: helpers compartilhados (matchSearchClient, normalize) em lugar único.
- [x] CustomSelect já aceita placeholder (verificado).
- [x] HighlightedText fix dedicado em T12.5.
- [x] Tour bumpa? Não — estrutura intacta.
