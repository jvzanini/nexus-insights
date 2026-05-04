/**
 * Testes do job `refresh-by-team` (T6 + L6 multi-tenant).
 *
 * Mocka pgPool (banco interno) + queryNexusChat (banco da connection) + datetime.
 *
 * Cenários:
 * 1. happy path — 2 bindings × 7 dias × 2 teams (incluindo sentinel 0).
 * 2. idempotente.
 * 3. falha isolada.
 * 4. snapshot só p/ hoje.
 * 5. UPSERTs gravam connection_id na SQL e nos params.
 *
 * NOTA: tabela tem `team_id INT NOT NULL DEFAULT 0`; team_id NULL no Chatwoot
 * vira 0 via COALESCE(c.team_id, 0).
 */

jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock("@/lib/nexus-chat/pool", () => ({
  queryNexusChat: jest.fn(),
}));

jest.mock("@/lib/datetime", () => ({
  getPlatformTz: jest.fn().mockResolvedValue("America/Sao_Paulo"),
}));

jest.mock("@/lib/realtime", () => ({
  publishRealtimeEvent: jest.fn().mockResolvedValue(undefined),
}));

import { pgPool } from "@/lib/pg-pool";
import { queryNexusChat } from "@/lib/nexus-chat/pool";
import type { Job } from "bullmq";
import { processRefreshByTeam } from "../refresh-by-team";

const FAKE_CONN = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

const mockedPgQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;
const mockedQueryNexus = queryNexusChat as jest.MockedFunction<
  typeof queryNexusChat
>;

function fakeJob(): Job {
  return {
    id: "test-job",
    name: "refresh-by-team",
    data: {},
    log: jest.fn(),
    updateProgress: jest.fn(),
  } as unknown as Job;
}

beforeEach(() => {
  mockedPgQuery.mockReset();
  mockedQueryNexus.mockReset();
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
      { connection_id: FAKE_CONN, chatwoot_account_id: 9 },
      { connection_id: FAKE_CONN, chatwoot_account_id: 2 },
    ],
  } as never);
}

function setupNexusHappy() {
  mockedQueryNexus.mockImplementation(async (_connId: unknown, sql: unknown) => {
    const text = String(sql);
    if (
      text.includes("team_id") &&
      text.includes("AS received") &&
      text.includes("COALESCE(c.team_id, 0)")
    ) {
      return {
        rowCount: 2,
        rows: [
          { team_id: 0, received: 30, resolved: 20, unique_contacts: 15 },
          { team_id: 5, received: 50, resolved: 40, unique_contacts: 25 },
        ],
      } as never;
    }
    if (
      text.includes("team_id") &&
      text.includes("messages_in") &&
      text.includes("FROM messages m")
    ) {
      return {
        rowCount: 2,
        rows: [
          { team_id: 0, messages_in: 60, messages_out: 50 },
          { team_id: 5, messages_in: 100, messages_out: 90 },
        ],
      } as never;
    }
    if (text.includes("team_id") && text.includes("first_response")) {
      return {
        rowCount: 2,
        rows: [
          { team_id: 0, frt_p50: 90, frt_p90: 400 },
          { team_id: 5, frt_p50: 60, frt_p90: 300 },
        ],
      } as never;
    }
    if (text.includes("team_id") && text.includes("conversation_resolved")) {
      return {
        rowCount: 2,
        rows: [
          { team_id: 0, rt_p50: 2400 },
          { team_id: 5, rt_p50: 1800 },
        ],
      } as never;
    }
    if (
      text.includes("team_id") &&
      text.includes("status = 0") &&
      text.includes("status = 2")
    ) {
      return {
        rowCount: 2,
        rows: [
          { team_id: 0, open_at_eod: 2, pending_at_eod: 1 },
          { team_id: 5, open_at_eod: 5, pending_at_eod: 3 },
        ],
      } as never;
    }
    return { rowCount: 0, rows: [] } as never;
  });
}

