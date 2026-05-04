/**
 * v0.36 B2 invariante: para a mesma conversa Aberta com last_activity_at em
 * 03/05 11:00 SP (= 14:00 UTC), os 3 períodos (dia/semana/mês) devem mostrar
 * open=1 no bucket 03/05.
 *
 * Mock pool detecta queries por marcadores estáveis (substring exclusivo):
 *  - sqlChart (T4 refatorada): contém "WITH unioned AS"
 *  - KPI counts: contém "SELECT COUNT(*)::bigint AS total"
 *  - demais queries: irrelevantes ao invariante, retornam rows vazias.
 *
 * Antes de T4 (sqlChart ainda usa "WITH created_buckets") os tests falham —
 * é o estado RED da TDD.
 *
 * v0.37.0 (multi-tenant fase 1): dashboardData passa a receber `connectionId`
 * como primeiro argumento e usa `queryNexusChat` em vez de `getChatwootPool`.
 */
import { dashboardData } from "../dashboard-data";
import type { DashboardChartPoint } from "../dashboard-data";
import { fromZonedTime } from "date-fns-tz";

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

const TZ = "America/Sao_Paulo";

interface MockChartRow {
  bucket: Date;
  received: string;
  resolved: string;
  open: string;
  pending: string;
}

function setupOpenConvo03_05_11h() {
  // Cenário: 1 conversa status=0 com last_activity_at = 03/05 14:00 UTC
  // (= 11:00 SP). Criada antes do período ⇒ received=0, resolved=0, open=1.
  mockQuery.mockImplementation((sql: string) => {
    // KPI counts
    if (sql.includes("SELECT COUNT(*)::bigint AS total")) {
      // received OR resolved (filtra por created_at): 0
      if (
        sql.includes("c.created_at >=") &&
        !sql.includes("c.last_activity_at")
      ) {
        return Promise.resolve({ rows: [{ total: "0" }] });
      }
      // open (filtra por last_activity_at + status=0): 1
      if (
        sql.includes("c.last_activity_at >=") &&
        sql.includes("c.status = 0")
      ) {
        return Promise.resolve({ rows: [{ total: "1" }] });
      }
      return Promise.resolve({ rows: [{ total: "0" }] });
    }
    // sqlChart refatorada (T4) — UNION ALL
    if (sql.includes("WITH unioned AS")) {
      const isHour = sql.includes("date_trunc('hour'");
      const bucketUtc = isHour
        ? fromZonedTime("2026-05-03T11:00:00", TZ) // 14:00 UTC
        : fromZonedTime("2026-05-03T00:00:00", TZ); // 03:00 UTC
      const row: MockChartRow = {
        bucket: bucketUtc,
        received: "0",
        resolved: "0",
        open: "1",
        pending: "0",
      };
      return Promise.resolve({ rows: [row] });
    }
    // Demais queries (top-agents, top-inboxes, by-team, by-status,
    // no-response, recent) — irrelevantes ao invariante.
    return Promise.resolve({ rows: [] });
  });
}

const CONNECTION_ID = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

const baseInput = (
  period: { start: Date; end: Date },
  prev: { start: Date; end: Date },
  granularity: "hour" | "day",
) => ({
  accountId: 1,
  period,
  prevPeriod: prev,
  forcedGranularity: granularity,
});

