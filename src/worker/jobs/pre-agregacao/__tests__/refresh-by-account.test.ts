/**
 * Testes do job `refresh-by-account` (T3 + L6 multi-tenant).
 *
 * Mocka pgPool (banco interno) + queryNexusChat (banco da connection) + datetime.
 *
 * Cenários:
 * 1. happy path — 2 bindings × 7 dias × (daily + hourly + snapshot só hoje).
 * 2. idempotente — rodar duas vezes produz o mesmo conjunto de UPSERTs sem erro.
 * 3. falha em 1 binding não afeta o outro.
 * 4. retorno: { accounts, days, errors }.
 * 5. UPSERTs gravam connection_id na SQL e nos params.
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
import { processRefreshByAccount } from "../refresh-by-account";

const FAKE_CONN = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

const mockedPgQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;
const mockedQueryNexus = queryNexusChat as jest.MockedFunction<
  typeof queryNexusChat
>;

function fakeJob(): Job {
  return {
    id: "test-job",
    name: "refresh-by-account",
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

/**
 * Configura pgPool para responder a TODAS as queries (meta + UPSERTs + discovery).
 */
function setupPgPoolHappy() {
  mockedPgQuery.mockImplementation(async (sql: unknown) => {
    const text = String(sql);
    // Range query de oldest/newest dentro de withMetaUpdate
    if (text.includes("MIN(bucket_date)")) {
      return {
        rowCount: 1,
        rows: [{ oldest: "2026-04-24", newest: "2026-04-30" }],
      } as never;
    }
    // Demais (UPSERTs) retornam rowCount=1
    return { rowCount: 1, rows: [] } as never;
  });

  // Bindings discovery — 2 bindings na mesma connection (FAKE_CONN)
  mockedPgQuery.mockResolvedValueOnce({
    rowCount: 2,
    rows: [
      { connection_id: FAKE_CONN, chatwoot_account_id: 9 },
      { connection_id: FAKE_CONN, chatwoot_account_id: 2 },
    ],
  } as never);
}

/**
 * Mock padrão de queryNexusChat: retorna métricas dummy para qualquer SQL.
 * Note: queryNexusChat retorna QueryResult { rows, rowCount }, não array direto.
 */
function setupNexusHappy() {
  mockedQueryNexus.mockImplementation(async (_connId: unknown, sql: unknown) => {
    const text = String(sql);
    if (text.includes("conv_metrics")) {
      // Daily aggregation
      return {
        rowCount: 1,
        rows: [
          {
            received: 100,
            resolved: 80,
            unique_contacts: 50,
            messages_in: 200,
            messages_out: 180,
            frt_p50_seconds: 60,
            frt_p90_seconds: 300,
            rt_p50_seconds: 1800,
          },
        ],
      } as never;
    }
    if (text.includes("FROM conversations c") && text.includes("status = 0")) {
      // Snapshot
      return {
        rowCount: 1,
        rows: [{ open_at_eod: 5, pending_at_eod: 3 }],
      } as never;
    }
    if (text.includes("generate_series(0, 23)")) {
      // Hourly conversations
      return {
        rowCount: 24,
        rows: Array.from({ length: 24 }, (_, h) => ({
          bucket_hour: h,
          received: 5,
          resolved: 4,
          unique_contacts: 3,
        })),
      } as never;
    }
    if (text.includes("messages") && text.includes("generate_series")) {
      // Hourly messages
      return {
        rowCount: 24,
        rows: Array.from({ length: 24 }, (_, h) => ({
          bucket_hour: h,
          messages_in: 10,
          messages_out: 9,
        })),
      } as never;
    }
    return { rowCount: 0, rows: [] } as never;
  });
}

