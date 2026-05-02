# Plan v2: Conversas v0.19 Polish

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps em checkbox. UI tasks invocam ui-ux-pro-max ANTES de codar.
>
> **Status**: v2 — passou por pente-fino #1 (20 achados aplicados); passa por pente-fino #2 antes de v3.

**Goal:** Aplicar 8 ajustes em `/relatorios/conversas` da v0.17.0 → v0.19.0 (paginação 1k, drill-down polish, busca UX, chips +N expansíveis, calendar overflow fix, minDate dinâmica, tour atalhos).

**Architecture:** Backend `conversasList` ganha modo offset com count(*) paralelo; URL `?page=`; novo `<ConversasPagination>` numerada; novo `<FilterChipListPopover>` pra +N; visuais sutis sem novas cores.

**Tech Stack:** Next.js 16.2.2, React 19.2, TypeScript strict, Tailwind v4, base-ui, @tanstack/react-virtual v3, react-day-picker v9, exceljs, Jest + jest-mock-extended + RTL.

---

## File Structure

### NEW
| Path | Responsabilidade |
|---|---|
| `src/components/reports/conversas-pagination.tsx` | Barra de paginação numerada com elipsis |
| `src/components/reports/filter-chip-list-popover.tsx` | Chip que abre popover com lista de items |
| `src/components/reports/__tests__/conversas-pagination.test.tsx` | Tests |
| `src/components/reports/__tests__/filter-chip-list-popover.test.tsx` | Tests |
| `src/lib/actions/reports/__tests__/conversas.test.ts` | Tests fetchConversas (NEW) |
| `src/lib/chatwoot/queries/__tests__/conversas-list.test.ts` | Tests conversasList (NEW) |

### MODIFY
| Path | Mudança |
|---|---|
| `src/lib/reports/filter-state.ts` | + `page?: number` |
| `src/lib/reports/__tests__/filter-state.test.ts` | + 7 cenários `page` |
| `src/lib/chatwoot/queries/conversas-list.ts` | + offset mode + count paralelo |
| `src/lib/actions/reports/conversas.ts` | + page/pageSize/total/totalPages |
| `src/app/(protected)/relatorios/conversas/page.tsx` | passa page/pageSize=1000; skip-link `sr-only` puro |
| `src/components/reports/conversas-table.tsx` | recebe paginação; remove banner amarelo; remove cursor; remove onRowCountChange |
| `src/components/reports/conversas-page-client.tsx` | implementa handlePageChange; passa total/page/pageSize/totalPages |
| `src/components/reports/advanced-filters.tsx` | pushUrl zera page; pending exclui search; hint sutil; data-tour=atalhos; X mais destrutivo; handleRemoveOne |
| `src/components/reports/applied-filters-chips.tsx` | usa FilterChipListPopover quando >=2; X mais destrutivo |
| `src/components/reports/conversa-drill-down.tsx` | visual polish + cap 200 + sem ver-mais |
| `src/components/reports/period-pills.tsx` | remove showOutsideDays; reset minDate por accountId |
| `src/lib/tours/conversas-tour.ts` | step atalhos + bump v3 |
| `package.json` | 0.18.0 → 0.19.0 |
| `CHANGELOG.md` | release notes v0.19.0 |
| `docs/STATUS.md` | versão atual |

---

## Convenções

- TypeScript strict; aliases `@/`; comentários pt-BR.
- TDD: test → fail → impl → pass → typecheck → commit.
- UI: invocar `ui-ux-pro-max:ui-ux-pro-max` ANTES de codar (CLAUDE.md §2.2).
- Stage APENAS arquivos seus (nunca `git add -A`).
- Não tocar prisma/schema, agente-nex/, integracoes/, llm/, nex/, configuracoes/page, sidebar.tsx, calendar.tsx (componente — diferente do `conversas-table.tsx`).

---

## Task 1: filter-state.page

**Files:**
- Modify: `src/lib/reports/filter-state.ts`
- Modify: `src/lib/reports/__tests__/filter-state.test.ts`

- [ ] **Step 1: Read existing file**

```bash
cat src/lib/reports/filter-state.ts
```

- [ ] **Step 2: Write failing tests** (acrescentar describe novo)

```ts
describe("filter-state — page", () => {
  it("serializeFilterState({ page: 1 }) NÃO inclui ?page=", () => {
    const s = { ...EMPTY_FILTER_STATE, page: 1 };
    expect(serializeFilterState(s).has("page")).toBe(false);
  });
  it("serializeFilterState({ page: 5 }) inclui ?page=5", () => {
    const s = { ...EMPTY_FILTER_STATE, page: 5 };
    expect(serializeFilterState(s).get("page")).toBe("5");
  });
  it("serializeFilterState({ page: undefined }) NÃO inclui ?page=", () => {
    const s = { ...EMPTY_FILTER_STATE, page: undefined };
    expect(serializeFilterState(s).has("page")).toBe(false);
  });
  it("deserializeFilterState(?page=3) → state.page === 3", () => {
    const r = deserializeFilterState(new URLSearchParams({ page: "3" }));
    expect(r.page).toBe(3);
  });
  it("deserializeFilterState(?page=abc) → undefined", () => {
    const r = deserializeFilterState(new URLSearchParams({ page: "abc" }));
    expect(r.page).toBeUndefined();
  });
  it("deserializeFilterState(?page=-5) → undefined", () => {
    const r = deserializeFilterState(new URLSearchParams({ page: "-5" }));
    expect(r.page).toBeUndefined();
  });
  it("deserializeFilterState(?page=0) → undefined", () => {
    const r = deserializeFilterState(new URLSearchParams({ page: "0" }));
    expect(r.page).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run failing tests**

```bash
npm test -- filter-state.test
```
Expected: 7 FAIL.

- [ ] **Step 4: Implement**

```ts
// FilterState interface — adicionar campo:
export interface FilterState {
  // ... existentes
  page?: number;
}

// serializeFilterState — adicionar antes do return:
if (state.page && state.page > 1) p.set("page", String(state.page));

