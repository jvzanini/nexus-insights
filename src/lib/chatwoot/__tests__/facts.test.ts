/**
 * Testes para `src/lib/chatwoot/facts.ts`.
 *
 * Estratégia: mockar `@/lib/pg-pool` (raw SQL via pgPool.query) — padrão
 * canônico do projeto (ver get-nex-bubble-enabled.test.ts).
 *
 * L6 multi-tenant: ganha cobertura de filtro `connection_id` opcional em
 * readFactsDaily, readFactsHourly e readFactsMeta.
 */

jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

import { pgPool } from "@/lib/pg-pool";
import {
  readFactsDaily,
  readFactsHourly,
  readFactsMeta,
} from "../facts";

const FAKE_CONN = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

const mockedQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => {
  mockedQuery.mockReset();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helper — row bruto que pgPool.query retornaria para chatwoot_facts_daily_*
// ---------------------------------------------------------------------------
function makeRawDailyRow(overrides: Record<string, unknown> = {}) {
  return {
    bucket_date: "2026-04-01",
    account_id: 1,
    received: 10,
    resolved: 8,
    open_at_eod: 2,
    pending_at_eod: 1,
    messages_in: 50,
    messages_out: 45,
    unique_contacts: 7,
    frt_p50_seconds: 120,
    frt_p90_seconds: 300,
    rt_p50_seconds: 600,
    ...overrides,
  };
}

function makeRawHourlyRow(overrides: Record<string, unknown> = {}) {
  return {
    bucket_date: "2026-04-01",
    bucket_hour: 9,
    account_id: 1,
    received: 5,
    resolved: 3,
    messages_in: 20,
    messages_out: 18,
    unique_contacts: 4,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. readFactsDaily — dimension="by_account" (padrão)
// ---------------------------------------------------------------------------
describe("readFactsDaily — by_account", () => {
  it("chama a tabela correta e retorna linhas mapeadas", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [makeRawDailyRow()],
      rowCount: 1,
    } as never);

    const rows = await readFactsDaily({
      accountId: 1,
      start: new Date("2026-04-01"),
      end: new Date("2026-04-30"),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      bucketDate: "2026-04-01",
      accountId: 1,
      received: 10,
      resolved: 8,
      openAtEod: 2,
      pendingAtEod: 1,
      messagesIn: 50,
      messagesOut: 45,
      uniqueContacts: 7,
      frtP50Seconds: 120,
      frtP90Seconds: 300,
      rtP50Seconds: 600,
    });
    expect(rows[0].dimensionId).toBeUndefined();

    // Verifica que usou a tabela by_account
    const sql: string = mockedQuery.mock.calls[0][0] as string;
    expect(sql).toContain("chatwoot_facts_daily_by_account");
  });

  it("sem connectionId, NÃO filtra por connection_id (compat L6)", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [makeRawDailyRow()],
      rowCount: 1,
    } as never);

    await readFactsDaily({
      accountId: 1,
      start: new Date("2026-04-01"),
      end: new Date("2026-04-30"),
    });

    const sql: string = mockedQuery.mock.calls[0][0] as string;
    expect(sql).not.toMatch(/connection_id\s*=/);
  });

  it("com connectionId, filtra WHERE connection_id = $X", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [makeRawDailyRow()],
      rowCount: 1,
    } as never);

    await readFactsDaily({
      connectionId: FAKE_CONN,
      accountId: 1,
      start: new Date("2026-04-01"),
      end: new Date("2026-04-30"),
    });

    const sql: string = mockedQuery.mock.calls[0][0] as string;
    const params = mockedQuery.mock.calls[0][1] as unknown[];
    expect(sql).toMatch(/connection_id\s*=\s*\$\d+/);
    expect(params).toContain(FAKE_CONN);
  });
});

// ---------------------------------------------------------------------------
// 2. readFactsDaily — dimension="by_inbox"
// ---------------------------------------------------------------------------
describe("readFactsDaily — by_inbox", () => {
  it("usa chatwoot_facts_daily_by_inbox e inclui dimensionId na saída", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{ ...makeRawDailyRow(), dimension_id: 5 }],
      rowCount: 1,
    } as never);

    const rows = await readFactsDaily({
      accountId: 1,
      start: new Date("2026-04-01"),
      end: new Date("2026-04-30"),
      dimension: "by_inbox",
    });

    expect(rows[0].dimensionId).toBe(5);

    const sql: string = mockedQuery.mock.calls[0][0] as string;
    expect(sql).toContain("chatwoot_facts_daily_by_inbox");
  });

  it("com connectionId em by_inbox, filtra connection_id = $X", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    } as never);

    await readFactsDaily({
      connectionId: FAKE_CONN,
      accountId: 1,
      start: new Date("2026-04-01"),
      end: new Date("2026-04-30"),
      dimension: "by_inbox",
    });

    const sql: string = mockedQuery.mock.calls[0][0] as string;
    const params = mockedQuery.mock.calls[0][1] as unknown[];
    expect(sql).toMatch(/connection_id\s*=\s*\$\d+/);
    expect(params).toContain(FAKE_CONN);
  });
});

