/**
 * Tests for volumetria-heatmap migration to facts.
 *
 * Hybrid pattern:
 *  - When `inboxIds`/`teamIds` are unset → reads from `readFactsHourly`
 *    (facts pre-aggregation), and the (DOW × hour) matrix is rolled up in JS.
 *  - When any of those filters is set → falls back to the original
 *    Chatwoot direct query (facts have no by_inbox/by_team hourly granularity).
 */

jest.mock("@/lib/cache/pull-through", () => ({
  withCache: async ({
    fetcher,
  }: {
    fetcher: () => Promise<{ data: unknown; stale: boolean }>;
  }) => {
    const r = await fetcher();
    return { data: r.data, cached: false, stale: r.stale };
  },
}));
jest.mock("../../resilience", () => ({
  withChatwootResilience: async <T,>(fn: () => Promise<T>) => ({
    data: await fn(),
    stale: false,
  }),
}));
jest.mock("../../facts", () => ({
  readFactsHourly: jest.fn(),
}));
jest.mock("../../pool", () => ({
  getChatwootPool: jest.fn(),
}));

import { volumetriaHeatmap } from "../volumetria-heatmap";

const { readFactsHourly } = jest.requireMock("../../facts");
const { getChatwootPool } = jest.requireMock("../../pool");

const PERIOD_START = new Date("2026-04-13T00:00:00Z"); // segunda
const PERIOD_END = new Date("2026-04-19T23:59:59Z"); // domingo

describe("volumetriaHeatmap (facts-first)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("usa readFactsHourly e agrega para (DOW × hour) quando não há filtros por inbox/team", async () => {
    // 2026-04-13 = segunda-feira (DOW=1), 2026-04-14 = terça (DOW=2)
    (readFactsHourly as jest.Mock).mockResolvedValue([
      { bucketDate: "2026-04-13", bucketHour: 9, accountId: 1, received: 5, resolved: 0, messagesIn: 0, messagesOut: 0, uniqueContacts: 0 },
      { bucketDate: "2026-04-13", bucketHour: 10, accountId: 1, received: 7, resolved: 0, messagesIn: 0, messagesOut: 0, uniqueContacts: 0 },
      { bucketDate: "2026-04-14", bucketHour: 9, accountId: 1, received: 3, resolved: 0, messagesIn: 0, messagesOut: 0, uniqueContacts: 0 },
      // Mesmo (dow,hour) somando dias diferentes (semana seguinte hipotética):
      { bucketDate: "2026-04-20", bucketHour: 9, accountId: 1, received: 4, resolved: 0, messagesIn: 0, messagesOut: 0, uniqueContacts: 0 },
    ]);

    const result = await volumetriaHeatmap({
      accountId: 1,
      filters: {
        period: { start: PERIOD_START, end: PERIOD_END },
        excludeMatrixIA: true,
      },
    });

    expect(readFactsHourly).toHaveBeenCalledWith({
      accountId: 1,
      start: PERIOD_START,
      end: PERIOD_END,
      excludeMatrixIA: true,
    });
    expect(getChatwootPool).not.toHaveBeenCalled();

    // Espera: (DOW=1, hour=9) = 5+4 = 9 ; (DOW=1, hour=10) = 7 ; (DOW=2, hour=9) = 3
    const sorted = [...result.data].sort((a, b) =>
      a.dow !== b.dow ? a.dow - b.dow : a.hour - b.hour,
    );
    expect(sorted).toEqual([
      { dow: 1, hour: 9, total: 9 },
      { dow: 1, hour: 10, total: 7 },
      { dow: 2, hour: 9, total: 3 },
    ]);
  });

  it("default excludeMatrixIA=true quando undefined", async () => {
    (readFactsHourly as jest.Mock).mockResolvedValue([]);
    await volumetriaHeatmap({
      accountId: 1,
      filters: { period: { start: PERIOD_START, end: PERIOD_END } },
    });
    expect(readFactsHourly).toHaveBeenCalledWith(
      expect.objectContaining({ excludeMatrixIA: true }),
    );
  });

  it("fallback para Chatwoot quando inboxIds está setado", async () => {
    const queryMock = jest.fn().mockResolvedValue({
      rows: [{ dow: "1", hour: "9", total: "12" }],
    });
    (getChatwootPool as jest.Mock).mockReturnValue({ query: queryMock });

    const result = await volumetriaHeatmap({
      accountId: 1,
      filters: {
        period: { start: PERIOD_START, end: PERIOD_END },
        inboxIds: [9, 10],
      },
    });

    expect(readFactsHourly).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalled();
    expect(result.data).toEqual([{ dow: 1, hour: 9, total: 12 }]);
  });

  it("fallback para Chatwoot quando teamIds está setado", async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [] });
    (getChatwootPool as jest.Mock).mockReturnValue({ query: queryMock });

    await volumetriaHeatmap({
      accountId: 1,
      filters: {
        period: { start: PERIOD_START, end: PERIOD_END },
        teamIds: [10],
      },
    });

    expect(readFactsHourly).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalled();
  });
});
