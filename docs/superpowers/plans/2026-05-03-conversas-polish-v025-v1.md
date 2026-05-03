# Conversas Polish v0.25.0 — Implementation Plan (v1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 7 ajustes em `/relatorios/conversas` — 6 polish + busca client-side global (opção B alinhada com João).

**Architecture:** Polish localizado nos componentes da Conversas (advanced-filters, applied-filters-chips, sorting-dialog, conversas-pagination). Busca migra de SQL ILIKE → filtro client-side puro sobre rows já hidratadas (cap 50.000). Paginação vira UI slicing.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · base-ui · @tanstack/react-virtual · Lucide.

---

## §1. Decisões arquiteturais (consolidadas do brainstorm)

### 1.1 Busca client-side global (opção B)

- `search` sai dos `reportFilters` que vão para SQL. Vira state local em `ConversasPageClient`.
- `page.tsx` carrega `pageSize: 50_000` (cap defensivo). Cache key fica idêntica entre digitação/limpeza.
- Se `total > 50_000` → banner amarelo: "Período retornou mais de 50.000 conversas. Refine o período/filtros para ativar a busca global."
- Pipeline na tabela: `searchedRows = match(rows, searchClient)` → `filteredRows = applyConditions(searchedRows, conditionGroup)` → `sortedRows = sort(filteredRows, sortStack)` → `pagedRows = slice(sortedRows, page, pageSize=100)`.
- Mudança de `searchClient`/filtros/sort reseta `page=1`.
- Algoritmo `matchSearchClient`: case-insensitive + ignora acentos via `String.prototype.normalize("NFD").replace(/[̀-ͯ]/g, "")`. Match OR sobre estes campos:
  - `display_id` (com e sem `#`)
  - `contact.name`
  - `contact.phone_number` (raw + formatado via `formatPhone`)
  - `contact.identifier` (raw + formatado via `detectDocument().formatted`)
  - `inbox.name`, `team.name`, `assignee.name`
  - Status pt-BR via `STATUS_LABELS[status]`
  - Prioridade pt-BR via `PRIORITY_LABELS[priority]`
  - `labels[].name` (cada etiqueta)
  - `custom_attributes` (JSON.stringify ignorando keys que começam com `_`)
- Datas (Criado em / Última atualização) FORA do match — fora do escopo desta release.
- `<HighlightedText>` já existe; passa `searchClient` como `searchTerm`.
- Stale banner do Chatwoot continua aparecendo quando aplicável; busca funciona normalmente sobre cache.
- URL não recebe mais `?q=...`. Quem favoritou URL com search vai abrir sem busca aplicada (breaking aceitável — search sempre foi efêmera).
- `<ExportButton>` recebe rows filtradas pelo searchClient (export = o que está na tela após busca + filtros + sort).

### 1.2 Polish (6 ajustes)

| # | Componente | Mudança |
|---|---|---|
| 1 | `advanced-filters.tsx:429-509` | X adesivo dos chips Filtros/Ordenação ganha visual destrutivo no hover (igual à imagem 3 do João): `h-5 w-5` + X `h-3 w-3`; idle: borda cinza + bg-card; hover: `bg-destructive`, X `text-white`, `ring-2 ring-destructive/30 ring-offset-1 ring-offset-card`, `scale-110`. |
| 2 | Toda a seção conversas | `cursor-pointer` em todo `<button>` clicável (period pills, calendar, paginação, headers ordenáveis, chips). `cursor-not-allowed` nos disabled. |
| 3 | `sorting-dialog.tsx:69-72` | `addRule()` cria `{ key: "", direction: "asc" }`. `<CustomSelect>` ganha `placeholder="Selecione uma coluna"`. Botão "Aplicar" desabilitado se algum rule tem `key === ""`. |
| 4 | `advanced-filters.tsx:73-85` | `SORT_OPTIONS` ganha `{ key: "document", label: "Documento" }` na posição 2 (após "name"). |
| 5 | `applied-filters-chips.tsx:181-188` | Etiquetas usam `summarize("Etiquetas", applied.labelIds, meta.labels ?? [])`. Resultado: "Etiquetas: hg" / "Etiquetas: hg +3". |
| 6 | `conversas-pagination.tsx:30-41` | `buildPageItems` simplificado: ≤4 todas, `atual=1\|N` → `[1, N]`, `atual no meio` → `[1, page, N]`. Sem reticências. `<EllipsisDropdown>` deletado. |

---

## §2. File Structure

### Modificações

| Arquivo | Responsabilidade da mudança |
|---|---|
| `src/app/(protected)/relatorios/conversas/page.tsx` | `pageSize: 50_000`; `search` removido de `reportFilters`; banner cap. |
| `src/components/reports/conversas-page-client.tsx` | State `searchClient` local; `pageSize=100` para slicing client; reset page on filters/sort/search change; pipeline rows. |
| `src/components/reports/advanced-filters.tsx` | Input controlado por `searchClient` local + `Enter` aplica + `Esc` limpa; remove URL push de search; `SORT_OPTIONS` ganha document; X destrutivo nos chips Filtros/Ordenação. |
| `src/components/reports/applied-filters-chips.tsx` | Etiquetas via `summarize`. |
| `src/components/reports/sorting-dialog.tsx` | `addRule` sem pré-seleção + placeholder + Apply guard. |
| `src/components/reports/conversas-pagination.tsx` | Algoritmo simplificado (sem reticências). |
| `src/components/reports/conversas-table.tsx` | Pipeline `match → conditions → sort → slice`; recebe `searchClient` como `searchTerm` para HighlightedText; paginação UI sobre dados client. |
| `src/components/ui/calendar.tsx` (se necessário) | `cursor-pointer` em dias e setinhas. |
| `src/components/ui/custom-select.tsx` | Suporte a `placeholder` quando `value === ""`. |
| `src/lib/chatwoot/queries/conversas-list.ts` | Remove chamada `buildConversasSearchClause`; comentário deprecation. |
| `src/lib/chatwoot/conversas-search.ts` | JSDoc `@deprecated` (não deletar — preserva testes existentes). |
| `package.json` | Bump `0.24.0` → `0.25.0`. |
| `CHANGELOG.md` | Entrada v0.25.0. |
| `docs/STATUS.md` | Release v0.25.0. |