// deserializeFilterState — adicionar antes do return:
const pageRaw = params.get("page");
const pageNum = pageRaw ? Number(pageRaw) : NaN;
const page = Number.isFinite(pageNum) && pageNum > 1
  ? Math.floor(pageNum)
  : undefined;

// e incluir `page` no objeto retornado.
```

- [ ] **Step 5: Run tests**

```bash
npm test -- filter-state.test
```
Expected: PASS (todos).

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/reports/filter-state.ts src/lib/reports/__tests__/filter-state.test.ts
git commit -m "feat(reports): T1 — FilterState.page (URL state)"
```

---

## Task 2: conversasList — offset mode + count paralelo

**Files:**
- Modify: `src/lib/chatwoot/queries/conversas-list.ts`
- Create: `src/lib/chatwoot/queries/__tests__/conversas-list.test.ts`

> Antes: invocar `superpowers:test-driven-development`.

- [ ] **Step 1: Read existing file** to understand cursor mode

- [ ] **Step 2: Write failing tests**

```ts
import { mockDeep } from "jest-mock-extended";
import type { Pool } from "pg";

jest.mock("../pool", () => ({
  getChatwootPool: jest.fn(),
}));
jest.mock("@/lib/cache/pull-through", () => ({
  withCache: ({ fetcher }: any) => fetcher().then((data: any) => ({ data, stale: false, cached: false })),
}));
jest.mock("../resilience", () => ({
  withChatwootResilience: (fn: any) => fn(),
}));
jest.mock("@/lib/cache/keys", () => ({
  cacheKey: (args: any) => `cache:${args.name}`,
  hashFilters: () => "hash",
}));

import { conversasList } from "@/lib/chatwoot/queries/conversas-list";
import { getChatwootPool } from "@/lib/chatwoot/pool";

describe("conversasList — offset mode", () => {
  let pool: any;
  beforeEach(() => {
    pool = mockDeep<Pool>();
    (getChatwootPool as jest.Mock).mockReturnValue(pool);
  });

  it("modo offset: roda 2 queries em paralelo (rows + count)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // rows query
    pool.query.mockResolvedValueOnce({ rows: [{ total: "100" }] }); // count query

    const r = await conversasList({
      accountId: 9,
      filters: { period: { start: new Date(), end: new Date() } } as any,
      page: 1,
      pageSize: 50,
    });

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(r.data.total).toBe(100);
    expect(r.data.page).toBe(1);
    expect(r.data.pageSize).toBe(50);
    expect(r.data.nextCursor).toBeNull();
  });

  it("modo cursor: 1 query (compat); total=0", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const r = await conversasList({
      accountId: 9,
      filters: { period: { start: new Date(), end: new Date() } } as any,
      cursor: null,
      limit: 50,
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(r.data.total).toBe(0);
  });

  it("offset = (page-1) * pageSize", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: "0" }] });

    await conversasList({
      accountId: 9,
      filters: { period: { start: new Date(), end: new Date() } } as any,
      page: 3,
      pageSize: 25,
    });

    const call = pool.query.mock.calls[0]; // primeira query = rows
    const sql = call[0] as string;
    expect(sql).toContain("OFFSET");
    expect(sql).toContain("50"); // (3-1)*25 = 50
  });

  it("page < 1 clamp pra 1", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: "0" }] });
    const r = await conversasList({
      accountId: 9,
      filters: { period: { start: new Date(), end: new Date() } } as any,
      page: -5,
      pageSize: 1000,
    });
    expect(r.data.page).toBe(1);
  });

  it("pageSize > 5000 clamp pra 5000", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: "0" }] });
    const r = await conversasList({
      accountId: 9,
      filters: { period: { start: new Date(), end: new Date() } } as any,
      page: 1,
      pageSize: 99999,
    });
    expect(r.data.pageSize).toBe(5000);
  });

  it("pageSize < 10 clamp pra 10", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: "0" }] });
    const r = await conversasList({
      accountId: 9,
      filters: { period: { start: new Date(), end: new Date() } } as any,
      page: 1,
      pageSize: 1,
    });
    expect(r.data.pageSize).toBe(10);
  });
});
```

- [ ] **Step 3: Run failing tests**

```bash
npm test -- conversas-list.test
```
Expected: FAIL.

- [ ] **Step 4: Implement**

Editar `src/lib/chatwoot/queries/conversas-list.ts`:

