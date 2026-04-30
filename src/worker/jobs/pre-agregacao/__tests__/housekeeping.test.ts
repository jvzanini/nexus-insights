/**
 * Testes do job `housekeeping-old-buckets` (T6).
 *
 * Lê `audit.retention_days` de app_settings (default 90).
 * DELETE em todas as 5 tabelas de facts onde bucket_date < CURRENT_DATE - retention.
 */

jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

import { pgPool } from "@/lib/pg-pool";
import { processHousekeeping } from "../housekeeping";

const mockedPgQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => {
  mockedPgQuery.mockReset();
});

const FACTS_TABLES = [
  "chatwoot_facts_daily_by_account",
  "chatwoot_facts_daily_by_inbox",
  "chatwoot_facts_daily_by_agent",
  "chatwoot_facts_daily_by_team",
  "chatwoot_facts_hourly_by_account",
];

describe("processHousekeeping — leitura da retenção", () => {
  it("lê audit.retention_days de app_settings e usa o valor", async () => {
    // 1ª chamada: SELECT app_settings → "30"
    mockedPgQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: "30" }],
    } as never);
    // demais chamadas (DELETEs): retornam rowCount
    for (let i = 0; i < FACTS_TABLES.length; i++) {
      mockedPgQuery.mockResolvedValueOnce({
        rowCount: 7,
        rows: [],
      } as never);
    }

    const result = await processHousekeeping();

    // Retention foi lida de app_settings
    const settingsCall = mockedPgQuery.mock.calls.find((c) =>
      String(c[0]).includes("app_settings"),
    );
    expect(settingsCall).toBeDefined();

    // DELETEs param[0] = 30
    const deleteCalls = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).startsWith("DELETE FROM"),
    );
    expect(deleteCalls.length).toBe(5);
    deleteCalls.forEach((c) => {
      const params = c[1] as unknown[];
      expect(params[0]).toBe(30);
    });

    expect(result.deletedByTable).toEqual({
      chatwoot_facts_daily_by_account: 7,
      chatwoot_facts_daily_by_inbox: 7,
      chatwoot_facts_daily_by_agent: 7,
      chatwoot_facts_daily_by_team: 7,
      chatwoot_facts_hourly_by_account: 7,
    });
  });

  it("fallback p/ 90 dias quando setting não existe", async () => {
    // SELECT retorna 0 linhas
    mockedPgQuery.mockResolvedValueOnce({
      rowCount: 0,
      rows: [],
    } as never);
    for (let i = 0; i < FACTS_TABLES.length; i++) {
      mockedPgQuery.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      } as never);
    }

    await processHousekeeping();

    const deleteCalls = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).startsWith("DELETE FROM"),
    );
    expect(deleteCalls.length).toBe(5);
    deleteCalls.forEach((c) => {
      const params = c[1] as unknown[];
      expect(params[0]).toBe(90);
    });
  });

  it("fallback p/ 90 dias quando valor é inválido", async () => {
    mockedPgQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: "abc" }],
    } as never);
    for (let i = 0; i < FACTS_TABLES.length; i++) {
      mockedPgQuery.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      } as never);
    }

    await processHousekeeping();

    const deleteCalls = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).startsWith("DELETE FROM"),
    );
    deleteCalls.forEach((c) => {
      const params = c[1] as unknown[];
      expect(params[0]).toBe(90);
    });
  });
});

describe("processHousekeeping — DELETEs nas 5 tabelas", () => {
  it("emite DELETE WHERE bucket_date < CURRENT_DATE - $1::int em cada tabela", async () => {
    mockedPgQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: "60" }],
    } as never);
    for (let i = 0; i < FACTS_TABLES.length; i++) {
      mockedPgQuery.mockResolvedValueOnce({
        rowCount: i + 1,
        rows: [],
      } as never);
    }

    const result = await processHousekeeping();

    const deleteCalls = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).startsWith("DELETE FROM"),
    );
    expect(deleteCalls.length).toBe(5);

    const tablesUsed = deleteCalls.map((c) => {
      const text = String(c[0]);
      const m = text.match(/DELETE FROM (\w+)/);
      return m ? m[1] : null;
    });
    FACTS_TABLES.forEach((t) => {
      expect(tablesUsed).toContain(t);
    });

    // Cada DELETE referencia bucket_date < CURRENT_DATE - $1::int
    deleteCalls.forEach((c) => {
      const text = String(c[0]);
      expect(text).toMatch(
        /bucket_date\s*<\s*CURRENT_DATE\s*-\s*\$1::int/i,
      );
    });

    expect(result.deletedByTable).toEqual({
      chatwoot_facts_daily_by_account: 1,
      chatwoot_facts_daily_by_inbox: 2,
      chatwoot_facts_daily_by_agent: 3,
      chatwoot_facts_daily_by_team: 4,
      chatwoot_facts_hourly_by_account: 5,
    });
  });

  it("mapeia rowCount=null para 0 no resultado", async () => {
    mockedPgQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: "60" }],
    } as never);
    for (let i = 0; i < FACTS_TABLES.length; i++) {
      mockedPgQuery.mockResolvedValueOnce({
        rowCount: null,
        rows: [],
      } as never);
    }

    const result = await processHousekeeping();
    Object.values(result.deletedByTable).forEach((n) => {
      expect(n).toBe(0);
    });
  });
});
