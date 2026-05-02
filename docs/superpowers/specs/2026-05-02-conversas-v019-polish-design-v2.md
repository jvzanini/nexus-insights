# Spec v2: Conversas v0.19 — Polish + Hotfixes

> **Data**: 2026-05-02
> **Versão alvo**: v0.19.0
> **Sessão**: claude-conversas-v019
> **Status**: v2 (passou por pente-fino #1; passa por pente-fino #2 antes de v3)

---

## 0. Pente-fino #1 — Achados aplicados

Análise crítica sobre a v1 identificou 30 achados reais. Cada um endereçado abaixo:

1. **Root cause das 50 conversas não estava explícito**: `page.tsx:83` chama `fetchConversas({ filters: reportFilters, accountId })` sem `limit`, então cai em `DEFAULT_LIMIT=50` em `conversas-list.ts:86`. Adicionado em §1.1.
2. **Tipagem do `fetchConversas` incompleta na v1**: detalhada em §3.1 com input/output tipados.
3. **Auditoria de consumidores de `conversasList`**: §3.2 lista todos os consumidores e impacto.
4. **Cache key precisa incluir `page` e `pageSize`**: §3.2.
5. **count(*) performance**: documentado riscos em §6.1 com TTL específico.
6. **Reset page=1 quando filtros mudam**: §3.4 detalhado.
7. **URL state ?page=N**: §3.5 explícito.
8. **Algoritmo elipsis em `<ConversasPagination>`**: §3.6 detalhado.
9. **"Borda esquerda violeta sutil" tokens vagos**: §3.7 com classes Tailwind exatas.
10. **Drill-down sem cap pode renderizar 1000 atributos**: §3.7 mantém cap defensivo de 200 com fallback "+N atributos não exibidos".
11. **Busca pending lógica explícita**: §3.8 com `pendingDiffExSearch`.
12. **Skip-link fix concreto**: §3.8 — trocar `focus:not-sr-only` por `sr-only` puro.
13. **Chips +N popover detalhado**: §3.9 com aria-haspopup, callbacks, animation.
14. **X mais visível: tokens específicos**: §3.10.
15. **Calendar fix tem implicações em outros usuários do `<PeriodPills>`**: §3.11 lista todos os pontos.
16. **minDate dinâmica: bug do useEffect detalhado**: §3.12.
17. **Tour: precisa de `data-tour="atalhos"` no DOM**: §3.13 explícito.
18. **Tour bump de id pra `conversas-v3`**: §3.13.
19. **Coordenação multi-agente**: §2.1 adicionada (zero agentes ativos no momento, mas registrado).
20. **Testes específicos enumerados**: §6 reescrito com cenários precisos.
21. **YAGNI**: cada item é direto pedido do user, mantido tudo.
22. **Risk assessment**: §6.1.
23. **Edge case 1000 atributos**: §3.7 cap defensivo de 200.
24. **Cursor backwards-compat em `conversasList`**: §3.2 — cursor opcional mantido (passa null em `fetchConversas`, ignorado se page > 1).
25. **Search Esc behavior**: §3.8 documentado.
26. **ExportButton continua exportando TUDO**: §3.5 confirmado (export ignora page).
27. **Test fixtures novas pra paginação**: §6.
28. **CHANGELOG entry estrutura**: §7.
29. **pageSize não persiste**: §3.5 registrado.
30. **Animação entre páginas**: §3.6 — sem animação por simplicidade (apenas loading overlay).

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

Por isso a tabela mostra sempre 50 conversas (independente do período/filtros). A v0.17.0 entregou virtualização e paginação visual removida assumindo que o backend traria 10k, mas o caller esqueceu de passar `limit`. Bug crítico — pacote v0.19.0 substitui essa lógica por **paginação clássica com `page` + `pageSize`**.

---

## 2. Restrições

### 2.1 Coordenação multi-agente

- **claude-nex-suite-refinement**: encerrado (v0.16.0 LIVE).
- **claude-integracoes-powerbi**: encerrado (v0.18.0 LIVE).
- **Nenhum agente paralelo ativo** (verificado via `ls docs/agents/active/` antes desta spec).
- Posso modificar `package.json`, `CHANGELOG.md`, `docs/STATUS.md`, `prisma/schema.prisma`, `src/components/ui/calendar.tsx` sem competir.

### 2.2 Stack
- Next.js 16.2.2, React 19.2, TypeScript, Tailwind v4, base-ui (Popover, Dialog).
- `@tanstack/react-virtual` v3 mantido.
- `react-day-picker` v9 mantido.

### 2.3 Banco read-only
- `count(*)` adicional em `conversations` com filtros já existentes. Performance: O(N) sem índices específicos (ver §6.1).

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
  total: number;        // count(*) com filtros
  page: number;         // página realmente retornada (após clamp)
  pageSize: number;     // tamanho efetivo
  totalPages: number;   // ceil(total / pageSize)
  stale: boolean;
  cached: boolean;
  cachedAt?: Date;
  error?: string;
}
```

`exportConversasAction` continua chamando `conversasList` direto com `cursor: null, limit: MAX_EXPORT_ROWS=50000` — **não usa** a nova interface paginada (export quer tudo de uma vez).

### 3.2 `conversasList` — paginação por offset + count

#### 3.2.1 Auditoria de consumidores

Atualmente `buildBaseFilter` é usado por 12 queries; mas `conversasList` em si é usado só por:
- `src/lib/actions/reports/conversas.ts` (fetchConversas)
- `src/lib/actions/reports/conversas-export.ts` (exportConversasAction)

Sem outros consumidores. Mudança segura.

#### 3.2.2 Mudança

Adicionar params `page?: number, pageSize?: number` em `conversasList`. Quando `page` está definido (>= 1), usa OFFSET/LIMIT clássico; quando `cursor` está definido, mantém cursor (compat com export). Os dois são mutuamente exclusivos.

```ts
// dentro de conversasList, após buildBaseFilter + searchClause
const page = Math.max(1, args.page ?? 1);
const pageSize = Math.min(Math.max(args.pageSize ?? 1000, 10), 5000);
const useOffset = args.cursor == null && args.page != null;
const offset = useOffset ? (page - 1) * pageSize : 0;
const limitParam = useOffset ? pageSize : (args.limit ?? DEFAULT_LIMIT) + 1;
```

E roda **2 queries em paralelo via Promise.all**:

```ts
const [rowsResult, countResult] = await Promise.all([
  pool.query<RawRow>(rowsSql, params),
  useOffset ? pool.query<{ total: string }>(countSql, params) : Promise.resolve({ rows: [{ total: "0" }] }),
]);
```

Onde `countSql` é:

```sql
SELECT COUNT(*)::text AS total
FROM conversations c
LEFT JOIN contacts ct ON ct.id = c.contact_id
LEFT JOIN inboxes ix ON ix.id = c.inbox_id
LEFT JOIN teams tm ON tm.id = c.team_id
LEFT JOIN users u ON u.id = c.assignee_id
WHERE ${base.whereSql}${searchClause.sql ? ` AND ${searchClause.sql}` : ""}
```

(Retorna `text` pra evitar problemas com bigint > 2^53.)

#### 3.2.3 Cache key

Atualizar `name` do cache pra incluir page/pageSize:
```ts
name: `conversas-list-${cacheScope}-p${page}s${pageSize}`,
```

(quando offset mode; cursor mode mantém o nome anterior.)

#### 3.2.4 Retorno

```ts
{
  rows: ConversaRow[],
  nextCursor: string | null,  // sempre null em modo offset
  total: number,              // novo, sempre presente em offset; null em cursor mode
  page: number,
  pageSize: number,
}
```

### 3.3 `<ConversasTable>` — recebe paginação como props

**Remove**:
- Banner amarelo "Mostrando primeiras 10.000 — refine os filtros".
- Toda lógica de cursor interna (state `cursor`).

**Adiciona props**:

```ts
interface ConversasTableProps {
  initialRows: ConversaRow[];
  total: number;             // novo
  page: number;              // novo
  pageSize: number;          // novo
  totalPages: number;        // novo
  onPageChange: (page: number) => void; // novo — atualiza URL
  // ... existentes
}
```

**Mantém**:
- `@tanstack/react-virtual` para 1000 rows (ainda exige virtualização pra performance).
- thead sticky.
- `onRowCountChange` removido (substituído por `total` no toolbar).

**Toolbar**:
- Substitui `{rows.length} conversas` por:

```tsx
<span>
  Total: <strong className="text-foreground tabular-nums">
    {total.toLocaleString("pt-BR")}
  </strong> conversa{total === 1 ? "" : "s"}
  {totalPages > 1 ? (
    <span className="text-muted-foreground/70">
      {" "}· página {page} de {totalPages}
    </span>
  ) : null}