```ts
// Adicionar à interface ConversasListResult:
export interface ConversasListResult {
  rows: ConversaRow[];
  nextCursor: string | null;
  total: number;        // novo
  page: number;         // novo
  pageSize: number;     // novo
}

// Adicionar args.page, args.pageSize:
export async function conversasList(args: {
  accountId: number;
  filters: ReportFilters;
  limit?: number;
  cursor?: string | null;
  page?: number;
  pageSize?: number;
  cacheScope?: "live" | "historical";
  ttlSeconds?: number;
}) {
  const useOffset = args.page != null;
  const effectivePage = useOffset ? Math.max(1, args.page!) : 1;
  const effectivePageSize = useOffset
    ? Math.min(Math.max(args.pageSize ?? 1000, 10), 5000)
    : 0;
  const offset = useOffset ? (effectivePage - 1) * effectivePageSize : 0;
  const cursor = !useOffset && args.cursor ? decodeCursor(args.cursor) : null;
  const cacheScope = args.cacheScope ?? "live";
  const ttl = args.ttlSeconds ?? (cacheScope === "live" ? DEFAULT_TTL_SECONDS : 300);
  const limit = useOffset
    ? effectivePageSize
    : Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const key = cacheKey({
    scope: "report",
    name: useOffset
      ? `conversas-list-${cacheScope}-p${effectivePage}s${effectivePageSize}`
      : `conversas-list-${cacheScope}-${limit}-${cursor ? `${cursor.lastActivityAt}-${cursor.id}` : "first"}`,
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<ConversasListResult>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<ConversasListResult>(
        async () => {
          const pool = getChatwootPool();
          const base = buildBaseFilter(args.filters, args.accountId);
          const params: unknown[] = [...base.params];
          let p = params.length;

          // search clause (igual antes)
          const searchClause = buildConversasSearchClause(args.filters.search, p);
          if (searchClause.sql) {
            p += searchClause.params.length;
            params.push(...searchClause.params);
          }

          let cursorClause = "";
          if (!useOffset && cursor) {
            cursorClause = ` AND (
              c.last_activity_at < $${++p}
              OR (c.last_activity_at = $${p} AND c.id < $${++p})
            )`;
            params.push(cursor.lastActivityAt);
            params.push(cursor.id);
          }

          let offsetClause = "";
          if (useOffset) {
            params.push(offset);
            offsetClause = ` OFFSET $${++p}`;
          }

          const limitParamIdx = ++p;
          params.push(useOffset ? limit : limit + 1);

          const rowsSql = `
            SELECT
              c.id, c.display_id, c.status, c.priority,
              c.created_at AS conversation_created_at,
              c.last_activity_at, c.custom_attributes,
              ct.id AS contact_id, ct.name AS contact_name,
              ct.phone_number AS contact_phone_number,
              ct.identifier AS contact_identifier,
              ct.additional_attributes AS contact_additional_attributes,
              c.inbox_id, ix.name AS inbox_name,
              c.team_id, tm.name AS team_name,
              c.assignee_id, u.name AS assignee_name,
              -- subqueries last_message_type, last_message_at, last_incoming_at, last_outgoing_at
              -- waiting_seconds, open_seconds, labels (mantidos como antes)
              ${"" /* code original mantém */}
              0 AS placeholder_keep_existing_sql_intact
            FROM conversations c
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes ix ON ix.id = c.inbox_id
            LEFT JOIN teams tm ON tm.id = c.team_id
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE ${base.whereSql}${searchClause.sql ? ` AND ${searchClause.sql}` : ""}${cursorClause}
            ORDER BY c.last_activity_at DESC NULLS LAST, c.id DESC
            ${offsetClause}
            LIMIT $${limitParamIdx}
          `;

          const countSql = useOffset ? `
            SELECT COUNT(*)::text AS total
            FROM conversations c
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes ix ON ix.id = c.inbox_id
            LEFT JOIN teams tm ON tm.id = c.team_id
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE ${base.whereSql}${searchClause.sql ? ` AND ${searchClause.sql}` : ""}
          ` : null;

          // count usa params SEM offset/limit/cursor — slice base+search apenas
          const countParams = countSql
            ? params.slice(0, base.params.length + (searchClause.params?.length ?? 0))
            : null;

          const [rowsResult, countResult] = await Promise.all([
            pool.query<RawRow>(rowsSql, params),
            countSql
              ? pool.query<{ total: string }>(countSql, countParams!)
              : Promise.resolve({ rows: [{ total: "0" }] }),
          ]);

          const hasMore = !useOffset && rowsResult.rows.length > limit;
          const sliced = hasMore ? rowsResult.rows.slice(0, limit) : rowsResult.rows;

          const rows: ConversaRow[] = sliced.map(/* mantém map original */);

          let nextCursor: string | null = null;
          if (!useOffset && hasMore) {
            const last = sliced[sliced.length - 1];
            if (last && last.last_activity_at) {
              nextCursor = encodeCursor({
                lastActivityAt: last.last_activity_at.toISOString(),
                id: last.id,
              });
            }
          }

          const total = useOffset ? Number(countResult.rows[0]?.total ?? "0") : 0;

          return { rows, nextCursor, total, page: effectivePage, pageSize: effectivePageSize };
        },
        { fallbackKey: key },
      ),
  });
}
```

> Atenção subagente: o arquivo atual tem ~360 linhas. NÃO substitua o arquivo todo — preserve o SELECT completo (subqueries de last_message_*, waiting_seconds, open_seconds, labels) e o map de RawRow→ConversaRow. Use Edit pra modificar só as partes que mudam: assinatura, lógica de mode, queries paralelas, retorno expandido.

- [ ] **Step 5: Run tests**

```bash
npm test -- conversas-list.test
```
Expected: 6/6 PASS.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/chatwoot/queries/conversas-list.ts src/lib/chatwoot/queries/__tests__/conversas-list.test.ts
git commit -m "feat(chatwoot): T2 — conversasList offset mode + count paralelo"
```

---

## Task 3: fetchConversas — page/pageSize/total/totalPages

**Files:**
- Modify: `src/lib/actions/reports/conversas.ts`
- Create: `src/lib/actions/reports/__tests__/conversas.test.ts`

- [ ] **Step 1: Tests**

```ts
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/chatwoot/queries/conversas-list", () => ({
  conversasList: jest.fn(),
}));
jest.mock("@/lib/tenant", () => ({
  getAccessibleTeamIds: jest.fn().mockResolvedValue("all"),
}));

import { fetchConversas } from "@/lib/actions/reports/conversas";
import { conversasList } from "@/lib/chatwoot/queries/conversas-list";
import { getCurrentUser } from "@/lib/auth";

const baseUser = {
  id: "u1", email: "x@y", name: "X",
  platformRole: "super_admin" as const,
  isOwner: true, mustChangePassword: false,
  avatarUrl: null, theme: "system" as const,
  accountIds: [9], teamIds: [],
};

