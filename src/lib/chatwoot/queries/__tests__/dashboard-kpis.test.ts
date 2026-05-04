/**
 * Task 4 (v0.42 padrão canônico) — verifica que `dashboardKpis` gera SQL
 * conforme o glossário canônico de `src/lib/reports/canonical.ts`.
 *
 * Estratégia: mockar `queryNexusChat` e inspecionar a string SQL passada em
 * cada uma das 7 queries paralelas. Não validamos snapshot — validamos
 * propriedades estruturais (regex/contains) que sobrevivem a refatorações
 * cosméticas mas garantem o contrato canônico.
 */
import { dashboardKpis } from "../dashboard-kpis";

const mockQuery = jest.fn();

jest.mock("@/lib/nexus-chat/pool", () => ({
  queryNexusChat: (
    _connectionId: string,
    sql: string,
    params: unknown[] = [],
  ) => mockQuery(sql, params),
}));
jest.mock("../../resilience", () => ({
  withChatwootResilience: <T,>(fn: () => Promise<T>) => fn(),
}));
jest.mock("@/lib/cache/pull-through", () => ({
  withCache: <T,>(opts: { fetcher: () => Promise<T> }) => opts.fetcher(),
}));
jest.mock("@/lib/cache/keys", () => ({
  cacheKey: () => "test-key",
  hashFilters: () => "test-hash",
}));

const CONNECTION_ID = "conn-1";

const baseInput = {
  accountId: 1,
  filters: {
    period: { start: new Date("2026-05-01"), end: new Date("2026-05-04") },
  },
};

describe("dashboardKpis — canonical SQL (v0.42)", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  function getCalls(): string[] {
    return mockQuery.mock.calls.map((c) => c[0] as string);
  }

  test("sqlResolvidas filtra c.last_activity_at (canonical active) + status resolved (1), sem c.created_at", async () => {
    await dashboardKpis(CONNECTION_ID, baseInput);
    const calls = getCalls();
    // O SQL de resolvidas é o único que tem last_activity_at >= AND
    // status (via buildBaseFilter c.status = ANY($N)) e NÃO tem GROUP BY.
    const sqlResolvidas = calls.find(
      (sql) =>
        /c\.last_activity_at >= \$/.test(sql) &&
        /c\.status = ANY\(/.test(sql) &&
        /SELECT COUNT\(\*\)::bigint AS total/.test(sql) &&
        !/GROUP BY/.test(sql) &&
        !/JOIN/.test(sql),
    );
    expect(sqlResolvidas).toBeDefined();
    // Garantir que NÃO usa created_at no recorte do period
    expect(sqlResolvidas).not.toMatch(/c\.created_at >= \$/);

    // E a chamada correspondente deve ter o status [1] como param.
    const matchingCall = mockQuery.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        /c\.last_activity_at >= \$/.test(c[0] as string) &&
        /c\.status = ANY\(/.test(c[0] as string) &&
        !/GROUP BY/.test(c[0] as string),
    );
    expect(matchingCall).toBeDefined();
    const params = matchingCall![1] as unknown[];
    // Algum param deve ser o array [STATUS_RESOLVED] = [1]
    const hasResolvedStatus = params.some(
      (p) => Array.isArray(p) && p.length === 1 && p[0] === 1,
    );
    expect(hasResolvedStatus).toBe(true);
  });

  test("sqlNaoRespondidas usa CTE last_classification_msg + lcm.message_type = 0", async () => {
    await dashboardKpis(CONNECTION_ID, baseInput);
    const calls = getCalls();
    const sqlNaoRespondidas = calls.find(
      (sql) =>
        /last_classification_msg/.test(sql) &&
        /lcm\.message_type = 0/.test(sql),
    );
    expect(sqlNaoRespondidas).toBeDefined();
    // Subquery bruta antiga não pode mais existir
    expect(sqlNaoRespondidas).not.toMatch(
      /\(\s*SELECT m\.message_type\s+FROM messages/,
    );
  });

  test("cache key bumped to dashboard-kpis-canonical-v0.42 (string presente no fonte)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "src/lib/chatwoot/queries/dashboard-kpis.ts",
      "utf8",
    );
    expect(src).toContain("dashboard-kpis-canonical-v0.42");
  });
});
