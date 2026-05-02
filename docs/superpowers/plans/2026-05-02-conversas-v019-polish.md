# Plan v3 (final): Conversas v0.19 Polish

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps em checkbox `- [ ]`. UI tasks invocam `ui-ux-pro-max:ui-ux-pro-max` ANTES de codar (CLAUDE.md §2.2). Tasks com lógica testável invocam `superpowers:test-driven-development`.
>
> **Status**: v3 final (passou por pente-fino #1 com 20 achados + pente-fino #2 com 33 achados aplicados).

**Goal:** Aplicar 8 ajustes em `/relatorios/conversas` da v0.17.0 → v0.19.0 (paginação 1k clássica, drill-down polish, busca UX, chips +N expansíveis em popover, calendar overflow fix, minDate dinâmica por accountId, tour atalhos).

**Architecture:** Backend `conversasList` ganha modo offset com count(*) paralelo; URL ?page=N; novo `<ConversasPagination>` numerado com elipsis; novo `<FilterChipListPopover>` para chips +N; visuais sutis sem cores extras.

**Tech Stack:** Next.js 16.2.2, React 19.2, TypeScript strict, Tailwind v4, base-ui (Popover existing em `src/components/ui/popover.tsx`), @tanstack/react-virtual v3, react-day-picker v9, exceljs, Jest + jest-mock-extended + RTL.

---

## Pré-flight check (controlador antes de despachar T1)

1. `git fetch origin main && git status` — branch limpo, up-to-date.
2. `ls docs/agents/active/` — confirmar 0 agentes paralelos ativos (se houver, ler antes).
3. `cat package.json | python3 -c "import json,sys;p=json.load(sys.stdin);print(p['version'])"` — confirmar v0.18.0.
4. Verificar `<PeriodPills>` consumers (3 já confirmados: `consumo-content.tsx`, `period-selector-url.tsx`, `advanced-filters.tsx`) — todos beneficiam do fix da T14.
5. Verificar `<QuickFiltersPopover>` em `advanced-filters.tsx` — já confirmado linha 359.

## Coordenação multi-agente (cada subagent recebe)

- Stage APENAS arquivos seus (NUNCA `git add -A`).
- Não tocar: prisma/schema, agente-nex/, integracoes/, llm/, nex/, configuracoes/page, sidebar.tsx, calendar.tsx (componente — ATENÇÃO: `conversas-table.tsx` e `period-pills.tsx` são meus).
- Antes de commit em arquivos compartilhados (package.json/CHANGELOG/STATUS): `git fetch origin main` + verificar untracked alheios.

## Modelo por task

- T1, T4, T8, T9, T12, T14, T15, T16, T17: **haiku** (mecânicas).
- T2, T3, T6, T7, T11, T13: **sonnet** (integração + refactor).
- T5, T10: **sonnet** (UI nova com testes).

---

## File Structure

### NEW
| Path | Responsabilidade |
|---|---|
| `src/components/reports/conversas-pagination.tsx` | Barra paginação numerada com elipsis |
| `src/components/reports/filter-chip-list-popover.tsx` | Chip +N que abre popover com lista |
| `src/components/reports/__tests__/conversas-pagination.test.tsx` | 10 cenários |
| `src/components/reports/__tests__/filter-chip-list-popover.test.tsx` | 5 cenários |
| `src/lib/actions/reports/__tests__/conversas.test.ts` | 3 cenários fetchConversas |
| `src/lib/chatwoot/queries/__tests__/conversas-list.test.ts` | 6 cenários offset/cursor |

### MODIFY
| Path | Resumo |
|---|---|
| `src/lib/reports/filter-state.ts` | + `page?: number` |
| `src/lib/reports/__tests__/filter-state.test.ts` | + 7 cenários `page` |
| `src/lib/chatwoot/queries/conversas-list.ts` | + offset + count paralelo (preserva SELECT original) |
| `src/lib/actions/reports/conversas.ts` | + page/pageSize/total/totalPages |
| `src/app/(protected)/relatorios/conversas/page.tsx` | passa page/pageSize=1000; skip-link `sr-only` puro |
| `src/components/reports/conversas-table.tsx` | recebe paginação; remove banner amarelo + cursor + onRowCountChange |
| `src/components/reports/conversas-page-client.tsx` | implementa handlePageChange; plumb total/page/pageSize/totalPages |
| `src/components/reports/advanced-filters.tsx` | pushUrl zera page; pending exclui search; hint sutil; data-tour=atalhos; X destrutivo; handleRemoveOne |
| `src/components/reports/applied-filters-chips.tsx` | usa FilterChipListPopover quando >=2; X destrutivo |
| `src/components/reports/conversa-drill-down.tsx` | visual polish + cap 200 + sem ver-mais |
| `src/components/reports/period-pills.tsx` | remove `showOutsideDays`; reset minDate por accountId |
| `src/lib/tours/conversas-tour.ts` | step atalhos + bump `conversas-v3` |
| `package.json` | 0.18.0 → 0.19.0 |
| `CHANGELOG.md` | release notes v0.19.0 |
| `docs/STATUS.md` | versão atual |

---

## Task 1: filter-state.page

**Model**: haiku.
**Files:**
- Modify: `src/lib/reports/filter-state.ts`
- Modify: `src/lib/reports/__tests__/filter-state.test.ts`

- [ ] **Step 1: Read** `src/lib/reports/filter-state.ts` (full).

- [ ] **Step 2: Append failing tests** ao describe existente:

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

- [ ] **Step 3: Run** `npm test -- filter-state.test` — Expected: 7 FAIL.

- [ ] **Step 4: Implement** — adições mínimas via Edit tool:

Em `interface FilterState`, adicionar campo:
```ts
  /** Página atual (1-based). Default 1 (não persiste em URL). */
  page?: number;
```

Em `serializeFilterState`, antes do `return`:
```ts
  if (state.page && state.page > 1) p.set("page", String(state.page));
```

Em `deserializeFilterState`, antes do return final:
```ts
  const pageRaw = params.get("page");
  const pageNum = pageRaw ? Number(pageRaw) : NaN;
  const page = Number.isFinite(pageNum) && pageNum > 1
    ? Math.floor(pageNum)
    : undefined;
```

E incluir `page` no objeto retornado.

- [ ] **Step 5: Run tests** → 7 PASS.

- [ ] **Step 6: Typecheck** → 0 errors.

- [ ] **Step 7: Commit**:

```bash
git add src/lib/reports/filter-state.ts src/lib/reports/__tests__/filter-state.test.ts
git commit -m "feat(reports): T1 — FilterState.page (URL state)"
```

---

## Task 2: conversasList — offset mode + count paralelo

**Model**: sonnet.
**Files:**
- Modify: `src/lib/chatwoot/queries/conversas-list.ts` (PRESERVE SELECT original — Edit cirúrgico, NÃO Write)
- Create: `src/lib/chatwoot/queries/__tests__/conversas-list.test.ts`

> Antes: invocar `superpowers:test-driven-development`.

> ATENÇÃO ao subagent: o arquivo `conversas-list.ts` tem ~360 linhas com SELECT complexo (subqueries de last_message_*, EXTRACT EPOCH para waiting_seconds/open_seconds, json_agg de labels). NÃO substitua o arquivo todo. Use a tool **Edit** para modificações cirúrgicas:
> - Edit 1: assinatura da função (adicionar page/pageSize)
> - Edit 2: lógica de mode (useOffset, clamps)
> - Edit 3: cache key
> - Edit 4: bloco de cursor clause (envelopar com `if (!useOffset && cursor)`)
> - Edit 5: adicionar offsetClause antes do limitParamIdx
> - Edit 6: adicionar `OFFSET ${offsetClause}` no SQL antes de `LIMIT $${limitParamIdx}`
> - Edit 7: countSql + countParams + Promise.all
> - Edit 8: ConversasListResult com novos campos
> - Edit 9: hasMore lógica (só em cursor mode)
> - Edit 10: retornar `total, page, pageSize`

- [ ] **Step 1: Read** `src/lib/chatwoot/queries/conversas-list.ts` (full).

- [ ] **Step 2: Tests** (criar arquivo):

```ts
// src/lib/chatwoot/queries/__tests__/conversas-list.test.ts
import { mockDeep } from "jest-mock-extended";
import type { Pool } from "pg";

jest.mock("../pool", () => ({ getChatwootPool: jest.fn() }));
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

const baseFilters: any = { period: { start: new Date("2026-04-01"), end: new Date("2026-04-30") } };

describe("conversasList — offset/cursor modes", () => {
  let pool: any;
  beforeEach(() => {
    pool = mockDeep<Pool>();
    (getChatwootPool as jest.Mock).mockReturnValue(pool);
  });

  it("modo offset: roda 2 queries em paralelo (rows + count)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: "100" }] });
    const r = await conversasList({ accountId: 9, filters: baseFilters, page: 1, pageSize: 50 });
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(r.data.total).toBe(100);
    expect(r.data.page).toBe(1);
    expect(r.data.pageSize).toBe(50);
    expect(r.data.nextCursor).toBeNull();
  });

  it("modo cursor: 1 query (compat); total=0", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const r = await conversasList({ accountId: 9, filters: baseFilters, cursor: null, limit: 50 });
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(r.data.total).toBe(0);
  });

  it("offset SQL contém OFFSET correto: (page-1)*pageSize", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: "0" }] });
    await conversasList({ accountId: 9, filters: baseFilters, page: 3, pageSize: 25 });
    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toMatch(/OFFSET\s+\$\d+/);
    const params = pool.query.mock.calls[0][1] as unknown[];
    expect(params).toContain(50); // (3-1)*25
  });

  it("page < 1 clamp pra 1", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: "0" }] });
    const r = await conversasList({ accountId: 9, filters: baseFilters, page: -5, pageSize: 1000 });
    expect(r.data.page).toBe(1);
  });

  it("pageSize > 5000 clamp pra 5000", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: "0" }] });
    const r = await conversasList({ accountId: 9, filters: baseFilters, page: 1, pageSize: 99999 });
    expect(r.data.pageSize).toBe(5000);
  });

  it("pageSize < 10 clamp pra 10", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: "0" }] });
    const r = await conversasList({ accountId: 9, filters: baseFilters, page: 1, pageSize: 1 });
    expect(r.data.pageSize).toBe(10);
  });
});
```

- [ ] **Step 3: Run failing tests** → FAIL.

- [ ] **Step 4: Implement (Edit cirúrgico)**:

**Edit 1** — Interface ConversasListResult:
```ts
// localizar:
export interface ConversasListResult {
  rows: ConversaRow[];
  nextCursor: string | null;
}

// substituir por:
export interface ConversasListResult {
  rows: ConversaRow[];
  nextCursor: string | null;
  total: number;
  page: number;
  pageSize: number;
}
```

**Edit 2** — Assinatura da função (adicionar params):
```ts
// localizar:
export async function conversasList(args: {
  accountId: number;
  filters: ReportFilters;
  limit?: number;
  cursor?: string | null;
  cacheScope?: "live" | "historical";
  ttlSeconds?: number;
}) {

// substituir por:
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
```

**Edit 3** — Block após assinatura (`const limit = ...`):
```ts
// localizar:
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const cursor = args.cursor ? decodeCursor(args.cursor) : null;
  const cacheScope = args.cacheScope ?? "live";
  const ttl = args.ttlSeconds ?? (cacheScope === "live" ? DEFAULT_TTL_SECONDS : 300);

// substituir por:
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
```

**Edit 4** — Cache key:
```ts
// localizar:
  const key = cacheKey({
    scope: "report",
    name: `conversas-list-${cacheScope}-${limit}-${cursor ? `${cursor.lastActivityAt}-${cursor.id}` : "first"}`,
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

// substituir por:
  const key = cacheKey({
    scope: "report",
    name: useOffset
      ? `conversas-list-${cacheScope}-p${effectivePage}s${effectivePageSize}`
      : `conversas-list-${cacheScope}-${limit}-${cursor ? `${cursor.lastActivityAt}-${cursor.id}` : "first"}`,
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });
```

**Edit 5** — cursorClause condicional ao !useOffset:
```ts
// localizar:
          const cursorClause = cursor
            ? ` AND (
                c.last_activity_at < $${++p}
                OR (c.last_activity_at = $${p} AND c.id < $${++p})
              )`
            : "";
          if (cursor) {
            params.push(cursor.lastActivityAt);
            params.push(cursor.id);
          }

// substituir por:
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
```

**Edit 6** — limitParam:
```ts
// localizar:
          const limitParamIdx = ++p;
          params.push(limit + 1); // pega 1 a mais para detectar nextCursor.

// substituir por:
          const limitParamIdx = ++p;
          params.push(useOffset ? limit : limit + 1);
```

**Edit 7** — Antes do `const sql = `, capturar baseParams pra count e adicionar offsetClause no SQL:

Localize a linha que termina o SELECT (`LIMIT $${limitParamIdx}`) e modifique o SQL para:
```ts
            ORDER BY c.last_activity_at DESC NULLS LAST, c.id DESC
            ${offsetClause}
            LIMIT $${limitParamIdx}
```

(Adiciona `${offsetClause}` antes de `LIMIT`.)

**Edit 8** — Substituir `pool.query` pela Promise.all:

```ts
// localizar:
          const result = await pool.query<RawRow>(sql, params);

// substituir por (insere countSql + countParams + Promise.all):
          const baseAndSearchParamCount = base.params.length;
          // count usa apenas params do base/search (sem cursor/offset/limit)
          const countSql = useOffset ? `
            SELECT COUNT(*)::text AS total
            FROM conversations c
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes ix ON ix.id = c.inbox_id
            LEFT JOIN teams tm ON tm.id = c.team_id
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE ${base.whereSql}${searchClause.sql ? ` AND ${searchClause.sql}` : ""}
          ` : null;

          // Quantos params são "base + search"? base.params.length + qty params do searchClause.
          // Como searchClause já adicionou em params, calculamos antes da adição de cursor/offset/limit.
          // A maneira segura é capturar antes (cf. Edit 5b abaixo).

          const [result, countResult] = useOffset
            ? await Promise.all([
                pool.query<RawRow>(sql, params),
                pool.query<{ total: string }>(countSql!, baseAndSearchParams),
              ])
            : [await pool.query<RawRow>(sql, params), null as { rows: { total: string }[] } | null];
```

> Nota técnica subagente: o arquivo atual NÃO captura `baseAndSearchParams` em uma variável separada. Você precisa adicionar **antes do bloco que adiciona cursor/offset**:
> ```ts
> // ... depois do searchClause:
> if (searchClause.sql) {
>   p += searchClause.params.length;
>   params.push(...searchClause.params);
> }
> // SNAPSHOT pra count:
> const baseAndSearchParams: unknown[] = [...params];
> ```
> Isso preserva os params para a count SQL antes que o cursor/offset/limit sejam adicionados.

**Edit 9** — Substituir hasMore + retorno:
```ts
// localizar:
          const hasMore = result.rows.length > limit;
          const sliced = hasMore ? result.rows.slice(0, limit) : result.rows;

// substituir por:
          const hasMore = !useOffset && result.rows.length > limit;
          const sliced = hasMore ? result.rows.slice(0, limit) : result.rows;
```

**Edit 10** — Retorno final:
```ts
// localizar (no fim do fetcher):
          let nextCursor: string | null = null;
          if (hasMore) {
            // ... encodeCursor
          }
          return { rows, nextCursor };

// substituir por:
          let nextCursor: string | null = null;
          if (hasMore) {
            const last = sliced[sliced.length - 1];
            if (last && last.last_activity_at) {
              nextCursor = encodeCursor({
                lastActivityAt: last.last_activity_at.toISOString(),
                id: last.id,
              });
            }
          }
          const total = useOffset && countResult
            ? Number(countResult.rows[0]?.total ?? "0")
            : 0;
          return { rows, nextCursor, total, page: effectivePage, pageSize: effectivePageSize };
```

- [ ] **Step 5: Run tests** → 6 PASS. Se algum FAIL, debugar — comum: ordem de Edits ou param indexing incorreto.

- [ ] **Step 6: Typecheck** → 0 errors.

- [ ] **Step 7: Commit**:

```bash
git add src/lib/chatwoot/queries/conversas-list.ts src/lib/chatwoot/queries/__tests__/conversas-list.test.ts
git commit -m "feat(chatwoot): T2 — conversasList offset mode + count paralelo"
```

---

## Task 3: fetchConversas — page/pageSize/total/totalPages

**Model**: sonnet.
**Files:**
- Modify: `src/lib/actions/reports/conversas.ts`
- Create: `src/lib/actions/reports/__tests__/conversas.test.ts`

- [ ] **Step 1: Read** `src/lib/actions/reports/conversas.ts` full.

- [ ] **Step 2: Tests**:

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

const baseFilters: any = { period: { start: new Date(), end: new Date() } };

describe("fetchConversas v0.19", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(baseUser);
  });

  it("retorna total/page/pageSize/totalPages calculado", async () => {
    (conversasList as jest.Mock).mockResolvedValue({
      data: { rows: [], nextCursor: null, total: 1234, page: 2, pageSize: 1000 },
      stale: false, cached: false,
    });
    const r = await fetchConversas({ filters: baseFilters, page: 2, pageSize: 1000, accountId: 9 });
    expect(r.total).toBe(1234);
    expect(r.page).toBe(2);
    expect(r.pageSize).toBe(1000);
    expect(r.totalPages).toBe(2); // ceil(1234/1000)
  });

  it("totalPages = 0 quando total = 0", async () => {
    (conversasList as jest.Mock).mockResolvedValue({
      data: { rows: [], nextCursor: null, total: 0, page: 1, pageSize: 1000 },
      stale: false, cached: false,
    });
    const r = await fetchConversas({ filters: baseFilters, accountId: 9 });
    expect(r.totalPages).toBe(0);
  });

  it("default page=1, pageSize=1000 passados pra conversasList", async () => {
    (conversasList as jest.Mock).mockResolvedValue({
      data: { rows: [], nextCursor: null, total: 0, page: 1, pageSize: 1000 },
      stale: false, cached: false,
    });
    await fetchConversas({ filters: baseFilters, accountId: 9 });
    const call = (conversasList as jest.Mock).mock.calls[0][0];
    expect(call.page).toBe(1);
    expect(call.pageSize).toBe(1000);
  });
});
```

- [ ] **Step 3: Run failing** → FAIL.

- [ ] **Step 4: Implement** (substitui interface + função):

```ts
// src/lib/actions/reports/conversas.ts
"use server";

