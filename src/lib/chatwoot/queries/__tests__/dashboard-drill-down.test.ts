/**
 * Task 5 (v0.42 padrão canônico) — verifica que cada uma das 6 funções de
 * drill-down do dashboard gera SQL conforme o glossário canônico de
 * `src/lib/reports/canonical.ts`.
 *
 * Estratégia: mockar `queryNexusChat`, executar cada função e inspecionar as
 * strings SQL passadas em cada query paralela. Validamos propriedades
 * estruturais via regex (que sobrevivem a refatorações cosméticas) e o
 * contrato canônico de cada drill-down (mesmo periodColumn do KPI
 * correspondente).
 */
import {
  getReceivedDrillDown,
  getResolvedDrillDown,
  getOpenDrillDown,
  getResolutionRateDrillDown,
  getNoResponseDrillDown,
  getByTeamDrillDown,
} from "../dashboard-drill-down";

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

const baseArgs = {
  accountId: 1,
  period: { start: new Date("2026-05-01"), end: new Date("2026-05-04") },
};

function getCalls(): string[] {
  return mockQuery.mock.calls.map((c) => c[0] as string);
}

describe("dashboard-drill-down — canonical SQL (v0.42)", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  /* ----------------------------- Received ----------------------------- */

  describe("getReceivedDrillDown", () => {
    test("filtra c.created_at (KPI canônico — único drill por created)", async () => {
      await getReceivedDrillDown(CONNECTION_ID, baseArgs);
      const calls = getCalls();
      // Pelo menos uma query (sqlTotal) com COUNT(*) e c.created_at
      const sqlTotal = calls.find(
        (sql) =>
          /SELECT COUNT\(\*\)::bigint AS total/.test(sql) &&
          /AND c\.created_at >= \$2/.test(sql) &&
          !/AND c\.status =/.test(sql),
      );
      expect(sqlTotal).toBeDefined();
      // Nenhuma query desta função pode usar c.last_activity_at no recorte do period
      for (const sql of calls) {
        expect(sql).not.toMatch(/AND c\.last_activity_at >= \$2/);
      }
    });
  });

  /* ----------------------------- Resolved ----------------------------- */

  describe("getResolvedDrillDown", () => {
    test("filtra c.last_activity_at + status=1 (canonical active)", async () => {
      await getResolvedDrillDown(CONNECTION_ID, baseArgs);
      const calls = getCalls();
      const sqlTotal = calls.find(
        (sql) =>
          /SELECT COUNT\(\*\)::bigint AS total/.test(sql) &&
          /AND c\.last_activity_at >= \$2/.test(sql) &&
          /AND c\.status = 1/.test(sql),
      );
      expect(sqlTotal).toBeDefined();
      // Nenhuma query desta função pode usar c.created_at >= $ no recorte
      for (const sql of calls) {
        expect(sql).not.toMatch(/AND c\.created_at >= \$2/);
      }
    });
  });

  /* ------------------------------- Open ------------------------------- */

  describe("getOpenDrillDown", () => {
    test("filtra c.last_activity_at + status=0 (canonical active)", async () => {
      await getOpenDrillDown(CONNECTION_ID, baseArgs);
      const calls = getCalls();
      // sqlTotal vem do getStatusDrillDown (status=0)
      const sqlTotal = calls.find(
        (sql) =>
          /SELECT COUNT\(\*\)::bigint AS total/.test(sql) &&
          /AND c\.last_activity_at >= \$2/.test(sql) &&
          /AND c\.status = \$4/.test(sql),
      );
      expect(sqlTotal).toBeDefined();
      // sqlByStatus do wrapper (status IN 0,2,3) também precisa usar last_activity_at
      const sqlByStatus = calls.find(
        (sql) =>
          /AND c\.status IN \(0, 2, 3\)/.test(sql) &&
          /GROUP BY c\.status/.test(sql),
      );
      expect(sqlByStatus).toBeDefined();
      expect(sqlByStatus).toMatch(/AND c\.last_activity_at >= \$2/);
    });
  });

  /* ------------------------- Resolution Rate -------------------------- */

  describe("getResolutionRateDrillDown", () => {
    test("Recebidas usa c.created_at (canonical created); Resolvidas usa c.last_activity_at + status=1 (canonical active) — coorte mista intencional, clamp 100% no front", async () => {
      await getResolutionRateDrillDown(CONNECTION_ID, baseArgs);
      const calls = getCalls();

      // Sub-query Recebidas: COUNT(*) com c.created_at (sem status filter no WHERE)
      const sqlReceived = calls.find(
        (sql) =>
          /SELECT[\s\S]+COUNT\(\*\)::bigint AS received/.test(sql) &&
          /AND c\.created_at >= \$2/.test(sql) &&
          !/c\.last_activity_at >= \$2/.test(sql),
      );
      expect(sqlReceived).toBeDefined();

      // Sub-query Resolvidas: COUNT com c.last_activity_at + c.status = 1
      const sqlResolved = calls.find(
        (sql) =>
          /COUNT\(\*\)::bigint AS resolved/.test(sql) &&
          /AND c\.last_activity_at >= \$2/.test(sql) &&
          /AND c\.status = 1/.test(sql),
      );
      expect(sqlResolved).toBeDefined();
    });
  });

  /* ---------------------------- NoResponse ---------------------------- */

  describe("getNoResponseDrillDown", () => {
    test("usa CTE canônica last_classification_msg + lcm.message_type=0 (sem CTE inline last_msg)", async () => {
      await getNoResponseDrillDown(CONNECTION_ID, baseArgs);
      const calls = getCalls();
      // Todas as queries da função precisam usar a CTE canônica
      const queriesWithCte = calls.filter((sql) =>
        /last_classification_msg/.test(sql),
      );
      expect(queriesWithCte.length).toBeGreaterThanOrEqual(4);
      for (const sql of queriesWithCte) {
        expect(sql).toMatch(/lcm\.message_type = 0/);
        // CTE inline antiga não pode mais existir
        expect(sql).not.toMatch(/WITH last_msg AS/);
      }
    });
  });

  /* ------------------------------ ByTeam ------------------------------ */

  describe("getByTeamDrillDown", () => {
    test("filtra c.last_activity_at (canonical active)", async () => {
      await getByTeamDrillDown(CONNECTION_ID, {
        ...baseArgs,
        teamId: 7,
      });
      const calls = getCalls();
      const sqlTotal = calls.find(
        (sql) =>
          /SELECT[\s\S]+COUNT\(c\.id\)::bigint AS total/.test(sql) &&
          /team_name/.test(sql),
      );
      expect(sqlTotal).toBeDefined();
      expect(sqlTotal).toMatch(/AND c\.last_activity_at >= \$2/);
      // não pode usar created_at >= $ no recorte
      for (const sql of calls) {
        expect(sql).not.toMatch(/AND c\.created_at >= \$2/);
      }
    });
  });

  /* -------------------------- matrixClause --------------------------- */

  describe("matrixClause via helper canonical", () => {
    test("excludeMatrixIA=true (default) → c.inbox_id <> 31 presente", async () => {
      await getReceivedDrillDown(CONNECTION_ID, baseArgs);
      const calls = getCalls();
      const anyMatrix = calls.find((sql) => /c\.inbox_id <> 31/.test(sql));
      expect(anyMatrix).toBeDefined();
    });

    test("excludeMatrixIA=false suprime o filtro Matrix IA", async () => {
      await getReceivedDrillDown(CONNECTION_ID, {
        ...baseArgs,
        excludeMatrixIA: false,
      });
      const calls = getCalls();
      const anyMatrix = calls.find((sql) => /c\.inbox_id <> 31/.test(sql));
      expect(anyMatrix).toBeUndefined();
    });
  });

  /* ----------------------- cache key bumped --------------------------- */

  describe("cache keys", () => {
    test("cache keys bumped to canonical-v0.42 nas 6 funções", async () => {
      const fs = await import("fs");
      const src = fs.readFileSync(
        "src/lib/chatwoot/queries/dashboard-drill-down.ts",
        "utf8",
      );
      expect(src).toContain("dashboard-drill-received-canonical-v0.45");
      expect(src).toContain("dashboard-drill-resolved-canonical-v0.42");
      expect(src).toContain("dashboard-drill-status-canonical-v0.42");
      expect(src).toContain("dashboard-drill-open-canonical-v0.42");
      expect(src).toContain("dashboard-drill-resolution-canonical-v0.42");
      expect(src).toContain("dashboard-drill-no-response-canonical-v0.42");
      expect(src).toContain("dashboard-drill-by-team-canonical-v0.42");
      // Versões antigas não podem mais aparecer
      expect(src).not.toMatch(/dashboard-drill-received-v4\b/);
      expect(src).not.toMatch(/dashboard-drill-resolved-v4\b/);
      expect(src).not.toMatch(/dashboard-drill-status-v4\b/);
      expect(src).not.toMatch(/dashboard-drill-open-v3\b/);
      expect(src).not.toMatch(/dashboard-drill-resolution-v3\b/);
      expect(src).not.toMatch(/dashboard-drill-no-response-v2\b/);
      expect(src).not.toMatch(/dashboard-drill-by-team-v2\b/);
    });
  });
});