</span>
```

### 3.4 Reset page=1 quando filtros mudam

`<ConversasPageClient>` adiciona `useEffect` que monitora mudanças em `reportFilters` (qualquer campo) + `sortStack` + `quickFilters` + `conditionGroup`:

```ts
useEffect(() => {
  // Quando filtros/ordenação mudam, volta pra página 1.
  // Não dispara no mount inicial (evita loop com initial page=1).
  if (currentPage !== 1) {
    onPageChange(1);
  }
}, [/* hash dos filtros */]);
```

Solução pragmática: em vez de `useEffect` complexo, simplesmente **a URL não inclui ?page** quando filtros mudam. `pushUrl(state)` em `<AdvancedFilters>` já reset implicitamente porque não preserva `?page`.

### 3.5 URL state `?page=N`

`filter-state.ts` ganha campo `page?: number` (default 1, omitido se 1):

```ts
serializeFilterState: if (state.page && state.page > 1) p.set("page", String(state.page));
deserializeFilterState: const page = Number(params.get("page")) || 1;
```

`page.tsx` lê `?page=` e passa pra `fetchConversas({ filters, accountId, page, pageSize: 1000 })`.

Click em página → `pushUrl({ ...applied, page: N })`.

`pageSize` **não** persiste em URL nem localStorage (fixo 1000).

ExportButton continua usando `appliedReportFilters` mas `exportConversasAction` ignora page — exporta tudo até MAX_EXPORT_ROWS=50000.

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

Layout (centralizado):
```
[<]  1  2  3  4  5  …  12  [>]
```

Algoritmo de elipsis (clássico):
- Sempre mostra primeira (1) e última (totalPages).
- Mostra atual ± 2.
- Insere "…" onde houver gap > 1.
- Total de itens visíveis: max ~9 (1 + ... + 5 + ... + last).

Exemplos:
- 5 páginas, atual=3: `[<] 1 2 3 4 5 [>]` (sem elipsis; cabe tudo).
- 12 páginas, atual=1: `[<] 1 2 3 … 12 [>]`.
- 12 páginas, atual=6: `[<] 1 … 4 5 6 7 8 … 12 [>]`.
- 12 páginas, atual=12: `[<] 1 … 10 11 12 [>]`.

Estilos:
- Cada botão: `h-9 min-w-9 px-3 rounded-md border border-border/50 text-sm tabular-nums`.
- Atual: `bg-violet-500/15 border-violet-500/40 text-violet-500 font-semibold` + `aria-current="page"`.
- Disabled (setinhas em primeira/última): `opacity-40 cursor-not-allowed`.
- Hover (não atual): `hover:bg-muted hover:border-border`.
- Foco visível: `focus-visible:ring-2 focus-visible:ring-violet-500/40`.

Animação entre páginas: nenhuma (overlay de loading existente cuida do feedback).

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

Mudanças:
- `border-l-2 border-violet-500/30` (marker discreto).
- `bg-muted/20` (era `/30`).
- `space-y-2.5` (era `space-y-2`).
- `motion-safe:animate-in motion-safe:fade-in` no mount.

#### Cada seção
- Rótulo: classes mantidas mas com `pt-0.5` pra alinhar com o início dos chips.

#### Atributos — sempre todos visíveis (mas com cap defensivo)
- Remover `ATTRS_PER_PAGE = 24`, remover botões "Ver mais"/"Recolher".
- **Cap defensivo**: 200 atributos. Se passar disso, mostra primeiros 200 + nota `+N atributos não exibidos` em texto pequeno (caso patológico).
- Cada chip: `border border-border/40 bg-card/80 text-[12px] px-2 py-1`.

### 3.8 Busca UX

#### 3.8.1 Banner pending exclui search

`src/components/reports/advanced-filters.tsx`:

```ts
const pendingDiffExSearch = useMemo(
  () => diffFilterStates(
    { ...draft, search: undefined },
    { ...applied, search: undefined },
  ),
  [draft, applied],
);
const hasPendingNonSearch = pendingDiffExSearch > 0;
const searchPending = (draft.search ?? "") !== (applied.search ?? "");
```

Banner amarelo (linha 433-454 do arquivo) só aparece quando `hasPendingNonSearch`.

#### 3.8.2 Hint sutil

Logo abaixo do input search, dentro do mesmo wrapper `data-tour="search"`:

```tsx
{searchPending ? (
  <span className="mt-1 block px-3 text-[11px] text-muted-foreground/70">
    Aperte Enter para buscar
  </span>
) : null}
```

Sem ícone, sem bg, sem botão.

#### 3.8.3 Skip-link bug

`src/app/(protected)/relatorios/conversas/page.tsx:100-105`:

```tsx
// ANTES
<a
  href="#conversas-table"
  className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