import { getCurrentUser } from "@/lib/auth";
import {
  conversasList,
  type ConversaRow,
} from "@/lib/chatwoot/queries/conversas-list";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { getAccessibleTeamIds } from "@/lib/tenant";
import type { AuthUser } from "@/lib/auth-helpers";

const DEFAULT_ACCOUNT_ID = 9;

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

export async function fetchConversas(
  args: FetchConversasInput,
): Promise<FetchConversasResult> {
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

  const teamScope = await getAccessibleTeamIds(
    {
      id: user.id, email: user.email, name: user.name,
      platformRole: user.platformRole, isOwner: user.isOwner,
      mustChangePassword: user.mustChangePassword,
      avatarUrl: user.avatarUrl, theme: user.theme,
      accountIds: user.accountIds, teamIds: user.teamIds,
    } satisfies AuthUser,
    accountId,
  );

  let scopedFilters: ReportFilters = { ...args.filters };
  if (teamScope !== "all") {
    if (teamScope.length === 0) {
      return {
        rows: [], total: 0, page, pageSize, totalPages: 0,
        stale: false, cached: false,
      };
    }
    if (scopedFilters.teamIds && scopedFilters.teamIds.length > 0) {
      scopedFilters.teamIds = scopedFilters.teamIds.filter((id) =>
        teamScope.includes(id),
      );
      if (scopedFilters.teamIds.length === 0) {
        return {
          rows: [], total: 0, page, pageSize, totalPages: 0,
          stale: false, cached: false,
        };
      }
    } else {
      scopedFilters.teamIds = teamScope;
    }
  }

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

- [ ] **Step 5-7**: tests PASS, typecheck 0, commit.

```bash
git add src/lib/actions/reports/conversas.ts src/lib/actions/reports/__tests__/conversas.test.ts
git commit -m "feat(reports): T3 — fetchConversas page/pageSize/total/totalPages"
```

---

## Task 4: page.tsx passa page + skip-link sr-only

**Model**: haiku.
**Files:**
- Modify: `src/app/(protected)/relatorios/conversas/page.tsx`

- [ ] **Step 1: Read** o arquivo full.

- [ ] **Step 2: Edit fetchConversas call** (linha ~83):

```ts
// ANTES:
fetchConversas({ filters: reportFilters, accountId }),

// DEPOIS:
fetchConversas({
  filters: reportFilters,
  accountId,
  page: filterState.page ?? 1,
  pageSize: 1000,
}),
```

- [ ] **Step 3: Edit destructure** após Promise.all:

```ts
// localizar:
const stale =
  conversasResult.stale ||
  Boolean(inboxesResult?.stale) ||
  ...

// adicionar antes:
const conversasTotal = conversasResult.total ?? 0;
const conversasPage = conversasResult.page ?? 1;
const conversasPageSize = conversasResult.pageSize ?? 1000;
const conversasTotalPages = conversasResult.totalPages ?? 0;
```

- [ ] **Step 4: Edit `<ConversasPageClient>`** props (linha ~126-142):

```tsx
// ANTES:
<ConversasPageClient
  inboxes={inboxes}
  teams={teams}
  assignees={assignees}
  labels={labels}
  filterState={filterState}
  accountId={accountId}
  initialRows={conversasResult.rows}
  initialCursor={conversasResult.nextCursor}
  reportFilters={reportFilters}
  conditionGroup={...}
  currentChatwootUserId={null}
/>

// DEPOIS:
<ConversasPageClient
  inboxes={inboxes}
  teams={teams}
  assignees={assignees}
  labels={labels}
  filterState={filterState}
  accountId={accountId}
  initialRows={conversasResult.rows}
  total={conversasTotal}
  page={conversasPage}
  pageSize={conversasPageSize}
  totalPages={conversasTotalPages}
  reportFilters={reportFilters}
  conditionGroup={
    filterState.mode === "advanced"
      ? filterState.conditionGroup
      : undefined
  }
  currentChatwootUserId={null}
/>
```

- [ ] **Step 5: Edit skip-link** (linhas 100-105):

```tsx
// ANTES:
<a
  href="#conversas-table"
  className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
>
  Pular para a tabela de conversas
</a>

// DEPOIS:
<a href="#conversas-table" className="sr-only">
  Pular para a tabela de conversas
</a>
```

- [ ] **Step 6: Typecheck** — vai dar erro em ConversasPageClient (props novas vs antigas). Esperado, fix em T7.

- [ ] **Step 7: Commit**:

```bash
git add "src/app/(protected)/relatorios/conversas/page.tsx"
git commit -m "feat(reports): T4 — page.tsx passa page/pageSize=1000 + skip-link sr-only"
```

---

## Task 5: ConversasPagination (NEW)

**Model**: sonnet.
**Files:**
- Create: `src/components/reports/conversas-pagination.tsx`
- Create: `src/components/reports/__tests__/conversas-pagination.test.tsx`

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` com query "numbered pagination active state focus ring touch target 40px chevron icon-only-button aria-current".

- [ ] **Step 1: Tests** (10 cenários):

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

  it("totalPages=2: render botões 1 e 2 sem elipsis", () => {
    render(<ConversasPagination page={1} totalPages={2} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /ir para página 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ir para página 2/i })).toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });

  it("totalPages=5, page=3: render 1-5 sem elipsis", () => {
    render(<ConversasPagination page={3} totalPages={5} onPageChange={() => {}} />);
    [1, 2, 3, 4, 5].forEach(p => {
      expect(screen.getByRole("button", { name: new RegExp(`ir para página ${p}`, "i") })).toBeInTheDocument();
    });
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });

  it("totalPages=12, page=1: 1 2 ... 12 (1 elipsis)", () => {
    render(<ConversasPagination page={1} totalPages={12} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /ir para página 12/i })).toBeInTheDocument();
    expect(screen.getAllByText("…").length).toBe(1);
  });

  it("totalPages=12, page=6: 1 ... 5 6 7 ... 12 (2 elipsis)", () => {
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

  it("click em página dispara onPageChange(N)", () => {
    const cb = jest.fn();
    render(<ConversasPagination page={1} totalPages={5} onPageChange={cb} />);
    fireEvent.click(screen.getByRole("button", { name: /ir para página 3/i }));
    expect(cb).toHaveBeenCalledWith(3);
  });

  it("aria-current='page' no atual e nav role", () => {
    render(<ConversasPagination page={3} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /ir para página 3/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: /paginação/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Failing** → FAIL (módulo missing).

- [ ] **Step 3: Implement**:

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

function buildPageItems(
  page: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  const set = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...set]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) result.push("ellipsis");
    result.push(sorted[i]!);
  }
  return result;
}

export function ConversasPagination({
  page,
  totalPages,
  onPageChange,
  className,
}: Props) {
  if (totalPages <= 1) return null;
  const items = buildPageItems(page, totalPages);

  return (
    <nav
      role="navigation"
      aria-label="Paginação de conversas"
      className={cn(
        "flex items-center justify-center gap-1.5 border-t border-border/40 bg-muted/10 p-3",
        className,
      )}
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

- [ ] **Step 4-7**: tests PASS, typecheck, commit.

```bash
git add src/components/reports/conversas-pagination.tsx src/components/reports/__tests__/conversas-pagination.test.tsx
git commit -m "feat(reports): T5 — ConversasPagination numbered + elipsis + aria"
```

---

## Task 6: ConversasTable — paginação props

**Model**: sonnet.
**Files:**
- Modify: `src/components/reports/conversas-table.tsx`
- Modify: `src/components/reports/__tests__/conversas-table.test.tsx`

> Antes: `ui-ux-pro-max:ui-ux-pro-max` query "data table footer pagination total counter sticky toolbar empty state".

- [ ] **Step 1: Read** existente.

- [ ] **Step 2: Tests update** — adicionar/atualizar:

```tsx
const baseProps = {
  initialRows: [baseRow(1, 100)],
  total: 1,
  page: 1,
  pageSize: 1000,
  totalPages: 1,
  onPageChange: jest.fn(),
  accountId: 9,
  filters: { period: { start: new Date(), end: new Date() } } as any,
  sortStack: [],
  onSortStackChange: () => {},
};

it("toolbar mostra 'Total: 1234 conversas · página 2 de 3'", () => {
  render(<ConversasTable {...baseProps} total={1234} page={2} totalPages={3} />);
  expect(screen.getByText(/Total/)).toBeInTheDocument();
  expect(screen.getByText(/1\.234/)).toBeInTheDocument();
  expect(screen.getByText(/página 2 de 3/i)).toBeInTheDocument();
});

it("não renderiza banner amarelo (era 'Mostrando primeiras 10000')", () => {
  render(<ConversasTable {...baseProps} totalPages={50} />);
  expect(screen.queryByText(/refine os filtros/i)).not.toBeInTheDocument();
});

it("renderiza ConversasPagination quando totalPages > 1", () => {
  render(<ConversasTable {...baseProps} totalPages={3} />);
  expect(screen.getByRole("navigation", { name: /paginação/i })).toBeInTheDocument();
});

it("não renderiza ConversasPagination quando totalPages <= 1", () => {
  render(<ConversasTable {...baseProps} totalPages={1} />);
  expect(screen.queryByRole("navigation", { name: /paginação/i })).not.toBeInTheDocument();
});

it("click em página chama onPageChange", () => {
  const cb = jest.fn();
  render(<ConversasTable {...baseProps} totalPages={3} onPageChange={cb} />);
  fireEvent.click(screen.getByRole("button", { name: /ir para página 2/i }));
  expect(cb).toHaveBeenCalledWith(2);
});
```

Remover testes de `initialCursor` truncated banner e `onRowCountChange`.

- [ ] **Step 3: Implementação** — Edit cirúrgico:

**Edit 1** — Interface props:
```ts
// localizar interface ConversasTableProps {} e substituir por:
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
}
```

(Remove `initialCursor`, `onRowCountChange`.)

**Edit 2** — Destructure props:
```ts
// localizar:
export function ConversasTable({
  initialRows, initialCursor, accountId, filters, sortStack,
  onSortStackChange, conditionGroup, onRowCountChange,
}: ConversasTableProps) {

// substituir por:
export function ConversasTable({
  initialRows, total, page, pageSize, totalPages, onPageChange,
  accountId, filters, sortStack, onSortStackChange, conditionGroup,
}: ConversasTableProps) {
```

**Edit 3** — Remover state cursor:
```ts
// localizar e DELETAR:
  const [cursor, setCursor] = useState<string | null>(initialCursor);
```

**Edit 4** — Remover onRowCountChange useEffect (se existe).

**Edit 5** — Toolbar contador:
```ts
// localizar:
        <span className="tabular-nums">
          <span className="font-semibold text-foreground">{rows.length}</span>{" "}
          conversa{rows.length === 1 ? "" : "s"}
        </span>

// substituir por:
        <span className="text-xs text-muted-foreground tabular-nums">
          Total:{" "}
          <strong className="text-foreground">
            {total.toLocaleString("pt-BR")}
          </strong>{" "}
          conversa{total === 1 ? "" : "s"}
          {totalPages > 1 ? (
            <span className="text-muted-foreground/70">
              {" · "}página {page} de {totalPages}
            </span>
          ) : null}
        </span>
```

**Edit 6** — Remover banner amarelo "Mostrando primeiras 10.000" (procurar `initialCursor` ou `Mostrando primeiras` e deletar bloco).

**Edit 7** — Remover loadMore + footer carregar-mais (procurar `Carregar mais` e deletar bloco).

**Edit 8** — Importar ConversasPagination + renderizar:

Adicionar import no topo:
```tsx
import { ConversasPagination } from "@/components/reports/conversas-pagination";
```

Adicionar componente após o div externo da tabela (mas DENTRO do card `<div id="conversas-table">`):
```tsx
{/* fim do <div className="hidden lg:block ..."> ... </div> */}
{/* fim do <ul className="lg:hidden ..."> ... </ul> */}

<ConversasPagination
  page={page}
  totalPages={totalPages}
  onPageChange={onPageChange}
/>

{/* fechamento do <div id="conversas-table"> */}
```

- [ ] **Step 4-7**: tests PASS, typecheck, commit.

```bash
git add src/components/reports/conversas-table.tsx src/components/reports/__tests__/conversas-table.test.tsx
git commit -m "feat(reports): T6 — ConversasTable paginação props + ConversasPagination"
```

---

## Task 7: ConversasPageClient — handlePageChange

**Model**: sonnet.
**Files:**
- Modify: `src/components/reports/conversas-page-client.tsx`

- [ ] **Step 1: Read** o arquivo full.

- [ ] **Step 2: Implementação**:

Imports adicionais:
```tsx
import { useRouter } from "next/navigation";
import { serializeFilterState } from "@/lib/reports/filter-state";
import { useFilterTransition } from "@/components/reports/filter-transition";
```

Atualizar Props:
```ts
interface Props {
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  labels: MetaItem[];
  filterState: FilterState;
  accountId: number;
  initialRows: ConversaRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  reportFilters: FetchConversasInput["filters"];
  conditionGroup?: ConditionGroup;
  currentChatwootUserId: number | null;
}
```

(Remove `initialCursor`.)

Implementação:
```tsx
const router = useRouter();
const { startTransition } = useFilterTransition();

const handlePageChange = useCallback(
  (newPage: number) => {
    const next = { ...filterState, page: newPage > 1 ? newPage : undefined };
    const qs = serializeFilterState(next).toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : "?");
    });
  },
  [filterState, router, startTransition],
);
```

Passar pra `<ConversasTable>`:
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

E `<AdvancedFilters>` recebe `tableRowCount={total}`.

- [ ] **Step 3-5**: typecheck, commit.

```bash
git add src/components/reports/conversas-page-client.tsx
git commit -m "feat(reports): T7 — handlePageChange + plumbing total/page/pageSize"
```

---

## Task 8: AdvancedFilters — pushUrl zera page

**Model**: haiku.
**Files:**
- Modify: `src/components/reports/advanced-filters.tsx`

- [ ] **Step 1: Tests** (criar/atualizar):

```tsx
// se tem test file: adicionar describe; senão criar
import { render, fireEvent } from "@testing-library/react";

