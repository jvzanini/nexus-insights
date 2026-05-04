jest.mock("@/lib/nexus-chat/pool", () => ({
  queryNexusChat: jest.fn(),
}));
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
import { queryNexusChat } from "@/lib/nexus-chat/pool";

const baseFilters: any = {
  period: { start: new Date("2026-04-01"), end: new Date("2026-04-30") },
};

const CONN_ID = "11111111-2222-3333-4444-555555555555";

describe("conversasList — offset/cursor modes (multi-tenant)", () => {
  beforeEach(() => {
    (queryNexusChat as jest.Mock).mockReset();
  });

  it("modo offset: roda 2 queries em paralelo (rows + count)", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValueOnce({ rows: [] });
    (queryNexusChat as jest.Mock).mockResolvedValueOnce({
      rows: [{ total: "100" }],
    });
    const r = await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      page: 1,
      pageSize: 50,
    });
    expect(queryNexusChat).toHaveBeenCalledTimes(2);
    expect(r.data.total).toBe(100);
    expect(r.data.page).toBe(1);
    expect(r.data.pageSize).toBe(50);
    expect(r.data.nextCursor).toBeNull();
  });

  it("propaga connectionId para queryNexusChat (1º parâmetro)", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValueOnce({ rows: [] });
    (queryNexusChat as jest.Mock).mockResolvedValueOnce({
      rows: [{ total: "0" }],
    });
    await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      page: 1,
      pageSize: 50,
    });
    const firstCall = (queryNexusChat as jest.Mock).mock.calls[0];
    expect(firstCall[0]).toBe(CONN_ID);
    const secondCall = (queryNexusChat as jest.Mock).mock.calls[1];
    expect(secondCall[0]).toBe(CONN_ID);
  });

  it("modo cursor: 1 query (compat); total=0", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValueOnce({ rows: [] });
    const r = await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      cursor: null,
      limit: 50,
    });
    expect(queryNexusChat).toHaveBeenCalledTimes(1);
    expect(r.data.total).toBe(0);
  });

  it("offset SQL contém OFFSET", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValueOnce({ rows: [] });
    (queryNexusChat as jest.Mock).mockResolvedValueOnce({
      rows: [{ total: "0" }],
    });
    await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      page: 3,
      pageSize: 25,
    });
    const sql = (queryNexusChat as jest.Mock).mock.calls[0][1] as string;
    expect(sql).toMatch(/OFFSET\s+\$\d+/);
    const params = (queryNexusChat as jest.Mock).mock.calls[0][2] as unknown[];
    expect(params).toContain(50); // (3-1)*25
  });

  it("page < 1 clamp pra 1", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValueOnce({ rows: [] });
    (queryNexusChat as jest.Mock).mockResolvedValueOnce({
      rows: [{ total: "0" }],
    });
    const r = await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      page: -5,
      pageSize: 1000,
    });
    expect(r.data.page).toBe(1);
  });

  it("pageSize > MAX_LIMIT clamp pra MAX_LIMIT (50_000)", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValueOnce({ rows: [] });
    (queryNexusChat as jest.Mock).mockResolvedValueOnce({
      rows: [{ total: "0" }],
    });
    const r = await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      page: 1,
      pageSize: 99999,
    });
    expect(r.data.pageSize).toBe(50_000);
  });

  it("pageSize < 10 clamp pra 10", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValueOnce({ rows: [] });
    (queryNexusChat as jest.Mock).mockResolvedValueOnce({
      rows: [{ total: "0" }],
    });
    const r = await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      page: 1,
      pageSize: 1,
    });
    expect(r.data.pageSize).toBe(10);
  });
});