### Novos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/reports/match-search-client.ts` | Algoritmo de match (com tests TDD). |
| `src/lib/reports/__tests__/match-search-client.test.ts` | Sanity tests do algoritmo. |

---

## §3. Tasks

### Task 1: SORT_OPTIONS ganha "Documento"

**Files:**
- Modify: `src/components/reports/advanced-filters.tsx:73-85`
- Test: `src/components/reports/__tests__/advanced-filters-sort-options.test.ts` (novo)

- [ ] **Step 1: Write failing test**

```ts
// src/components/reports/__tests__/advanced-filters-sort-options.test.ts
import { describe, it, expect } from "@jest/globals";
import { SORT_OPTIONS } from "@/components/reports/advanced-filters";

describe("SORT_OPTIONS", () => {
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

- [ ] **Step 2: Run, expect fail (SORT_OPTIONS not exported OR document missing)**

`npx jest src/components/reports/__tests__/advanced-filters-sort-options.test.ts`

Expected: FAIL.

- [ ] **Step 3: Export SORT_OPTIONS + adicionar entry**

Em `advanced-filters.tsx:73`:
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

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/advanced-filters.tsx src/components/reports/__tests__/advanced-filters-sort-options.test.ts
git commit -m "feat(conversas): T1 v0.25 — adiciona Documento em SORT_OPTIONS

Bug: ordenar via header da coluna 'Documento' resultava em chip com label
'document' (em inglês), porque sortOptions do AppliedFiltersChips não
encontrava a entry e usava rule.key como fallback.

Fix: adicionar { key: 'document', label: 'Documento' } em SORT_OPTIONS,
posição 2 (após Nome). Coluna já existe na tabela com compareFn correto."
```

---

### Task 2: AppliedFiltersChips — Etiquetas sem `(N)`

**Files:**
- Modify: `src/components/reports/applied-filters-chips.tsx:181-188`
- Test: `src/components/reports/__tests__/applied-filters-chips.test.tsx` (estende)

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "@jest/globals";
import { AppliedFiltersChips } from "@/components/reports/applied-filters-chips";
import { EMPTY_FILTER_STATE } from "@/lib/reports/filter-state";