describe("processRefreshByAccount — happy path", () => {
  it("processa 2 bindings × 7 dias e atualiza meta para ambas as dimensões", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    const result = await processRefreshByAccount(fakeJob());

    expect(result).toEqual({ accounts: 2, days: 14, errors: 0 });

    // Discovery query foi chamada 1 vez
    const discoverySqls = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("company_chat_bindings"),
    );
    expect(discoverySqls.length).toBe(1);

    // Cada binding deve ter UPSERTs em facts_daily e facts_hourly
    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_account"),
    );
    expect(dailyUpserts.length).toBe(14); // 2 bindings × 7 dias

    const hourlyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_hourly_by_account"),
    );
    // 2 bindings × 7 dias × 24 horas
    expect(hourlyUpserts.length).toBe(2 * 7 * 24);

    // Meta foi tocado para by_account E hourly_by_account, em cada binding
    const metaUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_meta"),
    );
    // Cada withMetaUpdate faz 2 INSERTs em meta (pre-attempt + post-success).
    // 2 bindings × 2 dimensões × 2 inserts = 8.
    expect(metaUpserts.length).toBe(8);
  });

  it("UPSERTs em facts_daily incluem connection_id na SQL e nos params", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    await processRefreshByAccount(fakeJob());

    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_account"),
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

  it("UPSERTs em facts_hourly incluem connection_id na SQL e nos params", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    await processRefreshByAccount(fakeJob());

    const hourlyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_hourly_by_account"),
    );
    expect(hourlyUpserts.length).toBeGreaterThan(0);

    hourlyUpserts.forEach((c) => {
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

    await processRefreshByAccount(fakeJob());

    expect(mockedQueryNexus.mock.calls.length).toBeGreaterThan(0);
    mockedQueryNexus.mock.calls.forEach((c) => {
      expect(c[0]).toBe(FAKE_CONN);
    });
  });

  it("emite snapshot apenas para o dia atual (passados ficam zerados)", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    await processRefreshByAccount(fakeJob());

    // Snapshot é uma query separada (status = 0/2 sem range temporal).
    const snapshotCalls = mockedQueryNexus.mock.calls.filter((c) =>
      String(c[1]).includes("FROM conversations c") &&
      String(c[1]).includes("status = 0") &&
      !String(c[1]).includes("conv_metrics"),
    );
    // Apenas hoje × 2 bindings = 2 chamadas
    expect(snapshotCalls.length).toBe(2);

    // Verifica que o UPSERT do dia de hoje (2026-04-30) carrega open_at_eod=5
    // e que o UPSERT de um dia passado (2026-04-29) carrega open_at_eod=0.
    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_account"),
    );

    const todays = dailyUpserts.filter((c) => {
      const params = c[1] as unknown[];
      return params.includes("2026-04-30");
    });
    const yesterdays = dailyUpserts.filter((c) => {
      const params = c[1] as unknown[];
      return params.includes("2026-04-29");
    });

    expect(todays.length).toBe(2);
    expect(yesterdays.length).toBe(2);

    // Order de params do UPSERT daily:
    // (account, date, connection_id, received, resolved, OPEN_AT_EOD, PENDING_AT_EOD, ...)
    // Índices: 0=acct 1=date 2=conn 3=received 4=resolved 5=open 6=pending
    todays.forEach((c) => {
      const params = c[1] as unknown[];
      expect(params[5]).toBe(5);
      expect(params[6]).toBe(3);
    });
    yesterdays.forEach((c) => {
      const params = c[1] as unknown[];
      expect(params[5]).toBe(0);
      expect(params[6]).toBe(0);
    });
  });
});

describe("processRefreshByAccount — idempotente", () => {
  it("rodar 2 vezes não lança e produz mesmas chamadas", async () => {
    setupPgPoolHappy();
    setupNexusHappy();

    const r1 = await processRefreshByAccount(fakeJob());
    const callsAfterFirst = mockedPgQuery.mock.calls.length;

    // Resetar discovery mock para a 2ª rodada (1ª chamada de pgQuery foi consumida)
    mockedPgQuery.mockResolvedValueOnce({
      rowCount: 2,
      rows: [
        { connection_id: FAKE_CONN, chatwoot_account_id: 9 },
        { connection_id: FAKE_CONN, chatwoot_account_id: 2 },
      ],
    } as never);

    const r2 = await processRefreshByAccount(fakeJob());

    expect(r1).toEqual(r2);
    // Quantidade total de queries deve ter dobrado (sem erros)
    expect(mockedPgQuery.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe("processRefreshByAccount — falha isolada", () => {
  it("erro em 1 binding não bloqueia processamento do outro", async () => {
    setupPgPoolHappy();

    // Account 9 falha em TODAS as queries; account 2 funciona.
    mockedQueryNexus.mockImplementation(
      async (_connId: unknown, sql: unknown, params: unknown[] = []) => {
        const text = String(sql);
        const accountIdInParams = params.find((p) => p === 9 || p === 2);

        if (accountIdInParams === 9) {
          throw new Error("nexus-chat down for 9");
        }

        // Account 2: respostas OK (mesmo padrão do happy)
        if (text.includes("conv_metrics")) {
          return {
            rowCount: 1,
            rows: [
              {
                received: 1,
                resolved: 1,
                unique_contacts: 1,
                messages_in: 1,
                messages_out: 1,
                frt_p50_seconds: 1,
                frt_p90_seconds: 1,
                rt_p50_seconds: 1,
              },
            ],
          } as never;
        }
        if (
          text.includes("FROM conversations c") &&
          text.includes("status = 0")
        ) {
          return {
            rowCount: 1,
            rows: [{ open_at_eod: 0, pending_at_eod: 0 }],
          } as never;
        }
        if (text.includes("generate_series(0, 23)")) {
          if (text.includes("messages")) {
            return {
              rowCount: 24,
              rows: Array.from({ length: 24 }, (_, h) => ({
                bucket_hour: h,
                messages_in: 0,
                messages_out: 0,
              })),
            } as never;
          }
          return {
            rowCount: 24,
            rows: Array.from({ length: 24 }, (_, h) => ({
              bucket_hour: h,
              received: 0,
              resolved: 0,
              unique_contacts: 0,
            })),
          } as never;
        }
        return { rowCount: 0, rows: [] } as never;
      },
    );

    const result = await processRefreshByAccount(fakeJob());

    // 2 bindings processados, 14 dias contabilizados (mesmo nas que falharam),
    // 1 binding com erros (errors=1, contado por binding).
    expect(result.accounts).toBe(2);
    expect(result.errors).toBe(1);

    // Account 2 conseguiu fazer UPSERTs, account 9 não.
    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_account"),
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
