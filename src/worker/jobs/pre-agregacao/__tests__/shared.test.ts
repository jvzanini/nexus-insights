/**
 * Testes do módulo `shared.ts` (T3 — utilitários compartilhados).
 *
 * Mocka `@/lib/pg-pool` para simular queries no banco interno.
 * Mocka `@/lib/realtime` para verificar publicação de eventos SSE (T13).
 */

jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock("@/lib/datetime", () => ({
  getPlatformTz: jest.fn().mockResolvedValue("America/Sao_Paulo"),
}));

jest.mock("@/lib/realtime", () => ({
  publishRealtimeEvent: jest.fn().mockResolvedValue(undefined),
}));

import { pgPool } from "@/lib/pg-pool";
import { publishRealtimeEvent } from "@/lib/realtime";
import {
  getAccountsToRefresh,
  getBindingsToRefresh,
  rollingDates,
  withMetaUpdate,
} from "../shared";

const FAKE_CONN = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

const mockedQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;
const mockedPublish = publishRealtimeEvent as jest.MockedFunction<
  typeof publishRealtimeEvent
>;

beforeEach(() => {
  mockedQuery.mockReset();
  mockedPublish.mockReset();
  mockedPublish.mockResolvedValue(undefined);
});

describe("getBindingsToRefresh", () => {
  it("retorna pares (connectionId, accountId) para bindings enabled + connection active", async () => {
    mockedQuery.mockResolvedValueOnce({
      rowCount: 2,
      rows: [
        { connection_id: FAKE_CONN, chatwoot_account_id: 9 },
        { connection_id: FAKE_CONN, chatwoot_account_id: 2 },
      ],
    } as never);

    const targets = await getBindingsToRefresh();

    expect(targets).toEqual([
      { connectionId: FAKE_CONN, accountId: 9 },
      { connectionId: FAKE_CONN, accountId: 2 },
    ]);
    const sql = mockedQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/company_chat_bindings/);
    expect(sql).toMatch(/nexus_chat_connections/);
    expect(sql).toMatch(/b\.enabled = true/);
    expect(sql).toMatch(/c\.status = 'active'/);
  });

  it("retorna array vazio quando não há binding ativo", async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
    const targets = await getBindingsToRefresh();
    expect(targets).toEqual([]);
  });
});

describe("getAccountsToRefresh (deprecated)", () => {
  it("retorna lista distinta e ordenada de account IDs", async () => {
    mockedQuery.mockResolvedValueOnce({
      rowCount: 3,
      rows: [
        { chatwoot_account_id: 2 },
        { chatwoot_account_id: 9 },
        { chatwoot_account_id: 31 },
      ],
    } as never);

    const ids = await getAccountsToRefresh();
    expect(ids).toEqual([2, 9, 31]);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    const sql = mockedQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/SELECT\s+DISTINCT/i);
    expect(sql).toMatch(/user_account_access/);
    expect(sql).toMatch(/ORDER BY/i);
    // Schema atual NÃO tem coluna revoked_at — a query NÃO deve referenciá-la.
    expect(sql).not.toMatch(/revoked_at/i);
  });

  it("retorna array vazio quando não há accounts", async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
    const ids = await getAccountsToRefresh();
    expect(ids).toEqual([]);
  });
});

describe("rollingDates", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // 2026-04-30 15:00 horário de São Paulo (UTC-3) == 18:00 UTC
    jest.setSystemTime(new Date("2026-04-30T18:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("retorna 7 datas em São Paulo, mais recente primeiro", async () => {
    const dates = await rollingDates(7);
    expect(dates).toEqual([
      "2026-04-30",
      "2026-04-29",
      "2026-04-28",
      "2026-04-27",
      "2026-04-26",
      "2026-04-25",
      "2026-04-24",
    ]);
  });

  it("retorna apenas 1 data para N=1", async () => {
    const dates = await rollingDates(1);
    expect(dates).toEqual(["2026-04-30"]);
  });

  it("respeita TZ — meia-noite UTC ainda é dia anterior em São Paulo", async () => {
    // 2026-05-01 00:30 UTC == 2026-04-30 21:30 SP
    jest.setSystemTime(new Date("2026-05-01T00:30:00Z"));
    const dates = await rollingDates(2);
    expect(dates).toEqual(["2026-04-30", "2026-04-29"]);
  });
});

