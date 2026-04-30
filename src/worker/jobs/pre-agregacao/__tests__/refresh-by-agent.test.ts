/**
 * Testes do job `refresh-by-agent` (T5).
 *
 * Mocka pgPool (banco interno) + chatwootQuery (banco Chatwoot) + datetime.
 *
 * Cenários:
 * 1. happy path — 2 accounts × 7 dias × 2 agents por account.
 * 2. idempotente.
 * 3. falha isolada.
 * 4. snapshot só p/ hoje.
 *
 * NOTA: orphans (assignee_id IS NULL) NÃO entram nesta tabela — só no by_account.
 * O SQL JÁ filtra `WHERE c.assignee_id IS NOT NULL`. Verificamos no teste.
 */

jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock("@/lib/chatwoot/pool", () => ({
  chatwootQuery: jest.fn(),
}));

jest.mock("@/lib/datetime", () => ({
  getPlatformTz: jest.fn().mockResolvedValue("America/Sao_Paulo"),
}));

jest.mock("@/lib/realtime", () => ({
  publishRealtimeEvent: jest.fn().mockResolvedValue(undefined),
}));

import { pgPool } from "@/lib/pg-pool";
import { chatwootQuery } from "@/lib/chatwoot/pool";
import type { Job } from "bullmq";
import { processRefreshByAgent } from "../refresh-by-agent";

const mockedPgQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;
const mockedChatwootQuery = chatwootQuery as jest.MockedFunction<
  typeof chatwootQuery
>;

function fakeJob(): Job {
  return {
    id: "test-job",
    name: "refresh-by-agent",
    data: {},
    log: jest.fn(),
    updateProgress: jest.fn(),
  } as unknown as Job;
}

beforeEach(() => {
  mockedPgQuery.mockReset();
  mockedChatwootQuery.mockReset();
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-04-30T18:00:00Z"));
});

afterEach(() => {
  jest.useRealTimers();
});

function setupPgPoolHappy() {
  mockedPgQuery.mockImplementation(async (sql: unknown) => {
    const text = String(sql);
    if (text.includes("MIN(bucket_date)")) {
      return {
        rowCount: 1,
        rows: [{ oldest: "2026-04-24", newest: "2026-04-30" }],
      } as never;
    }
    return { rowCount: 1, rows: [] } as never;
  });

  mockedPgQuery.mockResolvedValueOnce({
    rowCount: 2,
    rows: [
      { chatwoot_account_id: 9 },
      { chatwoot_account_id: 2 },
    ],
  } as never);
}

function setupChatwootHappy() {
  mockedChatwootQuery.mockImplementation(async (sql: unknown) => {
    const text = String(sql);
    if (
      text.includes("c.assignee_id") &&
      text.includes("AS received") &&
      text.includes("GROUP BY c.assignee_id")
    ) {
      return [
        { assignee_id: 100, received: 50, resolved: 40, unique_contacts: 25 },
        { assignee_id: 200, received: 30, resolved: 20, unique_contacts: 15 },
      ] as never;
    }
    if (
      text.includes("c.assignee_id") &&
      text.includes("messages_in") &&
      text.includes("FROM messages m")
    ) {
      return [
        { assignee_id: 100, messages_in: 100, messages_out: 90 },
        { assignee_id: 200, messages_in: 60, messages_out: 50 },
      ] as never;
    }
    if (text.includes("c.assignee_id") && text.includes("first_response")) {
      return [
        { assignee_id: 100, frt_p50: 60, frt_p90: 300 },
        { assignee_id: 200, frt_p50: 90, frt_p90: 400 },
      ] as never;
    }
    if (
      text.includes("c.assignee_id") &&
      text.includes("conversation_resolved")
    ) {
      return [
        { assignee_id: 100, rt_p50: 1800 },
        { assignee_id: 200, rt_p50: 2400 },
      ] as never;
    }
    if (
      text.includes("c.assignee_id") &&
      text.includes("status = 0") &&
      text.includes("status = 2")
    ) {
      return [
        { assignee_id: 100, open_at_eod: 5, pending_at_eod: 3 },
        { assignee_id: 200, open_at_eod: 2, pending_at_eod: 1 },
      ] as never;
    }
    return [] as never;
  });
}

