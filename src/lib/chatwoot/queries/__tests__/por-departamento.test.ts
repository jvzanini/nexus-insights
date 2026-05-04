/**
 * Tests for por-departamento multi-tenant migration.
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

import { porDepartamento } from "../por-departamento";

const { queryNexusChat } = jest.requireMock("@/lib/nexus-chat/pool");

const PERIOD_START = new Date("2026-04-01T00:00:00Z");
const PERIOD_END = new Date("2026-04-30T23:59:59Z");
const CONN_ID = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

describe("porDepartamento (multi-tenant)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("propaga connectionId em queryNexusChat", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValue({
      rows: [
        {
          team_id: 1,
          team_name: "Vendas",
          volume: "10",
          open: "5",
          resolved: "3",
          pending: "2",
          avg_fr: "120",
        },
      ],
    });

    const r = await porDepartamento({
      connectionId: CONN_ID,
      accountId: 1,
      filters: { period: { start: PERIOD_START, end: PERIOD_END } },
    });

    expect(queryNexusChat).toHaveBeenCalledTimes(1);
    expect((queryNexusChat as jest.Mock).mock.calls[0][0]).toBe(CONN_ID);
    expect(r.data).toEqual([
      {
        teamId: 1,
        teamName: "Vendas",
        volume: 10,
        open: 5,
        resolved: 3,
        pending: 2,
        avgFirstResponseSec: 120,
      },
    ]);
  });
});
