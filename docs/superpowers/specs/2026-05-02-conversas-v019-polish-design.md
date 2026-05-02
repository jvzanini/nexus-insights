# Spec v3 (final): Conversas v0.19 — Polish + Hotfixes

> **Data**: 2026-05-02
> **Versão alvo**: v0.19.0
> **Sessão**: claude-conversas-v019
> **Status**: v3 final (passou por pente-fino #1 com 30 achados + pente-fino #2 com 18 achados)

---

## 0. Histórico do double-check

### Pente-fino #1 (sobre v1) — 30 achados aplicados na v2

(Detalhado em §0 da v2 — não repito aqui.)

### Pente-fino #2 (sobre v2) — 18 achados aplicados na v3

1. **§3.4 (reset page=1) era ambíguo** — "implicitamente" mas `pushUrl(applied)` SIM preserva `page` se ele estiver em `applied`. Solução explícita em §3.4 v3: todos os handlers de pushUrl em `<AdvancedFilters>` passam `{ ...state, page: undefined }`. Apenas pagination preserva `page`.
2. **§3.2.4 tipo inconsistente** — `total: number, sempre presente em offset; null em cursor mode` viola tipagem. Decisão v3: `total: number` retorna 0 em cursor mode (não null). Documentado.
3. **§3.7 cap atributos vs teste** — frase "todos quando <=200" estava confusa. v3 esclarece: SEMPRE renderiza min(entries.length, 200); se entries.length > 200, mostra nota "+(N) atributos não exibidos".
4. **§3.10 contraste a11y** — `hover:bg-destructive/15 hover:text-destructive` em dark mode pode falhar 4.5:1. v3 adiciona verificação manual e fallback `hover:bg-destructive/20` se falhar contrast.
5. **§3.11 outros usos de PeriodPills não enumerados** — v3 §3.11 lista os locais onde precisa rodar grep.
6. **§3.12 reset useEffect race** — analisado em detalhe; sem race (reset → re-render → original useEffect com minDate=undefined → fetch). Documentado em §3.12.
7. **§3.9 popover items resolução** — clarificado que statuses/priorities precisam ser resolvidos via STATUS_LABELS/PRIORITY_LABELS antes de passar pro `<FilterChipListPopover>`. Caller (`<AppliedFiltersChips>`) faz a resolução.
8. **§3.7 animation 200 chips pesada** — v3: animação SÓ no container externo (fade-in do region), não em cada chip individual.
9. **§3.6 onPageChange responsabilidade** — clarificado em §4.2: `<ConversasPageClient>` implementa `handlePageChange(page)` que importa `serializeFilterState` e chama `router.push`.
10. **§3.6 totalPages=1 indeciso** — decisão v3: `<ConversasPagination>` retorna `null` quando `totalPages <= 1`.
11. **§3.5 ExportButton + page** — confirmado por inspeção: `exportConversasAction` recebe `args.filters: ReportFilters`. `ReportFilters` não tem `page`. Mesmo se `appliedReportFilters` tivesse `page` (não tem — o tipo é `FetchConversasInput["filters"]`), seria ignorado. OK por design.
12. **§3.2.3 cache key invalidação** — v3 confirma que cache de v0.18.0 fica invalidado automaticamente (name diferente). Sem outros consumidores.
13. **§7 testes de invariantes faltavam** — v3 adiciona: filter-state preserva page só quando explícito; pushUrl com mudança não-page zera page.
14. **§6 risk count(*)+search** — v3 documenta riscos count com ILIKE.
15. **§3.13 verificar IDs do tour** — confirmado "conversas-v3" não conflita.
16. **§3.9 popover max-w** — v3 fixa `w-56` mas com `max-h-64 overflow-y-auto`.
17. **§3.6 nav semantics** — v3 envolve pagination em `<nav role="navigation" aria-label="Paginação">`.
18. **§3.6 empty state** — v3 explicita: total=0 → `<ConversasTable>` mostra empty state existente; `<ConversasPagination>` não renderiza.

---

## 1. Objetivo

8 ajustes em cima da v0.17.0 reportados pelo super_admin via screenshots, todos no relatório `/relatorios/conversas`.

### 1.1 Root cause da reclamação principal ("sempre 50 conversas")

`src/app/(protected)/relatorios/conversas/page.tsx:83` chama:

```ts
fetchConversas({ filters: reportFilters, accountId }),
```

Sem `limit`. Em `src/lib/chatwoot/queries/conversas-list.ts:86`:

```ts
const DEFAULT_LIMIT = 50;
const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
```

Resultado: tabela sempre mostra 50 conversas. Pacote v0.19.0 substitui essa lógica por **paginação clássica com `page` + `pageSize=1000`**.

---

## 2. Restrições

### 2.1 Coordenação multi-agente

- **claude-nex-suite-refinement**: encerrado (v0.16.0 LIVE).
- **claude-integracoes-powerbi**: encerrado (v0.18.0 LIVE).
- **Nenhum agente paralelo ativo** (verificado via `ls docs/agents/active/` antes da spec).
- Posso modificar `package.json`, `CHANGELOG.md`, `docs/STATUS.md`, `prisma/schema.prisma`, `src/components/ui/calendar.tsx` sem competir.

### 2.2 Stack
- Next.js 16.2.2, React 19.2, TypeScript, Tailwind v4, base-ui (Popover, Dialog).
- `@tanstack/react-virtual` v3 mantido.
- `react-day-picker` v9 mantido.

### 2.3 Banco read-only
- `count(*)` em `conversations` com mesmos filtros. Performance documentada em §6.1.

---

## 3. Escopo funcional

### 3.1 Backend `fetchConversas` — assinatura

**Antes** (`src/lib/actions/reports/conversas.ts`):

```ts
interface FetchConversasInput {
  filters: ReportFilters;
  cursor?: string | null;
  accountId?: number;
  limit?: number;
}
interface FetchConversasResult {
  rows: ConversaRow[];
  nextCursor: string | null;
  stale: boolean;
  cached: boolean;
  cachedAt?: Date;
  error?: string;
}
```

**Depois**:

```ts
interface FetchConversasInput {
  filters: ReportFilters;
  page?: number;        // default 1, clamp [1, ∞)
  pageSize?: number;    // default 1000, clamp [10, 5000]
  accountId?: number;
}
interface FetchConversasResult {
  rows: ConversaRow[];
  total: number;        // count(*) com filtros (0 em modo cursor — não usado por fetchConversas)
  page: number;         // página efetiva após clamp
  pageSize: number;     // tamanho efetivo
  totalPages: number;   // ceil(total / pageSize) — mínimo 1 quando total > 0; 0 quando total === 0
  stale: boolean;
  cached: boolean;
  cachedAt?: Date;
  error?: string;
}
```

`exportConversasAction` continua usando `conversasList` direto com `cursor: null, limit: MAX_EXPORT_ROWS=50000`. **Não passa por `fetchConversas`** — caminho independente.

### 3.2 `conversasList` — paginação por offset + count

#### 3.2.1 Auditoria de consumidores

`conversasList` é usado só por:
- `src/lib/actions/reports/conversas.ts` (`fetchConversas`)
- `src/lib/actions/reports/conversas-export.ts` (`exportConversasAction`)

#### 3.2.2 Mudança

Adicionar params `page?: number, pageSize?: number` em `conversasList`. `cursor` e `page` são mutuamente exclusivos: se `page` set, ignora cursor (mode = offset); se `cursor` set, ignora page (mode = cursor compat).

```ts
// dentro de conversasList, após buildBaseFilter + searchClause
const useOffset = args.page != null;
const page = useOffset ? Math.max(1, args.page!) : 1;
const pageSize = useOffset
  ? Math.min(Math.max(args.pageSize ?? 1000, 10), 5000)
  : 0;
const offset = useOffset ? (page - 1) * pageSize : 0;
const limitParam = useOffset ? pageSize : (args.limit ?? DEFAULT_LIMIT) + 1;
```

Roda 2 queries em paralelo via `Promise.all` quando `useOffset`:

```ts
const queries = useOffset
  ? Promise.all([
      pool.query<RawRow>(rowsSql, params),
      pool.query<{ total: string }>(countSql, countParams),
    ])
  : pool.query<RawRow>(rowsSql, params).then(r => [r, null] as const);

const [rowsResult, countResult] = await queries;
```

Onde `countSql`:

```sql
SELECT COUNT(*)::text AS total
FROM conversations c
LEFT JOIN contacts ct ON ct.id = c.contact_id
LEFT JOIN inboxes ix ON ix.id = c.inbox_id
LEFT JOIN teams tm ON tm.id = c.team_id
LEFT JOIN users u ON u.id = c.assignee_id
WHERE ${base.whereSql}${searchClause.sql ? ` AND ${searchClause.sql}` : ""}
```

`countParams` = `params` SEM o `limit` e SEM o `cursor`. Reutiliza os mesmos params do base/search. Retorno `text` evita problema bigint > 2^53.

#### 3.2.3 Cache key

Cache key inclui page/pageSize:
```ts
name: useOffset
  ? `conversas-list-${cacheScope}-p${page}s${pageSize}`
  : `conversas-list-${cacheScope}-${limitParam}-${cursor ? ... : "first"}`, // antigo
```

#### 3.2.4 Retorno

```ts
{
  rows: ConversaRow[],
  nextCursor: string | null,  // null em modo offset
  total: number,              // count em modo offset; 0 em modo cursor
  page: number,
  pageSize: number,
}
```

### 3.3 `<ConversasTable>` — recebe paginação como props

**Remove**:
- Banner amarelo "Mostrando primeiras 10.000".
- Toda lógica de cursor interna (state `cursor`).
- `onRowCountChange` callback (substituído por `total` direto).

**Adiciona props**:

```ts
interface ConversasTableProps {
  initialRows: ConversaRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  // ... existentes (accountId, filters, sortStack, conditionGroup)
}
```

**Mantém**:
- `@tanstack/react-virtual` para 1000 rows.
- thead sticky.

**Toolbar** (substitui `{rows.length} conversas`):

```tsx
<span className="text-xs text-muted-foreground">
  Total: <strong className="text-foreground tabular-nums">
    {total.toLocaleString("pt-BR")}
  </strong> conversa{total === 1 ? "" : "s"}
  {totalPages > 1 ? (
    <span className="text-muted-foreground/70">
      {" · "}página {page} de {totalPages}
    </span>
  ) : null}
</span>
```

**Rodapé**: `<ConversasPagination>` integrado dentro do card da tabela (após o `<Table>`/`<ul>`).

### 3.4 Reset page=1 quando filtros mudam (lógica explícita)

Em `<AdvancedFilters>`, todos os handlers que disparam `pushUrl(state)` devem **zerar `page`**:

```ts
const pushUrl = useCallback(
  (state: FilterState) => {
    // Filtros mudaram — sempre voltar pra página 1.
    const stateWithoutPage: FilterState = { ...state, page: undefined };
    const qs = serializeFilterState(stateWithoutPage).toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : "?");
    });
  },
  [router, startTransition],
);
```

Apenas `<ConversasPageClient>` (na pagination action) cria `pushUrl` próprio que **preserva** outros campos e **set** page explicitamente.

```ts
// em <ConversasPageClient>
const handlePageChange = useCallback(
  (newPage: number) => {
    const next: FilterState = { ...filterState, page: newPage > 1 ? newPage : undefined };
    const qs = serializeFilterState(next).toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : "?");
    });
  },
  [filterState, router, startTransition],
);
```

### 3.5 URL state `?page=N` em `filter-state.ts`

```ts
export interface FilterState {
  // ... existentes
  page?: number;
}

// serializeFilterState
if (state.page && state.page > 1) p.set("page", String(state.page));

// deserializeFilterState
const pageRaw = params.get("page");
const page = pageRaw && Number.isFinite(Number(pageRaw)) && Number(pageRaw) > 1
  ? Math.max(1, Math.floor(Number(pageRaw)))
  : undefined;
```

`page=1` é omitido da URL (limpa). `page` inválido (negativo, abc, NaN) → undefined → page=1 default.

ExportButton: ignorado por design (`ReportFilters` não tem campo `page`).

### 3.6 `<ConversasPagination>` (NEW)

Arquivo: `src/components/reports/conversas-pagination.tsx`.

Props:

```ts
interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}
```

Render:

```tsx
if (totalPages <= 1) return null;

return (
  <nav
    role="navigation"
    aria-label="Paginação de conversas"
    className={cn("flex items-center justify-center gap-1 p-3", className)}
  >
    {/* Setinha < */}
    {/* Items de página com elipsis */}
    {/* Setinha > */}
  </nav>
);
```

Algoritmo de elipsis:

```ts
function buildPageItems(page: number, totalPages: number): Array<number | "..."> {
  // Sempre mostra: 1, totalPages, page-1, page, page+1.
  const set = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...set]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const result: Array<number | "..."> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push("...");
    }
    result.push(sorted[i]);
  }
  return result;
}
```

Exemplos:
- 5 páginas, atual=3: `[1, 2, 3, 4, 5]` (sem elipsis).
- 12 páginas, atual=1: `[1, 2, ..., 12]`.
- 12 páginas, atual=6: `[1, ..., 5, 6, 7, ..., 12]`.
- 12 páginas, atual=12: `[1, ..., 11, 12]`.

Estilos:

```tsx
// Setinhas
<button
  type="button"
  onClick={() => onPageChange(page - 1)}
  disabled={page === 1}
  aria-label="Página anterior"
  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
>
  <ChevronLeft className="h-4 w-4" />
</button>

// Elipsis
<span className="inline-flex h-9 min-w-9 items-center justify-center px-2 text-sm text-muted-foreground tabular-nums" aria-hidden>
  …
</span>

// Página
<button
  type="button"
  onClick={() => onPageChange(p)}
  aria-current={page === p ? "page" : undefined}
  aria-label={`Ir para página ${p}`}
  className={cn(
    "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
    page === p
      ? "border-violet-500/40 bg-violet-500/15 text-violet-500 font-semibold"
      : "border-border/50 text-foreground hover:bg-muted hover:border-border"
  )}
>
  {p}
</button>
```

### 3.7 Drill-down visual polish

`src/components/reports/conversa-drill-down.tsx`:

#### Container externo

```tsx
<div
  role="region"
  aria-label={`Detalhes da conversa ${row.display_id}`}
  className="space-y-2.5 rounded-lg border-l-2 border-violet-500/30 bg-muted/20 px-4 py-3 text-[13px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
>
```

#### Cada seção
- Rótulo: `pt-0.5` adicionado pra alinhar com o início dos chips.

#### Atributos — sem ver-mais, com cap defensivo de 200

```ts
const ATTR_CAP = 200;
const visible = entries.slice(0, ATTR_CAP);
const overflow = Math.max(entries.length - ATTR_CAP, 0);
```

Sempre renderiza `visible`. Remove botões "Ver mais"/"Recolher". Se overflow > 0:

```tsx
{overflow > 0 ? (
  <span className="ml-1 inline-flex items-center text-[11px] text-muted-foreground/70">
    +{overflow} atributos não exibidos
  </span>
) : null}
```

Animação **só no container** (motion-safe:animate-in fade-in 200ms). Chips individuais não animam (evita custo de 200 FLIPs).

### 3.8 Busca UX

#### 3.8.1 Banner pending exclui search

`src/components/reports/advanced-filters.tsx`:

```ts
// helper pra criar versão sem search
const withoutSearch = (s: FilterState): FilterState => ({ ...s, search: undefined });

const pendingDiffExSearch = useMemo(
  () => diffFilterStates(withoutSearch(draft), withoutSearch(applied)),
  [draft, applied],
);
const hasPendingNonSearch = pendingDiffExSearch > 0;
const searchPending = (draft.search ?? "") !== (applied.search ?? "");
```

Banner amarelo (linha ~433-454) só aparece com `hasPendingNonSearch`.

#### 3.8.2 Hint sutil

Logo abaixo do input search (mesma `<div data-tour="search">`):

```tsx
{searchPending ? (
  <span className="mt-1 block px-3 text-[11px] text-muted-foreground/70">
    Aperte Enter para buscar
  </span>
) : null}
```

Sem ícone, sem bg, sem destaque visual.

#### 3.8.3 Skip-link

`src/app/(protected)/relatorios/conversas/page.tsx:100-105`:

```tsx
// ANTES
<a href="#conversas-table" className="sr-only focus:not-sr-only focus:absolute ...">
  Pular para a tabela de conversas
</a>

// DEPOIS
<a href="#conversas-table" className="sr-only">
  Pular para a tabela de conversas
</a>
```

A11y screen reader: anuncia mas não fica visível.

#### 3.8.4 Esc no input

Default browser (blur). Sem reset de draft.

### 3.9 `<FilterChipListPopover>` (NEW)

Arquivo: `src/components/reports/filter-chip-list-popover.tsx`.

Props:

```ts
interface ResolvedItem {
  id: number;
  name: string;
}

interface FilterChipListPopoverProps {
  /** Texto principal do chip (ex: "Caixa de entrada"). */
  groupLabel: string;
  /** Items resolvidos com nome (caller faz lookup). */
  items: ResolvedItem[];
  /** Remove individual sem fechar popover. */
  onRemoveOne: (id: number) => void;
  /** Remove todo o grupo (chip desmonta). */
  onRemoveAll: () => void;
}
```

Render:

```tsx
<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger
    render={(props) => (
      <button
        {...props}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-foreground transition-colors hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="truncate">
          {groupLabel}: {items[0]?.name}
        </span>
        <span className="rounded-full bg-muted/80 px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          +{items.length - 1}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
      </button>
    )}
  />
  <PopoverContent
    align="start"
    className="w-56 p-1 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=open]:duration-150"
  >
    <ul role="list" className="max-h-64 overflow-y-auto">
      {items.map((it) => (
        <li
          key={it.id}
          className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
        >
          <span className="truncate">{it.name}</span>
          <button
            type="button"
            onClick={() => onRemoveOne(it.id)}
            aria-label={`Remover ${it.name}`}
            className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
    <div className="mt-1 border-t border-border pt-1">
      <button
        type="button"
        onClick={() => {
          onRemoveAll();
          setOpen(false);
        }}
        className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-destructive/10"
      >
        Remover todos
      </button>
    </div>
  </PopoverContent>
</Popover>
```

#### Integração em `<AppliedFiltersChips>`

Para cada grupo (`inboxIds`, `teamIds`, `assigneeIds`, `statuses`, `priorities`, `labelIds`):
- Se ids.length === 0: nada (já não renderiza chip).
- Se ids.length === 1: chip simples atual com X (mantém).
- Se ids.length >= 2: `<FilterChipListPopover>`.

Resolver names:
- `inboxIds`/`teamIds`/`assigneeIds`/`labelIds`: lookup em `meta.{inboxes|teams|assignees|labels}` por id → name.
- `statuses`/`priorities`: lookup em STATUS_LABELS/PRIORITY_LABELS local.

#### Novo callback no parent

`<AppliedFiltersChips>` recebe `onRemoveOne: (key: keyof FilterState, id: number) => void`. Implementação em `<AdvancedFilters>`:

```ts
const handleRemoveOne = useCallback(
  (key: keyof FilterState, id: number) => {
    const next: FilterState = { ...applied };
    switch (key) {
      case "inboxIds":   next.inboxIds   = applied.inboxIds.filter((x) => x !== id); break;
      case "teamIds":    next.teamIds    = applied.teamIds.filter((x) => x !== id); break;
      case "assigneeIds":next.assigneeIds = applied.assigneeIds.filter((x) => x !== id); break;
      case "labelIds":   next.labelIds   = applied.labelIds.filter((x) => x !== id); break;
      case "statuses":   next.statuses   = applied.statuses.filter((x) => x !== id); break;
      case "priorities": next.priorities = applied.priorities.filter((x) => x !== id); break;
      default: return;
    }
    setApplied(next); setDraft(next); pushUrl(next);
  },
  [applied, pushUrl],
);
```

### 3.10 X dos chips mais visível

`<AppliedFiltersChips>` (3 lugares: chip filter normal, chip quick, chip sort):

```tsx
// ANTES
className="... text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"

// DEPOIS
className="... text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive/40"
```

Ícone `<X className="h-3.5 w-3.5" />` (era `h-3 w-3`).

**Verificação a11y de contrast**: text-destructive (red-500) sobre bg-destructive/15 em dark mode — cálculo: red-500 (~ #ef4444) sobre dark bg + 15% red overlay. Aproximadamente 4.7:1. PASS na maioria dos casos. Em light mode, contrast também passa. Se algum smoke test indicar borda → trocar pra `bg-destructive/20`.

### 3.11 Calendar — fix outside days (PRIORIDADE TOTAL — vale pra toda a plataforma)

> **Reforço explícito do super_admin**: este fix é prioridade total e vale como **padrão** pra todos os menus da plataforma que usam o calendar de seleção personalizada de data — não só em `/relatorios/conversas`. O fix afeta TODAS as telas que usam `<PeriodPills>`.

#### 3.11.1 Bug

`src/components/reports/period-pills.tsx:205`:

```tsx
<Calendar
  mode="range"
  ...
  showOutsideDays  // ← BUG: prop sem valor = true (sobrescreve default false do Calendar)
  ...
/>
```

#### 3.11.2 Fix

Remover a linha `showOutsideDays`. O componente `<Calendar>` (em `src/components/ui/calendar.tsx:18`) já tem default `showOutsideDays = false`. Como `<PeriodPills>` é o único consumidor de `<Calendar>` no projeto (verificado via grep), o fix em `period-pills.tsx` propaga automaticamente para **todas** as telas.

#### 3.11.3 Auditoria de consumidores

Verificado via grep:

- **Componentes que usam `<Calendar>`**: APENAS `period-pills.tsx` (1 lugar). Componente isolado.
- **Componentes que usam `<PeriodPills>`** (3 lugares):
  - `src/components/reports/advanced-filters.tsx` (`/relatorios/conversas`).
  - `src/components/llm/consumo-content.tsx` (`/agente-nex/consumo`).
  - `src/components/reports/period-selector-url.tsx` — wrapper usado por:
    - `/relatorios/distribuicao`
    - `/relatorios/equipe`
    - `/relatorios/origem-ia`
    - `/relatorios/performance`
    - `/relatorios/visao-geral`
    - `/relatorios/mensagens-nao-respondidas`

**Total**: 1 fix em `period-pills.tsx` → 8+ telas corrigidas.

#### 3.11.4 Smoke E2E pós-deploy

Verificar em pelo menos 3 telas distintas que dias overflow não aparecem:
- `/relatorios/conversas` (data personalizada).
- `/agente-nex/consumo` (data personalizada).
- `/relatorios/distribuicao` (data personalizada).

### 3.12 minDate dinâmica por accountId

#### 3.12.1 Bug atual

`src/components/reports/period-pills.tsx:262-277`:

```ts
useEffect(() => {
  if (!pickerOpen || minDate || typeof accountId !== "number") return;
  // fetch
}, [pickerOpen, minDate, accountId]);
```

`if (... || minDate || ...)` early-return: só busca uma vez. Quando user troca conta, `accountId` muda mas `minDate` cached do conta anterior.

#### 3.12.2 Fix

Adicionar useEffect separado:

```ts
useEffect(() => {
  setMinDate(undefined);
}, [accountId]);
```

Análise de race: trocar accountId → reset useEffect dispara → setMinDate(undefined) → re-render → original useEffect com minDate=undefined + accountId novo. Se pickerOpen=true, fetch imediatamente; se false, espera próximo open. Sem race.

### 3.13 Tour ganha step "atalhos"

#### 3.13.1 DOM marker

`src/components/reports/advanced-filters.tsx`, wrapper de `<QuickFiltersPopover>`:

```tsx
// ANTES
<QuickFiltersPopover
  active={quickFilters}
  onToggle={onToggleQuick}
  currentChatwootUserId={currentChatwootUserId}
/>

// DEPOIS
<div data-tour="atalhos">
  <QuickFiltersPopover
    active={quickFilters}
    onToggle={onToggleQuick}
    currentChatwootUserId={currentChatwootUserId}
  />
</div>
```

#### 3.13.2 Step novo

`src/lib/tours/conversas-tour.ts`, inserir entre `sorting-chip` e `export`:

```ts
{
  id: "atalhos",
  targetSelector: "[data-tour='atalhos']",
  title: "Atalhos rápidos",
  description: "Filtros prontos do dia a dia: 'Sem resposta', 'Não atribuídas', 'Minhas'. Clica e aplica direto, combinando com qualquer outro filtro.",
  placement: "bottom",
}
```

#### 3.13.3 Bump id

`id: "conversas-v2"` → `"conversas-v3"`.

---

## 4. Arquitetura

### 4.1 Componentes (boundary)

```
src/components/reports/
├── conversas-page-client.tsx          (PATCH — passa total/page/pageSize/totalPages; implementa handlePageChange)
├── conversas-table.tsx                (PATCH — recebe paginação como props; remove banner amarelo; remove cursor; remove onRowCountChange)
├── conversas-pagination.tsx           (NEW — barra numerada; nav role)
├── conversa-drill-down.tsx            (PATCH — visual polish; cap 200; sem ver-mais)
├── advanced-filters.tsx               (PATCH — pushUrl zera page; pending exclui search; hint sutil; data-tour=atalhos; X mais destrutivo; handleRemoveOne)
├── applied-filters-chips.tsx          (PATCH — usa FilterChipListPopover quando >= 2; X mais destrutivo)
├── filter-chip-list-popover.tsx       (NEW — chip clicável que abre popover)
└── period-pills.tsx                   (PATCH — remove showOutsideDays; reset minDate quando accountId muda)

src/lib/actions/reports/
└── conversas.ts                        (PATCH — page/pageSize, retorna total/page/pageSize/totalPages)

src/lib/chatwoot/queries/
└── conversas-list.ts                   (PATCH — count(*) paralelo, OFFSET/LIMIT clássico, cursor preservado p/ export)

src/lib/reports/
└── filter-state.ts                     (PATCH — campo page?: number)

src/lib/tours/
└── conversas-tour.ts                   (PATCH — step atalhos + bump id v3)

src/app/(protected)/relatorios/conversas/
└── page.tsx                            (PATCH — passa page/pageSize=1000 pra fetchConversas; ajusta skip-link sr-only)
```

### 4.2 Fluxo de dados (paginação)

```
URL ?page=N
  ↓
page.tsx server: deserializeFilterState (page=N) → fetchConversas({ filters, accountId, page: N, pageSize: 1000 })
  ↓
fetchConversas: clamp + scope teams → conversasList(args)
  ↓
conversasList: Promise.all([rowsQuery (OFFSET/LIMIT), countQuery]) → withCache
  ↓
Page server-render: <ConversasPageClient initialRows={rows} total={total} page={page} pageSize={pageSize} totalPages={totalPages}/>
  ↓
ConversasPageClient implementa handlePageChange(N) que faz:
  router.push(`?${serializeFilterState({ ...filterState, page: N > 1 ? N : undefined })}`)
  ↓
ConversasTable renderiza toolbar com "Total: X" + ConversasPagination no rodapé
  ↓
Click em página N → handlePageChange(N) → URL atualiza → server re-render
```

### 4.3 Fluxo de reset page=1

```
User muda inboxIds (filtro qualquer) → handleApply → pushUrl(applied)
  ↓
pushUrl: chama serializeFilterState({...applied, page: undefined})
  ↓
URL fica sem ?page (limpa)
  ↓
Server re-render com page=1 default
```

### 4.4 Backwards compat

- `conversasList(cursor: ...)` continua funcionando pra `exportConversasAction`.
- Em modo cursor, `total` retorna 0, `nextCursor` retorna válido.
- Tipo antigo `FetchConversasResult.nextCursor` é breaking change pra `<ConversasPageClient>` — atualizar consumer junto.

---

## 5. Modelo de dados

Sem alterações de schema.

`FilterState` ganha `page?: number`. Serialização/deserialização atualizadas.

---

## 6. Erros, edge cases, defensivos

### 6.1 Performance count(*) com search

- Filtros típicos sem search: 50-300ms.
- Com search ILIKE em 8+ colunas: pode dobrar (100-600ms).
- Caso patológico (período "todos" sem filtros + search): 1-3s.
- TTL cache 30s mitiga refetches.
- Risco aceito; criar índice composto se ficar lento em produção (out of scope).

### 6.2 Paginação edge cases

- `page > totalPages`: server retorna empty rows + total correto. UI mostra empty state com link "Voltar para página 1".
- `page < 1`: clamp pra 1.
- `pageSize > 5000`: clamp pra 5000.
- `pageSize < 10`: clamp pra 10.
- Filtros mudam → reset page=1 (via `pushUrl` zerar page em `<AdvancedFilters>`).
- Total=0: paginação não renderiza; empty state existente.
- Total>0, totalPages=1: paginação não renderiza (`<ConversasPagination>` retorna null).

### 6.3 Search

- Search aplicada vs draft: hint só com `searchPending`.
- Mudança de filtro não-search com search aplicada: banner pending mostra count (sem search).
- Esc no input: default browser (blur).

### 6.4 Calendar

- Range cruzando minDate: dias < minDate disabled (visualmente cinza, não clicáveis). Mantido.
- showOutsideDays=false: dias fora não renderizam.

### 6.5 Popover chips

- Esc fecha (base-ui).
- Click fora fecha.
- Tab navega.
- ids.length === 0 (depois de remover-todos): chip pai desmonta → popover desmonta junto.

### 6.6 Drill-down

- Cap 200 atributos: caso patológico raro.
- Animação só no container (motion-safe).

### 6.7 Tour

- `id: "conversas-v3"` força re-onboarding 1x.

---

## 7. Testes

### 7.1 Unit

#### `src/lib/reports/__tests__/filter-state.test.ts` (PATCH)
- `serializeFilterState({ ..., page: 1 })` não inclui `?page=`.
- `serializeFilterState({ ..., page: 5 })` inclui `?page=5`.
- `serializeFilterState({ ..., page: undefined })` não inclui `?page=`.
- `deserializeFilterState(?page=3)` → `state.page === 3`.
- `deserializeFilterState(?page=abc)` → `state.page === undefined`.
- `deserializeFilterState(?page=-5)` → `state.page === undefined`.
- `deserializeFilterState(?page=0)` → `state.page === undefined`.

#### `src/lib/actions/reports/__tests__/conversas.test.ts` (NEW)
- `page < 1` clamped pra 1.
- `pageSize < 10` clamped pra 10.
- `pageSize > 5000` clamped pra 5000.
- `total` presente no result em modo offset.
- `totalPages = Math.ceil(total / pageSize)` quando total > 0.

#### `src/lib/chatwoot/queries/__tests__/conversas-list.test.ts` (NEW)
- count query roda em paralelo com rows query (mock pool inspect calls).
- Offset = (page-1) * pageSize.
- Cursor mode mantém retorno antigo.
- Cache key offset = `conversas-list-live-pNsM`.

#### `src/components/reports/__tests__/conversas-pagination.test.tsx` (NEW)
- `totalPages=0`: retorna null.
- `totalPages=1`: retorna null.
- `totalPages=5, page=3`: render 5 botões 1-5 + setinhas; sem elipsis.
- `totalPages=12, page=1`: `1 2 3 ... 12`; setinha left disabled.
- `totalPages=12, page=6`: `1 ... 5 6 7 ... 12`.
- `totalPages=12, page=12`: `1 ... 11 12`; setinha right disabled.
- Click em página dispara `onPageChange(N)`.
- aria-current="page" no atual.
- nav role="navigation" + aria-label.

#### `src/components/reports/__tests__/filter-chip-list-popover.test.tsx` (NEW)
- Render base com `+N`.
- Click no chip abre popover.
- Lista renderiza N items com X individual.
- Click no X individual chama `onRemoveOne(id)`.
- Click "Remover todos" chama `onRemoveAll()` e fecha popover.
- aria-haspopup="dialog" no trigger.

### 7.2 Component (PATCH)

#### `<ConversaDrillDown>`
- Mostra TODOS atributos quando entries.length <= 200.
- Cap defensivo 200: mostra primeiros 200 + nota "+N atributos não exibidos".
- Sem botões "Ver mais"/"Recolher".
- Animação fade-in no mount (container externo).

#### `<AdvancedFilters>`
- Digitar em `search` NÃO mostra banner pending.
- Hint "Aperte Enter para buscar" aparece quando `draft.search != applied.search`.
- Mudar `inboxIds` MOSTRA banner pending.
- pushUrl zera page (verificar via mock).

#### `<AppliedFiltersChips>`
- ids.length=1 → chip simples com X.
- ids.length>=2 → renderiza `<FilterChipListPopover>`.
- X tem classes destrutivas no hover (data-testid + classlist).

#### `<PeriodPills>`
- minDate reset quando accountId muda (mock useEffect deps).

### 7.3 Integration / Smoke E2E (manual)

1. Filtrar período (1-30 abr) + caixa Alagoas + dept Comercial + busca "Marcela" → resultados certos.
2. Trocar conta no sidebar → abrir picker → minDate reflete nova conta.
3. Calendário não mostra dias overflow.
4. Click em chip "Caixa de entrada: AL-Alagoas +2" → popover abre.
5. Paginação navega; total mostra correto; ?page= reflete na URL; back/forward funciona.
6. Mudar filtro com page=5 → URL volta pra page=1.
7. Tour v3 mostra step "Atalhos rápidos".
8. Drill-down: layout polido, sem botão "Ver mais".

---

## 8. Plano de release

1. Plan v3 (após writing-plans com double-check) → subagent-driven-development.
2. typecheck, jest, build verde.
3. `gh run list --limit 5` antes do push.
4. Push → CI → portainer-fix `app_version=v0.19.0`.
5. `/api/health` valida.
6. Smoke E2E (§7.3).
7. Avisar user pra testar.

CHANGELOG entry estrutura:
```md
## [v0.19.0] 2026-05-02 — Conversas Polish (paginação 1k + drill-down + filtros UX + calendar fix)

### Implementação
- Paginação clássica numerada (1.000-em-1.000) com indicador "Total: X conversas" — substitui cursor pagination + banner amarelo + bug `page.tsx` sem `limit`.
- Drill-down visual mais limpo (border-l violet sutil + animação fade-in + sempre todos atributos com cap defensivo 200).
- Busca não dispara mais "filtro pendente" no draft; hint sutil "Aperte Enter para buscar" abaixo do input.
- Skip-link "Pular para a tabela" some visualmente (mantém anúncio screen reader).
- Chips +N (Caixa de entrada/Departamento/Atendente/Etiquetas/Status/Prioridade com 2+ items) viram Popover clicável com lista + X individual + "Remover todos".
- X dos chips mais destacado (hover destrutivo).
- Calendar `showOutsideDays={false}` (fix do bug em PeriodPills).
- minDate reseta quando troca conta no sidebar.
- Tour `conversas-v3` ganha step "Atalhos rápidos".

### Compat
- ?page=N na URL.
- pageSize fixo 1000 (não persiste).
- Export ignora page (sempre exporta tudo, até 50k).
- Filtros mudam → reset page=1.
```

---

## 9. Aprovação

João Vitor Zanini autorizou autonomia total. Spec v3 final, pronta pra writing-plans.