describe("withMetaUpdate", () => {
  function setupMetaUpsertHappyPath() {
    // 1ª query: UPDATE last_attempt_at = now() (insert/upsert).
    mockedQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] } as never);
    // 2ª query: SELECT MIN/MAX bucket_date para popular oldest/newest.
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ oldest: "2026-04-24", newest: "2026-04-30" }],
    } as never);
    // 3ª query: UPDATE last_refresh_at = now() + clear last_error.
    mockedQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] } as never);
  }

  it("envolve fn() em pre/post update do meta no caminho feliz (com connectionId)", async () => {
    setupMetaUpsertHappyPath();
    const fn = jest.fn().mockResolvedValueOnce("ok");

    const result = await withMetaUpdate("by_account", FAKE_CONN, 9, fn);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockedQuery).toHaveBeenCalledTimes(3);

    const preSql = mockedQuery.mock.calls[0][0] as string;
    expect(preSql).toMatch(/INSERT INTO chatwoot_facts_meta/);
    expect(preSql).toMatch(/last_attempt_at/);
    expect(preSql).toMatch(/connection_id/);
    expect(preSql).toMatch(/ON CONFLICT/);

    const rangeSql = mockedQuery.mock.calls[1][0] as string;
    expect(rangeSql).toMatch(/MIN\(bucket_date\)/);
    expect(rangeSql).toMatch(/MAX\(bucket_date\)/);
    expect(rangeSql).toMatch(/chatwoot_facts_daily_by_account/);
    expect(rangeSql).toMatch(/connection_id = \$2/);

    const postSql = mockedQuery.mock.calls[2][0] as string;
    expect(postSql).toMatch(/INSERT INTO chatwoot_facts_meta/);
    expect(postSql).toMatch(/last_refresh_at/);
    expect(postSql).toMatch(/connection_id/);

    expect(mockedPublish).toHaveBeenCalledTimes(1);
    expect(mockedPublish).toHaveBeenCalledWith({
      type: "facts:refreshed",
      dimension: "by_account",
      connectionId: FAKE_CONN,
      accountId: 9,
    });
  });

  it("usa tabela hourly_by_account quando dimension = hourly_by_account", async () => {
    setupMetaUpsertHappyPath();
    await withMetaUpdate(
      "hourly_by_account",
      FAKE_CONN,
      2,
      jest.fn().mockResolvedValueOnce("x"),
    );

    const rangeSql = mockedQuery.mock.calls[1][0] as string;
    expect(rangeSql).toMatch(/chatwoot_facts_hourly_by_account/);
  });

  it("propaga erro de fn() e persiste last_error + connection_id no meta", async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] } as never);
    mockedQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] } as never);

    const err = new Error("boom");
    const fn = jest.fn().mockRejectedValueOnce(err);

    await expect(
      withMetaUpdate("by_inbox", FAKE_CONN, 9, fn),
    ).rejects.toThrow("boom");

    expect(mockedQuery).toHaveBeenCalledTimes(2);
    const errSql = mockedQuery.mock.calls[1][0] as string;
    expect(errSql).toMatch(/INSERT INTO chatwoot_facts_meta/);
    expect(errSql).toMatch(/last_error/);
    expect(errSql).toMatch(/connection_id/);
    const errParams = mockedQuery.mock.calls[1][1] as unknown[];
    expect(errParams).toContain("boom");
    expect(errParams).toContain(FAKE_CONN);

    expect(mockedPublish).not.toHaveBeenCalled();
  });

  it("publica facts:refreshed com connectionId correto", async () => {
    setupMetaUpsertHappyPath();
    await withMetaUpdate(
      "hourly_by_account",
      FAKE_CONN,
      2,
      jest.fn().mockResolvedValueOnce("x"),
    );
    expect(mockedPublish).toHaveBeenCalledWith({
      type: "facts:refreshed",
      dimension: "hourly_by_account",
      connectionId: FAKE_CONN,
      accountId: 2,
    });
  });

  it("não lança erro quando publishRealtimeEvent falha (best-effort)", async () => {
    setupMetaUpsertHappyPath();
    mockedPublish.mockRejectedValueOnce(new Error("redis down"));
    await expect(
      withMetaUpdate(
        "by_agent",
        FAKE_CONN,
        5,
        jest.fn().mockResolvedValueOnce("ok"),
      ),
    ).resolves.toBe("ok");
  });
});
