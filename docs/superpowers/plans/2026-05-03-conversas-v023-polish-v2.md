# Plan v2: Conversas v0.23 Polish

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps em checkbox `- [ ]`. UI tasks invocam `ui-ux-pro-max:ui-ux-pro-max` ANTES de codar. Tasks com lógica testável invocam `superpowers:test-driven-development`.
>
> **Status**: v2 (pente-fino #1 com 20 achados; pente-fino #2 a seguir).

**Goal:** Aplicar 19 ajustes em `/relatorios/conversas` da v0.22.0 → v0.23.0 (3 bugs críticos: busca não filtra, single-day retorna 0, sorting duplica coluna; UI polish: badge ↵ Enter inline, paginação no topo, novo algoritmo, X adesivo nos chips, FiltersDialog sections fechadas, calendar defaultMonth=today, highlight busca em violet).

**Tech Stack:** Next.js 16.2.2, React 19.2, TypeScript strict, Tailwind v4, base-ui (Popover), react-day-picker v9, Jest + RTL.

---

## Pré-flight (controlador antes de despachar T1)

```bash
ls docs/agents/active/        # esperado: SÓ claude-conversas-v023.md
git fetch origin main
git status                    # esperado limpo
git log --oneline -5
cat package.json | python3 -c "import json,sys;print(json.load(sys.stdin)['version'])"  # esperado 0.22.0
```

## Convenções (cada subagent recebe)

- Stage APENAS arquivos seus em commits (NUNCA `git add -A`).
- Não tocar em arquivos de outros agentes (verificar via `ls docs/agents/active/` antes de editar).
- TypeScript strict; aliases `@/`; comentários pt-BR; commits em pt-BR.

## Modelo por task

- T1, T6, T7, T11, T12, T13: haiku (mecânicas)
- T2, T3, T4, T5, T8, T9, T10: sonnet (raciocínio + UI)

---

## File Structure

### NEW
| Path | Responsabilidade |
|---|---|
| `src/lib/utils/highlight-text.tsx` | helper `<HighlightedText>` para busca em violet |
| `src/lib/__tests__/datetime-single-day.test.ts` | TDD do bug single-day |
| `src/lib/utils/__tests__/highlight-text.test.tsx` | tests highlight |

### MODIFY
| Path | Resumo |
|---|---|
| `src/app/(protected)/relatorios/conversas/page.tsx` | + search no reportFilters |
| `src/lib/datetime-core.ts` | (CONDITIONAL) fix custom range single-day |
| `src/components/reports/sorting-dialog.tsx` | anti-duplicação |
| `src/components/reports/advanced-filters.tsx` | badge ↵ Enter + X adesivo + remove hint span |
| `src/components/reports/conversas-table.tsx` | toolbar com paginação no topo + Mostrando X-Y + remove dup Ordenação 3 + integrar highlight |
| `src/components/reports/conversas-pagination.tsx` | rewrite algoritmo + Popover reticência + Popover atual |
| `src/components/reports/conversa-drill-down.tsx` | integrar highlight |
| `src/components/reports/filters-dialog.tsx` | sections fechadas + handleClearOnlyFilters + header dinâmico |
| `src/components/reports/applied-filters-chips.tsx` | remove botões "Limpar filtros" + "Limpar ordenação" |
| `src/components/reports/period-pills.tsx` | defaultMonth=today |
| `src/components/ui/calendar.tsx` | fontes -1 + h-8 w-8 |
| `src/lib/tours/conversas-tour.ts` | bump v4 + step pagination-top |
| `package.json` | 0.22.0 → 0.23.0 |
| `CHANGELOG.md` + `docs/STATUS.md` | release notes |

---

## Task 1: BUG search no reportFilters

**Model**: haiku.
**Files:** `src/app/(protected)/relatorios/conversas/page.tsx`

- [ ] **Step 1: Read** o arquivo full.

- [ ] **Step 2: Edit** linha 58-71. Adicionar antes de `excludeMatrixIA`:
```ts
search: filterState.search,
```

- [ ] **Step 3: Typecheck** + `npm test -- conversas` — PASS.

- [ ] **Step 4: Commit**:
```bash
git add "src/app/(protected)/relatorios/conversas/page.tsx"
git commit -m "fix(reports): T1 — page.tsx passa search no reportFilters (busca volta a funcionar)"
```

---

## Task 2: BUG single-day filter (TDD primeiro)

**Model**: sonnet.
**Files:** `src/lib/__tests__/datetime-single-day.test.ts` (NEW), `src/lib/datetime-core.ts` (CONDITIONAL).

> Antes: invocar `superpowers:test-driven-development`.

- [ ] **Step 1: Tests** (criar arquivo):
```ts
import { getPeriodInTz } from "@/lib/datetime-core";

describe("getPeriodInTz custom — single day SP", () => {
  it("21/03/2025 → 21/03/2025 retorna range com 24h em SP", () => {
    const r = getPeriodInTz("custom", { start: "2025-03-21", end: "2025-03-21" }, "America/Sao_Paulo");
    expect(r.start.toISOString()).toBe("2025-03-21T03:00:00.000Z");
    expect(r.end.toISOString()).toMatch(/^2025-03-22T(02:59:59\.999|03:00:00\.000)Z$/);
  });
  it("21/03/2025 → 22/03/2025 retorna range 48h em SP", () => {
    const r = getPeriodInTz("custom", { start: "2025-03-21", end: "2025-03-22" }, "America/Sao_Paulo");
    expect(r.start.toISOString()).toBe("2025-03-21T03:00:00.000Z");
    expect(r.end.toISOString()).toMatch(/^2025-03-23T(02:59:59\.999|03:00:00\.000)Z$/);
  });
});
```

- [ ] **Step 2: Run** `npm test -- datetime-single-day`. Esperado FAIL (se bug confirmado) OR PASS (se bug é em outro lugar).

- [ ] **Step 3: Diagnóstico**:

**Se PASS** → bug não é em datetime-core. Investigar `buildBaseFilter` em `src/lib/chatwoot/filters.ts`: cláusula `c.created_at < $end`. Talvez `created_at` no banco está em outro TZ.
- Adicionar console.log no SQL gerado e capturar via produção (subagente reporta como concern, controlador investiga).

**Se FAIL** → fix em `datetime-core.ts case "custom"`:
```ts
case "custom": {
  if (!customRange) {
    throw new Error('getPeriodInTz: customRange é obrigatório para key="custom"');
  }
  // FIX v0.23: parse string como data local SP, não UTC midnight.
  const startInTz = parseISO(`${customRange.start}T00:00:00`);
  const endInTz = parseISO(`${customRange.end}T00:00:00`);
  const startLocal = startOfDay(startInTz);
  const endLocal = endOfDay(endInTz);
  return {
    start: fromZonedTime(startLocal, tz),
    end: fromZonedTime(endLocal, tz),
  };
}
```
(Imports: adicionar `import { parseISO } from "date-fns";`.)

Re-run test → PASS.

- [ ] **Step 4: Commit**:
```bash
git add src/lib/__tests__/datetime-single-day.test.ts src/lib/datetime-core.ts
git commit -m "fix(datetime): T2 — single-day custom range respeita TZ corretamente"
```

(Se bug não está em datetime-core, commit só dos tests + reportar concern pra investigar SQL.)

---

## Task 3: Sorting anti-duplicação

**Model**: sonnet.
**Files:** `src/components/reports/sorting-dialog.tsx`, test associated.

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` (interaction pattern em select).

- [ ] **Step 1: Read** sorting-dialog.tsx + test existente.

- [ ] **Step 2: Tests** (adicionar describe):
```tsx
it("opções já usadas em critérios anteriores são excluídas dos subsequentes", () => {
  const initial = [
    { key: "departamento", direction: "asc" as const },
    { key: "estado", direction: "desc" as const },
  ];
  render(<SortingDialog open={true} onOpenChange={() => {}} applied={initial} options={ALL_OPTIONS} onApply={() => {}} onClear={() => {}} />);
  // O <select> do critério 2 NÃO deve ter "departamento"
  const selectsCriterio2 = screen.getAllByRole("combobox")[1];
  expect(within(selectsCriterio2).queryByText(/departamento/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run** failing → FAIL.

- [ ] **Step 4: Implement**: helper `getAvailableOptions(allOptions, currentCriteria, currentIdx)` excluindo keys usadas em outros índices.

- [ ] **Step 5-7**: Run pass, typecheck, commit.

```bash
git add src/components/reports/sorting-dialog.tsx src/components/reports/__tests__/sorting-dialog.test.tsx
git commit -m "fix(reports): T3 — SortingDialog anti-duplicação de colunas"
```

---

## Task 4: Layout badge ↵ Enter inline (substitui hint span quebrando layout)

**Model**: sonnet.
**Files:** `src/components/reports/advanced-filters.tsx`.

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` com query "command-k badge inline keyboard hint accessible kbd contrast violet".

- [ ] **Step 1: Read** o arquivo, localizar o `<div data-tour="search">` e o hint atual `{searchPending ? <span className="block">...</span> : null}`.

- [ ] **Step 2: Edit** — substituir TODO o `<div data-tour="search">` por:

```tsx
<div data-tour="search" className="relative w-full max-w-[320px] min-w-[200px] sm:flex-none">
  <Search
    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
    aria-hidden="true"
  />
  <Input
    type="search"
    value={draft.search ?? ""}
    onChange={(e) => updateSearch(e.currentTarget.value)}
    onKeyDown={(e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleApply();
      }
    }}
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

(REMOVE o `{searchPending ? <span...>` block — não é mais necessário.)

- [ ] **Step 3: Cleanup** — remove variáveis não usadas (`searchPending`?). Se outras refs usam, manter; senão remover.

- [ ] **Step 4-6**: typecheck, tests existentes, commit.

```bash
git add src/components/reports/advanced-filters.tsx
git commit -m "feat(reports): T4 — badge ↵ Enter inline (substitui hint span; layout não quebra)"
```

---

## Task 5: HighlightedText helper + integração

**Model**: sonnet.
**Files:**
- Create: `src/lib/utils/highlight-text.tsx`
- Create: `src/lib/utils/__tests__/highlight-text.test.tsx`
- Modify: `src/components/reports/conversas-table.tsx` (passar searchTerm + usar `<HighlightedText>` nas cells)
- Modify: `src/components/reports/conversa-drill-down.tsx` (usar nas seções WhatsApp/Etiquetas/Atributos)

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` query "search term highlight contrast violet readability mark element".

- [ ] **Step 1: Tests highlight-text** (criar `__tests__/highlight-text.test.tsx`):

```tsx
import { render, screen } from "@testing-library/react";
import { HighlightedText } from "@/lib/utils/highlight-text";

describe("HighlightedText", () => {
  it("sem term: retorna texto original sem mark", () => {
    const { container } = render(<HighlightedText text="hello world" />);
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("hello world");
  });
  it("term vazio: idem", () => {
    const { container } = render(<HighlightedText text="hello world" term="" />);
    expect(container.querySelector("mark")).toBeNull();
  });
  it("term match único: envolve match em <mark>", () => {
    const { container } = render(<HighlightedText text="hello world" term="world" />);
    const marks = container.querySelectorAll("mark");
    expect(marks.length).toBe(1);
    expect(marks[0]?.textContent).toBe("world");
  });
  it("case-insensitive", () => {
    const { container } = render(<HighlightedText text="HELLO World" term="hello" />);
    expect(container.querySelector("mark")?.textContent).toBe("HELLO");
  });
  it("multiple matches", () => {
    const { container } = render(<HighlightedText text="abc abc abc" term="abc" />);
    expect(container.querySelectorAll("mark").length).toBe(3);
  });
  it("substring match (não-prefix)", () => {
    const { container } = render(<HighlightedText text="#1701" term="170" />);
    expect(container.querySelector("mark")?.textContent).toBe("170");
  });
  it("term maior que texto: sem match", () => {
    const { container } = render(<HighlightedText text="abc" term="abcdef" />);
    expect(container.querySelector("mark")).toBeNull();
  });
});
```

- [ ] **Step 2: Implement** `src/lib/utils/highlight-text.tsx`:

```tsx
import type { ReactNode } from "react";

interface Props {
  text: string | null | undefined;
  term?: string;
}

/**
 * Envolve cada ocorrência (case-insensitive) de `term` em `text` com <mark>
 * estilizado em violet. Sem term ou texto vazio: retorna o texto original.
 *
 * Match: substring contains (não prefix). Sem regex (seguro contra chars
 * especiais). O(n) por chamada.
 */
export function HighlightedText({ text, term }: Props) {
  if (!text) return null;
  const trimmed = term?.trim();
  if (!trimmed) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerTerm = trimmed.toLowerCase();
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let counter = 0;
  let idx = lowerText.indexOf(lowerTerm);
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
    idx = lowerText.indexOf(lowerTerm, lastIdx);
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

export default HighlightedText;
```

- [ ] **Step 3: Run tests** — PASS.

- [ ] **Step 4: Commit helper**:
```bash
git add src/lib/utils/highlight-text.tsx src/lib/utils/__tests__/highlight-text.test.tsx
git commit -m "feat(utils): T5a — HighlightedText helper (busca em violet)"
```

- [ ] **Step 5: Integrar em conversas-table.tsx**:

A `<ConversasTable>` precisa receber `searchTerm: string | undefined` (do parent: `applied.search` ou `filters.search`). Cada `ColumnDef.render` que renderiza texto usa `<HighlightedText text={...} term={searchTerm} />`.

Atualizar interface:
```ts
interface ConversasTableProps {
  // ... existentes
  searchTerm?: string;
}
```

Plumb prop em ConversasPageClient:
```tsx
<ConversasTable searchTerm={reportFilters.search} ... />
```

Editar cada ColumnDef.render que retorna span com texto pra envolver com `<HighlightedText>`:

```tsx
// ANTES:
render: (row) => <span ...>{row.contact.name ?? "—"}</span>,

// DEPOIS — função render aceita searchTerm via closure:
// (preserva structure, mas componente precisa de acesso ao term — refatorar pra função)
```

> Atenção subagente: o ColumnDef.render é chamado sem prop searchTerm. Refatorar pra renderizar via componente que recebe row+searchTerm:
> ```tsx
> // dentro de <ConversasTable>:
> {orderedColumns.map((col) => (
>   <TableCell key={col.key}>
>     {col.key === "name" ? (
>       <HighlightedText text={row.contact.name ?? "—"} term={searchTerm} />
>     ) : col.key === "inbox" ? (
>       <HighlightedText text={row.inbox.name ?? "—"} term={searchTerm} />
>     ) : ...}
>   </TableCell>
> ))}
> ```
> OR: alterar `ColumnDef.render` pra `(row, opts: { searchTerm?: string }) => ReactNode` e passar opts.

Decisão: usar opts para preservar o pattern existente. Cada render que faz sentido usa HighlightedText.

Colunas a integrar: name, document, inbox (estado), team (departamento), assignee (atendente). #ID (display_id) precisa também — converte número pra string e aplica highlight.

- [ ] **Step 6: Integrar em conversa-drill-down.tsx**:

Atualizar interface:
```ts
interface Props {
  row: ConversaRow;
  accountId?: number;
  searchTerm?: string;
}
```

Wrap `phone`, `LabelsChips` (cada label.name), e cada chave/valor de atributo com `<HighlightedText>`.

Plumb pelo parent (ConversasTable) que já recebe searchTerm.

- [ ] **Step 7-9**: typecheck, run tests da área, commit.

```bash
git add src/components/reports/conversas-table.tsx src/components/reports/conversa-drill-down.tsx [tests]
git commit -m "feat(reports): T5b — integra HighlightedText em conversas-table + drill-down"
```

---

## Task 6: Calendar (defaultMonth=today + fontes -1)

**Model**: haiku.
**Files:** `src/components/reports/period-pills.tsx`, `src/components/ui/calendar.tsx`.

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` query "compact calendar typography mobile-friendly date picker".

- [ ] **Step 1: period-pills.tsx Edit** — `defaultMonth={range?.from ?? today}` (era `?? minDate`).

(Variável `today` já existe no PickerPanel.)

- [ ] **Step 2: calendar.tsx Edits**:
  - `text-sm` → `text-xs` nas day/weekday cells (procurar `defaultClassNames` overrides ou direct class).
  - `h-9 w-9` → `h-8 w-8` no day button (idem).

  > Nota subagente: leia o arquivo, identifique os classes que afetam tamanho/font do day cell, ajuste apenas elas.

- [ ] **Step 3: typecheck + tests** — PASS.

- [ ] **Step 4: Commit**:
```bash
git add src/components/reports/period-pills.tsx src/components/ui/calendar.tsx
git commit -m "feat(reports): T6 — calendar defaultMonth=today + fontes -1"
```

---

## Task 7: Toolbar tabela polish (remove dup Ordenação 3 + Mostrando X-Y + paginação no topo)

**Model**: haiku.
**Files:** `src/components/reports/conversas-table.tsx`.

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` query "data table toolbar header pagination integration tabular-nums semantic counter".

- [ ] **Step 1: Read** conversas-table.tsx.

- [ ] **Step 2: Edit 1** — toolbar interno: remover bloco do chip "Ordenação · N":
```tsx
// LOCALIZAR e DELETAR:
{sortStack.length > 0 ? (
  <Button variant="ghost" size="xs" onClick={clearSort} ...>
    <X /> Ordenação <span>{sortStack.length}</span>
  </Button>
) : null}
```

- [ ] **Step 3: Edit 2** — substituir contador "Total: X conversas · página N de M" por "Mostrando X-Y de Z":

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

- [ ] **Step 4: Edit 3** — paginação no topo: importar `<ConversasPagination>` e adicionar dentro do toolbar superior. Adicionar `data-tour="pagination-top"` no wrapper.

```tsx
<div data-tour="pagination-top" className="flex flex-wrap items-center justify-between gap-3 ...">
  <span>Mostrando X-Y de Z...</span>
  <ConversasPagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
  {/* ColumnsToggle existente */}
</div>
```

- [ ] **Step 5: Edit 4** — REMOVER `<ConversasPagination>` do rodapé (procurar onde está hoje no JSX).

- [ ] **Step 6: Tests update** — adicionar:
```tsx
it("não renderiza chip 'Ordenação · N' duplicado no toolbar interno", () => { ... });
it("renderiza 'Mostrando X-Y de Z' com formato pt-BR", () => { ... });
it("paginação no topo (não no rodapé)", () => { ... });
```

- [ ] **Step 7-8**: tests, typecheck, commit.

```bash
git add src/components/reports/conversas-table.tsx src/components/reports/__tests__/conversas-table.test.tsx
git commit -m "feat(reports): T7 — toolbar Mostrando X-Y + paginação no topo + remove dup Ordenação 3"
```

---

## Task 8: ConversasPagination rewrite (algoritmo + Popover reticência + Popover atual)

**Model**: sonnet.
**Files:** `src/components/reports/conversas-pagination.tsx` + tests.

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` query "numbered pagination dropdown popover ellipsis aria-current page selection chevron".

- [ ] **Step 1: Tests update** (rewrite test file):

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { ConversasPagination } from "@/components/reports/conversas-pagination";

describe("ConversasPagination v0.23 — algoritmo simplificado", () => {
  it("totalPages=0: null", () => {
    const { container } = render(<ConversasPagination page={1} totalPages={0} onPageChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
  it("totalPages=1: null", () => {
    const { container } = render(<ConversasPagination page={1} totalPages={1} onPageChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
  it("totalPages=2: '1 2' sem elipsis", () => {
    render(<ConversasPagination page={1} totalPages={2} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /ir para página 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ir para página 2/i })).toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });
  it("totalPages=3: '1 2 3' sem elipsis", () => { /* idem */ });
  it("totalPages=4: '1 2 3 4' sem elipsis", () => { /* idem */ });
  it("totalPages=8 atual=1: '1 ... 8'", () => {
    render(<ConversasPagination page={1} totalPages={8} onPageChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /ir para página 2/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ir para página 8/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /selecionar página/i }).length).toBe(1);
  });
  it("totalPages=8 atual=8: '1 ... 8'", () => { /* idem mirror */ });
  it("totalPages=8 atual=4: '1 ... 4 ... 8'", () => {
    render(<ConversasPagination page={4} totalPages={8} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /ir para página 4/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /selecionar página/i }).length).toBe(2);
  });
  it("reticência: click abre popover com lista", () => {
    render(<ConversasPagination page={1} totalPages={8} onPageChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /selecionar página/i }));
    // páginas 2..7 visíveis no popover (8 fora porque já está na barra)
    expect(screen.getByRole("button", { name: /^2$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^7$/ })).toBeInTheDocument();
  });
  it("atual no meio: tem chevron e abre popover com 1..N", () => {
    const cb = jest.fn();
    render(<ConversasPagination page={4} totalPages={8} onPageChange={cb} />);
    const atualBtn = screen.getByRole("button", { name: /ir para página 4/i });
    expect(atualBtn.querySelector('[aria-hidden]')).toBeTruthy(); // chevron
    fireEvent.click(atualBtn);
    // lista 1..8 (atual=4 marcada com check)
    expect(screen.getByRole("button", { name: /^5$/ })).toBeInTheDocument();
  });
  it("setinha < disabled em page=1", () => { /* mantém */ });
  it("setinha > disabled em page=totalPages", () => { /* mantém */ });
  it("aria-current='page' no atual", () => { /* mantém */ });
});
```

- [ ] **Step 2: Implement**:

```tsx
"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

function buildPageItems(page: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 0) return [];
  if (totalPages === 1) return [1];
  if (totalPages === 2) return [1, 2];
  if (totalPages === 3) return [1, 2, 3];
  if (totalPages === 4) return [1, 2, 3, 4];
  if (page === 1 || page === totalPages) return [1, "ellipsis", totalPages];
  return [1, "ellipsis", page, "ellipsis", totalPages];
}

function rangeToPages(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function EllipsisDropdown({ pages, onSelect }: { pages: number[]; onSelect: (p: number) => void }) {
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
      <PopoverContent
        className="w-32 p-1 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=open]:duration-150"
      >
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

function CurrentPageDropdown({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props) => (
          <button
            {...props}
            type="button"
            aria-current="page"
            aria-label={`Página atual ${page} — selecionar outra`}
            className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/15 px-3 text-sm font-semibold text-violet-500 tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
          >
            {page}
            <ChevronDown className="h-3 w-3" aria-hidden />
          </button>
        )}
      />
      <PopoverContent className="w-32 p-1 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=open]:duration-150">
        <ul role="list" className="max-h-64 overflow-y-auto">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => { onPageChange(p); setOpen(false); }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm tabular-nums hover:bg-muted",
                  p === page && "bg-violet-500/15 text-violet-500 font-semibold"
                )}
              >
                {p}
                {p === page ? <Check className="h-3 w-3" aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function ConversasPagination({ page, totalPages, onPageChange, className }: Props) {
  if (totalPages <= 1) return null;
  const items = buildPageItems(page, totalPages);

  // Calcular pages das reticências por posição
  const ellipsisIndices = items.map((it, idx) => ({ it, idx })).filter(x => x.it === "ellipsis");

  return (
    <nav
      role="navigation"
      aria-label="Paginação de conversas"
      className={cn("flex items-center gap-1.5", className)}
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        aria-label="Página anterior"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>

      {items.map((it, idx) => {
        if (it === "ellipsis") {
          // Determinar range pelas posições adjacentes
          let start = 2;
          let end = totalPages - 1;
          // Se múltiplas reticências (atual no meio), refinar:
          // items: [1, "ellipsis", page, "ellipsis", N]
          // idx=1 (esquerda): 2..page-1
          // idx=3 (direita): page+1..N-1
          if (ellipsisIndices.length === 2) {
            if (idx === 1) { start = 2; end = page - 1; }
            else { start = page + 1; end = totalPages - 1; }
          }
          const pages = rangeToPages(start, end);
          if (pages.length === 0) return null;
          return (
            <EllipsisDropdown
              key={`e${idx}`}
              pages={pages}
              onSelect={onPageChange}
            />
          );
        }

        // Number
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
              "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
              isCurrent
                ? "border-violet-500/40 bg-violet-500/15 text-violet-500 font-semibold"
                : "border-border/50 text-foreground hover:bg-muted hover:border-border"
            )}
          >
            {it}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Próxima página"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  );
}

export default ConversasPagination;
```

- [ ] **Step 3-5**: tests PASS, typecheck, commit.

```bash
git add src/components/reports/conversas-pagination.tsx src/components/reports/__tests__/conversas-pagination.test.tsx
git commit -m "feat(reports): T8 — ConversasPagination novo algoritmo + Popover reticência + Popover atual"
```

---

## Task 9: FiltersDialog (sections fechadas + handleClearOnlyFilters + header dinâmico)

**Model**: sonnet.
**Files:** `src/components/reports/filters-dialog.tsx` + tests.

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` query "modal dialog accordion progressive disclosure clear button isolation".

- [ ] **Step 1: Read** filters-dialog.tsx full. Identificar:
  - Como sections são abertas (Accordion default value? useState?).
  - Onde está o handler do botão "Limpar todos".
  - Onde está o título do modal.

- [ ] **Step 2: Edits**:
  - **Sections fechadas**: trocar default abre `["inboxIds"]` (ou similar) por `[]`.
  - **handleClearOnlyFilters**: implementação:
    ```ts
    const handleClearOnlyFilters = useCallback(() => {
      setDraft((prev) => ({
        ...prev,
        inboxIds: [],
        teamIds: [],
        assigneeIds: [],
        statuses: [],
        priorities: [],
        labelIds: [],
      }));
    }, []);
    ```
    Trocar onClick do botão "Limpar todos" pra usar este handler.
  - **Header dinâmico**:
    ```tsx
    <DialogTitle>
      Filtros {draft.mode === "advanced" ? "avançados" : "simples"}
    </DialogTitle>
    ```

- [ ] **Step 3: Tests** atualizar:
```tsx
it("seções iniciam todas fechadas", () => { ... });
it("'Limpar todos' zera só filtros, mantém modal aberto, não toca período", () => { ... });
it("header mostra 'Filtros simples' no modo simples", () => { ... });
it("header mostra 'Filtros avançados' no modo avançado", () => { ... });
```

- [ ] **Step 4-6**: tests PASS, typecheck, commit.

```bash
git add src/components/reports/filters-dialog.tsx src/components/reports/__tests__/filters-dialog.test.tsx
git commit -m "feat(reports): T9 — FiltersDialog sections fechadas + Limpar só filtros + header dinâmico"
```

---

## Task 10: Chips X adesivo + remove lixeirinhas

**Model**: sonnet.
**Files:** `src/components/reports/advanced-filters.tsx` (X adesivo), `src/components/reports/applied-filters-chips.tsx` (remove botões lixeirinha).

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` query "sticker badge corner remove button hover destructive WCAG accessible".

- [ ] **Step 1: advanced-filters.tsx — adicionar X adesivo nos botões "Filtros · N" e "Ordenação · N"**:

Localizar:
```tsx
<Button data-tour="filters-chip" ...>
  <Filter ... />
  Filtros
  {appliedCount > 0 ? <Badge>...</Badge> : null}
</Button>
```

Envolver em `<div className="relative inline-block">` e adicionar X bolinha quando `appliedCount > 0`:

```tsx
<div className="relative inline-block">
  <Button data-tour="filters-chip" ...>
    <Filter ... />
    Filtros
    {appliedCount > 0 ? <Badge>...</Badge> : null}
  </Button>
  {appliedCount > 0 ? (
    <button
      type="button"
      onClick={() => handleResetFiltersOnly()}
      aria-label="Limpar todos os filtros"
      className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-all hover:scale-110 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-150"
    >
      <X className="h-2.5 w-2.5" aria-hidden />
    </button>
  ) : null}
</div>
```

Implementar `handleResetFiltersOnly`:
```ts
const handleResetFiltersOnly = useCallback(() => {
  const next: FilterState = {
    ...applied,
    inboxIds: [],
    teamIds: [],
    assigneeIds: [],
    statuses: [],
    priorities: [],
    labelIds: [],
    // mantém: search, period, customRange, mode, conditionGroup, page
  };
  setApplied(next); setDraft(next); pushUrl(next);
}, [applied, pushUrl]);
```

Mesmo padrão pro botão "Ordenação · N" usando `clearSort()`:
```tsx
<div className="relative inline-block">
  <Button data-tour="sorting-chip" ...>...Ordenação...</Button>
  {sortCount > 0 ? (
    <button
      type="button"
      onClick={() => onSortStackChange([])}
      aria-label="Limpar ordenação"
      className="absolute -right-1.5 -top-1.5 ..."
    >
      <X className="h-2.5 w-2.5" />
    </button>
  ) : null}
</div>
```

- [ ] **Step 2: applied-filters-chips.tsx — remover botões "Limpar filtros" e "Limpar ordenação"**:

Localizar e DELETAR:
```tsx
{chips.length > 0 ? (
  <button onClick={onClearAll}>...Limpar filtros</button>
) : null}
{sortChips.length > 0 && onClearAllSort ? (
  <button onClick={onClearAllSort}>...Limpar ordenação</button>
) : null}
```

Props `onClearAll` e `onClearAllSort` podem ser mantidas como opcionais (sem uso interno) ou removidas — DECISÃO: manter (alguém pode usar via outro caller futuro; código reservado). Se TS strict reclamar de unused, marcar com `void onClearAll`.

- [ ] **Step 3: Tests** atualizar:
```tsx
it("chip 'Filtros · N' tem X adesivo na quina quando N > 0", () => {...});
it("X adesivo zera filtros mas mantém período/ordenação", () => {...});
it("AppliedFiltersChips NÃO renderiza mais botões 'Limpar filtros' e 'Limpar ordenação'", () => {...});
```

- [ ] **Step 4-6**: tests PASS, typecheck, commit.

```bash
git add src/components/reports/advanced-filters.tsx src/components/reports/applied-filters-chips.tsx [tests]
git commit -m "feat(reports): T10 — X adesivo nos chips Filtros/Ordenação + remove lixeirinhas separadas"
```

---

## Task 11: Tour bump v4 + step pagination-top

**Model**: haiku.
**Files:** `src/lib/tours/conversas-tour.ts`.

- [ ] **Step 1: Edit** id e steps:

```ts
id: "conversas-v4", // bump (era v3)
```

Substituir step `table` (ou inserir step `pagination-top` antes):
```ts
{
  id: "pagination-top",
  targetSelector: "[data-tour='pagination-top']",
  title: "Total + paginação",
  description: "No topo da tabela: total de conversas, indicador 'Mostrando X-Y de Z' e navegação entre páginas. Clique em '...' para escolher página específica.",
  placement: "bottom",
},
```

- [ ] **Step 2: Commit**:
```bash
git add src/lib/tours/conversas-tour.ts
git commit -m "feat(tour): T11 — conversas-v4 + step pagination-top"
```

---

## Task 12: Bump versão + CHANGELOG + STATUS

**Model**: haiku.
**Files:** `package.json`, `CHANGELOG.md`, `docs/STATUS.md`.

- [ ] **Step 1: Sync remoto** + verificar versão atual.

- [ ] **Step 2: Bump** package.json: `"version": "0.23.0"`.

- [ ] **Step 3: CHANGELOG.md** — append entry v0.23.0:

```md
## [v0.23.0] 2026-05-03 — Conversas Polish (busca funciona, single-day fix, paginação no topo, badge Enter, X adesivo, sorting anti-dup, highlight)

### Bug fixes críticos
- Busca volta a funcionar: page.tsx agora passa search no reportFilters (era descartado).
- Filtro single-day data personalizada (21/03 → 21/03) retorna conversas do dia (era 0).
- Sorting anti-duplicação: critério N não mostra colunas já usadas em critérios anteriores.

### Implementação
- Badge ↵ Enter inline (estilo Command+K) substitui hint span que quebrava layout.
- Highlight visual em violet das matches da busca em todas as colunas e drill-down.
- Paginação no TOPO da tabela com formato "Mostrando X-Y de Z conversas".
- ConversasPagination novo algoritmo simplificado: 1, 1-2, 1-2-3, 1-2-3-4, 1...N (atual=1 ou N), 1...mid...N. Reticências viram dropdown clicável; atual no meio tem chevron + dropdown.
- FiltersDialog: seções abertas fechadas inicial; "Limpar todos" zera SÓ filtros, mantém modal aberto, NÃO mexe em período/ordenação; header dinâmico "Filtros simples"/"Filtros avançados".
- X "adesivo" na quina dos chips "Filtros · N" e "Ordenação · N" (remove lixeirinhas separadas no toolbar).
- Calendar: defaultMonth=today (era março/2025) + tamanho fontes -1 unidade.
- Tour `conversas-v4` ganha step "Total + paginação".

### Compat
- ?page=N na URL (já existia desde v0.19).
- search ainda em ?q=N na URL.
```

- [ ] **Step 4: docs/STATUS.md** — atualizar header pra v0.23.0 + adicionar seção.

- [ ] **Step 5: Commit**:
```bash
git add package.json CHANGELOG.md docs/STATUS.md
git commit -m "chore(release): bump v0.23.0 — Conversas Polish + bug fixes"
```

---

## Task 13: Push + deploy + smoke + close

- [ ] **Step 1: tests + typecheck + build**.

- [ ] **Step 2: Sync + push**:
```bash
git fetch origin main
gh run list --limit 5
git push origin main
gh run watch <id>
```

- [ ] **Step 3: portainer-fix** com app_version=v0.23.0.

- [ ] **Step 4: Verificar /api/health** até v0.23.0.

- [ ] **Step 5: HISTORY.md + close active + push**.

- [ ] **Step 6: Smoke E2E** (manual após deploy — passar pra user).

---

## Self-Review (controlador antes de despachar)

- [ ] Spec coverage: §3.1-3.18 mapeados em T1-T11.
- [ ] No placeholders.
- [ ] Type consistency.
- [ ] TDD rigoroso em T2, T3, T5, T8, T9.
- [ ] ui-ux-pro-max obrigatório em T3, T4, T5, T6, T7, T8, T9, T10.
- [ ] Stage apenas seus.
- [ ] Modelo por task.