// ---------------------------------------------------------------------------
// 3. readFactsDaily com dimensionIds=[1,2,3]
// ---------------------------------------------------------------------------
describe("readFactsDaily — dimensionIds filter", () => {
  it("adiciona filtro ANY($N) quando dimensionIds fornecido", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    } as never);

    await readFactsDaily({
      accountId: 1,
      start: new Date("2026-04-01"),
      end: new Date("2026-04-30"),
      dimension: "by_agent",
      dimensionIds: [1, 2, 3],
    });

    const sql: string = mockedQuery.mock.calls[0][0] as string;
    const params = mockedQuery.mock.calls[0][1] as unknown[];
    expect(sql).toMatch(/ANY\(\$\d+\)/);
    expect(params).toContainEqual([1, 2, 3]);
  });

  it("dimensionIds + connectionId convivem (params em ordem correta)", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    } as never);

    await readFactsDaily({
      connectionId: FAKE_CONN,
      accountId: 1,
      start: new Date("2026-04-01"),
      end: new Date("2026-04-30"),
      dimension: "by_agent",
      dimensionIds: [1, 2, 3],
    });

    const sql: string = mockedQuery.mock.calls[0][0] as string;
    const params = mockedQuery.mock.calls[0][1] as unknown[];
    expect(sql).toMatch(/ANY\(\$\d+\)/);
    expect(sql).toMatch(/connection_id\s*=\s*\$\d+/);
    expect(params).toContainEqual([1, 2, 3]);
    expect(params).toContain(FAKE_CONN);
  });
});

// ---------------------------------------------------------------------------
// 4. readFactsDaily — excludeMatrixIA=true + by_account => LEFT JOIN
// ---------------------------------------------------------------------------
describe("readFactsDaily — excludeMatrixIA by_account", () => {
  it("usa LEFT JOIN em chatwoot_facts_daily_by_inbox (inbox_id=31)", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [makeRawDailyRow()],
      rowCount: 1,
    } as never);

    await readFactsDaily({
      accountId: 1,
      start: new Date("2026-04-01"),
      end: new Date("2026-04-30"),
      excludeMatrixIA: true,
    });

    const sql: string = mockedQuery.mock.calls[0][0] as string;
    expect(sql).toContain("LEFT JOIN");
    expect(sql).toContain("chatwoot_facts_daily_by_inbox");
    expect(sql).toContain("31");
  });

  it("excludeMatrixIA + connectionId filtram nas duas tabelas (a + i)", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [makeRawDailyRow()],
      rowCount: 1,
    } as never);

    await readFactsDaily({
      connectionId: FAKE_CONN,
      accountId: 1,
      start: new Date("2026-04-01"),
      end: new Date("2026-04-30"),
      excludeMatrixIA: true,
    });

    const sql: string = mockedQuery.mock.calls[0][0] as string;
    const params = mockedQuery.mock.calls[0][1] as unknown[];
    expect(sql).toMatch(/a\.connection_id\s*=\s*\$\d+/);
    expect(sql).toMatch(/i\.connection_id\s*=\s*\$\d+/);
    expect(params).toContain(FAKE_CONN);
  });
});

