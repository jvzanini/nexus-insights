/**
 * Testes do job `refresh-by-inbox` (T4 + L6 multi-tenant).
 *
 * Mocka pgPool (banco interno) + queryNexusChat (banco da connection) + datetime.
 *
 * Cenários:
 * 1. happy path — 2 bindings × 7 dias × 2 inboxes por binding.
 * 2. idempotente — rodar duas vezes produz o mesmo conjunto de UPSERTs.
 * 3. falha em 1 binding não afeta o outro.
 * 4. retorno: { accounts, days, errors }.
 * 5. snapshot só p/ hoje (open/pending = 0 nos passados).
 * 6. UPSERTs gravam connection_id na SQL e nos params.
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
import { processRefreshByInbox } from "../refresh-by-inbox";

const FAKE_CONN = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

const mockedPgQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;
const mockedQueryNexus = queryNexusChat as jest.MockedFunction<
  typeof queryNexusChat
>;

function fakeJob(): Job {
  return {
    id: "test-job",
    name: "refresh-by-inbox",
    data: {},
    log: jest.fn(),
    updateProgress: jest.fn(),
  } as unknown as Job;
}

beforeEach(() => {
  mockedPgQuery.mockReset();
  mockedQueryNexus.mockReset();
  jest.useFakeTimers();
  // 2026-04-30 15:00 São Paulo
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

  // Bindings discovery — 2 bindings
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
    // Daily metrics by inbox: COUNT(*) AS received + GROUP BY c.inbox_id
    if (
      text.includes("c.inbox_id") &&
      text.includes("AS received") &&
      text.includes("GROUP BY c.inbox_id")
    ) {
      return {
        rowCount: 2,
        rows: [
          { inbox_id: 1, received: 50, resolved: 40, unique_contacts: 25 },
          { inbox_id: 2, received: 30, resolved: 20, unique_contacts: 15 },
        ],
      } as never;
    }
    // Messages by inbox
    if (
      text.includes("c.inbox_id") &&
      text.includes("messages_in") &&
      text.includes("FROM messages m")
    ) {
      return {
        rowCount: 2,
        rows: [
          { inbox_id: 1, messages_in: 100, messages_out: 90 },
          { inbox_id: 2, messages_in: 60, messages_out: 50 },
        ],
      } as never;
    }
    // FRT percentiles by inbox
    if (text.includes("c.inbox_id") && text.includes("first_response")) {
      return {
        rowCount: 2,
        rows: [
          { inbox_id: 1, frt_p50: 60, frt_p90: 300 },
          { inbox_id: 2, frt_p50: 90, frt_p90: 400 },
        ],
      } as never;
    }
    // RT percentiles by inbox
    if (text.includes("c.inbox_id") && text.includes("conversation_resolved")) {
      return {
        rowCount: 2,
        rows: [
          { inbox_id: 1, rt_p50: 1800 },
          { inbox_id: 2, rt_p50: 2400 },
        ],
      } as never;
    }
    // Snapshot by inbox (status = 0/2)
    if (
      text.includes("c.inbox_id") &&
      text.includes("status = 0") &&
      text.includes("status = 2")
    ) {
      return {
        rowCount: 2,
        rows: [
          { inbox_id: 1, open_at_eod: 5, pending_at_eod: 3 },
          { inbox_id: 2, open_at_eod: 2, pending_at_eod: 1 },
        ],
      } as never;
    }
    return { rowCount: 0, rows: [] } as never;
  });
}

describe("processRefreshByInbox — happy path", () => {
  it("processa 2 bindings × 7 dias × 2 inboxes e atualiza meta", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    const result = await processRefreshByInbox(fakeJob());

    expect(result).toEqual({ accounts: 2, days: 14, errors: 0 });

    // Discovery query
    const discoverySqls = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("company_chat_bindings"),
    );
    expect(discoverySqls.length).toBe(1);

    // UPSERTs em chatwoot_facts_daily_by_inbox: 2 bindings × 7 dias × 2 inboxes
    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_inbox"),
    );
    expect(dailyUpserts.length).toBe(2 * 7 * 2);

    // Meta foi tocado para by_inbox em cada binding (2 bindings × 2 inserts = 4)
    const metaUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_meta"),
    );
    expect(metaUpserts.length).toBe(4);
  });

  it("UPSERTs em facts_daily_by_inbox incluem connection_id", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    await processRefreshByInbox(fakeJob());

    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_inbox"),
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

    await processRefreshByInbox(fakeJob());

    expect(mockedQueryNexus.mock.calls.length).toBeGreaterThan(0);
    mockedQueryNexus.mock.calls.forEach((c) => {
      expect(c[0]).toBe(FAKE_CONN);
    });
  });

  it("emite snapshot apenas para o dia atual (passados ficam zerados)", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    await processRefreshByInbox(fakeJob());

    // Snapshot é uma query separada (status = 0/2 sem range temporal).
    const snapshotCalls = mockedQueryNexus.mock.calls.filter((c) => {
      const text = String(c[1]);
      return (
        text.includes("c.inbox_id") &&
        text.includes("status = 0") &&
        text.includes("status = 2") &&
        !text.includes("created_at")
      );
    });
    // Apenas hoje × 2 bindings = 2 chamadas
    expect(snapshotCalls.length).toBe(2);

    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_inbox"),
    );

    const todays = dailyUpserts.filter((c) => {
      const params = c[1] as unknown[];
      return params.includes("2026-04-30");
    });
    const yesterdays = dailyUpserts.filter((c) => {
      const params = c[1] as unknown[];
      return params.includes("2026-04-29");
    });

    // 2 bindings × 2 inboxes = 4 UPSERTs por dia
    expect(todays.length).toBe(4);
    expect(yesterdays.length).toBe(4);

    // Order de params do UPSERT inbox:
    // (account, date, inbox, connection_id, received, resolved, open, pending, ...)
    // Índices: 0=acct 1=date 2=inbox 3=conn 4=received 5=resolved 6=open 7=pending
    todays.forEach((c) => {
      const params = c[1] as unknown[];
      const openAtEod = params[6];
      const pendingAtEod = params[7];
      // inbox 1 → 5/3; inbox 2 → 2/1
      expect([5, 2]).toContain(openAtEod);
      expect([3, 1]).toContain(pendingAtEod);
    });
    yesterdays.forEach((c) => {
      const params = c[1] as unknown[];
      expect(params[6]).toBe(0);
      expect(params[7]).toBe(0);
    });
  });
});

describe("processRefreshByInbox — idempotente", () => {
  it("rodar 2 vezes não lança e produz mesmas chamadas", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    const r1 = await processRefreshByInbox(fakeJob());
    const callsAfterFirst = mockedPgQuery.mock.calls.length;

    mockedPgQuery.mockResolvedValueOnce({
      rowCount: 2,
      rows: [
        { connection_id: FAKE_CONN, chatwoot_account_id: 9 },
        { connection_id: FAKE_CONN, chatwoot_account_id: 2 },
      ],
    } as never);

    const r2 = await processRefreshByInbox(fakeJob());

    expect(r1).toEqual(r2);
    expect(mockedPgQuery.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe("processRefreshByInbox — falha isolada", () => {
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
          text.includes("c.inbox_id") &&
          text.includes("AS received") &&
          text.includes("GROUP BY c.inbox_id")
        ) {
          return {
            rowCount: 1,
            rows: [
              { inbox_id: 1, received: 1, resolved: 1, unique_contacts: 1 },
            ],
          } as never;
        }
        if (
          text.includes("c.inbox_id") &&
          text.includes("messages_in") &&
          text.includes("FROM messages m")
        ) {
          return {
            rowCount: 1,
            rows: [{ inbox_id: 1, messages_in: 1, messages_out: 1 }],
          } as never;
        }
        if (text.includes("c.inbox_id") && text.includes("first_response")) {
          return {
            rowCount: 1,
            rows: [{ inbox_id: 1, frt_p50: 1, frt_p90: 1 }],
          } as never;
        }
        if (
          text.includes("c.inbox_id") &&
          text.includes("conversation_resolved")
        ) {
          return {
            rowCount: 1,
            rows: [{ inbox_id: 1, rt_p50: 1 }],
          } as never;
        }
        if (
          text.includes("c.inbox_id") &&
          text.includes("status = 0") &&
          text.includes("status = 2")
        ) {
          return {
            rowCount: 1,
            rows: [{ inbox_id: 1, open_at_eod: 0, pending_at_eod: 0 }],
          } as never;
        }
        return { rowCount: 0, rows: [] } as never;
      },
    );

    const result = await processRefreshByInbox(fakeJob());

    expect(result.accounts).toBe(2);
    expect(result.errors).toBe(1);

    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_inbox"),
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
    // account 2 → 7 dias × 1 inbox
    expect(account2Upserts.length).toBe(7);

    // Meta da account 9 deve ter UPSERT com last_error
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