const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

describe("AdvancedFilters — pushUrl zera page", () => {
  it("URL gerada não contém page=N quando filtros mudam", () => {
    // setup com filterState.page = 5
    // fireEvent change em algum filtro
    // expect mockRouter.push chamado com URL sem 'page='
  });
});
```

(Skipped se não houver fixtures — pode pular esses tests; o effect é coberto por smoke E2E.)

- [ ] **Step 2: Implementação** — Edit `pushUrl`:

```ts
// localizar:
  const pushUrl = useCallback(
    (state: FilterState) => {
      const qs = serializeFilterState(state).toString();
      startTransition(() => {
        router.push(qs ? `?${qs}` : "?");
      });
    },
    [router, startTransition],
  );

// substituir por:
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

- [ ] **Step 3-5**: typecheck, commit.

```bash
git add src/components/reports/advanced-filters.tsx
git commit -m "feat(reports): T8 — pushUrl zera page (reset 1 quando filtro muda)"
```

---

## Task 9: AdvancedFilters — banner pending exclui search + hint sutil

**Model**: haiku.
**Files:**
- Modify: `src/components/reports/advanced-filters.tsx`

- [ ] **Step 1: Implementação**:

Localizar `const pendingDiff = useMemo(...)` e SUBSTITUIR/EXPANDIR:

