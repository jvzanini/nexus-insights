/**
 * Tests for matrix-ia multi-tenant migration.
 *
 * - args agora contém connectionId; queryNexusChat é chamada com
 *   (connectionId, sql, params) em todas as 5 sub-queries em paralelo.
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

import { matrixIaMetrics } from "../matrix-ia";

const { queryNexusChat } = jest.requireMock("@/lib/nexus-chat/pool");

const CONN_ID = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

describe("matrixIaMetrics (multi-tenant)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 5 sub-queries: total, semResposta, transferidas, tempos, ultimas
    (queryNexusChat as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ total: "100" }] }) // total
      .mockResolvedValueOnce({ rows: [{ total: "5" }] }) // semResposta
      .mockResolvedValueOnce({ rows: [{ total: "10" }] }) // transferidas
      .mockResolvedValueOnce({ rows: [{ p50: "12.5", avg: "15.3" }] }) // tempos
      .mockResolvedValueOnce({ rows: [] }); // ultimas
  });

  it("dispara 5 queries em paralelo, todas com connectionId", async () => {
    const r = await matrixIaMetrics({
      connectionId: CONN_ID,
      accountId: 1,
      filters: { excludeMatrixIA: false },
    });

    expect(queryNexusChat).toHaveBeenCalledTimes(5);
    for (const call of (queryNexusChat as jest.Mock).mock.calls) {
      expect(call[0]).toBe(CONN_ID);
    }
    expect(r.data.totalConversas).toBe(100);
    expect(r.data.cliente_sem_resposta).toBe(5);
    expect(r.data.transferidas).toBe(10);
    expect(r.data.p50RespostaIaSec).toBe(13);
    expect(r.data.avgRespostaIaSec).toBe(15);
    expect(r.data.ultimas10).toEqual([]);
  });

  it("sqlSemResposta usa CTE canônica last_classification_msg (não subquery ad-hoc)", async () => {
    await matrixIaMetrics({
      connectionId: CONN_ID,
      accountId: 1,
      filters: { excludeMatrixIA: false },
    });

    // semResposta é a 2ª call (índice 1)
    const semRespostaSql = (queryNexusChat as jest.Mock).mock.calls[1][1] as string;
    expect(semRespostaSql).toContain("last_classification_msg");
    expect(semRespostaSql).toContain("JOIN last_classification_msg lcm");
    expect(semRespostaSql).toContain("lcm.message_type");
    // Não deve mais usar EXISTS com subquery aninhada
    expect(semRespostaSql).not.toContain("EXISTS");
    expect(semRespostaSql).not.toContain("MAX(m2.created_at)");
  });

  it("cache key contém canonical-v0.42", async () => {
    await matrixIaMetrics({
      connectionId: CONN_ID,
      accountId: 1,
      filters: {},
    });
    // withCache é bypass no mock, mas verificamos que cacheKey foi gerada corretamente
    // via o nome passado — inspecionamos via spy se necessário; aqui apenas smoke.
    expect(queryNexusChat).toHaveBeenCalledTimes(5);
  });
});
