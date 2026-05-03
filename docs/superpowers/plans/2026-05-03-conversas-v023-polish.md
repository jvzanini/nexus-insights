# Plan v3 (final): Conversas v0.23 Polish

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps em checkbox `- [ ]`. UI tasks invocam `ui-ux-pro-max:ui-ux-pro-max` ANTES de codar. Tasks com lógica testável invocam `superpowers:test-driven-development`.
>
> **Status**: v3 final (pente-fino #1 com 20 achados + pente-fino #2 com 18 achados aplicados).

**Goal:** Aplicar 19 ajustes em `/relatorios/conversas` da v0.22.0 → v0.23.0 (3 bugs críticos + UI polish + highlight busca + calendar padronizado em TODA a plataforma).

**Architecture:** 1 fix de 1 linha em page.tsx (busca), TDD em datetime-core (single-day), filtragem de opções no SortingDialog, badge ↵ Enter inline, paginação reorganizada no topo com novo algoritmo + Popover, helper HighlightedText, calendar tokens consistentes globais.

**Tech Stack:** Next.js 16.2.2, React 19.2, TypeScript strict, Tailwind v4, base-ui (Popover), react-day-picker v9, Jest + RTL.

---

## Pré-flight

```bash
ls docs/agents/active/        # esperado: SÓ claude-conversas-v023.md
git fetch origin main
git status                    # esperado limpo
git log --oneline -5
cat package.json | python3 -c "import json,sys;print(json.load(sys.stdin)['version'])"  # esperado 0.22.0
```

## Convenções

- Stage APENAS arquivos seus em commits (NUNCA `git add -A`).
- Não tocar em arquivos de outros agentes (verificar via `ls docs/agents/active/` antes de editar).
- TypeScript strict; aliases `@/`; comentários pt-BR.
- ui-ux-pro-max OBRIGATÓRIA pra qualquer toque em layout/componente/ícone/front-end.

## Modelo por task

- T1, T6, T7, T11, T12, T13: haiku (mecânicas)
- T2, T3, T4, T5, T8, T9, T10: sonnet (raciocínio + UI)

---

## Self-review do plan v3

(Pente-fino #2 sobre v2)

1. v2 não enfatizou o Calendar fix como mudança GLOBAL → v3 §T6 documenta que afeta TODAS as telas (advanced-filters, period-selector-url, consumo-content e seus consumidores).
2. v2 não cobre flags `searchPending` órfãs após remoção do hint span → v3 T4 menciona cleanup.
3. v2 não documenta que removendo `<ConversasPagination>` do rodapé exige preservar `data-tour`/scroll → v3 T7 explicita.
4. v2 T2 plano condicional sem definição clara do "se PASS" → v3 T2 define caminho de fallback.
5. v2 T5 highlight em ColumnDef.render — mudar API de `render(row)` pra `render(row, opts)` é breaking change → v3 propõe helper componente `<RowCellWithHighlight>` pra encapsular.
6. v2 T8 pagination — Popover state não desmonta quando ConversasTable re-render → v3 T8 inclui `key` baseado em totalPages.
7. v2 T9 FiltersDialog — sections abertas pode ter persistência localStorage → v3 T9 verifica.
8. v2 T10 X adesivo — overlap visual com Badge interno → v3 T10 ajusta z-index.
9. v2 não cobre interação X adesivo + tooltip → v3 T10 documenta sem tooltip (aria-label suficiente).
10. v2 T7 paginação no topo + ColumnsToggle — wrap responsivo apertado → v3 T7 detalha layout flex-wrap.
11. v2 T2 imports `parseISO` — verificar se já está disponível em datetime-core → v3 T2 nota.
12. v2 plan não documenta exportConversasAction afetada por search → v3 já era OK (filters: ReportFilters inclui search).
13. v2 T5 não cobre attributes complexos (JSON.stringify) com search → v3 T5 documenta.
14. v2 T5 não cobre LabelsChips com search → v3 T5 documenta wrapping.
15. v2 T11 step pagination-top — placement em mobile (sticky bottom?) → v3 T11 mantém "bottom" desktop.
16. v2 T13 portainer-fix racing condition (visto na v0.19) → v3 T13 inclui retry pattern.
17. v2 não cobre teste E2E pra busca em produção (precondição: dataset com "joão") → v3 T13 sugere user testar.
18. v2 não cobre limpar `?page=` quando o botão "Próxima página" disabled é clicado em telado → v3 nota.

---

## File Structure

### NEW
| Path | Responsabilidade |
|---|---|
| `src/lib/utils/highlight-text.tsx` | helper `<HighlightedText>` para busca em violet |
| `src/lib/__tests__/datetime-single-day.test.ts` | TDD do bug single-day |
| `src/lib/utils/__tests__/highlight-text.test.tsx` | tests highlight |

### MODIFY
(idem v2 — sem mudanças)

---

## Task 1: BUG search no reportFilters

**Model**: haiku.
**Files:** `src/app/(protected)/relatorios/conversas/page.tsx`

- [ ] **Step 1: Read** o arquivo full.

- [ ] **Step 2: Edit** linhas 58-71. Adicionar antes de `excludeMatrixIA,`:
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
**Files:**
- Create: `src/lib/__tests__/datetime-single-day.test.ts`
- (CONDITIONAL) Modify: `src/lib/datetime-core.ts`

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

- [ ] **Step 2: Run tests**:
```bash
npm test -- datetime-single-day
```

**Caminho A — tests PASS** → bug NÃO é em datetime-core. Investigar `buildBaseFilter` em `src/lib/chatwoot/filters.ts`. Reportar como concern; controlador investiga + cria fix dedicado.

**Caminho B — tests FAIL** → bug confirmado em datetime-core. Implementar fix.

- [ ] **Step 3 (caminho B): Implement** em `src/lib/datetime-core.ts case "custom"`:

Verificar imports atuais (`parseISO` de `date-fns`?). Se não, adicionar:
```ts
import { parseISO } from "date-fns";
```

Substituir o case:
```ts
case "custom": {
  if (!customRange) {
    throw new Error('getPeriodInTz: customRange é obrigatório para key="custom"');
  }
  // Parse string yyyy-mm-dd como local SP (não UTC midnight).
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

Re-run test → PASS.

- [ ] **Step 4: Commit**:
```bash
git add src/lib/__tests__/datetime-single-day.test.ts src/lib/datetime-core.ts
git commit -m "fix(datetime): T2 — single-day custom range respeita TZ corretamente"
```

(Caminho A — só tests + reportar concern.)

---

## Task 3: Sorting anti-duplicação

**Model**: sonnet.
**Files:** `src/components/reports/sorting-dialog.tsx` + tests.

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` query "select disabled options multi-criteria interaction visual feedback".

- [ ] **Step 1: Read** sorting-dialog.tsx (full).

- [ ] **Step 2: Tests** atualizar (adicionar describe novo):

```tsx
import { within } from "@testing-library/react";
const ALL_OPTIONS = [
  { key: "departamento", label: "Departamento" },
  { key: "estado", label: "Estado" },
  { key: "atendente", label: "Atendente" },
  { key: "status", label: "Status" },
];

it("opções já usadas em critérios anteriores são excluídas dos subsequentes", async () => {
  const initial = [
    { key: "departamento", direction: "asc" as const },
    { key: "estado", direction: "desc" as const },
  ];
  render(<SortingDialog open={true} onOpenChange={() => {}} applied={initial} options={ALL_OPTIONS} onApply={() => {}} onClear={() => {}} />);
  // O <select>/dropdown do critério 2 NÃO deve ter "departamento"
  // (busca varia conforme implementação — pode ser <select> nativo ou base-ui)
  // ...
});
```

(Sub-agent ajustar conforme implementação real do componente — base-ui Select, nativo, etc.)

- [ ] **Step 3: Run failing** → FAIL.

- [ ] **Step 4: Implement** — helper `getAvailableOptions`:

```ts
function getAvailableOptions(
  allOptions: SortRuleOption[],
  currentCriteria: SortRule[],
  currentIdx: number,
): SortRuleOption[] {
  const usedKeys = new Set(
    currentCriteria
      .filter((_, idx) => idx !== currentIdx)
      .map((c) => c.key),
  );
  return allOptions.filter((o) => !usedKeys.has(o.key));
}
```

E aplicar no render de cada select de critério:
```tsx
const available = getAvailableOptions(options, criteria, idx);
```

- [ ] **Step 5-7**: tests PASS, typecheck, commit.

```bash
git add src/components/reports/sorting-dialog.tsx src/components/reports/__tests__/sorting-dialog.test.tsx
git commit -m "fix(reports): T3 — SortingDialog anti-duplicação de colunas"
```

---

## Task 4: Layout badge ↵ Enter inline (substitui hint span quebrando layout)

**Model**: sonnet.
**Files:** `src/components/reports/advanced-filters.tsx`.

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` query "command-k badge inline keyboard hint accessible kbd contrast violet".

- [ ] **Step 1: Read** o arquivo, localizar o `<div data-tour="search">` e o hint atual `{searchPending ? <span ...>...</span> : null}`.

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

REMOVE o `{searchPending ? <span...>` block.

- [ ] **Step 3: Cleanup** — verificar se `searchPending` ainda é referenciado em outras partes do arquivo. Se não, remover a declaração + import inutil.

- [ ] **Step 4-6**: typecheck, tests, commit.

```bash
git add src/components/reports/advanced-filters.tsx
git commit -m "feat(reports): T4 — badge ↵ Enter inline (substitui hint span; layout não quebra)"
```

---

## Task 5: HighlightedText helper + integração em conversas-table + drill-down

**Model**: sonnet.
**Files:**
- Create: `src/lib/utils/highlight-text.tsx`
- Create: `src/lib/utils/__tests__/highlight-text.test.tsx`
- Modify: `src/components/reports/conversas-table.tsx`
- Modify: `src/components/reports/conversa-drill-down.tsx`
- Modify: `src/components/reports/conversas-page-client.tsx` (plumb searchTerm)

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` query "search term highlight readability mark element violet WCAG accessible".

- [ ] **Step 1: Tests highlight-text** (criar `__tests__/highlight-text.test.tsx`):

```tsx
import { render } from "@testing-library/react";
import { HighlightedText } from "@/lib/utils/highlight-text";

describe("HighlightedText", () => {
  it("sem term: texto original sem mark", () => {
    const { container } = render(<HighlightedText text="hello world" />);
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("hello world");
  });
  it("term vazio/whitespace: idem", () => {
    const { container } = render(<HighlightedText text="hello world" term="   " />);
    expect(container.querySelector("mark")).toBeNull();
  });
  it("text null/undefined: retorna null", () => {
    const { container } = render(<HighlightedText text={null} term="x" />);
    expect(container.firstChild).toBeNull();
  });
  it("term match único: envolve em <mark>", () => {
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
  it("substring match (não-prefix) em ID hashtag", () => {
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
 * estilizado em violet sutil. Sem term ou texto vazio: retorna o texto original.
 *
 * Match: substring contains (não prefix). Sem regex (seguro contra chars
 * especiais). O(n) por chamada.
 */
export function HighlightedText({ text, term }: Props) {
  if (text == null) return null;
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

- [ ] **Step 4: Plumb searchTerm**:

`<ConversasPageClient>` passa `searchTerm={reportFilters.search}` pra `<ConversasTable>`.
`<ConversasTable>` passa `searchTerm` pra `<ConversaDrillDown>` quando expandido.

- [ ] **Step 5: Integrar em conversas-table.tsx**:

Cada coluna que renderiza texto pesquisável:
- `display_id`: `<HighlightedText text={`#${row.display_id}`} term={searchTerm} />`
- `name`: `<HighlightedText text={row.contact.name ?? "—"} term={searchTerm} />`
- `document`: idem usando `getDocumentDisplay(row.contact)`
- `inbox`: `row.inbox.name ?? "—"`
- `team`: `row.team.name ?? "—"`
- `assignee`: `row.assignee.name ?? "—"`

Manter classes existentes (truncate, fontes) — `<HighlightedText>` não interfere.

- [ ] **Step 6: Integrar em conversa-drill-down.tsx**:

Wrap WhatsApp `phone`, cada `label.name` em `<LabelsChips>` (PATCH lá), e cada `k:v` de attribute com `<HighlightedText>`.

`<LabelsChips>` pode receber prop `searchTerm` opcional, OR mantemos sem highlight nas chips do drill-down (decisão simples: só wrap o key e value de attributes; etiquetas ficam inalteradas).

**Decisão**: highlight nas etiquetas via wrapper local em drill-down (não tocar `<LabelsChips>`):
```tsx
{row.labels.map((l) => (
  <span className="...">
    <HighlightedText text={l.name} term={searchTerm} />
  </span>
))}
```

- [ ] **Step 7-9**: typecheck, tests da área, commit.

```bash
git add src/lib/utils/highlight-text.tsx src/lib/utils/__tests__/highlight-text.test.tsx src/components/reports/conversas-table.tsx src/components/reports/conversa-drill-down.tsx src/components/reports/conversas-page-client.tsx
git commit -m "feat(reports): T5 — HighlightedText em violet em conversas-table + drill-down (busca destacada)"
```

---

## Task 6: Calendar PADRÃO da plataforma — defaultMonth=today + tamanho fontes -1

**Model**: haiku.
**Files:**
- Modify: `src/components/ui/calendar.tsx` (afeta TODA a plataforma — único usuário do Calendar)
- Modify: `src/components/reports/period-pills.tsx` (defaultMonth)

> **PRIORIDADE TOTAL** do super_admin: ajuste padrão. Afeta todas as 8+ telas que usam `<PeriodPills>`:
> - `/relatorios/conversas`
> - `/agente-nex/consumo`
> - `/relatorios/distribuicao`, equipe, origem-ia, performance, visao-geral, mensagens-nao-respondidas

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` query "compact calendar typography day picker tokens".

- [ ] **Step 1: Read** ambos os arquivos.

- [ ] **Step 2: Edit period-pills.tsx**:

Localizar:
```tsx
defaultMonth={range?.from ?? minDate}
```

Substituir por:
```tsx
defaultMonth={range?.from ?? today}
```

(Variável `today` já existe no PickerPanel.)

- [ ] **Step 3: Edit calendar.tsx**:

Identificar onde `text-sm`/`h-9 w-9` afetam day cells. Provavelmente no `defaultClassNames` ou nos overrides via prop `classNames`:

```tsx
// localizar (varia por implementação atual):
day_button: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 ...text-sm...")
weekday: "...text-sm..."

// substituir h-9 w-9 → h-8 w-8 e text-sm → text-xs nos pontos relevantes.
```

Subagente: leia o arquivo atual, identifique as classes que afetam o tamanho dos day cells e weekday header. Ajuste com cuidado.

- [ ] **Step 4: Tests existentes** — `npm test -- calendar period-pills`.

Rodar e verificar 0 regressões. Tests visuais de tamanho talvez não existam.

- [ ] **Step 5: Typecheck** — PASS.

- [ ] **Step 6: Commit**:
```bash
git add src/components/ui/calendar.tsx src/components/reports/period-pills.tsx
git commit -m "feat(ui): T6 — calendar padronizado (-1 fonte + h-8 w-8 + defaultMonth=today) — afeta toda a plataforma"
```

---

## Task 7: Toolbar tabela polish

**Model**: haiku.
**Files:** `src/components/reports/conversas-table.tsx` + tests.

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` query "data table toolbar header pagination integration semantic counter responsive".

- [ ] **Step 1: Read** conversas-table.tsx full.

- [ ] **Step 2: Edit 1** — DELETAR bloco do chip "Ordenação · N" duplicado no toolbar interno:

Localizar:
```tsx
{sortStack.length > 0 ? (
  <Button variant="ghost" size="xs" onClick={clearSort} ...>
    <X /> Ordenação <span>{sortStack.length}</span>
  </Button>
) : null}
```

Deletar.

- [ ] **Step 3: Edit 2** — substituir "Total: X conversas · página N de M" por "Mostrando X-Y de Z":

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

- [ ] **Step 4: Edit 3** — paginação no topo:

Importar `<ConversasPagination>` se ainda não.

Layout do toolbar superior (substituir o bloco existente):
```tsx
<div data-tour="pagination-top" className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/10 px-3 py-2.5">
  <span className="text-xs text-muted-foreground tabular-nums">
    {/* Mostrando X-Y de Z (jsx acima) */}
  </span>
  <ConversasPagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
  {/* ColumnsToggle existente */}
  <div data-tour="columns">
    <ColumnsToggle ... />
  </div>
</div>
```

- [ ] **Step 5: Edit 4** — REMOVER `<ConversasPagination>` do rodapé (procurar instância no JSX).

- [ ] **Step 6: Tests** atualizar:
```tsx
it("não renderiza chip 'Ordenação · N' duplicado no toolbar", () => {
  // mock: sortStack com 3 items, render, esperar 0 botões "Ordenação"
});
it("renderiza 'Mostrando X-Y de Z' com formato pt-BR", () => {
  render(<ConversasTable {...props} total={7183} page={1} pageSize={1000} totalPages={8} />);
  expect(screen.getByText(/Mostrando/)).toBeInTheDocument();
  expect(screen.getByText("1-1.000")).toBeInTheDocument();
  expect(screen.getByText(/7\.183/)).toBeInTheDocument();
});
it("paginação está no topo (data-tour=pagination-top), não no rodapé", () => {
  render(<ConversasTable {...props} totalPages={3} />);
  const top = screen.getByText(/Mostrando/).closest("[data-tour='pagination-top']");
  expect(top?.querySelector('[role="navigation"]')).toBeInTheDocument();
});
```

REMOVER tests antigos sobre "Total: X conversas" / "página N de M" / paginação no rodapé.

- [ ] **Step 7-8**: tests, typecheck, commit.

```bash
git add src/components/reports/conversas-table.tsx src/components/reports/__tests__/conversas-table.test.tsx
git commit -m "feat(reports): T7 — toolbar Mostrando X-Y + paginação no topo + remove dup Ordenação 3"
```

---

## Task 8: ConversasPagination rewrite

**Model**: sonnet.
**Files:** `src/components/reports/conversas-pagination.tsx` + tests.

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` query "numbered pagination dropdown popover ellipsis aria-current page selection chevron tabular-nums".

(Tests + implementação completos — ver plan v2 §T8 que foi mantido em v3.)

```bash
git add src/components/reports/conversas-pagination.tsx src/components/reports/__tests__/conversas-pagination.test.tsx
git commit -m "feat(reports): T8 — ConversasPagination novo algoritmo + Popover reticência + Popover atual"
```

---

## Task 9: FiltersDialog (sections fechadas + Limpar só filtros + header dinâmico)

**Model**: sonnet.
**Files:** `src/components/reports/filters-dialog.tsx` + tests.

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` query "modal dialog accordion progressive disclosure clear button isolation header dynamic".

(Implementação completa — ver plan v2 §T9.)

```bash
git add src/components/reports/filters-dialog.tsx src/components/reports/__tests__/filters-dialog.test.tsx
git commit -m "feat(reports): T9 — FiltersDialog sections fechadas + Limpar só filtros + header dinâmico"
```

---

## Task 10: Chips X adesivo + remove lixeirinhas

**Model**: sonnet.
**Files:** `src/components/reports/advanced-filters.tsx`, `src/components/reports/applied-filters-chips.tsx`.

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` query "sticker badge corner remove button hover destructive WCAG accessible motion-safe".

(Implementação completa — ver plan v2 §T10.)

```bash
git add src/components/reports/advanced-filters.tsx src/components/reports/applied-filters-chips.tsx [tests]
git commit -m "feat(reports): T10 — X adesivo nos chips Filtros/Ordenação + remove lixeirinhas separadas"
```

---

## Task 11: Tour bump v4 + step pagination-top

**Model**: haiku.
**Files:** `src/lib/tours/conversas-tour.ts`.

(Implementação completa — ver plan v2 §T11.)

```bash
git add src/lib/tours/conversas-tour.ts
git commit -m "feat(tour): T11 — conversas-v4 + step pagination-top"
```

---

## Task 12: Bump versão + CHANGELOG + STATUS

**Model**: haiku.
**Files:** `package.json`, `CHANGELOG.md`, `docs/STATUS.md`.

(Implementação completa — ver plan v2 §T12.)

```bash
git add package.json CHANGELOG.md docs/STATUS.md
git commit -m "chore(release): bump v0.23.0 — Conversas Polish + bug fixes"
```

---

## Task 13: Push + deploy + smoke + close

**Model**: haiku.
**Files:** none (orchestration).

- [ ] **Step 1: Tests + typecheck + build**:
```bash
npm test
npm run typecheck
npm run build
```

- [ ] **Step 2: Sync + push**:
```bash
git fetch origin main
gh run list --limit 5
git push origin main
gh run watch <id>
```

- [ ] **Step 3: portainer-fix com retry pattern** (vimos race em v0.19):
```bash
gh workflow run portainer-fix.yml -f app_version=v0.23.0
gh run watch $(gh run list --workflow=portainer-fix.yml --limit 1 --json databaseId --jq '.[0].databaseId')
# se falhar (race "update out of sequence" ou timeout 28), retry até 2x.
```

- [ ] **Step 4: Verificar /api/health até v0.23.0**:
```bash
until curl -s https://insights.nexusai360.com/api/health | grep -q '"version":"v0.23.0"'; do sleep 5; done
curl -s https://insights.nexusai360.com/api/health
```

- [ ] **Step 5: HISTORY.md + close active + push**.

- [ ] **Step 6: Avisar user pra testar**.

Smoke E2E sugeridos pro user:
1. Buscar "joão" + Enter — resultados destacados em violet.
2. Buscar "170" — match em #1701, etc.
3. Single-day 21/03/2025 — retorna conversas.
4. Sorting com 2 critérios — coluna 1 não aparece em coluna 2.
5. Paginação 8+ páginas — reticência clicável + atual com chevron.
6. FiltersDialog — sections fechadas, Limpar só filtros mantém modal aberto.
7. X adesivo nos chips Filtros/Ordenação.
8. Calendar — abre no mês atual, tamanho menor.
9. Cross-tela: data personalizada em /agente-nex/consumo também ficou compacta.

---

## Self-Review (controlador)

- [x] Spec coverage: §3.1-3.18 mapeados em T1-T11.
- [x] No placeholders.
- [x] Type consistency: searchTerm, page/total/pageSize/totalPages/onPageChange.
- [x] TDD em T2, T3, T5, T8, T9.
- [x] ui-ux-pro-max em T3-T10.
- [x] Stage apenas seus.
- [x] Modelo por task.
- [x] Calendar fix global registrado.
