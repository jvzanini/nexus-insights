/**
 * Tests for volumetria-heatmap migration to facts.
 *
 * Hybrid pattern (multi-tenant):
 *  - When `inboxIds`/`teamIds` are unset → reads from `readFactsHourly`
 *    (facts pre-aggregation), and the (DOW × hour) matrix is rolled up in JS.
 *  - When any of those filters is set → falls back to the Nexus Chat
 *    direct query (queryNexusChat com connectionId).
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
jest.mock("@/lib/nexus-chat/pool", () => ({
  queryNexusChat: jest.fn(),
}));

import { volumetriaHeatmap } from "../volumetria-heatmap";

const { readFactsHourly } = jest.requireMock("../../facts");
const { queryNexusChat } = jest.requireMock("@/lib/nexus-chat/pool");

const PERIOD_START = new Date("2026-04-13T00:00:00Z"); // segunda
const PERIOD_END = new Date("2026-04-19T23:59:59Z"); // domingo
const CONN_ID = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

describe("volumetriaHeatmap (facts-first, multi-tenant)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("usa readFactsHourly e agrega (DOW × hour) quando não há filtros por inbox/team", async () => {
    // 2026-04-13 = segunda-feira (DOW=1), 2026-04-14 = terça (DOW=2)
    (readFactsHourly as jest.Mock).mockResolvedValue([
      { bucketDate: "2026-04-13", bucketHour: 9, accountId: 1, received: 5, resolved: 0, messagesIn: 0, messagesOut: 0, uniqueContacts: 0 },
      { bucketDate: "2026-04-13", bucketHour: 10, accountId: 1, received: 7, resolved: 0, messagesIn: 0, messagesOut: 0, uniqueContacts: 0 },
      { bucketDate: "2026-04-14", bucketHour: 9, accountId: 1, received: 3, resolved: 0, messagesIn: 0, messagesOut: 0, uniqueContacts: 0 },
      // Mesmo (dow,hour) somando dias diferentes (semana seguinte hipotética):
      { bucketDate: "2026-04-20", bucketHour: 9, accountId: 1, received: 4, resolved: 0, messagesIn: 0, messagesOut: 0, uniqueContacts: 0 },
    ]);

    const result = await volumetriaHeatmap({
      connectionId: CONN_ID,
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
    expect(queryNexusChat).not.toHaveBeenCalled();

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
      connectionId: CONN_ID,
      accountId: 1,
      filters: { period: { start: PERIOD_START, end: PERIOD_END } },
    });
    expect(readFactsHourly).toHaveBeenCalledWith(
      expect.objectContaining({ excludeMatrixIA: true }),
    );
  });

  it("fallback para Nexus Chat quando inboxIds está setado, propaga connectionId", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValue({
      rows: [{ dow: "1", hour: "9", total: "12" }],
    });

    const result = await volumetriaHeatmap({
      connectionId: CONN_ID,
      accountId: 1,
      filters: {
        period: { start: PERIOD_START, end: PERIOD_END },
        inboxIds: [9, 10],
      },
    });

    expect(readFactsHourly).not.toHaveBeenCalled();
    expect(queryNexusChat).toHaveBeenCalledTimes(1);
    const call = (queryNexusChat as jest.Mock).mock.calls[0];
    expect(call[0]).toBe(CONN_ID);
    expect(result.data).toEqual([{ dow: 1, hour: 9, total: 12 }]);
  });

  it("fallback para Nexus Chat quando teamIds está setado", async () => {
    (queryNexusChat as jest.Mock).mockResolvedValue({ rows: [] });

    await volumetriaHeatmap({
      connectionId: CONN_ID,
      accountId: 1,
      filters: {
        period: { start: PERIOD_START, end: PERIOD_END },
        teamIds: [10],
      },
    });

    expect(readFactsHourly).not.toHaveBeenCalled();
    expect(queryNexusChat).toHaveBeenCalledTimes(1);
    expect((queryNexusChat as jest.Mock).mock.calls[0][0]).toBe(CONN_ID);
  });
});
