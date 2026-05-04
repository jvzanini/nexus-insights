/**
 * Tests for por-estado multi-tenant migration.
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

import { porEstado } from "../por-estado";

const { queryNexusChat } = jest.requireMock("@/lib/nexus-chat/pool");

const PERIOD_START = new Date("2026-04-01T00:00:00Z");
const PERIOD_END = new Date("2026-04-30T23:59:59Z");
const CONN_ID = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

describe("porEstado (multi-tenant)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("propaga connectionId em queryNexusChat", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValue({
      rows: [
        {
          inbox_id: 5,
          inbox_name: "MG-Minas Gerais",
          volume: "20",
          open: "10",
          resolved: "8",
          pending: "2",
          avg_fr: "200",
          top_agent_name: "Ana",
        },
      ],
    });

    const r = await porEstado({
      connectionId: CONN_ID,
      accountId: 1,
      filters: { period: { start: PERIOD_START, end: PERIOD_END } },
    });

    expect(queryNexusChat).toHaveBeenCalledTimes(1);
    expect((queryNexusChat as jest.Mock).mock.calls[0][0]).toBe(CONN_ID);
    expect(r.data).toEqual([
      {
        inboxId: 5,
        inboxName: "MG-Minas Gerais",
        volume: 20,
        open: 10,
        resolved: 8,
        pending: 2,
        topAgentName: "Ana",
        avgFirstResponseSec: 200,
      },
    ]);
  });

  it("SQL filtra por c.last_activity_at (default canonical 'active')", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValue({ rows: [] });

    await porEstado({
      connectionId: CONN_ID,
      accountId: 1,
      filters: { period: { start: PERIOD_START, end: PERIOD_END } },
    });

    const sql = (queryNexusChat as jest.Mock).mock.calls[0][1] as string;
    expect(sql).toContain("c.last_activity_at >= $");
    expect(sql).not.toMatch(/c\.created_at\s*>=\s*\$/);
  });

  it("source contém marker de cache key 'canonical-v0.42'", () => {
    const fs = jest.requireActual("fs") as typeof import("fs");
    const path = jest.requireActual("path") as typeof import("path");
    const src = fs.readFileSync(
      path.join(__dirname, "..", "por-estado.ts"),
      "utf8",
    );
    expect(src).toContain("canonical-v0.42");
  });
});
