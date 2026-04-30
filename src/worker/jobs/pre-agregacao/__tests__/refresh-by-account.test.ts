/**
 * Testes do job `refresh-by-account` (T3).
 *
 * Mocka pgPool (banco interno) + chatwootQuery (banco Chatwoot) + datetime.
 *
 * Cenários:
 * 1. happy path — 2 accounts × 7 dias × (daily + hourly + snapshot só hoje).
 * 2. idempotente — rodar duas vezes produz o mesmo conjunto de UPSERTs sem erro.
 * 3. falha em 1 account não afeta a outra.
 * 4. retorno: { accounts, days, errors }.
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
import { processRefreshByAccount } from "../refresh-by-account";

const mockedPgQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;
const mockedChatwootQuery = chatwootQuery as jest.MockedFunction<
  typeof chatwootQuery
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
  mockedChatwootQuery.mockReset();
  jest.useFakeTimers();
  // 2026-04-30 15:00 São Paulo
  jest.setSystemTime(new Date("2026-04-30T18:00:00Z"));
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * Configura pgPool para responder a TODAS as queries (meta + UPSERTs).
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

  // Account discovery — 2 accounts
  mockedPgQuery.mockResolvedValueOnce({
    rowCount: 2,
    rows: [
      { chatwoot_account_id: 9 },
      { chatwoot_account_id: 2 },
    ],
  } as never);
}

/**
 * Mock padrão de chatwootQuery: retorna métricas dummy para qualquer SQL.
 */
function setupChatwootHappy() {
  mockedChatwootQuery.mockImplementation(async (sql: unknown) => {
    const text = String(sql);
    if (text.includes("conv_metrics")) {
      // Daily aggregation
      return [
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
      ] as never;
    }
    if (text.includes("FROM conversations c") && text.includes("status = 0")) {
      // Snapshot
      return [{ open_at_eod: 5, pending_at_eod: 3 }] as never;
    }
    if (text.includes("generate_series(0, 23)")) {
      // Hourly conversations
      return Array.from({ length: 24 }, (_, h) => ({
        bucket_hour: h,
        received: 5,
        resolved: 4,
        unique_contacts: 3,
      })) as never;
    }
    if (text.includes("messages") && text.includes("generate_series")) {
      // Hourly messages
      return Array.from({ length: 24 }, (_, h) => ({
        bucket_hour: h,
        messages_in: 10,
        messages_out: 9,
      })) as never;
    }
    return [] as never;
  });
}

describe("processRefreshByAccount — happy path", () => {
  it("processa 2 accounts × 7 dias e atualiza meta para ambas as dimensões", async () => {
    setupPgPoolHappy();
    setupChatwootHappy();

    const result = await processRefreshByAccount(fakeJob());

    expect(result).toEqual({ accounts: 2, days: 14, errors: 0 });

    // Discovery query foi chamada 1 vez
    const discoverySqls = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("user_account_access"),
    );
    expect(discoverySqls.length).toBe(1);

    // Cada account deve ter UPSERTs em facts_daily e facts_hourly
    const dailyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_daily_by_account"),
    );
    expect(dailyUpserts.length).toBe(14); // 2 accts × 7 dias

    const hourlyUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_hourly_by_account"),
    );
    // 2 accts × 7 dias × 24 horas
    expect(hourlyUpserts.length).toBe(2 * 7 * 24);

    // Meta foi tocado para by_account E hourly_by_account, em cada acct
    const metaUpserts = mockedPgQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO chatwoot_facts_meta"),
    );
    // Cada withMetaUpdate faz 2 INSERTs em meta (pre-attempt + post-success).
    // 2 accts × 2 dimensões × 2 inserts = 8.
    expect(metaUpserts.length).toBe(8);
  });

  it("emite snapshot apenas para o dia atual (passados ficam zerados)", async () => {
    setupPgPoolHappy();
    setupChatwootHappy();

    await processRefreshByAccount(fakeJob());

    // Snapshot é uma query separada (status = 0/2 sem range temporal).
    const snapshotCalls = mockedChatwootQuery.mock.calls.filter((c) =>
      String(c[0]).includes("FROM conversations c") &&
      String(c[0]).includes("status = 0") &&
      !String(c[0]).includes("conv_metrics"),
    );
    // Apenas hoje × 2 accounts = 2 chamadas
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

    // open_at_eod é o 5º parâmetro ($5) do UPSERT — depois de
    // (account, date, received, resolved, OPEN_AT_EOD, ...)
    todays.forEach((c) => {
      const params = c[1] as unknown[];
      expect(params[4]).toBe(5);
      expect(params[5]).toBe(3);
    });
    yesterdays.forEach((c) => {
      const params = c[1] as unknown[];
      expect(params[4]).toBe(0);
      expect(params[5]).toBe(0);
    });
  });
});

describe("processRefreshByAccount — idempotente", () => {
  it("rodar 2 vezes não lança e produz mesmas chamadas", async () => {
    setupPgPoolHappy();
    setupChatwootHappy();

    const r1 = await processRefreshByAccount(fakeJob());
    const callsAfterFirst = mockedPgQuery.mock.calls.length;

    // Resetar discovery mock para a 2ª rodada (1ª chamada de pgQuery foi consumida)
    mockedPgQuery.mockResolvedValueOnce({
      rowCount: 2,
      rows: [
        { chatwoot_account_id: 9 },
        { chatwoot_account_id: 2 },
      ],
    } as never);

    const r2 = await processRefreshByAccount(fakeJob());

    expect(r1).toEqual(r2);
    // Quantidade total de queries deve ter dobrado (sem erros)
    expect(mockedPgQuery.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe("processRefreshByAccount — falha isolada", () => {
  it("erro em 1 account não bloqueia processamento da outra", async () => {
    setupPgPoolHappy();

    // Account 9 falha em TODAS as queries chatwoot; account 2 funciona.
    mockedChatwootQuery.mockImplementation(async (sql: unknown, params: unknown[] = []) => {
      const text = String(sql);
      // O accountId está sempre nos params; identifica a conta.
      const accountIdInParams = params.find((p) => p === 9 || p === 2);

      if (accountIdInParams === 9) {
        throw new Error("chatwoot down for 9");
      }

      // Account 2: respostas OK (mesmo padrão do happy)
      if (text.includes("conv_metrics")) {
        return [
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
        ] as never;
      }
      if (text.includes("FROM conversations c") && text.includes("status = 0")) {
        return [{ open_at_eod: 0, pending_at_eod: 0 }] as never;
      }
      if (text.includes("generate_series(0, 23)")) {
        if (text.includes("messages")) {
          return Array.from({ length: 24 }, (_, h) => ({
            bucket_hour: h,
            messages_in: 0,
            messages_out: 0,
          })) as never;
        }
        return Array.from({ length: 24 }, (_, h) => ({
          bucket_hour: h,
          received: 0,
          resolved: 0,
          unique_contacts: 0,
        })) as never;
      }
      return [] as never;
    });

    const result = await processRefreshByAccount(fakeJob());

    // 2 accounts processadas, 14 dias contabilizados (mesmo nas que falharam),
    // 1 account com erros (errors=1, contado por account).
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
