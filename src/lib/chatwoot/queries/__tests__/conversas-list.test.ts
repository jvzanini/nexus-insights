import { mockDeep } from "jest-mock-extended";
import type { Pool } from "pg";

jest.mock("../../pool", () => ({ getChatwootPool: jest.fn() }));
jest.mock("@/lib/cache/pull-through", () => ({
  withCache: ({ fetcher }: any) =>
    fetcher().then((data: any) => ({ data, stale: false, cached: false })),
}));
jest.mock("../../resilience", () => ({
  withChatwootResilience: (fn: any) => fn(),
}));
jest.mock("@/lib/cache/keys", () => ({
  cacheKey: (args: any) => `cache:${args.name}`,
  hashFilters: () => "hash",
}));

import { conversasList } from "@/lib/chatwoot/queries/conversas-list";
import { getChatwootPool } from "@/lib/chatwoot/pool";

const baseFilters: any = {
  period: { start: new Date("2026-04-01"), end: new Date("2026-04-30") },
};

describe("conversasList — offset/cursor modes", () => {
  let pool: any;
  beforeEach(() => {
    pool = mockDeep<Pool>();
    (getChatwootPool as jest.Mock).mockReturnValue(pool);
  });

  it("modo offset: roda 2 queries em paralelo (rows + count)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: "100" }] });
    const r = await conversasList({
      accountId: 9,
      filters: baseFilters,
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
      filters: baseFilters,
      cursor: null,
      limit: 50,
    });
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(r.data.total).toBe(0);
  });

  it("offset SQL contém OFFSET", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: "0" }] });
    await conversasList({
      accountId: 9,
      filters: baseFilters,
      page: 3,
      pageSize: 25,
    });
    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toMatch(/OFFSET\s+\$\d+/);
    const params = pool.query.mock.calls[0][1] as unknown[];
    expect(params).toContain(50); // (3-1)*25
  });

  it("page < 1 clamp pra 1", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: "0" }] });
    const r = await conversasList({
      accountId: 9,
      filters: baseFilters,
      page: -5,
      pageSize: 1000,
    });
    expect(r.data.page).toBe(1);
  });

  it("pageSize > MAX_LIMIT clamp pra MAX_LIMIT (50_000)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: "0" }] });
    const r = await conversasList({
      accountId: 9,
      filters: baseFilters,
      page: 1,
      pageSize: 99999,
    });
    expect(r.data.pageSize).toBe(50_000);
  });

  it("pageSize < 10 clamp pra 10", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: "0" }] });
    const r = await conversasList({
      accountId: 9,
      filters: baseFilters,
      page: 1,
      pageSize: 1,
    });
    expect(r.data.pageSize).toBe(10);
  });
});
