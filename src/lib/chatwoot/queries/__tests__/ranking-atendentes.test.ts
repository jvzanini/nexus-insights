/**
 * Tests for ranking-atendentes multi-tenant migration.
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

import { rankingAtendentes } from "../ranking-atendentes";

const { queryNexusChat } = jest.requireMock("@/lib/nexus-chat/pool");

const PERIOD_START = new Date("2026-04-01T00:00:00Z");
const PERIOD_END = new Date("2026-04-30T23:59:59Z");
const CONN_ID = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

describe("rankingAtendentes (multi-tenant)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("propaga connectionId em queryNexusChat e respeita limit", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValue({
      rows: [
        {
          user_id: 7,
          name: "Ana",
          email: "ana@matrix.com",
          volume: "30",
          resolved: "25",
          p50: "180",
        },
      ],
    });

    const r = await rankingAtendentes({
      connectionId: CONN_ID,
      accountId: 1,
      filters: { period: { start: PERIOD_START, end: PERIOD_END } },
      limit: 10,
    });

    expect(queryNexusChat).toHaveBeenCalledTimes(1);
    const call = (queryNexusChat as jest.Mock).mock.calls[0];
    expect(call[0]).toBe(CONN_ID);
    expect(typeof call[1]).toBe("string");
    expect(Array.isArray(call[2])).toBe(true);
    // limit é o último param (após filters params)
    expect(call[2][call[2].length - 1]).toBe(10);
    expect(r.data).toEqual([
      {
        userId: 7,
        name: "Ana",
        email: "ana@matrix.com",
        volume: 30,
        resolved: 25,
        p50FirstResponseSec: 180,
      },
    ]);
  });

  it("SQL filtra por c.last_activity_at (default canonical 'active')", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValue({ rows: [] });

    await rankingAtendentes({
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
      path.join(__dirname, "..", "ranking-atendentes.ts"),
      "utf8",
    );
    expect(src).toContain("canonical-v0.42");
  });
});
