/**
 * Tests for volumetria-dow migration to facts.
 *
 * Hybrid: usa readFactsDaily quando não há filtros por inbox/team;
 * caso contrário, fallback para a query Chatwoot.
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
  readFactsDaily: jest.fn(),
}));
jest.mock("../../pool", () => ({
  getChatwootPool: jest.fn(),
}));

import { volumetriaDow } from "../volumetria-dow";

const { readFactsDaily } = jest.requireMock("../../facts");
const { getChatwootPool } = jest.requireMock("../../pool");

const PERIOD_START = new Date("2026-04-13T00:00:00Z");
const PERIOD_END = new Date("2026-04-19T23:59:59Z");

describe("volumetriaDow (facts-first)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("agrega DOW em JS a partir de readFactsDaily", async () => {
    // 2026-04-13 = segunda (DOW=1)
    // 2026-04-14 = terça   (DOW=2)
    // 2026-04-19 = domingo (DOW=0)
    (readFactsDaily as jest.Mock).mockResolvedValue([
      { bucketDate: "2026-04-13", accountId: 1, received: 10, resolved: 0, openAtEod: 0, pendingAtEod: 0, messagesIn: 0, messagesOut: 0, uniqueContacts: 0, frtP50Seconds: null, frtP90Seconds: null, rtP50Seconds: null },
      { bucketDate: "2026-04-14", accountId: 1, received: 5,  resolved: 0, openAtEod: 0, pendingAtEod: 0, messagesIn: 0, messagesOut: 0, uniqueContacts: 0, frtP50Seconds: null, frtP90Seconds: null, rtP50Seconds: null },
      { bucketDate: "2026-04-19", accountId: 1, received: 7,  resolved: 0, openAtEod: 0, pendingAtEod: 0, messagesIn: 0, messagesOut: 0, uniqueContacts: 0, frtP50Seconds: null, frtP90Seconds: null, rtP50Seconds: null },
      { bucketDate: "2026-04-20", accountId: 1, received: 3,  resolved: 0, openAtEod: 0, pendingAtEod: 0, messagesIn: 0, messagesOut: 0, uniqueContacts: 0, frtP50Seconds: null, frtP90Seconds: null, rtP50Seconds: null },
    ]);

    const result = await volumetriaDow({
      accountId: 1,
      filters: {
        period: { start: PERIOD_START, end: PERIOD_END },
        excludeMatrixIA: true,
      },
    });

    expect(readFactsDaily).toHaveBeenCalledWith({
      accountId: 1,
      start: PERIOD_START,
      end: PERIOD_END,
      excludeMatrixIA: true,
    });
    expect(getChatwootPool).not.toHaveBeenCalled();

    // 0..6 sempre presentes; segunda(1)=10+3=13, terça(2)=5, domingo(0)=7.
    expect(result.data).toEqual([
      { dow: 0, total: 7 },
      { dow: 1, total: 13 },
      { dow: 2, total: 5 },
      { dow: 3, total: 0 },
      { dow: 4, total: 0 },
      { dow: 5, total: 0 },
      { dow: 6, total: 0 },
    ]);
  });

  it("fallback para Chatwoot quando inboxIds está setado", async () => {
    const queryMock = jest.fn().mockResolvedValue({
      rows: [{ dow: "1", total: "20" }, { dow: "5", total: "8" }],
    });
    (getChatwootPool as jest.Mock).mockReturnValue({ query: queryMock });

    const result = await volumetriaDow({
      accountId: 1,
      filters: {
        period: { start: PERIOD_START, end: PERIOD_END },
        inboxIds: [9],
      },
    });

    expect(readFactsDaily).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalled();
    expect(result.data).toEqual([
      { dow: 0, total: 0 },
      { dow: 1, total: 20 },
      { dow: 2, total: 0 },
      { dow: 3, total: 0 },
      { dow: 4, total: 0 },
      { dow: 5, total: 8 },
      { dow: 6, total: 0 },
    ]);
  });

  it("fallback para Chatwoot quando teamIds está setado", async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [] });
    (getChatwootPool as jest.Mock).mockReturnValue({ query: queryMock });

    await volumetriaDow({
      accountId: 1,
      filters: {
        period: { start: PERIOD_START, end: PERIOD_END },
        teamIds: [99],
      },
    });

    expect(readFactsDaily).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalled();
  });
});