// ---------------------------------------------------------------------------
// 5. readFactsDaily — resultado vazio retorna []
// ---------------------------------------------------------------------------
describe("readFactsDaily — resultado vazio", () => {
  it("retorna array vazio quando não há linhas", async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const rows = await readFactsDaily({
      accountId: 1,
      start: new Date("2026-04-01"),
      end: new Date("2026-04-30"),
    });

    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. readFactsDaily — args inválidos lançam erro Zod
// ---------------------------------------------------------------------------
describe("readFactsDaily — validação de args", () => {
  it("lança erro quando end < start", async () => {
    await expect(
      readFactsDaily({
        accountId: 1,
        start: new Date("2026-04-30"),
        end: new Date("2026-04-01"), // invertido
      }),
    ).rejects.toThrow();
  });

  it("lança erro quando accountId não é positivo", async () => {
    await expect(
      readFactsDaily({
        accountId: 0,
        start: new Date("2026-04-01"),
        end: new Date("2026-04-30"),
      }),
    ).rejects.toThrow();
  });

  it("lança erro quando connectionId não é UUID válido", async () => {
    await expect(
      readFactsDaily({
        connectionId: "not-a-uuid",
        accountId: 1,
        start: new Date("2026-04-01"),
        end: new Date("2026-04-30"),
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 7. readFactsHourly — ordena por (bucketDate, bucketHour) ASC
// ---------------------------------------------------------------------------
describe("readFactsHourly", () => {
  it("usa chatwoot_facts_hourly_by_account e mapeia campos corretamente", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [
        makeRawHourlyRow({ bucket_hour: 14 }),
        makeRawHourlyRow({ bucket_hour: 9 }),
      ],
      rowCount: 2,
    } as never);

    const rows = await readFactsHourly({
      accountId: 1,
      start: new Date("2026-04-01"),
      end: new Date("2026-04-30"),
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      bucketDate: "2026-04-01",
      bucketHour: 14,
      accountId: 1,
      received: 5,
      resolved: 3,
      messagesIn: 20,
      messagesOut: 18,
      uniqueContacts: 4,
    });

    const sql: string = mockedQuery.mock.calls[0][0] as string;
    expect(sql).toContain("chatwoot_facts_hourly_by_account");
    // ORDER BY inclui bucket_date e bucket_hour
    expect(sql).toContain("bucket_date");
    expect(sql).toContain("bucket_hour");
  });

  it("sem connectionId, NÃO filtra por connection_id (compat)", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    } as never);

    await readFactsHourly({
      accountId: 1,
      start: new Date("2026-04-01"),
      end: new Date("2026-04-30"),
    });

    const sql: string = mockedQuery.mock.calls[0][0] as string;
    expect(sql).not.toMatch(/connection_id\s*=/);
  });

  it("com connectionId, filtra WHERE connection_id = $X", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    } as never);

    await readFactsHourly({
      connectionId: FAKE_CONN,
      accountId: 1,
      start: new Date("2026-04-01"),
      end: new Date("2026-04-30"),
    });

    const sql: string = mockedQuery.mock.calls[0][0] as string;
    const params = mockedQuery.mock.calls[0][1] as unknown[];
    expect(sql).toMatch(/connection_id\s*=\s*\$\d+/);
    expect(params).toContain(FAKE_CONN);
  });
});

// ---------------------------------------------------------------------------
// 8. readFactsMeta — lagSeconds + status
// ---------------------------------------------------------------------------
describe("readFactsMeta — lagSeconds e status", () => {
  const NOW = new Date("2026-04-30T12:00:00.000Z").getTime();

  function makeRawMetaRow(overrides: Record<string, unknown> = {}) {
    return {
      dimension: "by_account",
      account_id: 1,
      last_refresh_at: null,
      last_attempt_at: null,
      last_error: null,
      oldest_bucket_date: null,
      newest_bucket_date: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("status='fresh' quando lastRefreshAt há 5 min", async () => {
    const fiveMinAgo = new Date(NOW - 5 * 60 * 1000);
    mockedQuery.mockResolvedValueOnce({
      rows: [makeRawMetaRow({ last_refresh_at: fiveMinAgo })],
      rowCount: 1,
    } as never);

    const rows = await readFactsMeta({ accountId: 1 });
    expect(rows[0].status).toBe("fresh");
    expect(rows[0].lagSeconds).toBe(300);
  });

  it("status='stale' quando lastRefreshAt há 20 min", async () => {
    const twentyMinAgo = new Date(NOW - 20 * 60 * 1000);
    mockedQuery.mockResolvedValueOnce({
      rows: [makeRawMetaRow({ last_refresh_at: twentyMinAgo })],
      rowCount: 1,
    } as never);

    const rows = await readFactsMeta({ accountId: 1 });
    expect(rows[0].status).toBe("stale");
  });

  it("status='lagging' quando lastRefreshAt há 60 min", async () => {
    const sixtyMinAgo = new Date(NOW - 60 * 60 * 1000);
    mockedQuery.mockResolvedValueOnce({
      rows: [makeRawMetaRow({ last_refresh_at: sixtyMinAgo })],
      rowCount: 1,
    } as never);

    const rows = await readFactsMeta({ accountId: 1 });
    expect(rows[0].status).toBe("lagging");
  });

  it("status='never' e lagSeconds=null quando lastRefreshAt é null", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [makeRawMetaRow()],
      rowCount: 1,
    } as never);

    const rows = await readFactsMeta({ accountId: 1 });
    expect(rows[0].status).toBe("never");
    expect(rows[0].lagSeconds).toBeNull();
  });

  it("filtra por dimension quando fornecida", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [makeRawMetaRow({ dimension: "by_inbox" })],
      rowCount: 1,
    } as never);

    await readFactsMeta({ accountId: 1, dimension: "by_account" });

    const params = mockedQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain("by_account");
  });

  it("com connectionId, filtra connection_id = $X", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [makeRawMetaRow()],
      rowCount: 1,
    } as never);

    await readFactsMeta({ connectionId: FAKE_CONN, accountId: 1 });

    const sql: string = mockedQuery.mock.calls[0][0] as string;
    const params = mockedQuery.mock.calls[0][1] as unknown[];
    expect(sql).toMatch(/connection_id\s*=\s*\$\d+/);
    expect(params).toContain(FAKE_CONN);
  });
});
