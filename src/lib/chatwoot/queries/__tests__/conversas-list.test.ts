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

describe("conversasList — canonical SQL (v0.42)", () => {
  beforeEach(() => {
    (queryNexusChat as jest.Mock).mockReset();
    (queryNexusChat as jest.Mock).mockResolvedValue({ rows: [] });
  });

  function getMainSql(): string {
    // No modo cursor (1 query), call[0] é a query principal de SELECT.
    return (queryNexusChat as jest.Mock).mock.calls[0][1] as string;
  }

  it("SQL contém as 3 CTEs canônicas (last_classification_msg, last_incoming_public_msg, last_outgoing_any_msg)", async () => {
    await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      cursor: null,
      limit: 50,
    });
    const sql = getMainSql();
    expect(sql).toMatch(/WITH last_classification_msg AS/);
    expect(sql).toMatch(/last_incoming_public_msg AS/);
    expect(sql).toMatch(/last_outgoing_any_msg AS/);
  });

  it("NÃO contém a CTE inline antiga `WITH last_msg AS`", async () => {
    await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      cursor: null,
      limit: 50,
    });
    const sql = getMainSql();
    expect(sql).not.toMatch(/WITH last_msg AS/);
  });

  it("waiting_seconds calculado de lipm.msg_created_at quando lcm.message_type = 0 (incoming)", async () => {
    await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      cursor: null,
      limit: 50,
    });
    const sql = getMainSql();
    // CASE WHEN c.status = 1 THEN NULL WHEN lcm.message_type = 0 THEN ... lipm.msg_created_at
    expect(sql).toMatch(
      /WHEN\s+lcm\.message_type\s*=\s*0\s+THEN\s+EXTRACT\(EPOCH\s+FROM\s*\(\s*NOW\(\)\s*-\s*lipm\.msg_created_at\s*\)\)/,
    );
  });

  it("open_seconds calculado de loam.msg_created_at quando lcm.message_type = 1 (outgoing)", async () => {
    await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      cursor: null,
      limit: 50,
    });
    const sql = getMainSql();
    expect(sql).toMatch(
      /WHEN\s+lcm\.message_type\s*=\s*1\s+THEN\s+EXTRACT\(EPOCH\s+FROM\s*\(\s*NOW\(\)\s*-\s*loam\.msg_created_at\s*\)\)/,
    );
  });

  it("conversa resolvida (status=1) zera waiting_seconds e open_seconds", async () => {
    await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      cursor: null,
      limit: 50,
    });
    const sql = getMainSql();
    // duas ocorrências (uma p/ waiting_seconds, outra p/ open_seconds)
    const matches = sql.match(/WHEN\s+c\.status\s*=\s*1\s+THEN\s+NULL/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("LEFT JOIN nas 3 CTEs canônicas com aliases lcm, lipm, loam", async () => {
    await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      cursor: null,
      limit: 50,
    });
    const sql = getMainSql();
    expect(sql).toMatch(/LEFT JOIN last_classification_msg lcm ON lcm\.conversation_id = c\.id/);
    expect(sql).toMatch(/LEFT JOIN last_incoming_public_msg lipm ON lipm\.conversation_id = c\.id/);
    expect(sql).toMatch(/LEFT JOIN last_outgoing_any_msg loam ON loam\.conversation_id = c\.id/);
  });

  it("default 'active' de buildBaseFilter aplica c.last_activity_at no WHERE", async () => {
    await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      cursor: null,
      limit: 50,
    });
    const sql = getMainSql();
    // Filtro de período pelo default canônico active
    expect(sql).toMatch(/c\.last_activity_at\s*>=\s*\$\d+/);
    // E NÃO usa c.created_at no recorte de período
    expect(sql).not.toMatch(/c\.created_at\s*>=\s*\$\d+/);
  });

  it("last_message_type/last_message_at vêm da CTE canônica (lcm)", async () => {
    await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      cursor: null,
      limit: 50,
    });
    const sql = getMainSql();
    expect(sql).toMatch(/lcm\.message_type AS last_message_type/);
    expect(sql).toMatch(/lcm\.msg_created_at AS last_message_at/);
  });

  it("last_incoming_at vem de lipm e last_outgoing_at vem de loam", async () => {
    await conversasList({
      connectionId: CONN_ID,
      accountId: 9,
      filters: baseFilters,
      cursor: null,
      limit: 50,
    });
    const sql = getMainSql();
    expect(sql).toMatch(/lipm\.msg_created_at AS last_incoming_at/);
    expect(sql).toMatch(/loam\.msg_created_at AS last_outgoing_at/);
  });
});
