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

  it("descarta período do filtro (estado atual)", async () => {
    (queryNexusChat as jest.Mock)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { total: 0, avg_waiting_seconds: 0, oldest_waiting_seconds: 0 },
        ],
      });

    const filtersWithPeriod: any = {
      period: { start: new Date("2026-01-01"), end: new Date("2026-01-31") },
    };

    await mensagensNaoRespondidas(CONNECTION_ID, {
      accountId: 9,
      filters: filtersWithPeriod,
    });

    // Como período é descartado, o SQL não deve receber as datas como params.
    // base.params em buildBaseFilter sem period contém apenas accountId (e flags Matrix IA se aplicável).
    const aggParams = (queryNexusChat as jest.Mock).mock.calls[1][2] as unknown[];
    const hasDate = aggParams.some(
      (p) => p instanceof Date,
    );
    expect(hasDate).toBe(false);
  });
});