describe("fetchConversas v0.19", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(baseUser);
    (conversasList as jest.Mock).mockResolvedValue({
      data: { rows: [], nextCursor: null, total: 1234, page: 2, pageSize: 1000 },
      stale: false, cached: false,
    });
  });

  it("retorna total/page/pageSize/totalPages", async () => {
    const r = await fetchConversas({
      filters: { period: { start: new Date(), end: new Date() } } as any,
      page: 2, pageSize: 1000, accountId: 9,
    });
    expect(r.total).toBe(1234);
    expect(r.page).toBe(2);
    expect(r.pageSize).toBe(1000);
    expect(r.totalPages).toBe(2); // ceil(1234/1000) = 2
  });

  it("totalPages = 0 quando total = 0", async () => {
    (conversasList as jest.Mock).mockResolvedValue({
      data: { rows: [], nextCursor: null, total: 0, page: 1, pageSize: 1000 },
      stale: false, cached: false,
    });
    const r = await fetchConversas({
      filters: { period: { start: new Date(), end: new Date() } } as any,
      accountId: 9,
    });
    expect(r.totalPages).toBe(0);
  });

  it("default page=1, pageSize=1000", async () => {
    await fetchConversas({
      filters: { period: { start: new Date(), end: new Date() } } as any,
      accountId: 9,
    });
    const call = (conversasList as jest.Mock).mock.calls[0][0];
    expect(call.page).toBe(1);
    expect(call.pageSize).toBe(1000);
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm test -- conversas.test
```
Expected: FAIL.

- [ ] **Step 3: Implement** — substitui assinatura e retorno:

```ts
export interface FetchConversasInput {
  filters: ReportFilters;
  page?: number;
  pageSize?: number;
  accountId?: number;
}

export interface FetchConversasResult {
  rows: ConversaRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stale: boolean;
  cached: boolean;
  cachedAt?: Date;
  error?: string;
}

export async function fetchConversas(args: FetchConversasInput): Promise<FetchConversasResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      rows: [], total: 0, page: 1, pageSize: 1000, totalPages: 0,
      stale: false, cached: false, error: "Não autenticado",
    };
  }

  const accountId = args.accountId ?? DEFAULT_ACCOUNT_ID;
  const page = args.page ?? 1;
  const pageSize = args.pageSize ?? 1000;

  // team scope (mantém lógica atual)
  // ...

  try {
    const result = await conversasList({
      accountId,
      filters: scopedFilters,
      page,
      pageSize,
    });

    const total = result.data.total;
    const effectivePageSize = result.data.pageSize;
    const totalPages = total > 0 ? Math.ceil(total / effectivePageSize) : 0;

    return {
      rows: result.data.rows,
      total,
      page: result.data.page,
      pageSize: effectivePageSize,
      totalPages,
      stale: result.stale,
      cached: result.cached,
      cachedAt: result.cachedAt,
      error: result.error,
    };
  } catch (err) {
    console.error("[fetchConversas]", err);
    return {
      rows: [], total: 0, page: 1, pageSize, totalPages: 0,
      stale: true, cached: false, error: "Erro ao carregar conversas",
    };
  }
}
```

- [ ] **Step 4-7: tests, typecheck, commit**

```bash
npm test -- conversas.test
npm run typecheck
git add src/lib/actions/reports/conversas.ts src/lib/actions/reports/__tests__/conversas.test.ts
git commit -m "feat(reports): T3 — fetchConversas page/pageSize/total/totalPages"
```

---

## Task 4: page.tsx passa page/pageSize=1000 + skip-link sr-only

**Files:**
- Modify: `src/app/(protected)/relatorios/conversas/page.tsx`

- [ ] **Step 1: Read file**

- [ ] **Step 2: Edit linha ~83 (fetchConversas call)**

```ts
// ANTES
fetchConversas({ filters: reportFilters, accountId }),

// DEPOIS
fetchConversas({
  filters: reportFilters,
  accountId,
  page: filterState.page ?? 1,
  pageSize: 1000,
}),
```

- [ ] **Step 3: Edit linha ~100-105 (skip-link)**

```tsx
// ANTES
<a
  href="#conversas-table"
  className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
>
  Pular para a tabela de conversas
</a>

// DEPOIS
<a href="#conversas-table" className="sr-only">
  Pular para a tabela de conversas
</a>
```

- [ ] **Step 4: Atualizar destructure de conversasResult** — agora retorna total/page/pageSize/totalPages.

- [ ] **Step 5: Passar pra ConversasPageClient**

```tsx
<ConversasPageClient
  // ... existentes
  total={conversasResult.total}
  page={conversasResult.page}
  pageSize={conversasResult.pageSize}
  totalPages={conversasResult.totalPages}
/>
```

(Remove `initialCursor={conversasResult.nextCursor}` — não usa mais).

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: erros em ConversasPageClient (props novas vs antigas) — esperado, será fixado em T7.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(protected)/relatorios/conversas/page.tsx"
git commit -m "feat(reports): T4 — page.tsx passa page/pageSize=1000 + skip-link sr-only"
```

---

## Task 5: ConversasPagination (NEW)