>
  Pular para a tabela de conversas
</a>

// DEPOIS — mantém pra screen reader, esconde visualmente
<a href="#conversas-table" className="sr-only">
  Pular para a tabela de conversas
</a>
```

A11y mantida (anunciado por screen reader); usuário não vê banner.

#### 3.8.4 Esc behavior

`onKeyDown` do input: Esc apenas blur (default do `<input type="search">` no browser). Sem reset de draft. Decisão registrada.

### 3.9 `<FilterChipListPopover>` (NEW)

Arquivo: `src/components/reports/filter-chip-list-popover.tsx`.

Props:

```ts
interface Item {
  id: number;
  name: string;
}

interface Props {
  groupKey: string;
  groupLabel: string;
  items: Item[];        // já resolvidos com nome
  onRemoveOne: (id: number) => void;
  onRemoveAll: () => void;
}
```

Comportamento:

- Render base: `<button>` com formato `{groupLabel}: {items[0].name} +{items.length - 1}` quando `items.length >= 2`.
- `aria-haspopup="dialog"` + `aria-expanded={open}`.
- `<Popover>` (base-ui) abre ao click; conteúdo:
  ```tsx
  <PopoverContent className="w-56 p-1" align="start">
    <ul role="list" className="max-h-64 overflow-y-auto">
      {items.map((it) => (
        <li key={it.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
          <span className="truncate">{it.name}</span>
          <button
            type="button"
            onClick={() => onRemoveOne(it.id)}
            aria-label={`Remover ${it.name}`}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </li>
      ))}
    </ul>
    <div className="mt-1 border-t border-border pt-1">
      <button
        type="button"
        onClick={() => { onRemoveAll(); /* popover fecha automaticamente porque o trigger desmonta */ }}
        className="w-full rounded-md px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
      >
        Remover todos
      </button>
    </div>
  </PopoverContent>
  ```
- Esc fecha (default base-ui). Click fora fecha (default). Animation: `data-state=open:animate-in data-state=open:fade-in data-state=open:zoom-in-95 data-state=open:duration-150`.
- Click no X individual: `onRemoveOne(id)` mas **não fecha** popover.
- Quando `items.length === 1` após remoção, ainda dentro do popover, ele fica aberto até user clicar fora.
- Quando `items.length === 0`, o chip pai desmonta (renderiza null) e popover desmonta junto.

#### Integração em `<AppliedFiltersChips>`

Para grupos com `ids.length >= 2`, renderiza `<FilterChipListPopover>` em vez de chip simples. Para `ids.length === 1`, mantém chip simples (atual).

Para `labelIds`, mesmo padrão (popover lista as N etiquetas com nomes).

#### Novo callback no parent

`<AppliedFiltersChips>` recebe `onRemoveOne: (key: keyof FilterState, id: number) => void`. Implementação em `<AdvancedFilters>`:

```ts
const handleRemoveOne = (key, id) => {
  const next: FilterState = { ...applied };
  switch (key) {
    case "inboxIds":   next.inboxIds   = applied.inboxIds.filter((x) => x !== id); break;
    case "teamIds":    next.teamIds    = applied.teamIds.filter((x) => x !== id); break;
    case "assigneeIds":next.assigneeIds = applied.assigneeIds.filter((x) => x !== id); break;
    case "labelIds":   next.labelIds   = applied.labelIds.filter((x) => x !== id); break;
    // statuses e priorities: também number[]
    case "statuses":   next.statuses   = applied.statuses.filter((x) => x !== id); break;
    case "priorities": next.priorities = applied.priorities.filter((x) => x !== id); break;
    default: return;
  }
  setApplied(next); setDraft(next); pushUrl(next);
};
```

### 3.10 X dos chips mais visível

`<AppliedFiltersChips>` linha 200-207 (botão X dentro do chip):

```tsx
// ANTES
className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

// DEPOIS
className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
```

Ícone: `<X className="h-3.5 w-3.5" />` (era `h-3 w-3`).

Idem aos chips de quick e sort.

### 3.11 Calendar — fix outside days

#### 3.11.1 Bug

`src/components/reports/period-pills.tsx:205`:

```tsx
<Calendar
  mode="range"
  selected={range}
  onSelect={setRange}
  locale={ptBR}
  numberOfMonths={isMobile ? 1 : 2}
  defaultMonth={range?.from ?? minDate}
  showOutsideDays  // ← BUG: prop sem valor = true; sobrescreve default false
  disabled={disabledMatcher}
  startMonth={minDate}
  endMonth={today}
/>
```

#### 3.11.2 Fix

Remover a linha `showOutsideDays` (deixa default `false` do componente).

#### 3.11.3 Implicações em outros usos do `<PeriodPills>`

Verificar via grep:
```bash
grep -rln "<PeriodPills" src
```

Se `<PeriodPills>` já é usado em outros relatórios, todos vão se beneficiar do fix automaticamente (não há prop pública pra showOutsideDays no `<PeriodPills>`).

### 3.12 minDate dinâmica por accountId

#### 3.12.1 Bug atual

`src/components/reports/period-pills.tsx:262-277`:

```ts
useEffect(() => {
  if (!pickerOpen || minDate || typeof accountId !== "number") return;
  // ... fetch
}, [pickerOpen, minDate, accountId]);
```

O `if (... || minDate || ...)` early-return garante que **só busca uma vez**. Quando o user troca conta no sidebar, `accountId` muda, mas `minDate` está cached do conta anterior — não re-fetch.

#### 3.12.2 Fix

Adicionar useEffect separado pra reset:

```ts
// Reset minDate quando accountId muda (próximo abrir do picker re-fetch).
useEffect(() => {
  setMinDate(undefined);
}, [accountId]);
```

### 3.13 Tour ganha step "atalhos"

#### 3.13.1 DOM precisa de marcador

`src/components/reports/advanced-filters.tsx` — wrapper do `<QuickFiltersPopover>`:

```tsx
// ANTES
<QuickFiltersPopover ... />

// DEPOIS
<div data-tour="atalhos">
  <QuickFiltersPopover ... />
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

`id: "conversas-v2"` → `"conversas-v3"` (re-onboarding 1x).

---

## 4. Arquitetura

### 4.1 Componentes (boundary)

```
src/components/reports/
├── conversas-page-client.tsx          (PATCH — passa page; total/page/pageSize/onPageChange)
├── conversas-table.tsx                (PATCH — recebe total/page; remove banner amarelo + cursor)
├── conversas-pagination.tsx           (NEW — barra numerada)
├── conversa-drill-down.tsx            (PATCH — visual polish; remove ver-mais; cap defensivo 200)
├── advanced-filters.tsx               (PATCH — pending exclui search; hint sutil; data-tour=atalhos)
├── applied-filters-chips.tsx          (PATCH — usa FilterChipListPopover quando >= 2; X mais destrutivo)
├── filter-chip-list-popover.tsx       (NEW — chip clicável que abre popover)
└── period-pills.tsx                   (PATCH — remove showOutsideDays; reset minDate quando accountId muda)

src/lib/actions/reports/
└── conversas.ts                        (PATCH — page/pageSize, retorna total/totalPages)

src/lib/chatwoot/queries/
└── conversas-list.ts                   (PATCH — count(*) paralelo, OFFSET/LIMIT clássico, cursor opcional preservado)

src/lib/reports/
└── filter-state.ts                     (PATCH — campo page?: number)

src/lib/tours/
└── conversas-tour.ts                   (PATCH — step atalhos + bump id v3)

src/app/(protected)/relatorios/conversas/
└── page.tsx                            (PATCH — lê ?page=, passa pageSize=1000, ajusta skip-link sr-only)
```

### 4.2 Fluxo de dados (paginação)

```
URL ?page=N
  ↓
page.tsx server: deserializeFilterState (page) → fetchConversas({ filters, accountId, page, pageSize: 1000 })
  ↓
fetchConversas: clamp page/pageSize → conversasList(args)
  ↓
conversasList: Promise.all([rowsQuery (OFFSET/LIMIT), countQuery]) → withCache
  ↓
Page Client renderiza ConversasPageClient → ConversasTable (total, page, pageSize, totalPages)
  ↓
ConversasTable renderiza toolbar com "Total: X" + ConversasPagination no rodapé
  ↓
User clica página N → onPageChange(N) → pushUrl({ ...applied, page: N }) (via AdvancedFilters → router.push)
  ↓
Server re-render com novo ?page=N
```

### 4.3 Backwards compat

- `conversasList(cursor: ...)` continua funcionando pra `exportConversasAction` (que passa `cursor: null, limit: 50000`).
- Em modo cursor, `total` retorna 0 (placeholder), `nextCursor` continua válido.
- Tipo `FetchConversasResult` antigo (com `nextCursor`) **breaking change** — mas só `fetchConversas` retorna esse tipo, e o único consumidor é `<ConversasPageClient>`. Atualizar o consumer junto.

---

## 5. Modelo de dados

Sem alterações de schema. Sem migration.

`FilterState` ganha campo opcional `page?: number`. Serialização/deserialização atualizadas em `filter-state.ts`.

---

## 6. Erros, edge cases, defensivos

### 6.1 Performance count(*)

- Filtros típicos (1 mês, 1-2 inboxes, 0-5 teams, 0-3 assignees) tendem a O(<= 100k rows) → count(*) leva 50-300ms em índices existentes.
- Em piora (período "todos", sem filtros), pode ir a 1-3s.
- TTL de cache do count = TTL da query principal (30s live).
- **Risco**: caso patológico (50k+ matches em "todos"), count consome RAM marginal mas tempo dobra. Aceito por ora — se pegar lento em prod, criar índice composto.
- **Fallback**: se count falhar (timeout), retorna `total: rows.length` como aproximação + flag `totalApproximate: true` (não detalhado nesta release; TODO de defesa).

### 6.2 Paginação edge cases

- `page > totalPages`: server retorna `rows: []`. UI mostra empty state com link "Voltar pra página 1".
- `page < 1`: clamp pra 1.
- `pageSize > 5000`: clamp pra 5000.
- `pageSize < 10`: clamp pra 10.
- **Filtros mudam → reset page=1**: feito implicitamente porque `pushUrl` em `<AdvancedFilters>` não preserva ?page se filtros mudaram. (Adicionar nota: `serializeFilterState` só inclui `page` se explicitamente set; e `pushUrl` em filtros deixa `page` ausente → URL fica sem ?page → page = 1.)
- **0 rows total**: paginação não renderiza; mantém empty state.

### 6.3 Search

- Search aplicada vs draft: hint só com `searchPending`.
- Mudança de filtro não-search com search aplicada: banner pending mostra count de filtros pending (sem search).

### 6.4 Calendar

- Range cruzando minDate: dias < minDate disabled (visualmente cinza, não clicáveis). Mantido.
- showOutsideDays=false: dias fora não renderizam, sem highlight.

### 6.5 Popover chips

- Esc fecha (base-ui).
- Click fora fecha.
- Tab navega.
- ids.length === 0: chip pai desmonta → popover desmonta.

### 6.6 Drill-down

- Cap defensivo 200 atributos: caso patológico raro mas defensivo.
- Animação só no mount (motion-safe respeitado).

### 6.7 Tour

- `id: "conversas-v3"` força re-onboarding 1x. Aceito.

---

## 7. Testes

### 7.1 Unit

#### `src/lib/reports/__tests__/filter-state.test.ts` (PATCH)
- `serializeFilterState({ ..., page: 1 })` não inclui `?page=`.
- `serializeFilterState({ ..., page: 5 })` inclui `?page=5`.
- `deserializeFilterState(?page=3)` → `state.page === 3`.
- `deserializeFilterState(?page=abc)` → `state.page === 1` (fallback).

#### `src/lib/actions/reports/__tests__/conversas.test.ts` (NEW ou PATCH)
- `page < 1` clamped pra 1.
- `pageSize < 10` clamped pra 10.
- `pageSize > 5000` clamped pra 5000.
- `total` presente no result.

#### `src/lib/chatwoot/queries/__tests__/conversas-list.test.ts` (NEW)
- count(*) retornado em offset mode (mock pool).
- cursor mode mantém retorno antigo.
- Cache key inclui page/pageSize.

#### `src/components/reports/__tests__/conversas-pagination.test.tsx` (NEW)
- `totalPages=1` → não renderiza nada (ou só o "1" estilizado).
- `totalPages=5, page=3`: renderiza `[<] 1 2 3 4 5 [>]` sem elipsis.
- `totalPages=12, page=1`: renderiza `[<] 1 2 3 … 12 [>]`.
- `totalPages=12, page=6`: `[<] 1 … 4 5 6 7 8 … 12 [>]`.
- `totalPages=12, page=12`: `[<] 1 … 10 11 12 [>]`.
- Click em página dispara `onPageChange(N)`.
- Setinha `<` disabled em page=1.
- Setinha `>` disabled em page=totalPages.
- aria-current="page" no atual.

#### `src/components/reports/__tests__/filter-chip-list-popover.test.tsx` (NEW)
- Render base com `+N`.
- Click no chip abre popover.
- Lista renderiza N items com X individual.
- Click no X individual chama `onRemoveOne(id)` sem fechar popover.
- Click "Remover todos" chama `onRemoveAll()`.
- Esc fecha.

### 7.2 Component (PATCH)

#### `<ConversaDrillDown>`
- Mostra TODOS atributos (sem ver-mais) quando entries.length <= 200.
- Cap defensivo 200: mostra primeiros 200 + nota "+N atributos não exibidos".
- Animação fade-in no mount.

#### `<AdvancedFilters>`
- Digitar em `search` NÃO mostra banner pending.
- Hint "Aperte Enter para buscar" aparece quando draft.search != applied.search.
- Mudar `inboxIds` (não-search) MOSTRA banner pending.

#### `<AppliedFiltersChips>`
- ids.length=1 → chip simples com X.
- ids.length>=2 → renderiza `<FilterChipListPopover>`.
- X tem classes destrutivas no hover.

#### `<PeriodPills>`
- minDate reset quando accountId muda (mock useEffect).

### 7.3 Smoke E2E manual

1. Filtrar período (1-30 abr) + caixa Alagoas + dept Comercial + busca "Marcela" → resultados certos.
2. Trocar conta no sidebar → abrir picker → minDate reflete nova conta.
3. Calendário não mostra dias overflow.
4. Click em chip "Caixa de entrada: AL-Alagoas +2" → popover abre.
5. Paginação navega; total mostra correto; ?page= reflete na URL; back/forward funciona.
6. Tour mostra step "Atalhos rápidos".

---

## 8. Plano de release

1. Spec v3 (após pente-fino #2) → plan v3 → subagent-driven-development.
2. typecheck, jest, build verde.
3. `gh run list --limit 5` antes do push.
4. Push → CI → portainer-fix `app_version=v0.19.0`.
5. `/api/health` valida.
6. Smoke E2E.
7. Avisar user.

CHANGELOG entry estrutura:
```md
## [v0.19.0] 2026-05-02 — Conversas Polish (paginação 1k + drill-down + filtros UX)

### Implementação
- Paginação clássica numerada (1.000-em-1.000) com indicador "Total: X conversas" — substitui cursor pagination + banner amarelo.
- Drill-down visual mais limpo (border-l violet sutil + animação fade-in + sempre todos atributos).
- Busca não dispara mais "filtro pendente" no draft; hint sutil "Aperte Enter para buscar" abaixo do input.
- Skip-link "Pular para a tabela" some visualmente (mantém anúncio screen reader).
- Chips +N (Caixa de entrada/Departamento/Atendente/Etiquetas com 2+ items) viram Popover clicável com lista + X individual.
- X dos chips mais destacado (hover destrutivo).
- Calendar `showOutsideDays={false}` (fix do bug em PeriodPills).
- minDate reseta quando troca conta no sidebar.
- Tour `conversas-v3` ganha step "Atalhos rápidos".

### Compat
- ?page=N na URL.
- pageSize fixo 1000 (não persiste).
- Export ignora page (sempre exporta tudo, até 50k).
```

---

## 9. Aprovação

João Vitor Zanini autorizou autonomia total. Spec v2 — passa por pente-fino #2 antes de v3.
