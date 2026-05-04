/**
 * Tests for leads-recebidos multi-tenant migration.
 *
 * - args agora contém connectionId; queryNexusChat é chamada com
 *   (connectionId, sql, params).
 * - Quando compareWith=true, 2 queries (current + previous).
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

import { leadsRecebidos } from "../leads-recebidos";

const { queryNexusChat } = jest.requireMock("@/lib/nexus-chat/pool");

const PERIOD_START = new Date("2026-04-01T00:00:00Z");
const PERIOD_END = new Date("2026-04-30T23:59:59Z");
const CONN_ID = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

describe("leadsRecebidos (multi-tenant)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("propaga connectionId em queryNexusChat (1 query, sem compareWith)", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValue({
      rows: [{ bucket: "2026-04-01", total: "5" }],
    });

    const r = await leadsRecebidos({
      connectionId: CONN_ID,
      accountId: 1,
      filters: { period: { start: PERIOD_START, end: PERIOD_END } },
      granularity: "day",
    });

    expect(queryNexusChat).toHaveBeenCalledTimes(1);
    expect((queryNexusChat as jest.Mock).mock.calls[0][0]).toBe(CONN_ID);
    expect(r.data.rows).toEqual([{ bucket: "2026-04-01", total: 5 }]);
    expect(r.data.comparison).toBeUndefined();
  });

  it("compareWith=true → 2 queries, ambas com connectionId", async () => {
    (queryNexusChat as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{ bucket: "2026-04-01", total: "10" }],
      })
      .mockResolvedValueOnce({ rows: [{ total: "8" }] });

    const r = await leadsRecebidos({
      connectionId: CONN_ID,
      accountId: 1,
      filters: { period: { start: PERIOD_START, end: PERIOD_END } },
      granularity: "day",
      compareWith: true,
    });

    expect(queryNexusChat).toHaveBeenCalledTimes(2);
    expect((queryNexusChat as jest.Mock).mock.calls[0][0]).toBe(CONN_ID);
    expect((queryNexusChat as jest.Mock).mock.calls[1][0]).toBe(CONN_ID);
    expect(r.data.comparison?.previousTotal).toBe(8);
    expect(r.data.comparison?.currentTotal).toBe(10);
  });
});