**Files:**
- Create: `src/components/reports/conversas-pagination.tsx`
- Create: `src/components/reports/__tests__/conversas-pagination.test.tsx`

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` com query "numbered pagination active state focus ring touch target chevron icons".

- [ ] **Step 1: Tests**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { ConversasPagination } from "@/components/reports/conversas-pagination";

describe("ConversasPagination", () => {
  it("totalPages=0: retorna null", () => {
    const { container } = render(<ConversasPagination page={1} totalPages={0} onPageChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("totalPages=1: retorna null", () => {
    const { container } = render(<ConversasPagination page={1} totalPages={1} onPageChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("totalPages=5, page=3: render 5 botões 1-5", () => {
    render(<ConversasPagination page={3} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /ir para página 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ir para página 5/i })).toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });

  it("totalPages=12, page=1: 1 2 ... 12", () => {
    render(<ConversasPagination page={1} totalPages={12} onPageChange={() => {}} />);
    // 1, 2, ..., 12
    expect(screen.getByRole("button", { name: /ir para página 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ir para página 12/i })).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
  });

  it("totalPages=12, page=6: 1 ... 5 6 7 ... 12", () => {
    render(<ConversasPagination page={6} totalPages={12} onPageChange={() => {}} />);
    expect(screen.getAllByText("…").length).toBe(2);
    expect(screen.getByRole("button", { name: /ir para página 5/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ir para página 7/i })).toBeInTheDocument();
  });

  it("setinha < disabled em page=1", () => {
    render(<ConversasPagination page={1} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /página anterior/i })).toBeDisabled();
  });

  it("setinha > disabled em page=totalPages", () => {
    render(<ConversasPagination page={5} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /próxima página/i })).toBeDisabled();
  });

  it("click em página dispara onPageChange", () => {
    const cb = jest.fn();
    render(<ConversasPagination page={1} totalPages={5} onPageChange={cb} />);
    fireEvent.click(screen.getByRole("button", { name: /ir para página 3/i }));
    expect(cb).toHaveBeenCalledWith(3);
  });

  it("aria-current='page' no atual", () => {
    render(<ConversasPagination page={3} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /ir para página 3/i })).toHaveAttribute("aria-current", "page");
  });

  it("nav role + aria-label", () => {
    render(<ConversasPagination page={1} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("navigation", { name: /paginação/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm test -- conversas-pagination.test
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/components/reports/conversas-pagination.tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

function buildPageItems(page: number, totalPages: number): Array<number | "ellipsis"> {
  const set = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...set]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("ellipsis");
    result.push(sorted[i]);
  }
  return result;
}

export function ConversasPagination({ page, totalPages, onPageChange, className }: Props) {
  if (totalPages <= 1) return null;

  const items = buildPageItems(page, totalPages);

  return (
    <nav
      role="navigation"
      aria-label="Paginação de conversas"
      className={cn("flex items-center justify-center gap-1.5 border-t border-border/40 bg-muted/10 p-3", className)}
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

      {items.map((it, idx) =>
        it === "ellipsis" ? (
          <span
            key={`e${idx}`}
            className="inline-flex h-9 min-w-9 items-center justify-center px-1 text-sm text-muted-foreground tabular-nums"
            aria-hidden
          >
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            onClick={() => onPageChange(it)}
            aria-current={page === it ? "page" : undefined}
            aria-label={`Ir para página ${it}`}
            className={cn(
              "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
              page === it
                ? "border-violet-500/40 bg-violet-500/15 text-violet-500 font-semibold"
                : "border-border/50 text-foreground hover:bg-muted hover:border-border",
            )}
          >
            {it}
          </button>
        ),
      )}

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

- [ ] **Step 4-7: tests, typecheck, commit**

```bash
npm test -- conversas-pagination.test
npm run typecheck
git add src/components/reports/conversas-pagination.tsx src/components/reports/__tests__/conversas-pagination.test.tsx
git commit -m "feat(reports): T5 — ConversasPagination numbered + elipsis + aria"
```

---

## Task 6: ConversasTable — recebe paginação

**Files:**
- Modify: `src/components/reports/conversas-table.tsx`

> Antes: `ui-ux-pro-max:ui-ux-pro-max` query "data table footer pagination total counter sticky toolbar empty state".

- [ ] **Step 1: Plumb props**

Substituir interface:
```ts
interface ConversasTableProps {
  initialRows: ConversaRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  accountId: number;
  filters: FetchConversasInput["filters"];
  sortStack: SortRule[];
  onSortStackChange: (next: SortRule[]) => void;
  conditionGroup?: ConditionGroup;
  // REMOVE: initialCursor, onRowCountChange
}
```

- [ ] **Step 2: Toolbar contador**

Substituir `{rows.length} conversas` por:
```tsx
<span className="text-xs text-muted-foreground tabular-nums">
  Total: <strong className="text-foreground">{total.toLocaleString("pt-BR")}</strong> conversa{total === 1 ? "" : "s"}
  {totalPages > 1 ? <span className="text-muted-foreground/70"> · página {page} de {totalPages}</span> : null}
</span>
```

- [ ] **Step 3: Remove banner amarelo "Mostrando primeiras 10.000"**

Apagar bloco que renderiza com `initialCursor !== null`.

- [ ] **Step 4: Remove cursor state e onRowCountChange callback**

- [ ] **Step 5: Adicionar `<ConversasPagination>` no rodapé**

Logo após o fechamento do `</div>` de overflow-y-auto da tabela desktop e do `<ul>` mobile, adicionar:
```tsx
<ConversasPagination
  page={page}
  totalPages={totalPages}
  onPageChange={onPageChange}
/>
```

- [ ] **Step 6: Cleanup localStorage `conversas-table-page-size`** — já era feito; manter.

- [ ] **Step 7: Atualizar tests**

Test file (`__tests__/conversas-table.test.tsx`) — atualizar fixtures pra incluir total/page/pageSize/totalPages e onPageChange. Remover testes de banner amarelo (não existe mais).

- [ ] **Step 8: Run tests + typecheck + commit**

```bash
npm test -- conversas-table.test
npm run typecheck
git add src/components/reports/conversas-table.tsx src/components/reports/__tests__/conversas-table.test.tsx
git commit -m "feat(reports): T6 — ConversasTable paginação props + ConversasPagination"
```

---

## Task 7: ConversasPageClient — handlePageChange

**Files:**
- Modify: `src/components/reports/conversas-page-client.tsx`

- [ ] **Step 1: Adicionar props + state**

```tsx
interface Props {
  // ... existentes
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  // REMOVE: initialCursor
}

// dentro do componente
import { useRouter } from "next/navigation";
import { serializeFilterState } from "@/lib/reports/filter-state";

const router = useRouter();
const handlePageChange = useCallback(
  (newPage: number) => {
    const next = { ...filterState, page: newPage > 1 ? newPage : undefined };
    const qs = serializeFilterState(next).toString();
    router.push(qs ? `?${qs}` : "?");
  },
  [filterState, router],
);
```

- [ ] **Step 2: Passar pra ConversasTable**

```tsx
<ConversasTable
  initialRows={initialRows}
  total={total}
  page={page}
  pageSize={pageSize}
  totalPages={totalPages}
  onPageChange={handlePageChange}
  accountId={accountId}
  filters={reportFilters}
  sortStack={sortStack}
  onSortStackChange={setSortStack}
  conditionGroup={composedConditionGroup}
/>
```

- [ ] **Step 3: Atualizar AdvancedFilters** — `tableRowCount` agora é `total`.

```tsx
<AdvancedFilters
  // ... existentes
  appliedReportFilters={reportFilters}
  tableRowCount={total}  // novo nome de fonte