```ts
// helper
const withoutSearch = useCallback(
  (s: FilterState): FilterState => ({ ...s, search: undefined }),
  [],
);

const pendingDiffExSearch = useMemo(
  () => diffFilterStates(withoutSearch(draft), withoutSearch(applied)),
  [draft, applied, withoutSearch],
);
const hasPendingNonSearch = pendingDiffExSearch > 0;
const searchPending =
  (draft.search ?? "") !== (applied.search ?? "");

// MANTER hasPending antigo se for usado em outros lugares pra não quebrar
const hasPending = hasPendingNonSearch; // alias retrocompat
```

Localizar o banner pendente (`{hasPending ? <div role="status" ...`) e atualizar:

```tsx
{hasPendingNonSearch ? (
  <div role="status" aria-live="polite" className="...existente">
    <Filter className="h-4 w-4 text-primary" aria-hidden />
    <span>
      <strong>{pendingDiffExSearch}</strong>{" "}
      {pendingDiffExSearch === 1 ? "filtro pendente" : "filtros pendentes"}
    </span>
    {/* botão Aplicar agora — mantém */}
  </div>
) : null}
```

Localizar o `<div data-tour="search">` e adicionar HINT sutil DEPOIS do `<Input>`:

```tsx
<div data-tour="search" className="relative w-full max-w-[320px] min-w-[200px] sm:flex-none">
  <Search ... />
  <Input ... />
  {searchPending ? (
    <span className="mt-1 block px-1 text-[11px] text-muted-foreground/70">
      Aperte Enter para buscar
    </span>
  ) : null}
</div>
```