describe("AppliedFiltersChips — Etiquetas v0.25", () => {
  it("chip Etiquetas segue padrão summarize (sem parênteses)", () => {
    render(
      <AppliedFiltersChips
        meta={{
          inboxes: [],
          teams: [],
          assignees: [],
          labels: [
            { id: 1, name: "hg" },
            { id: 2, name: "vip" },
            { id: 3, name: "novo" },
            { id: 4, name: "bloqueado" },
          ],
        }}
        applied={{ ...EMPTY_FILTER_STATE, labelIds: [1, 2, 3, 4] }}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.queryByText(/Etiquetas \(4\)/)).toBeNull();
    // FilterChipListPopover renderiza o trigger com o resumo summarize-like.
    expect(screen.getByText(/Etiquetas: hg \+3/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect fail (current renders "Etiquetas (4)")**

- [ ] **Step 3: Aplicar mudança**

Em `applied-filters-chips.tsx:181`:
```tsx
if (applied.labelIds.length) {
  chips.push({
    key: "labelIds",
    label: summarize("Etiquetas", applied.labelIds, meta.labels ?? []),
  });
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/applied-filters-chips.tsx src/components/reports/__tests__/applied-filters-chips.test.tsx
git commit -m "feat(conversas): T2 v0.25 — Etiquetas sem (N) padronizadas

Antes: chip 'Etiquetas (4): hg +3' (parênteses N quebrava padrão).
Depois: 'Etiquetas: hg +3' usando summarize() — mesmo padrão de
Caixa de entrada / Departamento / Atendente / Status / Prioridade.
meta.labels já é resolvido em resolveItems(); apenas troca a fonte do label."
```

---

### Task 3: SortingDialog — "Adicionar critério" sem coluna pré-selecionada

**Files:**
- Modify: `src/components/reports/sorting-dialog.tsx`
- Modify: `src/components/ui/custom-select.tsx` (suporte a placeholder quando value vazio)
- Test: `src/components/reports/__tests__/sorting-dialog.test.tsx` (estende)

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, jest } from "@jest/globals";
import { SortingDialog } from "@/components/reports/sorting-dialog";

describe("SortingDialog v0.25 — Adicionar critério sem coluna pré-selecionada", () => {
  const options = [
    { key: "name", label: "Nome" },
    { key: "document", label: "Documento" },
  ];

  it("addRule cria critério com key vazio + placeholder visível", () => {
    render(
      <SortingDialog
        open
        onOpenChange={() => {}}
        applied={[]}
        options={options}
        onApply={() => {}}
        onClear={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Adicionar critério/i }));
    expect(screen.getByText(/Selecione uma coluna/i)).toBeInTheDocument();
  });

  it("Aplicar fica desabilitado quando há critério com key vazio", () => {
    const onApply = jest.fn();
    render(
      <SortingDialog
        open
        onOpenChange={() => {}}
        applied={[]}
        options={options}
        onApply={onApply}
        onClear={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Adicionar critério/i }));
    const aplicar = screen.getByRole("button", { name: /Aplicar/i });
    expect(aplicar).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Modificar `addRule` + Apply guard em `sorting-dialog.tsx`**

```tsx
const addRule = () => {
  setDraft((p) => [...p, { key: "", direction: "asc" }]);
};

const hasInvalidRule = draft.some((r) => r.key === "");
// ... no JSX do "Aplicar":
<Button
  disabled={!isDirty || hasInvalidRule}
  onClick={() => { onApply(draft); onOpenChange(false); }}
>
```

- [ ] **Step 4: Adicionar suporte a placeholder em `custom-select.tsx`**

(Verificar primeiro a API atual. Se já aceita placeholder, só passar `placeholder="Selecione uma coluna"` no SortingDialog.)

- [ ] **Step 5: Passar placeholder no `<CustomSelect>` do SortingDialog**

```tsx
<CustomSelect
  value={rule.key}
  onChange={(k) => setKey(idx, k)}
  options={fieldOptions}
  placeholder="Selecione uma coluna"
  triggerClassName="h-9 text-sm"
/>
```

- [ ] **Step 6: Filtragem fieldOptions quando rule.key === ""**

Pra evitar bug: quando rule.key === "", `fieldOptions` deve listar todas as opções não usadas por outros critérios (não o próprio).

```tsx
const usedByOthers = new Set(
  draft.filter((_, i) => i !== idx && c.key !== "").map((c) => c.key),
);
```

- [ ] **Step 7: Run all sorting-dialog tests, expect pass**

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(conversas): T3 v0.25 — sort dialog 'Adicionar critério' sem coluna pré-selecionada

Antes: addRule selecionava available[0] (primeiro slot livre) automaticamente.
Depois: cria { key: '', direction: 'asc' } e CustomSelect mostra
placeholder 'Selecione uma coluna'. Botão Aplicar desabilitado se algum
critério tem key vazio."
```

---

### Task 4: X destrutivo nos chips Filtros/Ordenação

**Files:**
- Modify: `src/components/reports/advanced-filters.tsx:461-470` (X do chip Filtros) e `499-508` (X do chip Ordenação).
- Test: `src/components/reports/__tests__/advanced-filters.test.tsx` (novo ou estende)

- [ ] **Step 1: Write failing test (visual smoke — checa classes-chave)**

```tsx
import { render, screen } from "@testing-library/react";
// ... setup com mock de presetsApi etc.
it("X dos chips Filtros e Ordenação tem classes destrutivas no hover", () => {
  // Render com appliedCount > 0 e sortCount > 0
  render(<AdvancedFilters {...propsWith16Filters4Sort} />);
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

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Aplicar nova classe nos 2 X buttons**

```tsx
className="absolute -right-1.5 -top-1.5 z-10 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-all hover:scale-110 hover:border-destructive hover:bg-destructive hover:text-white hover:ring-2 hover:ring-destructive/30 hover:ring-offset-1 hover:ring-offset-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-150"
```

E o `<X>` interno: `h-3 w-3`.

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(conversas): T4 v0.25 — X destrutivo nos chips Filtros/Ordenação

Antes: X h-4 w-4, ícone h-2.5 w-2.5, hover só mudava cor (sem fundo).
Depois: h-5 w-5 + ícone h-3 w-3; idle igual; hover ganha bg-destructive,
text-white, ring-2 destructive/30, ring-offset-1 ring-offset-card,
scale-110 — visual sólido e destacado conforme imagem 3 do feedback."
```

---

### Task 5: Cursor pointer global na seção Conversas

**Files:**
- Modify: `src/components/reports/period-pills.tsx` (period pills + custom)
- Modify: `src/components/ui/calendar.tsx` (dias + nav)
- Modify: `src/components/reports/conversas-pagination.tsx` (botões + dropdowns)
- Modify: `src/components/reports/conversas-table.tsx` (column headers ordenáveis)
- Modify: `src/components/reports/sorting-dialog.tsx` (botões internos)
- Modify: `src/components/reports/applied-filters-chips.tsx` (X dos chips)
- Test: `src/components/reports/__tests__/cursor-pointer.test.tsx` (smoke)

- [ ] **Step 1: Inventário (ls grep)**

```bash
grep -rn "<button" src/components/reports/ src/components/ui/calendar.tsx src/components/ui/popover.tsx | grep -v "cursor-"
```

- [ ] **Step 2: Sanity test smoke (1 representante por componente)**

```tsx
// Padrão: cada componente principal tem ≥1 button com cursor-pointer no className.
it.each([
  ["PeriodPills", PeriodPillsRender],
  ["ConversasPagination", PaginationRender],
  ["AppliedFiltersChips", ChipsRender],
])("%s tem cursor-pointer em buttons", (_, Render) => {
  Render();
  for (const btn of screen.getAllByRole("button")) {
    if (btn.disabled) {
      expect(btn.className).toMatch(/cursor-not-allowed|disabled:cursor-not-allowed/);
    } else {
      expect(btn.className).toMatch(/cursor-pointer/);
    }
  }
});
```

- [ ] **Step 3: Adicionar `cursor-pointer` em todos buttons da auditoria. `disabled:cursor-not-allowed` onde aplicável**

Aplicar pra cada arquivo via Edit pontual; não usar replace_all global pra evitar pegar coisa fora da seção.

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(conversas): T5 v0.25 — cursor-pointer global na seção Conversas

PeriodPills, Calendar (nav + dias), ConversasPagination, sorting-dialog,
applied-filters-chips, table headers ordenáveis. disabled:cursor-not-allowed
nos disabled. Padroniza affordance visual."
```

---

### Task 6: Paginação simplificada (sem reticências quando atual no meio)

**Files:**
- Modify: `src/components/reports/conversas-pagination.tsx:30-41` (`buildPageItems`)
- Modify: `src/components/reports/conversas-pagination.tsx` (remove `<EllipsisDropdown>` + `rangeToPages`)
- Test: `src/components/reports/__tests__/conversas-pagination.test.tsx` (estende)

- [ ] **Step 1: Update tests do algoritmo**

```ts
describe("buildPageItems v0.25", () => {
  it("totalPages 1: [1]", () => expect(buildPageItems(1, 1)).toEqual([1]));
  it("totalPages 4: [1,2,3,4]", () => expect(buildPageItems(2, 4)).toEqual([1, 2, 3, 4]));
  it("atual=1 com 8 págs: [1,8]", () => expect(buildPageItems(1, 8)).toEqual([1, 8]));
  it("atual=8 com 8 págs: [1,8]", () => expect(buildPageItems(8, 8)).toEqual([1, 8]));
  it("atual=5 com 8 págs: [1,5,8]", () => expect(buildPageItems(5, 8)).toEqual([1, 5, 8]));
  it("atual=2 com 5 págs: [1,2,5]", () => expect(buildPageItems(2, 5)).toEqual([1, 2, 5]));
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Substituir buildPageItems**

```ts
function buildPageItems(page: number, totalPages: number): number[] {
  if (totalPages <= 0) return [];
  if (totalPages === 1) return [1];
  if (totalPages === 2) return [1, 2];
  if (totalPages === 3) return [1, 2, 3];
  if (totalPages === 4) return [1, 2, 3, 4];
  if (page === 1 || page === totalPages) return [1, totalPages];
  return [1, page, totalPages];
}
```

- [ ] **Step 4: Deletar `<EllipsisDropdown>` + `rangeToPages` (não mais usado)**

- [ ] **Step 5: Atualizar render — sem ramo `it === "ellipsis"`**

```tsx
{items.map((it) => {
  const isCurrent = page === it;
  const isEdge = it === 1 || it === totalPages;
  if (isCurrent && !isEdge) {
    return <CurrentPageDropdown key={it} page={page} totalPages={totalPages} onPageChange={onPageChange} />;
  }
  return <button key={it} ...>{it}</button>;
})}
```

- [ ] **Step 6: Run pagination tests, expect pass**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(conversas): T6 v0.25 — paginação simplificada sem reticências

Antes: [1, '...', page, '...', N] com 2 EllipsisDropdowns + CurrentPageDropdown.
Depois: [1, page, N] direto. Atual continua sendo Popover dropdown
(chevron) que abre lista 1..N. Bordas (atual=1|N): [1, N]. Mais limpo."
```

---

### Task 7: matchSearchClient — algoritmo + tests TDD

**Files:**
- Create: `src/lib/reports/match-search-client.ts`
- Create: `src/lib/reports/__tests__/match-search-client.test.ts`

- [ ] **Step 1: Write failing tests (vários cenários)**

```ts
import { describe, it, expect } from "@jest/globals";
import { matchSearchClient } from "@/lib/reports/match-search-client";
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
  status: 0, // Aberta
  priority: 1, // Media
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

describe("matchSearchClient", () => {
  it("vazio retorna todas as rows", () => {
    expect(matchSearchClient([baseRow], "")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "   ")).toHaveLength(1);
    expect(matchSearchClient([baseRow], undefined)).toHaveLength(1);
  });

  it("match em display_id sem #", () => {
    expect(matchSearchClient([baseRow], "12345")).toHaveLength(1);
  });
  it("match em display_id com #", () => {
    expect(matchSearchClient([baseRow], "#12345")).toHaveLength(1);
  });
  it("match em nome com acento", () => {
    expect(matchSearchClient([baseRow], "joao")).toHaveLength(1); // sem acento
    expect(matchSearchClient([baseRow], "João")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "SILVA")).toHaveLength(1); // case
  });
  it("match em telefone com e sem máscara", () => {
    expect(matchSearchClient([baseRow], "5511987654321")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "+55 11 98765-4321")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "987654321")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "98765-4321")).toHaveLength(1);
  });
  it("match em CPF com e sem máscara", () => {
    expect(matchSearchClient([baseRow], "07041511111")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "070.415.111-11")).toHaveLength(1);
  });
  it("match em inbox/team/assignee", () => {
    expect(matchSearchClient([baseRow], "amapa")).toHaveLength(1); // sem acento
    expect(matchSearchClient([baseRow], "comercial")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "allyda")).toHaveLength(1);
  });
  it("match em status pt-BR", () => {
    expect(matchSearchClient([baseRow], "Aberta")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "aberta")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "Resolvida")).toHaveLength(0); // status=0 não é "Resolvida"
  });
  it("match em prioridade pt-BR", () => {
    expect(matchSearchClient([baseRow], "Media")).toHaveLength(1); // priority=1
  });
  it("match em label", () => {
    expect(matchSearchClient([baseRow], "vip")).toHaveLength(1);
  });
  it("match em custom_attributes value e key", () => {
    expect(matchSearchClient([baseRow], "Gold")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "plano")).toHaveLength(1);
  });
  it("ignora keys que começam com _ (técnicas)", () => {
    const r = { ...baseRow, custom_attributes: { _internal_id: "abc123" } };
    expect(matchSearchClient([r], "abc123")).toHaveLength(0);
  });
  it("não match: palavra fora", () => {
    expect(matchSearchClient([baseRow], "xyz-naoexiste")).toHaveLength(0);
  });
  it("performance: 50k rows < 500ms", () => {
    const big = Array.from({ length: 50_000 }, (_, i) => ({
      ...baseRow,
      id: i,
      display_id: i,
    }));
    const t0 = performance.now();
    matchSearchClient(big, "12345");
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(500);
  });
});
```

- [ ] **Step 2: Run, expect fail (module not found)**

- [ ] **Step 3: Implementar `match-search-client.ts`**

```ts
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
} from "@/lib/chatwoot/conversas-translations";
import { formatPhone } from "@/lib/utils/format-phone";
import { detectDocument } from "@/lib/utils/format-document";

/** Normaliza para match: lowercase + remove acentos. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Variações de phone (com e sem caracteres não-dígitos). */
function phoneVariants(phone: string | null): string[] {
  if (!phone) return [];
  const formatted = formatPhone(phone) ?? "";
  return [phone, formatted, phone.replace(/\D/g, "")];
}

/** Variações de document (raw + formatted CPF/CNPJ). */
function documentVariants(contact: ConversaRow["contact"]): string[] {
  const raw = contact.identifier ?? "";
  const detected = detectDocument({
    identifier: contact.identifier,
    additional_attributes: contact.additional_attributes,
  });
  return [raw, detected?.formatted ?? "", detected?.raw ?? ""].filter(Boolean);
}

/** Stringify custom_attributes ignorando keys técnicas (_*). */
function customAttrsToText(ca: Record<string, unknown> | null): string {
  if (!ca) return "";
  const entries = Object.entries(ca).filter(([k]) => !k.startsWith("_"));
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" | ");
}

/** Constrói o haystack (string única concatenada e normalizada) por row. */
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

/**
 * Filtra rows por busca client-side global.
 * - Vazio → retorna o array original (referência preservada).
 * - Match: substring case-insensitive, ignora acentos.
 * - Match OR sobre todos os campos (ver buildHaystack).
 */
export function matchSearchClient(
  rows: ConversaRow[],
  search: string | null | undefined,
): ConversaRow[] {
  const trimmed = search?.trim();
  if (!trimmed) return rows;
  const needle = normalize(trimmed);
  return rows.filter((row) => buildHaystack(row).includes(needle));
}
```

- [ ] **Step 4: Run all tests, expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/match-search-client.ts src/lib/reports/__tests__/match-search-client.test.ts
git commit -m "feat(conversas): T7 v0.25 — matchSearchClient + sanity tests

Algoritmo OR sobre 11 campos (display_id com/sem #, name, phone com/sem
máscara, identifier CPF/CNPJ com/sem máscara, inbox/team/assignee,
status pt-BR, prioridade pt-BR, labels[], custom_attributes ignorando _).
Normaliza acentos via NFD. Performance: 50k rows < 500ms (medido)."
```

---

### Task 8: page.tsx — pageSize 50_000 + remove search dos reportFilters + banner cap

**Files:**
- Modify: `src/app/(protected)/relatorios/conversas/page.tsx`
- Test: `src/app/(protected)/relatorios/conversas/__tests__/page.test.tsx` (existir? Ver — se não, smoke novo.)

- [ ] **Step 1: Sanity test (server component, smoke via mock)**

(Se não houver test de page.tsx, pular — é Server Component; a cobertura virá em T10/T12 via integration.)

- [ ] **Step 2: Modificar page.tsx**

Em `page.tsx:58-72`, remover `search`:
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
  // search removido: agora é client-side em ConversasPageClient.
};
```

Em `page.tsx:87-93`, alterar `pageSize`:
```tsx
fetchConversas({
  filters: reportFilters,
  accountId,
  page: 1,
  pageSize: 50_000,
}),
```

Em `page.tsx:107-110` recalcular:
```tsx
const conversasTotal = conversasResult.total ?? 0;
const conversasRows = conversasResult.rows;
const conversasOverCap = conversasTotal > 50_000;
```

Em `page.tsx:131-133`, banner cap (acima do StaleBanner):
```tsx
{conversasOverCap ? (
  <div role="status" aria-live="polite" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
    Período retornou {conversasTotal.toLocaleString("pt-BR")} conversas (acima do cap de 50.000).
    Refine o período ou os filtros para ativar a busca global na seleção exibida.
  </div>
) : null}
```

E ajustar props passadas pro `ConversasPageClient` — `total = conversasRows.length` (clientside paginação derivada disso).

- [ ] **Step 3: Verify integração com `fetchConversas` aceita 50_000**

`MAX_LIMIT = 10000` em `conversas-list.ts:90` — vou precisar elevar pra 50_000 OU não usar cursor MAX_LIMIT. Verificar `conversasList()` honra `pageSize`.

- [ ] **Step 4: Bump MAX_LIMIT em conversas-list.ts:90 → 50_000**

```ts
const MAX_LIMIT = 50_000;
```

- [ ] **Step 5: Smoke test do banner via E2E ou unit do helper**

Vou criar um helper de "calcOverCap" se ficar mais testável: `total > 50_000`. Trivial.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(conversas): T8 v0.25 — page.tsx pageSize 50k + remove search dos reportFilters

- pageSize 1000 → 50_000 (cap defensivo).
- search removido de reportFilters (não vai mais pra SQL).
- Banner amarelo quando total > 50.000 ('Refine o período...').
- MAX_LIMIT em conversas-list.ts elevado de 10.000 → 50.000.
- Cache key estável durante busca (era invalidada a cada keystroke)."
```

---

### Task 9: conversas-list.ts — remove search clause + deprecate helper

**Files:**
- Modify: `src/lib/chatwoot/queries/conversas-list.ts:194-200, 334, 348` (remove `searchClause`)
- Modify: `src/lib/chatwoot/conversas-search.ts` (deprecate JSDoc)
- Modify: `src/lib/chatwoot/__tests__/conversas-search.test.ts` (mantém + skip se necessário)

- [ ] **Step 1: Remover chamadas a `buildConversasSearchClause` e parametrização correlata**

```ts
// conversas-list.ts:193 — remover bloco searchClause inteiro:
//   const searchClause = buildConversasSearchClause(args.filters.search, p);
//   if (searchClause.sql) { p += searchClause.params.length; params.push(...searchClause.params); }
// E remover ` AND ${searchClause.sql}` em ambos os WHEREs.
```

- [ ] **Step 2: Remover import de `buildConversasSearchClause`**

```ts
// conversas-list.ts:22 — deletar a linha
```

- [ ] **Step 3: Adicionar JSDoc @deprecated em `conversas-search.ts`**

```ts
/**
 * @deprecated v0.25.0 — busca migrou para client-side em
 * `src/lib/reports/match-search-client.ts`. Helper preservado para
 * compatibilidade dos tests existentes; não usar em novo código.
 */
export function buildConversasSearchClause(...)
```

- [ ] **Step 4: Run conversas-list tests (não devem regredir)**

```bash
npx jest src/lib/chatwoot/queries/__tests__/conversas-list.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(conversas): T9 v0.25 — conversas-list.ts remove search SQL clause

buildConversasSearchClause não é mais chamado (busca virou client-side).
Helper marcado @deprecated em conversas-search.ts; tests existentes
preservados. Sem mudança na cláusula WHERE base."
```

---

### Task 10: ConversasPageClient — state local searchClient + paginação client-side

**Files:**
- Modify: `src/components/reports/conversas-page-client.tsx`
- Test: integration via T11/T12.

- [ ] **Step 1: Adicionar state + handler**

```tsx
const [searchClient, setSearchClient] = useState<string>("");
const [pageClient, setPageClient] = useState<number>(1);
const PAGE_SIZE_CLIENT = 100;

// Reset page=1 quando search/filters/sort mudam.
useEffect(() => {
  setPageClient(1);
}, [searchClient, filterState, sortStack]);
```

- [ ] **Step 2: Pipeline derivado**

Computa derivado `filteredCount` para passar pro toolbar. (A filtragem acontece dentro de `<ConversasTable>` — aqui só passamos `searchClient` e `pageClient`/`onPageClientChange`.)

- [ ] **Step 3: Passar props pra `<AdvancedFilters>` e `<ConversasTable>`**

```tsx
<AdvancedFilters
  ...
  searchClient={searchClient}
  onSearchClientChange={setSearchClient}
  // tableRowCount agora é o total filtrado (computado abaixo)
/>
<ConversasTable
  ...
  searchClient={searchClient}
  pageClient={pageClient}
  pageSizeClient={PAGE_SIZE_CLIENT}
  onPageClientChange={setPageClient}
  onFilteredCountChange={setFilteredCount} // pro toolbar
/>
```

- [ ] **Step 4: Remover handlePageChange server-side (era router.push)**

`handlePageChange` é deletado — paginação agora é puramente client. URL não recebe mais `?page=N`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(conversas): T10 v0.25 — ConversasPageClient state searchClient + paginação client

- searchClient: state local, não vai pra URL (efêmero).
- pageClient: state local, paginação UI sobre rows hidratadas.
- Reset page=1 quando filtros/search/sort mudam.
- handlePageChange server-side deletado (não há mais navegação por URL pra page)."
```

---

### Task 11: AdvancedFilters — input controlado por searchClient + Esc + ExportButton com filtradas

**Files:**
- Modify: `src/components/reports/advanced-filters.tsx`
- Test: `src/components/reports/__tests__/advanced-filters-search.test.tsx` (novo)

- [ ] **Step 1: Tests novos**

```tsx
it("Enter chama onSearchClientChange com valor digitado", () => {
  const onSearchClientChange = jest.fn();
  render(<AdvancedFilters {...baseProps} searchClient="" onSearchClientChange={onSearchClientChange} />);
  const input = screen.getByLabelText(/Buscar conversas/i);
  fireEvent.change(input, { target: { value: "070" } });
  fireEvent.keyDown(input, { key: "Enter" });
  // Aqui Enter SÓ aplica — onSearchClientChange já foi chamado no onChange.
  expect(onSearchClientChange).toHaveBeenCalledWith("070");
});

it("Esc limpa searchClient", () => {
  const onSearchClientChange = jest.fn();
  render(<AdvancedFilters {...baseProps} searchClient="070" onSearchClientChange={onSearchClientChange} />);
  const input = screen.getByLabelText(/Buscar conversas/i);
  fireEvent.keyDown(input, { key: "Escape" });
  expect(onSearchClientChange).toHaveBeenCalledWith("");
});

it("search não conta no pendingDiff (banner amarelo não aparece por search)", () => {
  // Implícito — handlers não setam draft.search.
});
```

- [ ] **Step 2: Implementar — substituir `updateSearch`/Enter atual**

```tsx
interface AdvancedFiltersProps {
  ...
  searchClient: string;
  onSearchClientChange: (next: string) => void;
}

// no JSX:
<Input
  type="search"
  value={searchClient}
  onChange={(e) => onSearchClientChange(e.currentTarget.value)}
  onKeyDown={(e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onSearchClientChange("");
    }
    // Enter não precisa fazer nada — onChange já atualiza estado.
  }}
  placeholder="Buscar..."
  aria-label="Buscar conversas"
  className="h-10 pl-9 pr-[112px]"
/>
```

- [ ] **Step 3: Remover `draft.search`/`applied.search` da lógica (continuam no FilterState mas ignorados aqui)**

`pendingDiff` já exclui search via `withoutSearch` — manter como está.

- [ ] **Step 4: ExportButton recebe rows filtradas**

Mais natural: `<ExportButton>` recebe `filtered.length` em vez de `total`. T10 já cabeou via `onFilteredCountChange`. Aqui só usar:

```tsx
<ExportButton
  filters={appliedReportFilters}
  accountId={accountId ?? 9}
  rowCount={tableRowCount} // já filtrado client-side
/>
```

`appliedReportFilters` continua server-side (export usa SQL próprio). Decisão: **export ignora searchClient** (export = filtros server, não busca client). Justificativa: export gera XLSX com dados completos do período, e busca client-side é efêmera/UI. Documentar no commit.

- [ ] **Step 5: Run tests, expect pass**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(conversas): T11 v0.25 — input search controlado client + Esc clear

- value/onChange ligados a searchClient/onSearchClientChange via prop.
- Esc limpa busca; Enter no-op (onChange já aplica).
- Não toca em draft.search/applied.search (FilterState mantém compat).
- ExportButton continua exportando filtros server-side (busca client é
  efêmera/visual — export = dados completos do período aplicados)."
```

---

### Task 12: ConversasTable — pipeline match → conditions → sort → slice

**Files:**
- Modify: `src/components/reports/conversas-table.tsx`
- Test: `src/components/reports/__tests__/conversas-table.test.tsx` (estende)

- [ ] **Step 1: Tests novos**

```tsx
it("filtra rows por searchClient e mostra contador correto", () => {
  const rows = [
    { ...baseRow, contact: { ...baseRow.contact, name: "Ana" } },
    { ...baseRow, id: 2, display_id: 22, contact: { ...baseRow.contact, name: "Beto" } },
    { ...baseRow, id: 3, display_id: 33, contact: { ...baseRow.contact, name: "Carlos" } },
  ];
  render(<ConversasTable {...baseProps} initialRows={rows} searchClient="ana" />);
  expect(screen.getByText(/Mostrando 1-1 de 1 conversa/)).toBeInTheDocument();
  expect(screen.getByText(/Ana/)).toBeInTheDocument();
  expect(screen.queryByText(/Beto/)).toBeNull();
});

it("paginação client-side: 250 rows com pageSize=100 → 3 páginas", () => {
  const rows = Array.from({ length: 250 }, (_, i) => ({ ...baseRow, id: i, display_id: i }));
  render(<ConversasTable {...baseProps} initialRows={rows} pageClient={2} />);
  expect(screen.getByText(/Mostrando 101-200 de 250 conversa/)).toBeInTheDocument();
});

it("highlight roxo aparece nas células das colunas matched", () => {
  render(<ConversasTable {...baseProps} initialRows={[baseRow]} searchClient="João" />);
  const marks = screen.getAllByText("João");
  expect(marks.some((m) => m.tagName === "MARK")).toBe(true);
});
```

- [ ] **Step 2: Atualizar interface props**

```tsx
interface ConversasTableProps {
  initialRows: ConversaRow[];
  // remove: total, page, totalPages, onPageChange (eram server-side)
  pageClient: number;
  pageSizeClient: number;
  onPageClientChange: (page: number) => void;
  onFilteredCountChange?: (count: number) => void;
  ...
  searchClient: string; // substitui searchTerm prop antiga (ou renomear)
  ...
}
```

- [ ] **Step 3: Pipeline interno**

```tsx
import { matchSearchClient } from "@/lib/reports/match-search-client";

const searchedRows = useMemo(
  () => matchSearchClient(rows, searchClient),
  [rows, searchClient],
);

const filteredRows = useMemo(() => {
  if (!conditionGroup?.conditions?.length) return searchedRows;
  return applyConditions(searchedRows, conditionGroup);
}, [searchedRows, conditionGroup]);

const sortedRows = useMemo(() => {
  // (mesmo de hoje, mas sobre filteredRows — já está sobre filteredRows)
  ...
}, [filteredRows, sortStack]);

const totalFiltered = sortedRows.length;
const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSizeClient));
const safePage = Math.min(Math.max(1, pageClient), totalPages);
const pagedRows = useMemo(
  () => sortedRows.slice((safePage - 1) * pageSizeClient, safePage * pageSizeClient),
  [sortedRows, safePage, pageSizeClient],
);

// Notifica parent
useEffect(() => {
  onFilteredCountChange?.(totalFiltered);
}, [totalFiltered, onFilteredCountChange]);
```

- [ ] **Step 4: Toolbar — counter usa totalFiltered**

```tsx
const showingFrom = totalFiltered === 0 ? 0 : (safePage - 1) * pageSizeClient + 1;
const showingTo = Math.min(safePage * pageSizeClient, totalFiltered);
// ...
<ConversasPagination
  page={safePage}
  totalPages={totalPages}
  onPageChange={onPageClientChange}
  className="..."
/>
```

- [ ] **Step 5: Virtualizer usa pagedRows**

```tsx
const rowVirtualizer = useVirtualizer({
  count: pagedRows.length,
  ...
});
```

- [ ] **Step 6: searchTerm pra HighlightedText = searchClient**

(Renomear searchTerm → searchClient na interface E nos consumers de HighlightedText, ou manter alias).

- [ ] **Step 7: Run tests, expect pass**

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(conversas): T12 v0.25 — ConversasTable pipeline client + paginação UI

- Pipeline: match (searchClient) → conditionGroup → sort → slice por página.
- Counter 'Mostrando X-Y de Z' reflete filteredRows.length.
- Paginação UI sobre dados hidratados; ConversasPagination consome
  pageClient/totalPages calculados localmente.
- HighlightedText recebe searchClient — destaque imediato em todas as
  colunas (visíveis e drill-down)."
```

---

### Task 13: bump v0.25.0 + CHANGELOG + STATUS

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Bump version**

`"version": "0.25.0"` em `package.json`.

- [ ] **Step 2: Entry CHANGELOG.md**

Padrão usual do projeto.

- [ ] **Step 3: STATUS.md**

Adicionar v0.25.0 no topo.

- [ ] **Step 4: Commit (ainda sem push)**

```bash
git commit -m "chore(release): v0.25.0 — Conversas Polish + busca client-side global"
```

- [ ] **Step 5: typecheck + jest full**

```bash
npm run typecheck && npm test
```

- [ ] **Step 6: Push (deploy automático)**

Aguarda confirmação do João pra push.

---

## §4. Edge Cases

- **Cap 50.000:** banner não bloqueia o uso — paginação/sort/visualização funcionam normalmente sobre os 50k carregados; só avisa que busca não cobre os outros.
- **Stale Chatwoot:** banner stale + busca client-side funciona normalmente em cache.
- **Sort key="":** Apply desabilitado; visualmente o critério aparece com placeholder.
- **Phone com `+55 11 98765-4321`:** match em `5511987654321`, `987654321`, `98765-4321`.
- **CPF/CNPJ formatado:** match em `070.415.111-11` E `07041511111`.
- **Acentos:** "joao" matches "João".
- **Custom attributes JSON:** match em chave (`plano`) E valor (`Gold`); ignora keys com prefixo `_`.
- **Empty state:** quando search não retorna nada, "Nenhuma conversa encontrada — Ajuste os filtros ou a busca."
- **searchClient persiste entre paginações:** sim (state local mantém).
- **searchClient zera quando muda período/filtros:** NÃO — se zerasse, perderia o caso "filtrei depto X e busquei doc Y". Decisão: search persiste; só reseta page=1 ao mudar.
- **Dark + light mode:** X destrutivo testado nos 2; ring-offset-card adapta.

---

## §5. Riscos e Rollback

- **Risco performance 50k:** medido em T7 (< 500ms). Mitigação: degrada para 25k via env var se preciso (não fazemos preventivamente).
- **Risco memória browser:** ~3-5MB JSON por 50k rows × 14 cols. Aceitável.
- **Risco regressão export:** export usa server-side com filtros aplicados (sem search) — comportamento mantido. Documentar no PR.
- **Risco URL `?q=foo` favorita:** breaking aceitável (search sempre foi efêmera).
- **Rollback:** revert do commit de release. Cache key não muda → SQL ILIKE volta ao funcionamento.

---

## §6. Self-Review Checklist (antes de mover pra v2)

- [ ] Cada task tem files/test/steps/code blocks/commit?
- [ ] SORT_OPTIONS exportada em T1 — alguma task depende dessa export além do test? Não.
- [ ] T7 algoritmo cobre todos os campos listados em §1.1? Sim.
- [ ] Cap 50_000 alinhado entre page.tsx (T8) e MAX_LIMIT (T8)? Sim.
- [ ] T10/T11/T12 dependências cabeadas? Sim — searchClient flui T10 → T11 input + T12 pipeline.
- [ ] Tests TDD em todas as tasks de código?
- [ ] DRY: helpers compartilhados (matchSearchClient, normalize) em lugar único.