/>
```

- [ ] **Step 4: typecheck + commit**

```bash
npm run typecheck
git add src/components/reports/conversas-page-client.tsx
git commit -m "feat(reports): T7 — handlePageChange + plumbing total/page/pageSize"
```

---

## Task 8: AdvancedFilters — pushUrl zera page

**Files:**
- Modify: `src/components/reports/advanced-filters.tsx`

- [ ] **Step 1: Modificar `pushUrl`**

```ts
// ANTES
const pushUrl = useCallback(
  (state: FilterState) => {
    const qs = serializeFilterState(state).toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : "?");
    });
  },
  [router, startTransition],
);

// DEPOIS
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

- [ ] **Step 2: Tests** (no test file existente ou criar novo)

```ts
// teste: ao mudar filtro com page=5 setado, URL gerada não tem ?page=
import { render, fireEvent } from "@testing-library/react";
// ... setup com filterState.page = 5
// fireEvent change inboxIds
// expect router.push chamado com URL sem 'page=5'
```

- [ ] **Step 3-5: tests, typecheck, commit**

```bash
git add src/components/reports/advanced-filters.tsx [test files]
git commit -m "feat(reports): T8 — pushUrl zera page (reset 1 quando filtro muda)"
```

---

## Task 9: AdvancedFilters — banner pending exclui search + hint sutil

**Files:**
- Modify: `src/components/reports/advanced-filters.tsx`

- [ ] **Step 1: Adicionar pendingDiffExSearch**

```ts
const withoutSearch = useCallback(
  (s: FilterState): FilterState => ({ ...s, search: undefined }),
  [],
);
const pendingDiffExSearch = useMemo(
  () => diffFilterStates(withoutSearch(draft), withoutSearch(applied)),
  [draft, applied, withoutSearch],
);
const hasPendingNonSearch = pendingDiffExSearch > 0;
const searchPending = (draft.search ?? "") !== (applied.search ?? "");
```

- [ ] **Step 2: Banner usa `hasPendingNonSearch`** (em vez de `hasPending`):

```tsx
{hasPendingNonSearch ? (
  <div role="status" ...>
    <strong>{pendingDiffExSearch}</strong> {pendingDiffExSearch === 1 ? "filtro pendente" : "filtros pendentes"}
    ...
  </div>
) : null}
```

- [ ] **Step 3: Hint sutil abaixo do input search**

```tsx
<div data-tour="search" className="relative w-full max-w-[320px] min-w-[200px] sm:flex-none">
  {/* Input existente */}
  <Input ... />
  {searchPending ? (
    <span className="mt-1 block px-1 text-[11px] text-muted-foreground/70">
      Aperte Enter para buscar
    </span>
  ) : null}
</div>
```

- [ ] **Step 4-6: tests, typecheck, commit**

```bash
git add src/components/reports/advanced-filters.tsx [tests]
git commit -m "feat(reports): T9 — banner pending exclui search + hint Enter"
```

---

## Task 10: FilterChipListPopover (NEW)

**Files:**
- Create: `src/components/reports/filter-chip-list-popover.tsx`
- Create: `src/components/reports/__tests__/filter-chip-list-popover.test.tsx`

> Antes: `ui-ux-pro-max:ui-ux-pro-max` query "popover trigger button list of items remove individual hover state animation".

- [ ] **Step 1: Read base-ui Popover API**

```bash
grep -rln "Popover" src/components/ui/popover.tsx
cat src/components/ui/popover.tsx
```

- [ ] **Step 2: Tests** (5 cenários)

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterChipListPopover } from "@/components/reports/filter-chip-list-popover";

const items = [
  { id: 1, name: "AL-Alagoas" },
  { id: 2, name: "BA-Bahia" },
  { id: 3, name: "CE-Ceará" },
];