- [ ] **Step 2-4**: typecheck, commit.

```bash
git add src/components/reports/advanced-filters.tsx
git commit -m "feat(reports): T9 — banner pending exclui search + hint Enter"
```

---

## Task 10: FilterChipListPopover (NEW)

**Model**: sonnet.
**Files:**
- Create: `src/components/reports/filter-chip-list-popover.tsx`
- Create: `src/components/reports/__tests__/filter-chip-list-popover.test.tsx`

> Antes: `ui-ux-pro-max:ui-ux-pro-max` query "popover trigger button list of items remove individual hover state animation chip aria-haspopup".

- [ ] **Step 1: Read** `src/components/ui/popover.tsx` pra confirmar API base-ui.

- [ ] **Step 2: Tests** (5 cenários — ver código completo na spec §3.9 e em plan v2 task 10).

- [ ] **Step 3: Failing** → FAIL.

- [ ] **Step 4: Implement** — código completo na spec §3.9 (FilterChipListPopover).

- [ ] **Step 5-7**: tests PASS, typecheck, commit.

```bash
git add src/components/reports/filter-chip-list-popover.tsx src/components/reports/__tests__/filter-chip-list-popover.test.tsx
git commit -m "feat(reports): T10 — FilterChipListPopover (chip clicável + lista)"
```

