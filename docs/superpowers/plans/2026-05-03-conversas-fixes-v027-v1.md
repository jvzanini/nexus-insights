# Conversas Fixes v0.27.0 — Implementation Plan (v1)

> Fixes de regressões e ajustes específicos reportados pelo João via screenshots após v0.25.0/v0.26.0 LIVE.

**Goal:** 8 fixes em `/relatorios/conversas` corrigindo regressões da v0.25 + bugs descobertos.

**Architecture:** revert pageSize/paginação para estado pré-v0.25; refator do input search (lupa-roxa + X canto); REMOVE heurística `isPhoneOrDocLike` (match agora é estritamente substring contígua); revisita estilos do X chips Filtros/Ordenação; corrige cursor calendário; renomeia "Chatwoot" → "Nexus Chat"; reordena tour; estabiliza larguras de colunas da tabela.

**Tech Stack:** Next.js 16 · React 19 · TypeScript · Tailwind v4 · base-ui.

---

## §1. Fixes (8 itens)

### F1. Paginação volta a 1000 (era 100)
- `src/components/reports/conversas-page-client.tsx:66`: `PAGE_SIZE_CLIENT = 100` → `1000`.

### F2. Reticências na paginação (volta algoritmo v0.23)
- `src/components/reports/conversas-pagination.tsx`:
  - `buildPageItems` retorna `Array<number | "ellipsis">`:
    - 0: `[]`
    - 1: `[1]`
    - 2-4: todas
    - 5+ atual=1 ou N: `[1, "ellipsis", N]`
    - 5+ atual no meio: `[1, "ellipsis", page, "ellipsis", N]`
  - Restaurar `<EllipsisDropdown>` + `rangeToPages` (deletados em T6 da v0.25).
  - Render trata branch `it === "ellipsis"`.

### F3. Input busca: lupa roxa quando ativa + X no canto direito + sem tag "Filtrando"
- `src/components/reports/advanced-filters.tsx:392-422`:
  - Remove `<span>Filtrando</span>` (lines 417-421).
  - `<Search>` ícone ganha className condicional: `text-muted-foreground` (idle) / `text-violet-500` (search ativa).
  - Adiciona `<button>` com `<X>` no `right-2 top-1/2`, visível APENAS quando `searchClient.trim() !== ""`. Click chama `onSearchClientChange("")`.
  - Input `pr-9` (espaço pro X) quando busca ativa, `pr-3` idle.
  - Tooltip do X: "Limpar busca".

### F4. Match: REMOVE heurística `isPhoneOrDocLike` (busca respeita ordem dos caracteres)
- `src/lib/reports/match-search-client.ts`:
  - Deleta `isPhoneOrDocLike` + `useDigitsMatch` + bloco `hayDigits.includes(needleDigits)`.
  - `matchSearchClient` vira: `rows.filter((row) => buildHaystack(row).includes(needle))`.
  - Tests atualizados:
    - REMOVE: `"11 98765-4321"` matches `+55 (11) 98765-4321` (não bate mais — diferente máscara).
    - MANTÉM: `"5511987654321"` (digits raw já está no haystack via `phoneVariants`), `"98765-4321"` (substring contígua do `formatPhone` output), `"070.415.111-11"` (formatted CPF está no haystack via `documentVariants`).
    - ADICIONA: `"3380"` em haystack com `"3803"` retorna 0 (regressão fixada).

### F5. X dos chips Filtros/Ordenação volta ao estilo v0.23 (fosco)
- `src/components/reports/advanced-filters.tsx:478, 506`:
  - Substituir className atual (h-5 + bg-destructive vivo + ring + scale) por:
    - Idle: `h-5 w-5 cursor-pointer rounded-full border border-destructive/40 bg-destructive/15 text-destructive shadow-sm transition-colors`
    - Hover: `hover:bg-destructive/25 hover:border-destructive/60 hover:text-destructive`
    - Sem `scale-110`, sem `text-white`, sem `ring-2`.
  - Tamanho mantém h-5 (não volta ao h-4 antigo — só estilo muda).