describe("processRefreshByTeam — happy path", () => {
  it("processa 2 bindings × 7 dias × 2 teams (com sentinel 0)", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    const result = await processRefreshByTeam(fakeJob());

    expect(result).toEqual({ accounts: 2, days: 14, errors: 0 });

    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_team"),
    );
    expect(dailyUpserts.length).toBe(2 * 7 * 2);

    const metaUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_meta"),
    );
    expect(metaUpserts.length).toBe(4);
  });

  it("UPSERTs em facts_daily_by_team incluem connection_id", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    await processRefreshByTeam(fakeJob());

    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_team"),
    );
    expect(dailyUpserts.length).toBeGreaterThan(0);

    dailyUpserts.forEach((c) => {
      const sql = String(c[0]);
      const params = c[1] as unknown[];
      expect(sql).toMatch(/connection_id/);
      expect(sql).toMatch(/EXCLUDED\.connection_id/);
      expect(params).toContain(FAKE_CONN);
    });
  });

  it("queryNexusChat é chamado com connectionId como 1º param", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    await processRefreshByTeam(fakeJob());

    expect(mockedQueryNexus.mock.calls.length).toBeGreaterThan(0);
    mockedQueryNexus.mock.calls.forEach((c) => {
      expect(c[0]).toBe(FAKE_CONN);
    });
  });

  it("usa COALESCE(c.team_id, 0) em todos os SQL agregados", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    await processRefreshByTeam(fakeJob());

    const aggregateSqls = mockedQueryNexus.mock.calls.filter((c) => {
      const text = String(c[1]);
      return text.includes("team_id") && text.includes("GROUP BY");
    });
    expect(aggregateSqls.length).toBeGreaterThan(0);
    aggregateSqls.forEach((c) => {
      const text = String(c[1]);
      expect(text).toMatch(/COALESCE\(\s*c\.team_id\s*,\s*0\s*\)/i);
    });
  });

  it("UPSERTs incluem team_id = 0 quando vem de orphan team", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    await processRefreshByTeam(fakeJob());

    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_team"),
    );

    const teamZeroUpserts = dailyUpserts.filter((c) => {
      const params = c[1] as unknown[];
      // params: [account_id, bucket_date, team_id, connection_id, received, ...]
      return params[2] === 0;
    });
    // 2 bindings × 7 dias = 14 UPSERTs com team_id = 0
    expect(teamZeroUpserts.length).toBe(14);
  });

  it("snapshot apenas para o dia atual; passados ficam zerados", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    await processRefreshByTeam(fakeJob());

    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_team"),
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

    // Order de params do UPSERT team:
    // (account, date, team, connection_id, received, resolved, open, pending, ...)
    // Índices: 0=acct 1=date 2=team 3=conn 4=received 5=resolved 6=open 7=pending
    yesterdays.forEach((c) => {
      const params = c[1] as unknown[];
      expect(params[6]).toBe(0);
      expect(params[7]).toBe(0);
    });
  });
});

describe("processRefreshByTeam — idempotente", () => {
  it("rodar 2 vezes não lança e produz mesmas chamadas", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    const r1 = await processRefreshByTeam(fakeJob());
    const callsAfterFirst = mockedPgQuery.mock.calls.length;

    mockedPgQuery.mockResolvedValueOnce({
      rowCount: 2,
      rows: [
        { connection_id: FAKE_CONN, chatwoot_account_id: 9 },
        { connection_id: FAKE_CONN, chatwoot_account_id: 2 },
      ],
    } as never);

    const r2 = await processRefreshByTeam(fakeJob());

    expect(r1).toEqual(r2);
    expect(mockedPgQuery.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe("processRefreshByTeam — falha isolada", () => {
  it("erro em 1 binding não bloqueia processamento do outro", async () => {
    setupPgPoolHappy();

    mockedQueryNexus.mockImplementation(
      async (_connId: unknown, sql: unknown, params: unknown[] = []) => {
        const text = String(sql);
        const accountIdInParams = params.find((p) => p === 9 || p === 2);

        if (accountIdInParams === 9) {
          throw new Error("nexus-chat down for 9");
        }

        if (
          text.includes("team_id") &&
          text.includes("AS received") &&
          text.includes("COALESCE(c.team_id, 0)")
        ) {
          return {
            rowCount: 1,
            rows: [
              { team_id: 5, received: 1, resolved: 1, unique_contacts: 1 },
            ],
          } as never;
        }
        if (
          text.includes("team_id") &&
          text.includes("messages_in") &&
          text.includes("FROM messages m")
        ) {
          return {
            rowCount: 1,
            rows: [{ team_id: 5, messages_in: 1, messages_out: 1 }],
          } as never;
        }
        if (text.includes("team_id") && text.includes("first_response")) {
          return {
            rowCount: 1,
            rows: [{ team_id: 5, frt_p50: 1, frt_p90: 1 }],
          } as never;
        }
        if (text.includes("team_id") && text.includes("conversation_resolved")) {
          return {
            rowCount: 1,
            rows: [{ team_id: 5, rt_p50: 1 }],
          } as never;
        }
        if (
          text.includes("team_id") &&
          text.includes("status = 0") &&
          text.includes("status = 2")
        ) {
          return {
            rowCount: 1,
            rows: [{ team_id: 5, open_at_eod: 0, pending_at_eod: 0 }],
          } as never;
        }
        return { rowCount: 0, rows: [] } as never;
      },
    );

    const result = await processRefreshByTeam(fakeJob());

    expect(result.accounts).toBe(2);
    expect(result.errors).toBe(1);

    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_team"),
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
