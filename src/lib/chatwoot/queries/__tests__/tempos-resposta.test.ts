/**
 * Tests for tempos-resposta multi-tenant migration.
 *
 * - 2 sub-queries em paralelo (first_response + conversation_resolved).
 * - args agora contém connectionId; queryNexusChat é chamada 2× com
 *   o mesmo connectionId.
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

import { temposResposta } from "../tempos-resposta";

const { queryNexusChat } = jest.requireMock("@/lib/nexus-chat/pool");

const PERIOD_START = new Date("2026-04-01T00:00:00Z");
const PERIOD_END = new Date("2026-04-30T23:59:59Z");
const CONN_ID = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

describe("temposResposta (multi-tenant)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("dispara 2 queries em paralelo, ambas com connectionId", async () => {
    (queryNexusChat as jest.Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            avg: "100.4",
            p50: "90.2",
            p95: "300.1",
            max: "1000",
            count: "50",
            bh_avg: "80.7",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            avg: "500.6",
            p50: "400",
            p95: "800",
            max: "5000",
            count: "30",
            bh_avg: "450",
          },
        ],
      });

    const r = await temposResposta({
      connectionId: CONN_ID,
      accountId: 1,
      filters: { period: { start: PERIOD_START, end: PERIOD_END } },
    });

    expect(queryNexusChat).toHaveBeenCalledTimes(2);
    expect((queryNexusChat as jest.Mock).mock.calls[0][0]).toBe(CONN_ID);
    expect((queryNexusChat as jest.Mock).mock.calls[1][0]).toBe(CONN_ID);
    expect(r.data.first_response).toEqual({
      avg: 100,
      p50: 90,
      p95: 300,
      max: 1000,
      count: 50,
    });
    expect(r.data.resolution).toEqual({
      avg: 501,
      p50: 400,
      p95: 800,
      max: 5000,
      count: 30,
    });
    expect(r.data.business_hours).toEqual({
      first_response_avg: 81,
      resolution_avg: 450,
    });
  });

  it("aplica needsJoin (teamIds) sem perder connectionId", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValue({ rows: [] });

    await temposResposta({
      connectionId: CONN_ID,
      accountId: 1,
      filters: {
        period: { start: PERIOD_START, end: PERIOD_END },
        teamIds: [99],
      },
    });

    expect(queryNexusChat).toHaveBeenCalledTimes(2);
    for (const call of (queryNexusChat as jest.Mock).mock.calls) {
      expect(call[0]).toBe(CONN_ID);
      // SQL deve conter o JOIN quando teamIds é setado.
      expect(call[1]).toContain("JOIN conversations c");
    }
  });
});