---

## Task 11: AppliedFiltersChips — usa FilterChipListPopover quando >= 2 + X destrutivo

**Model**: sonnet.
**Files:**
- Modify: `src/components/reports/applied-filters-chips.tsx`

> Antes: `ui-ux-pro-max:ui-ux-pro-max` query "chip cluster destructive button hover focus contrast".

- [ ] **Step 1: Adicionar prop `onRemoveOne`**:

```ts
interface Props {
  // ... existentes
  onRemoveOne?: (key: keyof FilterState, id: number) => void;
}
```

- [ ] **Step 2: Helper de resolver names + STATUS/PRIORITY locais**:

(STATUS_LABELS / PRIORITY_LABELS já existem no arquivo nas linhas 59-71.)

```ts
interface ResolvedItem { id: number; name: string }

function resolveItems(
  key: keyof FilterState,
  ids: number[],
  meta: Meta,
): ResolvedItem[] {
  if (key === "inboxIds") {
    return ids.map((id) => ({ id, name: meta.inboxes.find((x) => x.id === id)?.name ?? `${id}` }));
  }
  if (key === "teamIds") {
    return ids.map((id) => ({ id, name: meta.teams.find((x) => x.id === id)?.name ?? `${id}` }));
  }
  if (key === "assigneeIds") {
    return ids.map((id) => ({ id, name: meta.assignees.find((x) => x.id === id)?.name ?? `${id}` }));
  }
  if (key === "labelIds") {
    return ids.map((id) => ({ id, name: meta.labels?.find((x) => x.id === id)?.name ?? `${id}` }));
  }
  if (key === "statuses") {
    return ids.map((id) => ({ id, name: STATUS_LABELS[id] ?? `${id}` }));
  }
  if (key === "priorities") {
    return ids.map((id) => ({ id, name: PRIORITY_LABELS[id] ?? `${id}` }));
  }
  return [];
}
```

- [ ] **Step 3: Renderização condicional dos chips de filtro**:

Substituir o `chips.map((c) => ...)` por:

```tsx
{chips.map((c) => {
  const ids = (() => {
    switch (c.key) {
      case "inboxIds": return applied.inboxIds;
      case "teamIds": return applied.teamIds;
      case "assigneeIds": return applied.assigneeIds;
      case "statuses": return applied.statuses;
      case "priorities": return applied.priorities;
      case "labelIds": return applied.labelIds;
      default: return [];
    }
  })();
  const groupName = c.label.split(":")[0]?.trim() ?? c.label;

  if (ids.length >= 2 && onRemoveOne) {
    return (
      <FilterChipListPopover
        key={c.key as string}
        groupLabel={groupName}
        items={resolveItems(c.key, ids, meta)}
        onRemoveOne={(id) => onRemoveOne(c.key, id)}
        onRemoveAll={() => onRemove(c.key)}
      />
    );
  }

  // ids.length === 1 OU sem onRemoveOne: chip simples atual.
  return (
    <span
      key={c.key as string}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-foreground"
    >
      <span className="truncate">{c.label}</span>
      <button
        type="button"
        onClick={() => onRemove(c.key)}
        aria-label={`Remover ${groupName}`}
        className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
})}
```

Adicionar import no topo:
```ts
import { FilterChipListPopover } from "@/components/reports/filter-chip-list-popover";
```

- [ ] **Step 4: X destrutivo nos chips quick e sort**:

Aplicar mesma mudança de className no botão X dentro de `quickChips.map(...)` e `sortChips.map(...)`:
- `hover:bg-muted hover:text-foreground` → `hover:bg-destructive/15 hover:text-destructive`
- `focus-visible:ring-ring/50` → `focus-visible:ring-destructive/40`
- `<X className="h-3 w-3" />` → `<X className="h-3.5 w-3.5" />`

- [ ] **Step 5-7**: tests update (dual-mode), typecheck, commit.

```bash
git add src/components/reports/applied-filters-chips.tsx
git commit -m "feat(reports): T11 — AppliedFiltersChips usa FilterChipListPopover + X destrutivo"
```

---

## Task 12: AdvancedFilters — handleRemoveOne

**Model**: haiku.
**Files:**
- Modify: `src/components/reports/advanced-filters.tsx`

- [ ] **Step 1: Adicionar handler** (depois de `handleRemoveGroup`):

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

- [ ] **Step 2: Passar pra AppliedFiltersChips**:

```tsx
<AppliedFiltersChips
  // ... existentes
  onRemoveOne={handleRemoveOne}
/>
```

- [ ] **Step 3-5**: typecheck, commit.