### F6. Cursor pointer no Calendar (DayButton)
- `src/components/ui/calendar.tsx:213`:
  - `CalendarDayButton` className adiciona `cursor-pointer aria-disabled:cursor-not-allowed`.
  - Afeta TODOS os calendários da plataforma (period-pills, dashboards, etc.).

### F7. Tabela com larguras estáveis (sem lag ao rolar)
- `src/components/reports/conversas-table.tsx`:
  - `<Table>` ganha `style={{ tableLayout: "fixed" }}`.
  - Cada coluna recebe `width` explícito via `style` (não só `min-w-`):
    - `expand`: 40px
    - `display_id`: 80px
    - `name`: 220px
    - `document`: 160px
    - `inbox`: 140px
    - `team`: 140px
    - `assignee`: 140px
    - `status`: 120px
    - `priority`: 120px
    - `waiting_seconds`: 160px
    - `open_seconds`: 170px
    - `created_at`: 160px
    - `last_activity_at`: 180px
  - `<colgroup>` no topo do Table com `<col style={{ width: ... }}>` por coluna visível.
  - Headers e cells perdem `min-w-` (substituído por `colgroup`).
  - Texto truncado via `truncate` continua igual.

### F8. Tour: reordena steps + renomeia "Chatwoot" → "Nexus Chat"
- `src/lib/tours/conversas-tour.ts`:
  - Bump `id: "conversas-v4"` → `"conversas-v5"`.
  - Reordena steps:
    1. period
    2. search
    3. filters-chip
    4. sorting-chip
    5. atalhos
    6. **presets** (era 7 — vem ANTES do export)
    7. **export** (era 6 — vem DEPOIS do presets)
    8. columns
    9. pagination-top
    10. table
    11. drill-down
    12. open-action — title: `"Abrir conversa no Nexus Chat"` (era "Abrir no Chatwoot"); description: `"Clique no número da conversa (#) para abrir direto no Nexus Chat, em uma nova aba."`
    13. refresh

### F9. Renomear "Chatwoot" → "Nexus Chat" em UI user-facing
- `src/components/reports/conversas-table.tsx:184-185`:
  - `title={\`Abrir conversa #${displayId} no Nexus Chat\`}` (era "Chatwoot").
  - `aria-label={\`Abrir conversa #${displayId} no Nexus Chat\`}` (era "Chatwoot").
- (Auditar: comentários de código referenciando Chatwoot internamente continuam — só UI muda.)

---

## §2. File Structure

| Arquivo | Mudança |
|---|---|
| `src/components/reports/conversas-page-client.tsx` | F1: PAGE_SIZE_CLIENT 100→1000. |
| `src/components/reports/conversas-pagination.tsx` | F2: algoritmo `\|"ellipsis"`; restaura `<EllipsisDropdown>` + `rangeToPages`. |
| `src/components/reports/__tests__/conversas-pagination.test.tsx` | F2: atualiza tests. |
| `src/components/reports/advanced-filters.tsx` | F3 + F5: input search refator + X chips estilo fosco. |
| `src/components/reports/__tests__/advanced-filters-x-style.test.tsx` | F5: atualiza expectativas (sem hover:bg-destructive sólido). |
| `src/components/reports/__tests__/advanced-filters-search.test.tsx` | F3: atualiza tests (lupa cor + X visível + tag removida). |
| `src/lib/reports/match-search-client.ts` | F4: remove isPhoneOrDocLike + useDigitsMatch. |
| `src/lib/reports/__tests__/match-search-client.test.ts` | F4: atualiza casos. |
| `src/components/ui/calendar.tsx` | F6: cursor-pointer no DayButton. |
| `src/components/reports/conversas-table.tsx` | F7: tableLayout fixed + colgroup + larguras explícitas. F9: renomeia Chatwoot→Nexus Chat. |
| `src/lib/tours/conversas-tour.ts` | F8: reordena + bump id v4→v5 + renomeia. |
| `package.json` | Bump 0.25.0 → 0.27.0. |
| `CHANGELOG.md` | Entrada v0.27.0. |
| `docs/STATUS.md` | Release v0.27.0 no topo. |

