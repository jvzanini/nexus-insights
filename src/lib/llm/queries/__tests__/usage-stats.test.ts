/**
 * Testes de getUsageStats / getUsageDetails / getSystemCreatedAt.
 *
 * Mockamos `pgPool` e `ensureLlmTables` para evitar dependência de DB:
 * - cenário sem registros retorna zeros / mês corrente como floor;
 * - cenário com registros mapeia colunas snake_case → camelCase;
 * - paginação clamps limit/offset.
 */

import { jest } from "@jest/globals";

type QueryResult = { rows: Array<Record<string, unknown>> };
const mockQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();

jest.mock("@/lib/pg-pool", () => ({
  pgPool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

jest.mock("@/lib/llm/ensure-tables", () => ({
  ensureLlmTables: jest.fn(() => Promise.resolve()),
}));

import {
  getSystemCreatedAt,
  getUsageDetails,
  getUsageStats,
} from "@/lib/llm/queries/usage-stats";

beforeEach(() => {
  mockQuery.mockReset();
});

describe("getUsageStats", () => {
  it("retorna zeros e arrays vazios quando não há registros", async () => {
    // Ordem: summary, byModel, byDay, byProvider (Promise.all paralelo,
    // mas mock é chamado nessa ordem porque pgPool.query é sequencial no mock).
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            total_cost: 0,
            total_tokens_input: 0,
            total_tokens_output: 0,
            total_calls: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getUsageStats({
      start: new Date("2026-04-01T00:00:00Z"),
      end: new Date("2026-04-30T23:59:59Z"),
    });

    expect(result.totalCost).toBe(0);
    expect(result.totalTokensInput).toBe(0);
    expect(result.totalTokensOutput).toBe(0);
    expect(result.totalCalls).toBe(0);
    expect(result.byModel).toEqual([]);
    expect(result.byDay).toEqual([]);
    expect(result.byProvider).toEqual([]);
  });

  it("converte strings numéricas do Postgres para number", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            total_cost: "1.234567",
            total_tokens_input: "1000",
            total_tokens_output: "2000",
            total_calls: "5",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            provider: "openai",
            model: "gpt-4o-mini",
            cost: "0.5",
            tokens_input: "500",
            tokens_output: "1500",
            calls: "3",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            day: "2026-04-15",
            cost: "1.0",
            tokens: "3000",
            calls: "5",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { provider: "openai", cost: "1.234567", calls: "5" },
        ],
      });

    const result = await getUsageStats({
      start: new Date("2026-04-01T00:00:00Z"),
      end: new Date("2026-04-30T23:59:59Z"),
    });

    expect(result.totalCost).toBeCloseTo(1.234567, 6);
    expect(result.totalCalls).toBe(5);
    expect(result.byModel[0]).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      cost: 0.5,
      tokensInput: 500,
      tokensOutput: 1500,
      calls: 3,
    });
    expect(result.byDay[0].day).toBe("2026-04-15");
    expect(result.byProvider[0].calls).toBe(5);
  });
});

describe("getUsageDetails", () => {
  it("clamps limit em [1, 200] e offset em [0, ∞)", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] });

    await getUsageDetails({
      start: new Date(),
      end: new Date(),
      limit: 9999,
      offset: -50,
    });

    const firstCall = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(firstCall[1][2]).toBe(200); // limit clamped
    expect(firstCall[1][3]).toBe(0); // offset clamped
  });

  it("mapeia rows com camelCase e converte created_at para ISO string", async () => {
    const fakeDate = new Date("2026-04-29T12:00:00Z");
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: "abc",
            provider: "anthropic",
            model: "claude-3-5-sonnet-20241022",
            tokens_input: "100",
            tokens_output: "200",
            cost_usd: "0.0005",
            duration_ms: "1234",
            created_at: fakeDate,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: "1" }] });

    const result = await getUsageDetails({
      start: new Date(),
      end: new Date(),
    });

    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({
      id: "abc",
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      tokensInput: 100,
      tokensOutput: 200,
      costUsd: 0.0005,
      durationMs: 1234,
    });
    expect(result.rows[0].createdAt).toBe(fakeDate.toISOString());
  });
});

describe("getSystemCreatedAt", () => {
  it("retorna início do mês corrente quando tabela está vazia", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ min: null }] });
    const result = await getSystemCreatedAt();
    expect(result).toBeInstanceOf(Date);
    expect(result.getUTCDate()).toBe(1);
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it("retorna a data mínima quando há registros", async () => {
    const min = new Date("2026-01-15T08:30:00Z");
    mockQuery.mockResolvedValueOnce({ rows: [{ min }] });
    const result = await getSystemCreatedAt();
    expect(result.toISOString()).toBe(min.toISOString());
  });
});

describe("usage-stats — BRL aggregates (v0.12.0)", () => {
  it("inclui totalCostBrl e cost_brl em byDay/byProvider/byModel", async () => {
    // Ordem do Promise.all em getUsageStats: [summary, byModel, byDay, byProvider]
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            total_cost: 0.1,
            total_cost_brl: 0.55,
            total_tokens_input: 100,
            total_tokens_output: 50,
            total_calls: 1,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            provider: "openai",
            model: "gpt-4o",
            cost: 0.1,
            cost_brl: 0.55,
            tokens_input: 100,
            tokens_output: 50,
            calls: 1,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            day: "2026-04-30",
            cost: 0.1,
            cost_brl: 0.55,
            tokens: 150,
            calls: 1,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { provider: "openai", cost: 0.1, cost_brl: 0.55, calls: 1 },
        ],
      });

    const result = await getUsageStats({
      start: new Date("2026-04-01"),
      end: new Date("2026-05-01"),
    });

    expect(result.totalCostBrl).toBeCloseTo(0.55);
    expect(result.byDay[0].costBrl).toBeCloseTo(0.55);
    expect(result.byProvider[0].costBrl).toBeCloseTo(0.55);
    expect(result.byModel[0].costBrl).toBeCloseTo(0.55);
  });

  it("byDay com cost_brl NULL em rows antigas vira 0", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            total_cost: 0,
            total_cost_brl: null,
            total_tokens_input: 0,
            total_tokens_output: 0,
            total_calls: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            day: "2026-04-30",
            cost: 0,
            cost_brl: null,
            tokens: 0,
            calls: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getUsageStats({
      start: new Date("2026-04-01"),
      end: new Date("2026-05-01"),
    });

    expect(result.totalCostBrl).toBe(0);
    expect(result.byDay[0].costBrl).toBe(0);
  });
});
