/**
 * Task 3 (v0.42 padrão canônico) — verifica que `dashboardData` gera SQL
 * conforme o glossário canônico de `src/lib/reports/canonical.ts`.
 *
 * Estratégia: mockar `queryNexusChat` e inspecionar a string SQL passada em
 * cada uma das 14 queries paralelas. Não validamos snapshot — validamos
 * propriedades estruturais (regex/contains) que sobrevivem a refatorações
 * cosméticas mas garantem o contrato canônico.
 */
import { dashboardData } from "../dashboard-data";

const mockQuery = jest.fn();

jest.mock("@/lib/nexus-chat/pool", () => ({
  queryNexusChat: (
    _connectionId: string,
    sql: string,
    params: unknown[] = [],
  ) => mockQuery(sql, params),
}));
jest.mock("../../resilience", () => ({
  withChatwootResilience: <T,>(fn: () => Promise<T>) =>
    fn().then((data) => ({ data, stale: false })),
}));
jest.mock("@/lib/cache/pull-through", () => ({
  withCache: <T,>(opts: {
    fetcher: () => Promise<{ data: T; stale: boolean }>;
  }) =>
    opts.fetcher().then((r) => ({
      data: r.data,
      cached: false,
      stale: r.stale,
    })),
}));
jest.mock("@/lib/cache/keys", () => ({
  cacheKey: () => "test-key",
  hashFilters: () => "test-hash",
}));
jest.mock("@/lib/datetime", () => ({
  getPlatformTz: async () => "America/Sao_Paulo",
}));

const CONNECTION_ID = "conn-1";

const baseInput = {
  accountId: 1,
  period: { start: new Date("2026-05-01"), end: new Date("2026-05-04") },
  prevPeriod: {
    start: new Date("2026-04-28"),
    end: new Date("2026-05-01"),
  },
};

describe("dashboardData — canonical SQL (v0.42)", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  function getCalls(): string[] {
    return mockQuery.mock.calls.map((c) => c[0] as string);
  }

  test("sqlReceived filtra c.created_at (KPI canônico) — único recorte por created_at", async () => {
    await dashboardData(CONNECTION_ID, baseInput);
    const calls = getCalls();
    const sqlReceived = calls.find(
      (sql) =>
        /SELECT COUNT\(\*\)::bigint AS total\s+FROM conversations c\s+WHERE c\.account_id = \$1\s+AND c\.created_at >= \$2/.test(
          sql,
        ) && !/AND c\.status =/.test(sql),
    );
    expect(sqlReceived).toBeDefined();
  });

  test("sqlResolved filtra c.last_activity_at (canonical active) + status=1", async () => {
    await dashboardData(CONNECTION_ID, baseInput);
    const calls = getCalls();
    const sqlResolved = calls.find(
      (sql) =>
        /AND c\.last_activity_at >= \$2/.test(sql) &&
        /AND c\.status = 1/.test(sql),
    );
    expect(sqlResolved).toBeDefined();
    // Garantir que NÃO usa created_at no recorte do period
    expect(sqlResolved).not.toMatch(/AND c\.created_at >= \$2/);
  });

  test("sqlOpen filtra c.last_activity_at + status=0, sem UNION ALL", async () => {
    await dashboardData(CONNECTION_ID, baseInput);
    const calls = getCalls();
    const sqlOpen = calls.find(
      (sql) =>
        /AND c\.last_activity_at >= \$2/.test(sql) &&
        /AND c\.status = 0/.test(sql) &&
        !/UNION ALL/.test(sql) &&
        !/JOIN inboxes/.test(sql),
    );
    expect(sqlOpen).toBeDefined();
  });

  test("sqlByStatus query única por c.last_activity_at, sem UNION ALL bifurcando status=1", async () => {
    await dashboardData(CONNECTION_ID, baseInput);
    const calls = getCalls();
    const sqlByStatus = calls.find(
      (sql) =>
        /GROUP BY c\.status/.test(sql) &&
        /c\.status::int AS status/.test(sql),
    );
    expect(sqlByStatus).toBeDefined();
    expect(sqlByStatus).toMatch(/c\.last_activity_at >= \$2/);
    // Não deve haver UNION ALL bifurcando status=1 por created_at
    expect(sqlByStatus).not.toMatch(/UNION ALL[\s\S]+c\.created_at >= \$2/);
  });

  test("sqlNoResponse usa CTE last_classification_msg + filtro lcm.message_type = 0", async () => {
    await dashboardData(CONNECTION_ID, baseInput);
    const calls = getCalls();
    const sqlNoResponse = calls.find(
      (sql) =>
        /last_classification_msg/.test(sql) &&
        /lcm\.message_type = 0/.test(sql) &&
        /SELECT[\s\S]+c\.id,/.test(sql),
    );
    expect(sqlNoResponse).toBeDefined();
    // CTE inline antiga `WITH last_msg AS` não pode mais existir
    expect(sqlNoResponse).not.toMatch(/WITH last_msg AS/);
  });

  test("sqlNoResponseAgg também usa CTE canônica", async () => {
    await dashboardData(CONNECTION_ID, baseInput);
    const calls = getCalls();
    const sqlNoResponseAgg = calls.find(
      (sql) =>
        /last_classification_msg/.test(sql) &&
        /lcm\.message_type = 0/.test(sql) &&
        /COUNT\(\*\)::int AS total/.test(sql) &&
        /oldest_seconds/.test(sql),
    );
    expect(sqlNoResponseAgg).toBeDefined();
    expect(sqlNoResponseAgg).not.toMatch(/WITH last_msg AS/);
  });

  test("matrixClause vem do helper canonical (literal '<> 31' continua presente)", async () => {
    await dashboardData(CONNECTION_ID, { ...baseInput, excludeMatrixIA: true });
    const calls = getCalls();
    // Pelo menos uma das queries (sqlReceived) deve conter o filtro do helper
    const anyMatrix = calls.find((sql) => /c\.inbox_id <> 31/.test(sql));
    expect(anyMatrix).toBeDefined();
  });

  test("excludeMatrixIA=false suprime o filtro Matrix IA", async () => {
    await dashboardData(CONNECTION_ID, { ...baseInput, excludeMatrixIA: false });
    const calls = getCalls();
    const anyMatrix = calls.find((sql) => /c\.inbox_id <> 31/.test(sql));
    expect(anyMatrix).toBeUndefined();
  });

  test("cache key bumped to canonical-v0.44 (string presente no fonte)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "src/lib/chatwoot/queries/dashboard-data.ts",
      "utf8",
    );
    expect(src).toContain("dashboard-data-canonical-v0.44");
    expect(src).not.toContain("dashboard-data-v9");
  });
});
