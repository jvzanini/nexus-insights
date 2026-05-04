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

import { mensagensNaoRespondidas } from "@/lib/chatwoot/queries/mensagens-nao-respondidas";
import { queryNexusChat } from "@/lib/nexus-chat/pool";

const CONNECTION_ID = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

const baseFilters: any = {};

describe("mensagensNaoRespondidas — multi-tenant via queryNexusChat", () => {
  beforeEach(() => {
    (queryNexusChat as jest.Mock).mockReset();
  });

  it("recebe connectionId como 1º parâmetro e propaga para queryNexusChat", async () => {
    (queryNexusChat as jest.Mock)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { total: 0, avg_waiting_seconds: 0, oldest_waiting_seconds: 0 },
        ],
      });

    await mensagensNaoRespondidas(CONNECTION_ID, {
      accountId: 9,
      filters: baseFilters,
    });

    expect(queryNexusChat).toHaveBeenCalledTimes(2);
    expect((queryNexusChat as jest.Mock).mock.calls[0][0]).toBe(CONNECTION_ID);
    expect((queryNexusChat as jest.Mock).mock.calls[1][0]).toBe(CONNECTION_ID);
  });

  it("retorna agregados e linhas mapeadas", async () => {
    const lastIncoming = new Date("2026-05-01T12:00:00.000Z");
    (queryNexusChat as jest.Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 100,
            display_id: 42,
            contact_name: "Fulano",
            contact_phone: "+5511999999999",
            inbox_name: "Suporte",
            team_name: "Time A",
            assignee_name: "Atendente",
            last_incoming_at: lastIncoming,
            waiting_seconds: 360,
            snippet: "olá",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { total: "1", avg_waiting_seconds: "360", oldest_waiting_seconds: "360" },
        ],
      });

    const result = await mensagensNaoRespondidas(CONNECTION_ID, {
      accountId: 9,
      filters: baseFilters,
    });

    expect(result.data.rows).toHaveLength(1);
    expect(result.data.rows[0].id).toBe(100);
    expect(result.data.rows[0].last_incoming_at).toBe(lastIncoming.toISOString());
    expect(result.data.total).toBe(1);
    expect(result.data.avgWaitingSeconds).toBe(360);
    expect(result.data.oldestWaitingSeconds).toBe(360);
  });

  it("clamp do limit em MAX_LIMIT (500)", async () => {
    (queryNexusChat as jest.Mock)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { total: 0, avg_waiting_seconds: 0, oldest_waiting_seconds: 0 },
        ],
      });

    await mensagensNaoRespondidas(CONNECTION_ID, {
      accountId: 9,
      filters: baseFilters,
      limit: 99999,
    });

    const listParams = (queryNexusChat as jest.Mock).mock.calls[0][2] as unknown[];
    expect(listParams).toContain(500);
  });
});

describe("mensagensNaoRespondidas — canonical SQL (CTE last_classification_msg + period active)", () => {
  beforeEach(() => {
    (queryNexusChat as jest.Mock).mockReset();
  });

  function getListSql(): string {
    return (queryNexusChat as jest.Mock).mock.calls[0][1] as string;
  }
  function getAggSql(): string {
    return (queryNexusChat as jest.Mock).mock.calls[1][1] as string;
  }

  async function run(filters: any = {}) {
    (queryNexusChat as jest.Mock)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { total: 0, avg_waiting_seconds: 0, oldest_waiting_seconds: 0 },
        ],
      });

    await mensagensNaoRespondidas(CONNECTION_ID, {
      accountId: 9,
      filters,
    });
  }

  it("SQL contém a CTE canônica `last_classification_msg` (lista e agregado)", async () => {
    await run();
    expect(getListSql()).toMatch(/WITH last_classification_msg AS/);
    expect(getAggSql()).toMatch(/WITH last_classification_msg AS/);
  });

  it("SQL NÃO contém a CTE inline antiga `WITH last_msg AS`", async () => {
    await run();
    expect(getListSql()).not.toMatch(/WITH last_msg AS/);
    expect(getAggSql()).not.toMatch(/WITH last_msg AS/);
  });

  it("filtra última msg classificadora como incoming via `lcm.message_type = 0`", async () => {
    await run();
    expect(getListSql()).toMatch(/lcm\.message_type\s*=\s*0/);
    expect(getAggSql()).toMatch(/lcm\.message_type\s*=\s*0/);
  });

  it("aplica `c.status = 0` (conversa aberta)", async () => {
    await run();
    expect(getListSql()).toMatch(/c\.status\s*=\s*0/);
    expect(getAggSql()).toMatch(/c\.status\s*=\s*0/);
  });

  it("quando `filters.period` informado, SQL contém `c.last_activity_at >= $` e `c.last_activity_at < $`", async () => {
    await run({
      period: { start: new Date("2026-04-01"), end: new Date("2026-04-30") },
    });
    expect(getListSql()).toMatch(/c\.last_activity_at\s*>=\s*\$\d+/);
    expect(getListSql()).toMatch(/c\.last_activity_at\s*<\s*\$\d+/);
    expect(getAggSql()).toMatch(/c\.last_activity_at\s*>=\s*\$\d+/);
    expect(getAggSql()).toMatch(/c\.last_activity_at\s*<\s*\$\d+/);
  });

  it("quando `filters.period` informado, params incluem as datas de início e fim", async () => {
    const start = new Date("2026-04-01");
    const end = new Date("2026-04-30");
    await run({ period: { start, end } });
    const listParams = (queryNexusChat as jest.Mock).mock.calls[0][2] as unknown[];
    const aggParams = (queryNexusChat as jest.Mock).mock.calls[1][2] as unknown[];
    expect(listParams).toEqual(expect.arrayContaining([start, end]));
    expect(aggParams).toEqual(expect.arrayContaining([start, end]));
  });

  it("quando `filters.period` NÃO informado, SQL não filtra por `c.last_activity_at`", async () => {
    await run();
    expect(getListSql()).not.toMatch(/c\.last_activity_at\s*>=\s*\$\d+/);
    expect(getListSql()).not.toMatch(/c\.last_activity_at\s*<\s*\$\d+/);
    expect(getAggSql()).not.toMatch(/c\.last_activity_at\s*>=\s*\$\d+/);
    expect(getAggSql()).not.toMatch(/c\.last_activity_at\s*<\s*\$\d+/);
  });

  it("NÃO usa `c.created_at` no recorte de período (default canonical 'active')", async () => {
    await run({
      period: { start: new Date("2026-04-01"), end: new Date("2026-04-30") },
    });
    expect(getListSql()).not.toMatch(/c\.created_at\s*>=\s*\$\d+/);
    expect(getAggSql()).not.toMatch(/c\.created_at\s*>=\s*\$\d+/);
  });

  it("JOIN da lista usa alias `lcm` da CTE canônica", async () => {
    await run();
    expect(getListSql()).toMatch(/JOIN\s+last_classification_msg\s+lcm\s+ON\s+lcm\.conversation_id\s*=\s*c\.id/);
  });
});
