# Conversas Fixes v0.27.0 — Implementation Plan (v3 final)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 9 fixes em `/relatorios/conversas` corrigindo regressões da v0.25 + bugs reportados pelo João via screenshots.

**Status:** v3 final (passou por pente fino #1 com 22 achados → v2 + pente fino #2 com 26 achados → v3).

**Tech Stack:** Next.js 16 · React 19 · TypeScript · Tailwind v4 · base-ui.

---

## §0. Histórico double-check

### Pente fino #1 (v1 → v2) — 22 achados

(Detalhados em `-v2.md` §0; resumo: F2 ranges por idx, F2 rangeToPages, F2 tests update, F3 data-search-icon attr, F3 X aria-label, F4 mantém phoneVariants/documentVariants, F4 testes "11 98765-4321"/"5511987654321"/"98765-4321"/"3380 vs 3803", F5 contraste WCAG, F6 dual disabled+aria-disabled, F7 colgroup keys dinâmicas, F7 expand defaultOrder=-1, F7 textos longos truncate, F8+F9 commit único, F9 escopo "Chatwoot"→"Nexus Chat" delimitado a 3 arquivos, F1+F2 tasks separadas, F1 PAGE_SIZE virtualizer ok, F3 data-state, F4 caso "3380" prioritário, F7 width soma 1630px, F4 risco máscaras documentado.)

### Pente fino #2 (v2 → v3) — 26 achados

1. **F2 EllipsisDropdown vazio** — `pages.length === 0` retorna null (preserva da v0.23). Casos: page=4 ou 5 com totalPages=5 geram range vazio na ellipsis direita.
2. **F2 totalPages 5 page 3:** `[1, ellipsis, 3, ellipsis, 5]` — ellipsis esquerda `[2]`, direita `[4]`. Funciona.
3. **F2 totalPages 5 page 2:** `[1, ellipsis, 2, ellipsis, 5]` — ellipsis esquerda range `[2..1]=[]` (null), direita `[3..4]`. Visual: `< 1 [vazio] 2 [3,4]✁ 5 >`.
4. **F2 totalPages 5 page 4:** `[1, ellipsis, 4, ellipsis, 5]` — esquerda `[2,3]`, direita `[5..4]=[]`.
5. **F3 input cursor:** `cursor-text` no input + `cursor-pointer` no botão X. Z-order ok (botão posicional `right-2` sobre input).
6. **F4 phone match positivos preservados:** `(11) 98765` substring de `+55 (11) 98765-4321` ✓; `5511987654321` substring de raw ✓; `98765-4321` substring do formatted ✓.
7. **F4 phone match negativo intencional:** `11 98765-4321` (sem `+55`/parens) NÃO bate — ordem específica do user diverge do haystack. Aceitável.
8. **F4 caso edge "3380" + phone "+5511338021234":** rownow tem `5511338021234` no haystack, e `3380` é substring contígua → bate intencionalmente. Adicionar test documentando.
9. **F5 light mode contraste:** `text-destructive` direto sobre `bg-destructive/15` atinge AA. ✓
10. **F6 Calendar DayButton:** o `<Button>` shadcn ghost variant não inclui cursor — adicionar resolve. Tanto `disabled:` quanto `aria-disabled:` necessários (react-day-picker varia entre os dois).
11. **F7 `<colgroup>` precisa ser child direto de `<table>` (ou shadcn `<Table>`):** verificar `src/components/ui/table.tsx` — wrapper deve aceitar children no top.
12. **F7 `tableLayout: fixed` é OBRIGATÓRIO** para `<col width>` ser respeitado (sem fixed, browser ignora os `width`).
13. **F7 ColumnsToggle ocultando coluna:** `orderedColumns` filtra por `visibleCols`. `<colgroup>` mapeia sobre `orderedColumns` → recalcula automaticamente. ✓
14. **F7 width soma 10 cols default 1630px** — em viewport < 1630px scroll-x já existe (parent `overflow-x-auto`). OK.
15. **F8 tour bump v4→v5** força re-show. Aceito.
16. **F8 reorder muda ÍNDICES, não conteúdo:** descrições/títulos preservados (exceto F9 open-action).
17. **F9 escopo limitado a 3 arquivos:** `conversas-table.tsx`, `conversas-tour.ts`, `open-in-chatwoot.tsx` (aria-label). Outros (chatwoot-urls-card, audits-table, user-form-dialog, login-branding, stale-banner) ficam pra release dedicada de rebranding.
18. **Coordenação multi-agente:** sem outros agentes ativos (verificado). Bumpando 0.25 → 0.27 (pula 0.26 que ficou com agente paralelo no env var, mas package.json local diz 0.25.0).
19. **Subagent batches:** 4 sequenciais sem conflito de arquivos.
20. **F4 perf:** removendo heurística digits-only, code path simplifica. Sem ganho mensurável (haystack JÁ tem digits raw via phoneVariants).
21. **F4 case `#3380`:** com hash bate display_id 3380 (haystack tem `#3380` literal). ✓
22. **F1 PAGE_SIZE_CLIENT impacto:** com 7k rows → 7 páginas. Counter "Mostrando 1-1000 de 7000". Pagination renderiza.
23. **F3 lupa color CSS-only via `data-search-icon`:** alternativa seria classe condicional inline (`searchClient.trim() !== "" ? "text-violet-500" : "text-muted-foreground"`). Mais simples. Adopt esse approach (sem data-attr — direto className).
24. **F2 EllipsisDropdown range arg pode ser `[]`:** `<EllipsisDropdown pages={[]}>` retorna null. Sem trabalho extra.
25. **F4 test "ordem invertida" robusto:** confirmar com `phone_number: null, identifier: null` para garantir que único campo numérico é `display_id`. Sem isso, "3380" poderia bater em phone "+5511338011111" coincidentemente.
26. **CHANGELOG entry crítica:** documentar que match agora respeita ordem dos caracteres — usuários que dependiam de "encontrar em qualquer ordem" precisam adaptar.

---

## §1. Decisões finais

### F1. PAGE_SIZE_CLIENT 100 → 1000

`src/components/reports/conversas-page-client.tsx:66`.

### F2. Paginação reticências (algoritmo v0.23)

`src/components/reports/conversas-pagination.tsx`:
- `buildPageItems` retorna `Array<number | "ellipsis">`.
- Restaura `<EllipsisDropdown>` + `rangeToPages`.
- Render trata `it === "ellipsis"` com range por idx.

### F3. Input busca: lupa roxa + X canto direito + sem tag

`src/components/reports/advanced-filters.tsx`:
- Remove `<span>Filtrando</span>`.
- `<Search>` className condicional: `text-violet-500` quando ativa, senão `text-muted-foreground`.
- `<button>` X com `<X h-3 w-3>` no `right-2 top-1/2`, visível só com search ativa, aria-label "Limpar busca", click chama `onSearchClientChange("")`.
- Input `pr-9` (search ativa) / `pr-3` (idle).

### F4. Match respeita ordem dos caracteres

`src/lib/reports/match-search-client.ts`:
- DELETA `isPhoneOrDocLike` + bloco `useDigitsMatch`/`needleDigits`/`hayDigits`.
- `matchSearchClient` simplifica: `rows.filter((row) => buildHaystack(row).includes(needle))`.
- `phoneVariants` e `documentVariants` continuam (alimentam haystack com formatos múltiplos).

### F5. X chips Filtros/Ordenação volta ao estilo fosco

`src/components/reports/advanced-filters.tsx` linhas 478, 506:
- `border border-destructive/40 bg-destructive/15 text-destructive`
- Hover: `hover:bg-destructive/25 hover:border-destructive/60` (mantém text-destructive).
- Sem `scale-110`, sem `text-white`, sem `ring-2`.
- Tamanho mantém `h-5 w-5` + `<X h-3 w-3>`.

### F6. Calendar DayButton cursor-pointer

`src/components/ui/calendar.tsx:213`:
- `cursor-pointer disabled:cursor-not-allowed aria-disabled:cursor-not-allowed`.

### F7. Tabela com larguras fixas

`src/components/reports/conversas-table.tsx`:
- Constante `COLUMN_WIDTHS: Record<string, string>` com larguras px por key.
- `<Table style={{ tableLayout: "fixed" }}>` (style override; verificar se `<Table>` shadcn passa style adiante).
- `<colgroup><col width=...>` filho direto de `<Table>`, antes de `<TableHeader>`. Map sobre `orderedColumns`.
- Remove `min-w-` dos className das columns (substituído).

### F8. Tour reordena steps + bump id

`src/lib/tours/conversas-tour.ts`:
- `id: "conversas-v5"`.
- Ordem: period, search, filters-chip, sorting-chip, atalhos, **presets, export**, columns, pagination-top, table, drill-down, open-action, refresh.

### F9. "Chatwoot" → "Nexus Chat" (escopo limitado)

3 arquivos:
- `src/components/reports/conversas-table.tsx:184-185`: title + aria-label do `<OpenIdLink>` → "Nexus Chat".
- `src/lib/tours/conversas-tour.ts` step `open-action`: title + description → "Nexus Chat".
- `src/components/reports/open-in-chatwoot.tsx:18`: aria-label → "Nexus Chat".

(Outros locais: chatwoot-urls-card, audits-table, user-form-dialog, login-branding, stale-banner — release dedicada futura.)

---

## §2. File Structure

| Arquivo | Mudança |
|---|---|
| `src/components/reports/conversas-page-client.tsx` | F1: PAGE_SIZE_CLIENT 100→1000. |
| `src/components/reports/conversas-pagination.tsx` | F2. |
| `src/components/reports/__tests__/conversas-pagination.test.tsx` | F2 tests. |
| `src/components/reports/advanced-filters.tsx` | F3 + F5. |
| `src/components/reports/__tests__/advanced-filters-x-style.test.tsx` | F5 tests. |
| `src/components/reports/__tests__/advanced-filters-search.test.tsx` | F3 tests. |
| `src/lib/reports/match-search-client.ts` | F4. |
| `src/lib/reports/__tests__/match-search-client.test.ts` | F4 tests. |
| `src/components/ui/calendar.tsx` | F6. |
| `src/components/reports/conversas-table.tsx` | F7 + F9. |
| `src/lib/tours/conversas-tour.ts` | F8 + F9. |
| `src/components/reports/open-in-chatwoot.tsx` | F9. |
| `package.json` | Bump 0.25.0 → 0.27.0. |
| `CHANGELOG.md` | Entrada v0.27.0. |
| `docs/STATUS.md` | Release v0.27.0 no topo. |

---

## §3. Tasks

### Subagent Batch 1: T1 (F1) + T2 (F2) + T6 (F6) + T8a (F8 tour)

**Files (disjuntos):**
- `src/components/reports/conversas-page-client.tsx`
- `src/components/reports/conversas-pagination.tsx`
- `src/components/reports/__tests__/conversas-pagination.test.tsx`
- `src/components/ui/calendar.tsx`
- `src/lib/tours/conversas-tour.ts`
- `src/components/reports/open-in-chatwoot.tsx`

#### T1 (F1): pageSize 1000

```ts
// src/components/reports/conversas-page-client.tsx:66
const PAGE_SIZE_CLIENT = 1000;
```

Commit: `feat(conversas): T1 v0.27 — pageSize client 100→1000 (volta ao padrão antes da v0.25)`.

#### T2 (F2): paginação reticências (volta v0.23)

Tests primeiro (TDD):

```ts
// conversas-pagination.test.tsx
describe("buildPageItems v0.27 (com reticências)", () => {
  it("totalPages 1: [1]", () => expect(buildPageItems(1, 1)).toEqual([1]));
  it("totalPages 4: [1,2,3,4]", () => expect(buildPageItems(2, 4)).toEqual([1, 2, 3, 4]));
  it("atual=1 com 8 págs: [1, ellipsis, 8]", () =>
    expect(buildPageItems(1, 8)).toEqual([1, "ellipsis", 8]));
  it("atual=8 com 8 págs: [1, ellipsis, 8]", () =>
    expect(buildPageItems(8, 8)).toEqual([1, "ellipsis", 8]));
  it("atual=5 com 8 págs: [1, ellipsis, 5, ellipsis, 8]", () =>
    expect(buildPageItems(5, 8)).toEqual([1, "ellipsis", 5, "ellipsis", 8]));
});

describe("ConversasPagination v0.27 (render)", () => {
  it("renderiza dropdown de reticência (botão '...')", () => {
    render(<ConversasPagination page={5} totalPages={8} onPageChange={() => {}} />);
    expect(screen.getAllByRole("button", { name: /Selecionar página/i }).length).toBeGreaterThan(0);
  });
  it("atual no meio é dropdown", () => {
    render(<ConversasPagination page={5} totalPages={8} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Página atual 5/i })).toBeInTheDocument();
  });
});
```

Implementação `conversas-pagination.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function buildPageItems(
  page: number,
  totalPages: number,
): Array<number | "ellipsis"> {
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

function EllipsisDropdown({
  pages,
  onSelect,
}: { pages: number[]; onSelect: (p: number) => void }) {
  const [open, setOpen] = useState(false);
  if (pages.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props) => (
          <button
            {...props}
            type="button"
            aria-label="Selecionar página"
            className="inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-md border border-border/50 px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
          >
            …
          </button>
        )}
      />
      <PopoverContent className="w-32 p-1">
        <ul role="list" className="max-h-64 overflow-y-auto">
          {pages.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => { onSelect(p); setOpen(false); }}
                className="flex w-full cursor-pointer items-center justify-center rounded-md px-2 py-1.5 text-sm tabular-nums hover:bg-muted"
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

function CurrentPageDropdown({
  page,
  totalPages,
  onPageChange,
}: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
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
            className="inline-flex h-9 min-w-9 cursor-pointer items-center justify-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/15 px-3 text-sm font-semibold text-violet-500 tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
          >
            {page}
            <ChevronDown className="h-3 w-3" aria-hidden />
          </button>
        )}
      />
      <PopoverContent className="w-32 p-1">
        <ul role="list" className="max-h-64 overflow-y-auto">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => { onPageChange(p); setOpen(false); }}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm tabular-nums hover:bg-muted",
                  p === page && "bg-violet-500/15 font-semibold text-violet-500",
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
  const ellipsisCount = items.filter((it) => it === "ellipsis").length;

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
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>

      {items.map((it, idx) => {
        if (it === "ellipsis") {
          let start = 2;
          let end = totalPages - 1;
          if (ellipsisCount === 2) {
            // [1, ellipsis, page, ellipsis, N]: idx 1 esquerda; idx 3 direita
            if (idx === 1) {
              start = 2;
              end = page - 1;
            } else {
              start = page + 1;
              end = totalPages - 1;
            }
          }
          return (
            <EllipsisDropdown
              key={`e${idx}`}
              pages={rangeToPages(start, end)}
              onSelect={onPageChange}
            />
          );
        }
        const isCurrent = page === it;
        const isEdge = it === 1 || it === totalPages;
        if (isCurrent && !isEdge) {
          return (
            <CurrentPageDropdown
              key={it}
              page={page}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
          );
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

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Próxima página"
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  );
}

export default ConversasPagination;
```

Commit: `feat(conversas): T2 v0.27 — paginação volta com reticências (algoritmo v0.23)`.

#### T6 (F6): Calendar cursor-pointer

`src/components/ui/calendar.tsx:213` — adicionar no className do `<Button>` no `CalendarDayButton`:

```tsx
className={cn(
  "cursor-pointer disabled:cursor-not-allowed aria-disabled:cursor-not-allowed",
  "relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size)...", // resto inalterado
  defaultClassNames.day,
  className,
)}
```

Commit: `feat(ui): T6 v0.27 — Calendar DayButton ganha cursor-pointer (afeta todos calendários)`.

#### T8a (F8): Tour reorder + bump v5 + Chatwoot→Nexus Chat (tour + open-in-chatwoot)

`src/lib/tours/conversas-tour.ts`:
- `id: "conversas-v5"`.
- Reordenar steps array: presets antes de export.
- Step `open-action`:
  ```ts
  {
    id: "open-action",
    targetSelector: "[data-tour='open-action']",
    title: "Abrir conversa no Nexus Chat",
    description: "Clique no número da conversa (#) para abrir direto no Nexus Chat, em uma nova aba.",
    placement: "right",
  }
  ```

`src/components/reports/open-in-chatwoot.tsx:18`:
```tsx
aria-label={`Abrir conversa #${displayId} no Nexus Chat`}
```

Commit: `feat(conversas): T8a v0.27 — tour reorder presets/export + 'Chatwoot' → 'Nexus Chat' (tour + OpenInChatwoot aria)`.

---

### Subagent Batch 2: T3 (F3) + T5 (F5) — advanced-filters.tsx

**Files:**
- `src/components/reports/advanced-filters.tsx`
- `src/components/reports/__tests__/advanced-filters-search.test.tsx`
- `src/components/reports/__tests__/advanced-filters-x-style.test.tsx`

**Pré:** Invocar `ui-ux-pro-max:ui-ux-pro-max` antes (foco: input filtering state via icon color + secondary clear in corner; chip destructive style follow-up).

#### T3 (F3): input search refator

Tests novos em `advanced-filters-search.test.tsx`:
```tsx
it("ícone lupa fica violet quando searchClient ativo", () => {
  const { container } = render(<AdvancedFilters {...baseProps} searchClient="abc" onSearchClientChange={() => {}} />);
  const icon = container.querySelector(".lucide-search");
  expect(icon?.className).toMatch(/text-violet-500/);
});
it("ícone lupa fica muted quando searchClient vazio", () => {
  const { container } = render(<AdvancedFilters {...baseProps} searchClient="" onSearchClientChange={() => {}} />);
  const icon = container.querySelector(".lucide-search");
  expect(icon?.className).toMatch(/text-muted-foreground/);
});
it("X de limpar busca aparece e clica limpa", () => {
  const onSearchClientChange = jest.fn();
  render(<AdvancedFilters {...baseProps} searchClient="abc" onSearchClientChange={onSearchClientChange} />);
  const x = screen.getByRole("button", { name: /Limpar busca/i });
  fireEvent.click(x);
  expect(onSearchClientChange).toHaveBeenCalledWith("");
});
it("não renderiza tag 'Filtrando' (removida v0.27)", () => {
  render(<AdvancedFilters {...baseProps} searchClient="abc" onSearchClientChange={() => {}} />);
  expect(screen.queryByText(/Filtrando/i)).toBeNull();
});
it("X NÃO aparece quando search vazio", () => {
  render(<AdvancedFilters {...baseProps} searchClient="" onSearchClientChange={() => {}} />);
  expect(screen.queryByRole("button", { name: /Limpar busca/i })).toBeNull();
});
```

Implementação `advanced-filters.tsx` lines 392-422 — substitui o JSX completo do search:

```tsx
<div data-tour="search" className="relative w-full max-w-[320px] min-w-[200px] sm:flex-none">
  <Search
    className={cn(
      "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors",
      searchClient.trim() !== "" ? "text-violet-500" : "text-muted-foreground",
    )}
    aria-hidden="true"
  />
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
    className={cn("h-10 cursor-text pl-9", searchClient.trim() !== "" ? "pr-9" : "pr-3")}
  />
  {searchClient.trim() !== "" ? (
    <button
      type="button"
      onClick={() => onSearchClientChange("")}
      aria-label="Limpar busca"
      title="Limpar busca"
      className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
    >
      <X className="h-3 w-3" aria-hidden="true" />
    </button>
  ) : null}
</div>
```

Commit: `feat(conversas): T3 v0.27 — input busca lupa roxa + X canto direito (remove tag Filtrando)`.

#### T5 (F5): X chips Filtros/Ordenação fosco

Tests atualizados em `advanced-filters-x-style.test.tsx`:
```tsx
expect(cls).toMatch(/h-5 w-5/);
expect(cls).toMatch(/bg-destructive\/15/);
expect(cls).toMatch(/text-destructive/);
expect(cls).toMatch(/border-destructive\/40/);
expect(cls).toMatch(/hover:bg-destructive\/25/);
expect(cls).not.toMatch(/hover:text-white/);
expect(cls).not.toMatch(/hover:ring-2/);
expect(cls).not.toMatch(/hover:scale-110/);
```

Edit lines 478, 506 — substitui className de AMBOS os botões X:
```tsx
className="absolute -right-1.5 -top-1.5 z-10 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-destructive/40 bg-destructive/15 text-destructive shadow-sm transition-colors hover:bg-destructive/25 hover:border-destructive/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
```

Mantém `<X className="h-3 w-3" aria-hidden="true" />`.

Commit: `feat(conversas): T5 v0.27 — X chips Filtros/Ordenação volta ao estilo fosco (v0.23)`.

---

### Subagent Batch 3: T4 (F4) — match-search-client.ts

**Files:**
- `src/lib/reports/match-search-client.ts`
- `src/lib/reports/__tests__/match-search-client.test.ts`

#### T4 (F4): match respeita ordem (remove digits-only)

Tests atualizados/adicionados em `match-search-client.test.ts`:
```ts
// REMOVE/ATUALIZA: caso "11 98765-4321" matches "+55 (11) 98765-4321".
it("phone com máscara divergente (parens entre) NÃO bate", () => {
  // v0.27: match respeita ordem dos caracteres; máscaras arbitrárias precisam casar substring contígua.
  expect(matchSearchClient([baseRow], "11 98765-4321")).toHaveLength(0);
});

// MANTÉM:
it("digits raw bate (haystack tem raw via phoneVariants)", () => {
  expect(matchSearchClient([baseRow], "5511987654321")).toHaveLength(1);
});
it("substring contígua do formatPhone bate", () => {
  expect(matchSearchClient([baseRow], "98765-4321")).toHaveLength(1);
});
it("CPF com máscara batendo formatted", () => {
  expect(matchSearchClient([baseRow], "070.415.111-11")).toHaveLength(1);
});
it("CPF raw batendo identifier", () => {
  expect(matchSearchClient([baseRow], "07041511111")).toHaveLength(1);
});

// ADICIONA — REGRESSÃO FIXADA:
it("'3380' NÃO bate em row com display_id 3803 (caracteres iguais ordem diferente — bug reportado pelo João)", () => {
  const r = {
    ...baseRow,
    display_id: 3803,
    contact: { ...baseRow.contact, phone_number: null, identifier: null },
    custom_attributes: null,
    labels: [],
  };
  expect(matchSearchClient([r], "3380")).toHaveLength(0);
});
it("'3380' BATE em row com phone '+5511338021234' (substring contígua)", () => {
  const r = {
    ...baseRow,
    display_id: 999,
    contact: { ...baseRow.contact, phone_number: "+5511338021234", identifier: null },
    custom_attributes: null,
    labels: [],
  };
  expect(matchSearchClient([r], "3380")).toHaveLength(1);
});
it("'#3380' bate em row com display_id 3380 (haystack tem '#3380')", () => {
  const r = { ...baseRow, display_id: 3380 };
  expect(matchSearchClient([r], "#3380")).toHaveLength(1);
});
```

Implementação `match-search-client.ts` — substitui só `matchSearchClient` (mantém `phoneVariants`, `documentVariants`, `customAttrsToText`, `buildHaystack`, `normalize`):

```ts
/**
 * Match OR sobre haystack normalizado.
 *
 * Match é substring contígua (case + acentos insensíveis). Respeita a
 * ordem dos caracteres digitados pelo usuário — "3380" NÃO bate em
 * haystack que contém "3803" (mesmos dígitos, ordem diferente).
 *
 * Telefones e documentos são cobertos via formatos múltiplos no haystack
 * (phoneVariants: raw + formatPhone + digits-only; documentVariants:
 * identifier + formatted CPF/CNPJ). Máscaras arbitrárias só batem se
 * forem substring contígua de algum dos formatos.
 */
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

DELETA: `isPhoneOrDocLike` function inteira (lines 63-72).

Commit: `feat(conversas): T4 v0.27 — match respeita ordem dos caracteres (remove heurística digits-only)`.

---

### Subagent Batch 4: T7 (F7) + T8b (F9 conversas-table) — conversas-table.tsx

**Files:**
- `src/components/reports/conversas-table.tsx`

**Pré:** Invocar `ui-ux-pro-max:ui-ux-pro-max` (foco: table-layout fixed + colgroup + truncate).

#### T7 (F7): tabela larguras fixas

1. Adicionar constante no topo do arquivo (após imports):
```ts
const COLUMN_WIDTHS: Record<string, string> = {
  expand: "40px",
  display_id: "80px",
  name: "220px",
  document: "160px",
  inbox: "140px",
  team: "140px",
  assignee: "140px",
  status: "120px",
  priority: "120px",
  waiting_seconds: "160px",
  open_seconds: "170px",
  created_at: "160px",
  last_activity_at: "180px",
};
```

2. Verificar `src/components/ui/table.tsx` — `<Table>` precisa aceitar `style` prop. Se não aceita, edit pra aceitar `style?: React.CSSProperties` e passar pro `<table>` interno.

3. Edit no render: `<Table style={{ tableLayout: "fixed", minWidth: "max-content" }}>` + `<colgroup>...</colgroup>` antes de `<TableHeader>`:

```tsx
<Table style={{ tableLayout: "fixed", minWidth: "max-content" }}>
  <colgroup>
    {orderedColumns.map((col) => (
      <col
        key={col.key}
        style={{ width: COLUMN_WIDTHS[col.key] ?? "auto" }}
      />
    ))}
  </colgroup>
  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_rgb(var(--border)_/_0.6)]">
    {/* ... */}
  </TableHeader>
  {/* ... */}
</Table>
```

4. Remove `min-w-[Xpx]` dos className das colunas (já são cobertos por `<col width>`).

5. Verifica em jest: smoke test verifica `<colgroup>` rendered + `tableLayout: fixed` no style.

Commit: `feat(conversas): T7 v0.27 — tabela com larguras fixas (table-layout fixed + colgroup)`.

#### T8b (F9): conversas-table renomeação Chatwoot→Nexus Chat

Edit `src/components/reports/conversas-table.tsx` linhas 184-185:

```tsx
title={`Abrir conversa #${displayId} no Nexus Chat`}
aria-label={`Abrir conversa #${displayId} no Nexus Chat`}
```

(Comentário interno linha 162 "// Botão #ID — abre conversa no Chatwoot." mantém — código interno OK.)

Commit: `feat(conversas): T8b v0.27 — OpenIdLink aria/title 'Chatwoot' → 'Nexus Chat'`.

---

### Task 9 (controlador): Release v0.27.0

- [ ] Bump `package.json`: `"version": "0.27.0"` (era 0.25.0).
- [ ] CHANGELOG entry v0.27.0 listando os 9 fixes.
- [ ] STATUS.md no topo.
- [ ] typecheck full.
- [ ] Commit release.
- [ ] Push origin main.
- [ ] `gh workflow run "Portainer fix..."` com `--field app_version=v0.27.0`.
- [ ] Monitor `/api/health` até `version=v0.27.0`.

---

## §4. Edge Cases

- F2: `pages.length === 0` em EllipsisDropdown → null. Casos onde aparece (page=2,3 ou 4 com totalPages=5).
- F4: máscaras arbitrárias agora exigem substring contígua. Documentado no CHANGELOG.
- F7: scroll-x ativa em viewport < 1630px. Aceitável (parent já tem `overflow-x-auto`).

## §5. Riscos & Rollback

| Risco | Mitigação |
|---|---|
| Match v0.27 quebra usuários que dependiam de digits-only | Documentar; oferecer formato exato no UI futuramente. |
| `<col width>` não respeitado se Table não passa `style` adiante | Fix no Table component em T7. |
| Tour bump v5 força re-show pra usuários que viram v4 | Aceito (padrão). |

Rollback: `git revert <SHA release>` + push + portainer-fix com `app_version=v0.26.0`.

## §6. Self-Review v3 final

- [x] 9 fixes cobertos com 8 commits granulares + release.
- [x] TDD em F2, F3, F4, F5.
- [x] ui-ux-pro-max obrigatória em batches que tocam UI (2, 4).
- [x] CHANGELOG entry inclui aviso "match respeita ordem dos caracteres".
- [x] STATUS.md release v0.27.0 no topo.
- [x] "Chatwoot" → "Nexus Chat" só em 3 arquivos do escopo.
- [x] Coordenação multi-agente verificada (sem outros active).
- [x] PAGE_SIZE_CLIENT 1000 sem regressão de virtualização.
- [x] EllipsisDropdown vazio retorna null (preserva comportamento v0.23).
- [x] Calendar DayButton tem `disabled:` E `aria-disabled:` (cobre react-day-picker variations).
- [x] `<Table>` precisa aceitar style prop pra tableLayout: fixed funcionar.