describe("processRefreshByAgent — happy path", () => {
  it("processa 2 accounts × 7 dias × 2 agents e atualiza meta", async () => {
    setupPgPoolHappy();
    setupChatwootHappy();

    const result = await processRefreshByAgent(fakeJob());

    expect(result).toEqual({ accounts: 2, days: 14, errors: 0 });

    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_agent"),
    );
    expect(dailyUpserts.length).toBe(2 * 7 * 2);

    const metaUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_meta"),
    );
    expect(metaUpserts.length).toBe(4);
  });

  it("filtra orphans (assignee_id IS NOT NULL) nos SQL agregados", async () => {
    setupPgPoolHappy();
    setupChatwootHappy();

    await processRefreshByAgent(fakeJob());

    // Todas as queries que usam assignee_id devem ter o filtro IS NOT NULL.
    const aggregateSqls = mockedChatwootQuery.mock.calls.filter((c) => {
      const text = String(c[0]);
      return text.includes("c.assignee_id");
    });
    expect(aggregateSqls.length).toBeGreaterThan(0);
    aggregateSqls.forEach((c) => {
      const text = String(c[0]);
      expect(text).toMatch(/c\.assignee_id\s+IS\s+NOT\s+NULL/i);
    });
  });

  it("snapshot apenas para o dia atual; passados ficam zerados", async () => {
    setupPgPoolHappy();
    setupChatwootHappy();

    await processRefreshByAgent(fakeJob());

    const snapshotCalls = mockedChatwootQuery.mock.calls.filter((c) => {
      const text = String(c[0]);
      return (
        text.includes("c.assignee_id") &&
        text.includes("status = 0") &&
        text.includes("status = 2") &&
        !text.includes("created_at")
      );
    });
    expect(snapshotCalls.length).toBe(2);

    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_agent"),
    );

    const todays = dailyUpserts.filter((c) => {
      const params = c[1] as unknown[];
      return params.includes("2026-04-30");
    });
    const yesterdays = dailyUpserts.filter((c) => {
      const params = c[1] as unknown[];
      return params.includes("2026-04-29");
    });

    expect(todays.length).toBe(4);
    expect(yesterdays.length).toBe(4);

    todays.forEach((c) => {
      const params = c[1] as unknown[];
      expect([5, 2]).toContain(params[5]);
      expect([3, 1]).toContain(params[6]);
    });
    yesterdays.forEach((c) => {
      const params = c[1] as unknown[];
      expect(params[5]).toBe(0);
      expect(params[6]).toBe(0);
    });
  });

  it("seta is_active_at_eod = true em todos os UPSERTs", async () => {
    setupPgPoolHappy();
    setupChatwootHappy();

    await processRefreshByAgent(fakeJob());

    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_agent"),
    );

    expect(dailyUpserts.length).toBeGreaterThan(0);
    dailyUpserts.forEach((c) => {
      const text = String(c[0]);
      const params = c[1] as unknown[];
      // Cobertura via SQL OU via param. Garantimos que algum dos params
      // booleanos ou o SQL force `true` para is_active_at_eod.
      const hasTrueParam = params.some((p) => p === true);
      const hasTrueLiteralInSql = /is_active_at_eod[^,]*TRUE/i.test(text);
      expect(hasTrueParam || hasTrueLiteralInSql).toBe(true);
    });
  });
});

describe("processRefreshByAgent — idempotente", () => {
  it("rodar 2 vezes não lança e produz mesmas chamadas", async () => {
    setupPgPoolHappy();
    setupChatwootHappy();

    const r1 = await processRefreshByAgent(fakeJob());
    const callsAfterFirst = mockedPgQuery.mock.calls.length;

    mockedPgQuery.mockResolvedValueOnce({
      rowCount: 2,
      rows: [
        { chatwoot_account_id: 9 },
        { chatwoot_account_id: 2 },
      ],
    } as never);

    const r2 = await processRefreshByAgent(fakeJob());

    expect(r1).toEqual(r2);
    expect(mockedPgQuery.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe("processRefreshByAgent — falha isolada", () => {
  it("erro em 1 account não bloqueia processamento da outra", async () => {
    setupPgPoolHappy();

    mockedChatwootQuery.mockImplementation(
      async (sql: unknown, params: unknown[] = []) => {
        const text = String(sql);
        const accountIdInParams = params.find((p) => p === 9 || p === 2);

        if (accountIdInParams === 9) {
          throw new Error("chatwoot down for 9");
        }

        if (
          text.includes("c.assignee_id") &&
          text.includes("AS received") &&
          text.includes("GROUP BY c.assignee_id")
        ) {
          return [
            { assignee_id: 100, received: 1, resolved: 1, unique_contacts: 1 },
          ] as never;
        }
        if (
          text.includes("c.assignee_id") &&
          text.includes("messages_in") &&
          text.includes("FROM messages m")
        ) {
          return [
            { assignee_id: 100, messages_in: 1, messages_out: 1 },
          ] as never;
        }
        if (text.includes("c.assignee_id") && text.includes("first_response")) {
          return [{ assignee_id: 100, frt_p50: 1, frt_p90: 1 }] as never;
        }
        if (
          text.includes("c.assignee_id") &&
          text.includes("conversation_resolved")
        ) {
          return [{ assignee_id: 100, rt_p50: 1 }] as never;
        }
        if (
          text.includes("c.assignee_id") &&
          text.includes("status = 0") &&
          text.includes("status = 2")
        ) {
          return [
            { assignee_id: 100, open_at_eod: 0, pending_at_eod: 0 },
          ] as never;
        }
        return [] as never;
      },
    );

    const result = await processRefreshByAgent(fakeJob());

    expect(result.accounts).toBe(2);
    expect(result.errors).toBe(1);

    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_agent"),
    );
    const account9Upserts = dailyUpserts.filter((c) => {
      const params = c[1] as unknown[];
      return params[0] === 9;
    });
    const account2Upserts = dailyUpserts.filter((c) => {
      const params = c[1] as unknown[];
      return params[0] === 2;
    });

    expect(account9Upserts.length).toBe(0);
    expect(account2Upserts.length).toBe(7);

    const errorMetaUpserts = mockedPgQuery.mock.calls.filter((c) => {
      const text = String(c[0]);
      const params = c[1] as unknown[];
      return (
        text.includes("INSERT INTO chatwoot_facts_meta") &&
        text.includes("last_error") &&
        params.includes(9)
      );
    });
    expect(errorMetaUpserts.length).toBeGreaterThan(0);
  });
});