---

## §3. Tasks

### Task 1: F1 — Paginação volta a 1000

- [ ] Edit `conversas-page-client.tsx:66`: `PAGE_SIZE_CLIENT = 1000`.
- [ ] typecheck.
- [ ] Commit `feat(conversas): T1 v0.27 — pageSize client 100→1000`.

### Task 2: F2 — Reticências (volta algoritmo v0.23)

- [ ] Atualiza tests em `conversas-pagination.test.tsx`:
  ```ts
  expect(buildPageItems(1, 8)).toEqual([1, "ellipsis", 8]);
  expect(buildPageItems(8, 8)).toEqual([1, "ellipsis", 8]);
  expect(buildPageItems(5, 8)).toEqual([1, "ellipsis", 5, "ellipsis", 8]);
  ```
- [ ] Restaura `buildPageItems` retornando `Array<number | "ellipsis">`:
  ```ts
  export function buildPageItems(page, totalPages): Array<number | "ellipsis"> {
    if (totalPages <= 0) return [];
    if (totalPages === 1) return [1];
    if (totalPages === 2) return [1, 2];
    if (totalPages === 3) return [1, 2, 3];
    if (totalPages === 4) return [1, 2, 3, 4];
    if (page === 1 || page === totalPages) return [1, "ellipsis", totalPages];
    return [1, "ellipsis", page, "ellipsis", totalPages];
  }
  ```
- [ ] Restaura `<EllipsisDropdown>` (cópia da v0.23 — botão `…` que abre Popover com range de páginas):
  ```tsx
  function EllipsisDropdown({ pages, onSelect }) {
    const [open, setOpen] = useState(false);
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={(props) => (
          <button {...props} type="button" aria-label="Selecionar página"
            className="inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-md border border-border/50 px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40">…</button>
        )} />
        <PopoverContent className="w-32 p-1">
          <ul role="list" className="max-h-64 overflow-y-auto">
            {pages.map((p) => (
              <li key={p}>
                <button type="button" onClick={() => { onSelect(p); setOpen(false); }}
                  className="flex w-full cursor-pointer items-center justify-center rounded-md px-2 py-1.5 text-sm tabular-nums hover:bg-muted">{p}</button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    );
  }
  function rangeToPages(start, end) { const out = []; for (let i = start; i <= end; i++) out.push(i); return out; }
  ```
- [ ] Render trata `it === "ellipsis"` com `<EllipsisDropdown>` (range entre vizinhos: edge → `[2..N-1]`; meio → `[2..page-1]` esquerda, `[page+1..N-1]` direita).
- [ ] typecheck + tests verde.
- [ ] Commit `feat(conversas): T2 v0.27 — paginação volta com reticências (algoritmo v0.23)`.

### Task 3: F3 — Input busca refator (lupa roxa + X canto + sem tag)

**Pré:** Invocar `ui-ux-pro-max:ui-ux-pro-max` skill.

- [ ] Tests novos em `advanced-filters-search.test.tsx`:
  ```tsx
  it("ícone lupa fica violet quando searchClient ativa", () => {
    const { container } = render(<AdvancedFilters {...baseProps} searchClient="abc" onSearchClientChange={() => {}} />);
    const icon = container.querySelector("[data-search-icon]");
    expect(icon?.className).toMatch(/text-violet-500/);
  });
  it("X de limpar busca aparece quando search ativa e está no canto direito", () => {
    render(<AdvancedFilters {...baseProps} searchClient="abc" onSearchClientChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Limpar busca/i })).toBeInTheDocument();
  });
  it("X clicado limpa busca", () => {
    const onSearchClientChange = jest.fn();
    render(<AdvancedFilters {...baseProps} searchClient="abc" onSearchClientChange={onSearchClientChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Limpar busca/i }));
    expect(onSearchClientChange).toHaveBeenCalledWith("");
  });
  it("não renderiza tag 'Filtrando' (removida v0.27)", () => {
    render(<AdvancedFilters {...baseProps} searchClient="abc" onSearchClientChange={() => {}} />);
    expect(screen.queryByText(/Filtrando/i)).toBeNull();
  });
  ```