describe("FilterChipListPopover", () => {
  it("renderiza chip 'Caixa de entrada: AL-Alagoas +2'", () => {
    render(<FilterChipListPopover groupLabel="Caixa de entrada" items={items} onRemoveOne={() => {}} onRemoveAll={() => {}} />);
    expect(screen.getByText(/AL-Alagoas/)).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("aria-haspopup='dialog' no trigger", () => {
    render(<FilterChipListPopover groupLabel="X" items={items} onRemoveOne={() => {}} onRemoveAll={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("click abre popover com lista", () => {
    render(<FilterChipListPopover groupLabel="X" items={items} onRemoveOne={() => {}} onRemoveAll={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("AL-Alagoas")).toBeVisible();
    expect(screen.getByText("BA-Bahia")).toBeVisible();
    expect(screen.getByText("CE-Ceará")).toBeVisible();
  });

  it("click no X individual chama onRemoveOne(id)", () => {
    const cb = jest.fn();
    render(<FilterChipListPopover groupLabel="X" items={items} onRemoveOne={cb} onRemoveAll={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByLabelText(/Remover BA-Bahia/));
    expect(cb).toHaveBeenCalledWith(2);
  });

  it("click 'Remover todos' chama onRemoveAll", () => {
    const cb = jest.fn();
    render(<FilterChipListPopover groupLabel="X" items={items} onRemoveOne={() => {}} onRemoveAll={cb} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(/Remover todos/));
    expect(cb).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ResolvedItem { id: number; name: string }

interface Props {
  groupLabel: string;
  items: ResolvedItem[];
  onRemoveOne: (id: number) => void;
  onRemoveAll: () => void;
}

export function FilterChipListPopover({ groupLabel, items, onRemoveOne, onRemoveAll }: Props) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const first = items[0];

  return (
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
              {groupLabel}: {first.name}
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
            onClick={() => { onRemoveAll(); setOpen(false); }}
            className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-destructive/10"
          >
            Remover todos
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default FilterChipListPopover;
```

- [ ] **Step 4-7: tests, typecheck, commit**

```bash
npm test -- filter-chip-list-popover.test
npm run typecheck
git add src/components/reports/filter-chip-list-popover.tsx src/components/reports/__tests__/filter-chip-list-popover.test.tsx
git commit -m "feat(reports): T10 — FilterChipListPopover (chip clicável + lista)"
```

---

## Task 11: AppliedFiltersChips — usa FilterChipListPopover quando >= 2 + X mais destrutivo

**Files:**
- Modify: `src/components/reports/applied-filters-chips.tsx`

> Antes: `ui-ux-pro-max:ui-ux-pro-max` query "chip cluster destructive button hover focus contrast".

- [ ] **Step 1: Adicionar prop `onRemoveOne`**

```ts
interface Props {
  // ... existentes
  onRemoveOne?: (key: keyof FilterState, id: number) => void;
}
```

- [ ] **Step 2: Helper de resolver names**

```ts
function resolveItems(key: keyof FilterState, ids: number[], meta: Meta): ResolvedItem[] {
  if (key === "inboxIds") {
    return ids.map(id => ({ id, name: meta.inboxes.find(x => x.id === id)?.name ?? `${id}` }));
  }
  if (key === "teamIds") {
    return ids.map(id => ({ id, name: meta.teams.find(x => x.id === id)?.name ?? `${id}` }));
  }
  if (key === "assigneeIds") {
    return ids.map(id => ({ id, name: meta.assignees.find(x => x.id === id)?.name ?? `${id}` }));
  }
  if (key === "labelIds") {
    return ids.map(id => ({ id, name: (meta.labels?.find(x => x.id === id)?.name) ?? `${id}` }));
  }
  if (key === "statuses") {
    return ids.map(id => ({ id, name: STATUS_LABELS[id] ?? `${id}` }));
  }
  if (key === "priorities") {
    return ids.map(id => ({ id, name: PRIORITY_LABELS[id] ?? `${id}` }));
  }
  return [];
}
```

- [ ] **Step 3: Renderizar conditional**

Para cada grupo com `ids.length >= 2`:
```tsx
<FilterChipListPopover
  groupLabel={"Caixa de entrada"}
  items={resolveItems("inboxIds", applied.inboxIds, meta)}
  onRemoveOne={(id) => onRemoveOne?.("inboxIds", id)}
  onRemoveAll={() => onRemove("inboxIds")}
/>
```

Para `ids.length === 1`: chip simples atual.

- [ ] **Step 4: X mais destrutivo (3 lugares: chip filter, chip quick, chip sort)**

```tsx
// ANTES
className="... text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-ring/50"
// DEPOIS
className="... text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:ring-destructive/40"
```

Ícone `<X className="h-3.5 w-3.5" />` (era `h-3 w-3`).

- [ ] **Step 5-7: tests, typecheck, commit**

```bash
git add src/components/reports/applied-filters-chips.tsx
git commit -m "feat(reports): T11 — AppliedFiltersChips usa FilterChipListPopover + X destrutivo"
```

---

## Task 12: AdvancedFilters — handleRemoveOne

**Files:**
- Modify: `src/components/reports/advanced-filters.tsx`

- [ ] **Step 1: Adicionar handler**

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

- [ ] **Step 2: Passar pra AppliedFiltersChips**

```tsx
<AppliedFiltersChips
  // ... existentes
  onRemoveOne={handleRemoveOne}
/>
```

- [ ] **Step 3-5: tests, typecheck, commit**

```bash
git add src/components/reports/advanced-filters.tsx
git commit -m "feat(reports): T12 — AdvancedFilters handleRemoveOne (remove individual)"
```

---

## Task 13: ConversaDrillDown — visual polish

**Files:**
- Modify: `src/components/reports/conversa-drill-down.tsx`
- Modify: `src/components/reports/__tests__/conversa-drill-down.test.tsx`

> Antes: `ui-ux-pro-max:ui-ux-pro-max` query "expandable detail panel subtle accent border vertical rhythm chips no extra colors".

- [ ] **Step 1: Tests update**

```tsx
it("Mostra TODOS atributos quando entries.length <= 200", () => {
  // 50 atributos
  const attrs: any = {};
  for (let i = 0; i < 50; i++) attrs[`k${i}`] = `v${i}`;
  render(<ConversaDrillDown row={{ ...baseRow, custom_attributes: attrs } as any} accountId={9} />);
  expect(screen.getAllByText(/^k\d+:$/).length).toBe(50);
});

it("Cap defensivo 200: mostra primeiros 200 + nota '+N atributos não exibidos'", () => {
  const attrs: any = {};
  for (let i = 0; i < 250; i++) attrs[`k${i}`] = `v${i}`;
  render(<ConversaDrillDown row={{ ...baseRow, custom_attributes: attrs } as any} accountId={9} />);
  // 200 chips renderizados
  expect(screen.getAllByText(/^k\d+:$/).length).toBe(200);
  expect(screen.getByText(/\+50 atributos não exibidos/)).toBeInTheDocument();
});

it("não renderiza botão 'Ver mais'", () => {
  const attrs: any = {};
  for (let i = 0; i < 50; i++) attrs[`k${i}`] = `v${i}`;
  render(<ConversaDrillDown row={{ ...baseRow, custom_attributes: attrs } as any} accountId={9} />);
  expect(screen.queryByRole("button", { name: /ver mais/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Reescrever componente**

```tsx
"use client";

import { LabelsChips } from "@/components/reports/labels-chips";
import { formatPhone } from "@/lib/utils/format-phone";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const ATTR_CAP = 200;

interface Props {
  row: ConversaRow;
  accountId?: number;
}

export function ConversaDrillDown({ row }: Props) {
  const phone = row.contact.phone_number
    ? formatPhone(row.contact.phone_number) || row.contact.phone_number
    : null;

  const attrs = row.custom_attributes ?? {};
  const entries = Object.entries(attrs).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  const visible = entries.slice(0, ATTR_CAP);
  const overflow = Math.max(entries.length - ATTR_CAP, 0);

  return (
    <div
      role="region"
      aria-label={`Detalhes da conversa ${row.display_id}`}
      className="space-y-2.5 rounded-lg border-l-2 border-violet-500/30 bg-muted/20 px-4 py-3 text-[13px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
    >
      {/* WhatsApp */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="min-w-[100px] pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          WhatsApp
        </span>
        <span className="font-mono text-[14px] tabular-nums text-foreground">
          {phone ?? "—"}
        </span>
      </div>

      {/* Etiquetas */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-[100px] pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Etiquetas
        </span>
        {row.labels && row.labels.length > 0 ? (
          <LabelsChips labels={row.labels} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {/* Atributos */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-[100px] pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Atributos{" "}
          <span className="text-muted-foreground/70 tabular-nums">
            ({entries.length})
          </span>
        </span>
        {entries.length === 0 ? (
          <span className="text-muted-foreground">— sem atributos</span>
        ) : (
          <div className="inline-flex flex-wrap items-center gap-1.5">
            {visible.map(([k, v]) => {
              const raw =
                typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean"
                  ? String(v)
                  : JSON.stringify(v);
              return (
                <span
                  key={k}
                  className="inline-flex items-baseline gap-x-1 break-all rounded-md border border-border/40 bg-card/80 px-2 py-1"
                >
                  <span className="text-[11px] font-medium text-muted-foreground/80">
                    {k}:
                  </span>
                  <span className="text-[12px] text-foreground/90">{raw}</span>
                </span>
              );
            })}
            {overflow > 0 ? (
              <span className="ml-1 inline-flex items-center text-[11px] text-muted-foreground/70">
                +{overflow} atributos não exibidos
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default ConversaDrillDown;
```

- [ ] **Step 3-5: tests, typecheck, commit**

```bash
npm test -- conversa-drill-down.test
git add src/components/reports/conversa-drill-down.tsx src/components/reports/__tests__/conversa-drill-down.test.tsx
git commit -m "feat(reports): T13 — drill-down visual polish + cap 200 + sem ver-mais"
```

---

## Task 14: PeriodPills — fix showOutsideDays + reset minDate

**Files:**
- Modify: `src/components/reports/period-pills.tsx`

- [ ] **Step 1: Remove `showOutsideDays`**

Linha ~205, no `<Calendar>`:
```diff
-  showOutsideDays
   disabled={disabledMatcher}
```

- [ ] **Step 2: Adicionar useEffect reset**

Logo após o `[minDate, setMinDate] = useState`:
```ts
// Reset minDate quando accountId muda — força re-fetch ao próximo open.
useEffect(() => {
  setMinDate(undefined);
}, [accountId]);
```

- [ ] **Step 3-5: tests, typecheck, commit**

```bash
git add src/components/reports/period-pills.tsx
git commit -m "fix(reports): T14 — PeriodPills sem showOutsideDays + minDate reset por accountId"
```

---

## Task 15: Tour — step atalhos + bump v3

**Files:**
- Modify: `src/lib/tours/conversas-tour.ts`
- Modify: `src/components/reports/advanced-filters.tsx`

- [ ] **Step 1: data-tour=atalhos no DOM**

Em `advanced-filters.tsx`, wrapper de `<QuickFiltersPopover>`:
```tsx
<div data-tour="atalhos">
  <QuickFiltersPopover ... />
</div>
```

- [ ] **Step 2: Adicionar step + bump id**

Em `conversas-tour.ts`:
```ts
id: "conversas-v3", // (era "conversas-v2")
```

Inserir step entre `sorting-chip` e `export`:
```ts
{
  id: "atalhos",
  targetSelector: "[data-tour='atalhos']",
  title: "Atalhos rápidos",
  description: "Filtros prontos do dia a dia: 'Sem resposta', 'Não atribuídas', 'Minhas'. Clica e aplica direto, combinando com qualquer outro filtro.",
  placement: "bottom",
},
```

- [ ] **Step 3: typecheck + commit**

```bash
npm run typecheck
git add src/lib/tours/conversas-tour.ts src/components/reports/advanced-filters.tsx
git commit -m "feat(tour): T15 — conversas-v3 + step atalhos"
```

---

## Task 16: Bump versão + CHANGELOG + STATUS

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Sync remoto**

```bash
git fetch origin main
git log --oneline HEAD..origin/main
git pull --rebase origin main  # se há novidade
```

- [ ] **Step 2: Bump package.json**

```json
"version": "0.19.0"
```

- [ ] **Step 3: CHANGELOG**

Inserir no topo (após `# Changelog\n`) entrada estruturada (ver §8 da spec).

- [ ] **Step 4: STATUS.md**

Atualizar header `Versão atual em produção: v0.19.0` + adicionar seção `### Release v0.19.0` no topo.

- [ ] **Step 5: Commit**

```bash
git add package.json CHANGELOG.md docs/STATUS.md
git commit -m "chore(release): bump v0.19.0 — Conversas Polish"
```

---

## Task 17: Verification + push + deploy + smoke

- [ ] **Step 1: Tests + typecheck + build**

```bash
npm test
npm run typecheck
npm run build
```

- [ ] **Step 2: Push**

```bash
git fetch origin main
gh run list --limit 5
git push origin main
gh run watch <run-id>
```

- [ ] **Step 3: Portainer fix + /api/health**

```bash
gh workflow run portainer-fix.yml -f app_version=v0.19.0
# until /api/health version == v0.19.0
```

- [ ] **Step 4: Smoke E2E**

(Manual após deploy: §7.3 da spec.)

- [ ] **Step 5: HISTORY.md + close active**

```bash
echo "..." >> docs/agents/HISTORY.md
rm docs/agents/active/claude-conversas-v019.md
git add docs/agents/HISTORY.md docs/agents/active/claude-conversas-v019.md
git commit -m "docs(agents): registra v0.19.0 LIVE + encerra sessão"
git push origin main
```

- [ ] **Step 6: Avisar user**

---

## Self-Review (a aplicar na v3)

- [ ] cobertura de spec: cada §3 tem task?
- [ ] sem placeholders.
- [ ] tipos consistentes entre tasks.
- [ ] commits frequentes (1 por task).
- [ ] TDD rigoroso.