describe("dashboardData chart invariant cross-period (v0.36 B2)", () => {
  beforeEach(() => mockQuery.mockReset());

  it("DIA 03/05 (granularity=hour) retorna soma open=1 no chart", async () => {
    setupOpenConvo03_05_11h();
    const result = await dashboardData(
      CONNECTION_ID,
      baseInput(
        {
          start: fromZonedTime("2026-05-03T00:00:00", TZ),
          end: fromZonedTime("2026-05-03T23:59:59.999", TZ),
        },
        {
          start: fromZonedTime("2026-05-02T00:00:00", TZ),
          end: fromZonedTime("2026-05-02T23:59:59.999", TZ),
        },
        "hour",
      ),
    );
    const totalOpen = result.data.chart.reduce((a: number, r: DashboardChartPoint) => a + r.open, 0);
    expect(totalOpen).toBe(1);
  });

  it("SEMANA 27/04—03/05 (granularity=day) retorna open=1 no bucket 03/05", async () => {
    setupOpenConvo03_05_11h();
    const result = await dashboardData(
      CONNECTION_ID,
      baseInput(
        {
          start: fromZonedTime("2026-04-27T00:00:00", TZ),
          end: fromZonedTime("2026-05-03T23:59:59.999", TZ),
        },
        {
          start: fromZonedTime("2026-04-20T00:00:00", TZ),
          end: fromZonedTime("2026-04-26T23:59:59.999", TZ),
        },
        "day",
      ),
    );
    const bucket0305 = result.data.chart.find((r: DashboardChartPoint) =>
      r.bucket.startsWith("2026-05-03"),
    );
    expect(bucket0305).toBeDefined();
    expect(bucket0305!.open).toBe(1);
  });

  it("MÊS 01/05—31/05 (granularity=day) retorna open=1 no bucket 03/05", async () => {
    setupOpenConvo03_05_11h();
    const result = await dashboardData(
      CONNECTION_ID,
      baseInput(
        {
          start: fromZonedTime("2026-05-01T00:00:00", TZ),
          end: fromZonedTime("2026-05-31T23:59:59.999", TZ),
        },
        {
          start: fromZonedTime("2026-04-01T00:00:00", TZ),
          end: fromZonedTime("2026-04-30T23:59:59.999", TZ),
        },
        "day",
      ),
    );
    const bucket0305 = result.data.chart.find((r: DashboardChartPoint) =>
      r.bucket.startsWith("2026-05-03"),
    );
    expect(bucket0305).toBeDefined();
    expect(bucket0305!.open).toBe(1);
  });

  it("CONSISTÊNCIA: dia(soma)=semana(bucket-03/05)=mês(bucket-03/05)=1", async () => {
    setupOpenConvo03_05_11h();
    const dia = await dashboardData(
      CONNECTION_ID,
      baseInput(
        {
          start: fromZonedTime("2026-05-03T00:00:00", TZ),
          end: fromZonedTime("2026-05-03T23:59:59.999", TZ),
        },
        {
          start: fromZonedTime("2026-05-02T00:00:00", TZ),
          end: fromZonedTime("2026-05-02T23:59:59.999", TZ),
        },
        "hour",
      ),
    );
    const semana = await dashboardData(
      CONNECTION_ID,
      baseInput(
        {
          start: fromZonedTime("2026-04-27T00:00:00", TZ),
          end: fromZonedTime("2026-05-03T23:59:59.999", TZ),
        },
        {
          start: fromZonedTime("2026-04-20T00:00:00", TZ),
          end: fromZonedTime("2026-04-26T23:59:59.999", TZ),
        },
        "day",
      ),
    );
    const mes = await dashboardData(
      CONNECTION_ID,
      baseInput(
        {
          start: fromZonedTime("2026-05-01T00:00:00", TZ),
          end: fromZonedTime("2026-05-31T23:59:59.999", TZ),
        },
        {
          start: fromZonedTime("2026-04-01T00:00:00", TZ),
          end: fromZonedTime("2026-04-30T23:59:59.999", TZ),
        },
        "day",
      ),
    );
    const totalDia = dia.data.chart.reduce((a: number, r: DashboardChartPoint) => a + r.open, 0);
    const bucketSemana = semana.data.chart.find((r: DashboardChartPoint) =>
      r.bucket.startsWith("2026-05-03"),
    )!.open;
    const bucketMes = mes.data.chart.find((r: DashboardChartPoint) =>
      r.bucket.startsWith("2026-05-03"),
    )!.open;
    expect(totalDia).toBe(bucketSemana);
    expect(bucketSemana).toBe(bucketMes);
    expect(totalDia).toBe(1);
  });
});