- [ ] Edit `advanced-filters.tsx` (lines 392-422) — substitui o JSX completo do search:
  ```tsx
  <div data-tour="search" className="relative w-full max-w-[320px] min-w-[200px] sm:flex-none">
    <Search
      data-search-icon
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
- [ ] typecheck + tests.
- [ ] Commit `feat(conversas): T3 v0.27 — input busca lupa roxa + X canto direito (remove tag Filtrando)`.

### Task 4: F4 — Match respeita ordem dos caracteres (REMOVE digits-only)

- [ ] Tests atualizados em `match-search-client.test.ts`:
  ```ts
  it("3380 NÃO bate em '3803' (caracteres iguais ordem diferente)", () => {
    const r = { ...baseRow, display_id: 3803 };
    expect(matchSearchClient([r], "3380")).toHaveLength(0);
  });
  // REMOVE casos que dependiam de digits-only:
  //  - "11 98765-4321" não bate "+55 (11) 98765-4321" (parênteses no meio)
  it("phone bate quando substring contígua ('98765-4321' bate '+55 (11) 98765-4321')", () => {
    expect(matchSearchClient([baseRow], "98765-4321")).toHaveLength(1);
  });
  it("phone digits puros batem (raw está no haystack)", () => {
    expect(matchSearchClient([baseRow], "5511987654321")).toHaveLength(1);
  });
  ```
- [ ] Remove `isPhoneOrDocLike` + `useDigitsMatch` + `needleDigits` + bloco `hayDigits.includes(...)`.
- [ ] `matchSearchClient` simplificado:
  ```ts
  export function matchSearchClient(rows, search) {
    const trimmed = (search ?? "").trim();
    if (!trimmed) return rows;
    const needle = normalize(trimmed);
    return rows.filter((row) => buildHaystack(row).includes(needle));
  }
  ```
- [ ] tests verde.
- [ ] Commit `feat(conversas): T4 v0.27 — match respeita ordem dos caracteres (remove heurística digits-only)`.

### Task 5: F5 — X chips Filtros/Ordenação volta ao estilo fosco

**Pré:** Invocar `ui-ux-pro-max:ui-ux-pro-max` skill (consistência com style guide v0.23).

- [ ] Tests atualizados em `advanced-filters-x-style.test.tsx`:
  ```tsx
  expect(cls).toMatch(/h-5 w-5/);                   // tamanho mantém
  expect(cls).toMatch(/bg-destructive\/15/);        // bg fosco idle
  expect(cls).toMatch(/text-destructive/);          // X vermelho mais vivo
  expect(cls).toMatch(/border-destructive\/40/);
  expect(cls).not.toMatch(/hover:bg-destructive(?!\/)/); // não tem destructive sólido
  expect(cls).not.toMatch(/hover:text-white/);
  expect(cls).not.toMatch(/hover:ring-2/);
  expect(cls).not.toMatch(/hover:scale-110/);
  ```
- [ ] Edit lines 478 e 506 — substituir className do `<button>` X (ambos os chips):
  ```tsx
  className="absolute -right-1.5 -top-1.5 z-10 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-destructive/40 bg-destructive/15 text-destructive shadow-sm transition-colors hover:bg-destructive/25 hover:border-destructive/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
  ```
  E `<X className="h-3 w-3" />` mantém.
- [ ] typecheck + tests.
- [ ] Commit `feat(conversas): T5 v0.27 — X chips Filtros/Ordenação volta ao estilo fosco (v0.23)`.

### Task 6: F6 — Cursor pointer no Calendar DayButton

- [ ] Edit `src/components/ui/calendar.tsx:213` — className do `<Button>` no `CalendarDayButton`:
  ```tsx
  className={cn(
    "cursor-pointer aria-disabled:cursor-not-allowed",
    "relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size)...",
    defaultClassNames.day,
    className
  )}
  ```
- [ ] (Não há test específico — visual; testes existentes do calendar continuam.)
- [ ] typecheck.
- [ ] Commit `feat(ui): T6 v0.27 — Calendar DayButton ganha cursor-pointer (afeta todos calendários)`.

### Task 7: F7 — Tabela com larguras estáveis (table-layout fixed)

**Pré:** Invocar `ui-ux-pro-max:ui-ux-pro-max` skill.

- [ ] Edit `conversas-table.tsx` adicionando `<colgroup>` antes do `<TableHeader>`:
  ```tsx
  <Table style={{ tableLayout: "fixed" }}>
    <colgroup>
      {orderedColumns.map((col) => (
        <col key={col.key} style={{ width: COLUMN_WIDTHS[col.key] }} />
      ))}
    </colgroup>
    <TableHeader>...
  ```
- [ ] Adiciona constante `COLUMN_WIDTHS`:
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
- [ ] Remove `min-w-` dos className das colunas (substituído por colgroup).
- [ ] Adiciona test smoke verificando que `<table>` tem `tableLayout: fixed`.
- [ ] typecheck + tests.
- [ ] Commit `feat(conversas): T7 v0.27 — tabela com larguras fixas (table-layout fixed + colgroup)`.

### Task 8: F8 + F9 — Tour reordena + renomeia "Chatwoot" → "Nexus Chat"

- [ ] Edit `src/lib/tours/conversas-tour.ts`:
  - `id: "conversas-v5"` (era v4).
  - Reordenar steps: presets (6) ↔ export (7).
  - `id: "open-action"` title: `"Abrir conversa no Nexus Chat"`; description ajustada.
- [ ] Edit `src/components/reports/conversas-table.tsx:184-185`:
  - `title` e `aria-label` ambos com "Nexus Chat".
- [ ] typecheck + (test do tour não existe; smoke manual visual).
- [ ] Commit `feat(conversas): T8 v0.27 — tour reordena + 'Chatwoot' → 'Nexus Chat' (UI user-facing)`.

### Task 9: Release v0.27.0

- [ ] Bump `package.json` 0.25.0 → 0.27.0 (pula 0.26 do agente paralelo).
- [ ] CHANGELOG entry.
- [ ] STATUS.md update.
- [ ] typecheck full.
- [ ] Commit release.
- [ ] Push origin main.
- [ ] Trigger portainer-fix com `--field app_version=v0.27.0`.
- [ ] curl /api/health até `version=v0.27.0`.

---

## §4. Edge Cases

- F2 (paginação): EllipsisDropdown range — esquerda mostra `[2..page-1]`, direita `[page+1..N-1]`. Quando edge (atual=1 ou N), ellipsis está no meio único e mostra `[2..N-1]`.
- F4 (match): "5511987654321" bate porque digits-raw está no haystack via phoneVariants. "98765-4321" bate porque é substring contígua do formatPhone. "11 98765-4321" NÃO bate mais "+55 (11) 98765-4321" — comportamento aceitável (parens entre).
- F7 (table-layout fixed): textos longos vão truncar (já tem `truncate` nas cells). Verificar visual em telas pequenas (< 1024px).

---

## §5. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| F4 quebra busca de telefones com máscara arbitrária | Baixa | João explicitou que match deve respeitar ordem; documentado em CHANGELOG. |
| F7 textos longos vazam | Média | `truncate` + `title` HTML já existem nas cells; verificar visual. |
| F8 tour bumpa id — usuários veem v5 mesmo já tendo visto v4 | Baixa | Padrão do projeto (cada release toca tour bumpa id). |

---

## §6. Self-Review v1

- [ ] F1-F9 cobertos com task dedicada?
- [ ] TDD em F2, F3, F4, F5?
- [ ] ui-ux-pro-max invocada em F3, F5, F7?
- [ ] CHANGELOG + STATUS atualizados em T9?
- [ ] Renomear "Chatwoot" → "Nexus Chat" só em UI user-facing (não em comentários internos / cache keys / paths)?
