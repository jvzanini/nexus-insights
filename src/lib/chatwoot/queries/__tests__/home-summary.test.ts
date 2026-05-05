/**
 * Tests for home-summary canonical period column.
 *
 * Após Task 8 do plan canonical-data-rules:
 *  - default `periodColumn: "active"` propaga via buildBaseFilter → SQL
 *    base contém `c.last_activity_at >= $...`.
 *  - Janelas rolling fixas (`now() - interval '24 hours'`) em sqlP50/sqlTop são
 *    intencionais (Apêndice A.9) — não devem ser confundidas com filtro do
 *    usuário. O sqlP50 opera em reporting_events (sem buildBaseFilter).
 *  - cache key contém o sufixo `canonical-v0.42`.
 */

jest.mock("@/lib/cache/pull-through", () => ({
  withCache: async ({
    fetcher,
  }: {
    fetcher: () => Promise<{ data: unknown; stale: boolean }>;
  }) => {
    const r = await fetcher();
    return { data: r.data, cached: false, stale: r.stale };
  },
}));
jest.mock("../../resilience", () => ({
  withChatwootResilience: async <T,>(fn: () => Promise<T>) => ({
    data: await fn(),
    stale: false,
  }),
}));
jest.mock("@/lib/nexus-chat/pool", () => ({
  queryNexusChat: jest.fn(),
}));

import { homeSummary } from "../home-summary";

const { queryNexusChat } = jest.requireMock("@/lib/nexus-chat/pool");

const PERIOD_START = new Date("2026-04-01T00:00:00Z");
const PERIOD_END = new Date("2026-04-30T23:59:59Z");
const CONN_ID = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

describe("homeSummary (canonical periodColumn)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (queryNexusChat as jest.Mock).mockResolvedValue({ rows: [] });
  });

  it("SQL base usa c.last_activity_at (default canonical 'active') e janela rolling 24h é preservada", async () => {
    await homeSummary(CONN_ID, {
      accountId: 1,
      filters: { period: { start: PERIOD_START, end: PERIOD_END } },
    });

    // 6 queries concorrentes (Promise.all): hoje, ontem, backlog, orfas, p50, top.
    expect(queryNexusChat).toHaveBeenCalledTimes(6);

    const sqlByIndex = (queryNexusChat as jest.Mock).mock.calls.map(
      (c) => c[1] as string,
    );

    // Pelo menos uma das queries com base filter deve usar c.last_activity_at.
    const hasActiveBase = sqlByIndex.some((s) =>
      s.includes("c.last_activity_at >= $"),
    );
    expect(hasActiveBase).toBe(true);

    // Janela rolling 24h em sqlTop é intencional (Apêndice A.9) — manter.
    const hasRollingWindow = sqlByIndex.some((s) =>
      s.includes("now() - interval '24 hours'"),
    );
    expect(hasRollingWindow).toBe(true);

    // Nenhuma das queries com filtro do usuário deve filtrar c.created_at >= $
    // (KPI base é "active"). Subqueries hoje/ontem usam c.created_at AT TIME ZONE
    // para "data brasileira de hoje" (independente do filtro do período do
    // usuário) — esse uso não é "filtro de período", é "data atual TZ".
    const usesCreatedFilterParam = sqlByIndex.some((s) =>
      /c\.created_at\s*>=\s*\$/.test(s),
    );
    expect(usesCreatedFilterParam).toBe(false);
  });

  it("source contém marker de cache key 'canonical-v0.42'", () => {
    const fs = jest.requireActual("fs") as typeof import("fs");
    const path = jest.requireActual("path") as typeof import("path");
    const src = fs.readFileSync(
      path.join(__dirname, "..", "home-summary.ts"),
      "utf8",
    );
    expect(src).toContain("canonical-v0.42");
  });
});