```bash
git add src/components/reports/advanced-filters.tsx
git commit -m "feat(reports): T12 — AdvancedFilters handleRemoveOne (remove individual)"
```

---

## Task 13: ConversaDrillDown — visual polish

**Model**: sonnet.
**Files:**
- Modify: `src/components/reports/conversa-drill-down.tsx`
- Modify: `src/components/reports/__tests__/conversa-drill-down.test.tsx`

> Antes: `ui-ux-pro-max:ui-ux-pro-max` query "expandable detail panel subtle accent border vertical rhythm chips no extra colors animation fade-in".

- [ ] **Step 1: Tests update**:

Adicionar/substituir cenários:

```tsx
it("Mostra TODOS atributos quando entries.length <= 200", () => {
  const attrs: any = {};
  for (let i = 0; i < 50; i++) attrs[`k${i}`] = `v${i}`;
  render(<ConversaDrillDown row={{ ...baseRow, custom_attributes: attrs } as any} accountId={9} />);
  // 50 chips chave: visíveis
  for (let i = 0; i < 50; i++) {
    expect(screen.getByText(`k${i}:`)).toBeInTheDocument();
  }
});

it("Cap defensivo 200: mostra primeiros 200 + nota '+N atributos não exibidos'", () => {
  const attrs: any = {};
  for (let i = 0; i < 250; i++) attrs[`k${i}`] = `v${i}`;
  render(<ConversaDrillDown row={{ ...baseRow, custom_attributes: attrs } as any} accountId={9} />);
  expect(screen.getByText(/\+50 atributos não exibidos/)).toBeInTheDocument();
});

it("não renderiza botão 'Ver mais'", () => {
  const attrs: any = {};
  for (let i = 0; i < 50; i++) attrs[`k${i}`] = `v${i}`;
  render(<ConversaDrillDown row={{ ...baseRow, custom_attributes: attrs } as any} accountId={9} />);
  expect(screen.queryByRole("button", { name: /ver mais/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Reescrever componente**: ver código completo na spec §3.7 (acima — ConversaDrillDown).

- [ ] **Step 3-5**: tests PASS, typecheck, commit.

```bash
git add src/components/reports/conversa-drill-down.tsx src/components/reports/__tests__/conversa-drill-down.test.tsx
git commit -m "feat(reports): T13 — drill-down visual polish + cap 200 + sem ver-mais"
```

---

## Task 14: PeriodPills — fix showOutsideDays + reset minDate (PRIORIDADE TOTAL)

> **Reforço do super_admin**: este fix é PRIORIDADE TOTAL e vale como **padrão da plataforma**. Afeta TODAS as 8+ telas que usam `<PeriodPills>`:
> - `/relatorios/conversas` (advanced-filters)
> - `/agente-nex/consumo` (consumo-content)
> - `/relatorios/distribuicao`, `/relatorios/equipe`, `/relatorios/origem-ia`, `/relatorios/performance`, `/relatorios/visao-geral`, `/relatorios/mensagens-nao-respondidas` (todos via period-selector-url)
>
> Verificado via grep: `<Calendar>` é usado APENAS em `period-pills.tsx`. Fix único propaga automaticamente.

**Model**: haiku.
**Files:**
- Modify: `src/components/reports/period-pills.tsx`

- [ ] **Step 1: Edit linha ~205** (Calendar):

```tsx
// localizar:
        <Calendar
          mode="range"
          selected={range}
          onSelect={setRange}
          locale={ptBR}
          numberOfMonths={isMobile ? 1 : 2}
          defaultMonth={range?.from ?? minDate}
          showOutsideDays
          disabled={disabledMatcher}
          startMonth={minDate}
          endMonth={today}
        />

// substituir por (remove showOutsideDays):
        <Calendar
          mode="range"
          selected={range}
          onSelect={setRange}
          locale={ptBR}
          numberOfMonths={isMobile ? 1 : 2}
          defaultMonth={range?.from ?? minDate}
          disabled={disabledMatcher}
          startMonth={minDate}
          endMonth={today}
        />
```

- [ ] **Step 2: Adicionar useEffect reset** logo após o `const [minDate, setMinDate]`:

```ts
// Reset minDate quando accountId muda — força re-fetch ao próximo open.
useEffect(() => {
  setMinDate(undefined);
}, [accountId]);
```

- [ ] **Step 3-5**: typecheck, commit.

```bash
git add src/components/reports/period-pills.tsx
git commit -m "fix(reports): T14 — PeriodPills sem showOutsideDays + minDate reset por accountId"
```

---

## Task 15: Tour — step atalhos + bump v3

**Model**: haiku.
**Files:**
- Modify: `src/lib/tours/conversas-tour.ts`
- Modify: `src/components/reports/advanced-filters.tsx`

- [ ] **Step 1: data-tour=atalhos no DOM** — em `advanced-filters.tsx`, localizar `<QuickFiltersPopover` (linha ~359) e envolver:

```tsx
// ANTES:
<QuickFiltersPopover
  active={quickFilters}
  onToggle={onToggleQuick}
  currentChatwootUserId={currentChatwootUserId}
/>

// DEPOIS:
<div data-tour="atalhos">
  <QuickFiltersPopover
    active={quickFilters}
    onToggle={onToggleQuick}
    currentChatwootUserId={currentChatwootUserId}
  />
</div>
```

- [ ] **Step 2: Bump tour id + step atalhos** em `conversas-tour.ts`:

```ts
// localizar:
  id: "conversas-v2",
// substituir por:
  id: "conversas-v3",
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

- [ ] **Step 3: typecheck + commit**:

```bash
npm run typecheck
git add src/lib/tours/conversas-tour.ts src/components/reports/advanced-filters.tsx
git commit -m "feat(tour): T15 — conversas-v3 + step atalhos"
```

---

## Task 16: Bump versão + CHANGELOG + STATUS

**Model**: haiku.
**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Sync remoto**:

```bash
git fetch origin main
git log --oneline HEAD..origin/main
```

Se há novidades: `git pull --rebase origin main`. Resolver conflitos manualmente.

- [ ] **Step 2: Bump package.json** — Edit:
```json
"version": "0.19.0"
```
(era `"0.18.0"`)

- [ ] **Step 3: CHANGELOG.md** — Inserir após `# Changelog\n\n`:

```md
## [v0.19.0] 2026-05-02 — Conversas Polish (paginação 1k + drill-down + filtros UX + calendar fix)

> Pacote consolidado de polimento + hotfixes em /relatorios/conversas, derivado dos screenshots do super_admin. Workflow rigoroso (spec v1→v2→v3 com 30+18 achados de pente-fino + plan v1→v2→v3 com 20+33 achados + ui-ux-pro-max em todas tasks UI). 8 ajustes diretos.

### Implementação

- **Paginação clássica numerada** (1.000-em-1.000) com indicador "Total: X conversas · página N de M". Substitui cursor pagination + banner amarelo "Mostrando primeiras 10.000" + bug `page.tsx` que não passava `limit` (caía em DEFAULT_LIMIT=50). URL ?page=N. Setinhas + páginas + elipsis automática (1 … 5 6 7 … 12). count(*) paralelo no backend.
- **Drill-down visual mais limpo**: border-l violet sutil + animação fade-in 200ms + sempre todos atributos visíveis (cap defensivo 200 com nota "+N atributos não exibidos" no caso patológico). Remove botões "Ver mais"/"Recolher".
- **Busca não dispara mais "filtro pendente" no draft**: banner pendente exclui search; hint sutil "Aperte Enter para buscar" abaixo do input quando há texto não aplicado.
- **Skip-link "Pular para a tabela"** some visualmente (mantém anúncio screen reader via `sr-only`).
- **Chips +N expansíveis**: chips com 2+ items (Caixa de entrada, Departamento, Atendente, Etiquetas, Status, Prioridade) viram Popover clicável com lista vertical + X individual + "Remover todos" + animação zoom-in 150ms + aria-haspopup="dialog".
- **X dos chips mais destacado**: hover destrutivo (`bg-destructive/15 text-destructive`); ícone aumentado (h-3.5 w-3.5).
- **Calendar `showOutsideDays={false}`** (fix do bug em PeriodPills que passava sem valor).
- **minDate reseta** quando troca conta no sidebar (re-fetch da primeira conversa da conta no próximo open do picker).
- **Tour `conversas-v3`** ganha step "Atalhos rápidos" + bump de id (re-onboarding 1x).

### Compat

- `?page=N` na URL (omitido se 1).
- `pageSize` fixo 1000 (não persiste).
- Filtros mudam → reset page=1 (pushUrl zera page automaticamente).
- Export ignora page (sempre exporta tudo, até 50k).
- `conversasList(cursor: ...)` continua funcionando para `exportConversasAction` (modo cursor preservado).

### Notas

- count(*) com search ILIKE em 8+ colunas pode demorar 100-600ms em datasets típicos. TTL cache 30s mitiga refetches.
- Cap defensivo 200 atributos no drill-down (caso patológico).
```

- [ ] **Step 4: docs/STATUS.md** — atualizar header `Versão atual em produção: v0.17.0` → `v0.19.0` (e talvez v0.18.0 se aparecer).

Adicionar seção logo abaixo de `## Em produção`:

```md
## Em produção (v0.19.0)

### Release v0.19.0 (2026-05-02) — Conversas Polish (paginação 1k + drill-down + filtros UX + calendar fix)

Polimento + hotfixes do `/relatorios/conversas`: paginação clássica 1.000-em-1.000 com indicador total + páginas + elipsis substitui cursor pagination + banner amarelo + bug do `limit` faltando; drill-down visual minimal (border-l violet + animação fade-in + sempre todos atributos com cap defensivo 200); busca UX (banner pendente exclui search + hint sutil + skip-link sr-only puro); chips +N expansíveis em popover com X individual + "Remover todos"; X dos chips com hover destrutivo; calendar `showOutsideDays={false}` (fix do PeriodPills); minDate reset por accountId; tour `conversas-v3` + step Atalhos. Spec v3 com 30+18 achados de pente-fino · plan v3 com 20+33 achados · ui-ux-pro-max em todas tasks UI.
```

- [ ] **Step 5: Commit**:

```bash
git add package.json CHANGELOG.md docs/STATUS.md
git commit -m "chore(release): bump v0.19.0 — Conversas Polish"
```

---

## Task 17: Verification + push + deploy + smoke

**Model**: haiku.
**Files:** none (orchestration).

- [ ] **Step 1: Tests + typecheck + build**:

```bash
npm test
npm run typecheck
npm run build
```

Todos verde.

- [ ] **Step 2: Sync final + push**:

```bash
git fetch origin main
gh run list --limit 5
# Se há build em curso: aguardar.
git push origin main
```

- [ ] **Step 3: Watch CI**:

```bash
gh run list --limit 1 | head -1   # pegar id do run novo
gh run watch <run-id>
```

- [ ] **Step 4: Portainer fix**:

```bash
gh workflow run portainer-fix.yml -f app_version=v0.19.0
gh run watch $(gh run list --workflow=portainer-fix.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

- [ ] **Step 5: Verificar /api/health até v0.19.0**:

```bash
until curl -s https://insights.nexusai360.com/api/health | grep -q '"version":"v0.19.0"'; do sleep 5; done
curl -s https://insights.nexusai360.com/api/health
```

- [ ] **Step 6: HISTORY.md + close active**:

```bash
cat >> docs/agents/HISTORY.md <<'EOF'

2026-05-02 HH:MM | agent=claude-conversas-v019 | run=<run-id> | scope=release | summary=v0.19.0 LIVE — Conversas Polish.
EOF
git add docs/agents/HISTORY.md
git commit -m "docs(agents): registra v0.19.0 LIVE em HISTORY"

rm docs/agents/active/claude-conversas-v019.md
git add -u docs/agents/active/claude-conversas-v019.md
git commit -m "docs(agents): encerra sessão claude-conversas-v019"

git push origin main
```

- [ ] **Step 7: Smoke E2E** (manual após deploy — passa pro user):

1. Filtrar período (1-30 abr) + caixa Alagoas + dept Comercial + busca "Marcela" → resultados certos.
2. Trocar conta no sidebar → abrir picker → minDate reflete nova conta.
3. **Calendário não mostra dias overflow em /relatorios/conversas**.
4. **Calendário não mostra dias overflow em /agente-nex/consumo** (verificação cross-tela).
5. **Calendário não mostra dias overflow em /relatorios/distribuicao** (verificação cross-tela).
6. Click em chip "Caixa de entrada: AL-Alagoas +2" → popover abre com lista.
7. Paginação navega; total mostra correto; ?page= reflete na URL; back/forward funciona.
8. Mudar filtro com page=5 → URL volta pra page=1.
9. Tour v3 mostra step "Atalhos rápidos".
10. Drill-down: layout polido, sem botão "Ver mais".

- [ ] **Step 8: Avisar user**.

---

## Self-Review (controlador antes de despachar T1)

- [x] **Spec coverage**: §1-§3.13 da spec mapeados em T1-T15. T16-T17 release.
- [x] **No placeholders**: cada task tem código completo OR Edit cirúrgico explícito apontando arquivo+linha.
- [x] **Type consistency**: `FetchConversasResult` tem total/page/pageSize/totalPages em T3 e usado em T4/T6/T7. `ConversaListResult` total em T2. `FilterState.page` em T1, usado em T4/T7/T8.
- [x] **TDD rigoroso**: tasks com lógica testável (T1-T3, T5, T6, T8, T9, T10, T11, T13, T14) começam com test.
- [x] **ui-ux-pro-max obrigatório**: T5, T6, T10, T11, T13 mencionam invocação obrigatória.
- [x] **Stage apenas seus**: convenções incluem aviso explícito.
- [x] **Modelo por task**: enumerado no topo.
