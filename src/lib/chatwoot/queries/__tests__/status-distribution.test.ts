/**
 * Tests for status-distribution canonical period column.
 *
 * Após Task 8 do plan canonical-data-rules:
 *  - default `periodColumn: "active"` propaga via buildBaseFilter → SQL
 *    contém `c.last_activity_at >= $...` e nunca `c.created_at >= $...`.
 *  - cache key contém o sufixo `canonical-v0.42` para evitar stale.
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

import { statusDistribution } from "../status-distribution";

const { queryNexusChat } = jest.requireMock("@/lib/nexus-chat/pool");

const PERIOD_START = new Date("2026-04-01T00:00:00Z");
const PERIOD_END = new Date("2026-04-30T23:59:59Z");
const CONN_ID = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

describe("statusDistribution (canonical periodColumn)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("SQL filtra por c.last_activity_at (default canonical 'active')", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValue({ rows: [] });

    await statusDistribution(CONN_ID, {
      accountId: 1,
      filters: { period: { start: PERIOD_START, end: PERIOD_END } },
    });

    expect(queryNexusChat).toHaveBeenCalledTimes(1);
    const sql = (queryNexusChat as jest.Mock).mock.calls[0][1] as string;
    expect(sql).toContain("c.last_activity_at >= $");
    expect(sql).not.toMatch(/c\.created_at\s*>=\s*\$/);
  });

  it("source contém marker de cache key 'canonical-v0.42'", () => {
    const fs = jest.requireActual("fs") as typeof import("fs");
    const path = jest.requireActual("path") as typeof import("path");
    const src = fs.readFileSync(
      path.join(__dirname, "..", "status-distribution.ts"),
      "utf8",
    );
    expect(src).toContain("canonical-v0.42");
  });
});
