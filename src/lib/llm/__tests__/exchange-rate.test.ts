jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

import { pgPool } from "@/lib/pg-pool";
import {
  getUsdBrlRate,
  __resetUsdBrlCache,
  FALLBACK_COMMERCIAL_RATE,
  DEFAULT_CARD_SPREAD,
} from "../exchange-rate";

const q = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

const realFetch = global.fetch;

function mockSettings(state: {
  cache?: { commercial: number; fetchedAt: string } | null;
  spread?: number | null;
}): void {
  q.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (typeof sql === "string" && sql.includes("FROM app_settings")) {
      const key = (params?.[0] ?? "") as string;
      if (key === "llm.usd_brl.rate_cache") {
        return {
          rows: state.cache ? [{ value: state.cache }] : [],
          rowCount: state.cache ? 1 : 0,
        } as never;
      }
      if (key === "llm.usd_brl.card_spread") {
        return {
          rows: state.spread != null ? [{ value: state.spread }] : [],
          rowCount: state.spread != null ? 1 : 0,
        } as never;
      }
    }
    if (typeof sql === "string" && sql.includes("INTO app_settings")) {
      return { rows: [], rowCount: 1 } as never;
    }
    return { rows: [], rowCount: 0 } as never;
  });
}

beforeEach(() => {
  __resetUsdBrlCache();
  q.mockReset();
  global.fetch = jest.fn() as unknown as typeof global.fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

describe("getUsdBrlRate", () => {
  it("usa cache quando válido (<4h) e não chama fetch", async () => {
    const now = new Date();
    const fresh = new Date(now.getTime() - 60 * 60 * 1000); // 1h atrás
    mockSettings({
      cache: { commercial: 5.1, fetchedAt: fresh.toISOString() },
      spread: 1.1,
    });
    const r = await getUsdBrlRate();
    expect(r.source).toBe("cache");
    expect(r.rate).toBeCloseTo(5.1 * 1.1, 4);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(0);
  });

  it("faz fetch quando cache expirado e atualiza", async () => {
    const old = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5h atrás
    mockSettings({
      cache: { commercial: 5.0, fetchedAt: old.toISOString() },
      spread: 1.1,
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ USDBRL: { bid: "5.20" } }),
    });

    const r = await getUsdBrlRate();
    expect(r.source).toBe("live");
    expect(r.rate).toBeCloseTo(5.2 * 1.1, 4);
  });

  it("fetch falha e cache existe (mesmo expirado): usa cache antigo", async () => {
    const old = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockSettings({
      cache: { commercial: 4.95, fetchedAt: old.toISOString() },
      spread: 1.1,
    });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network"));

    const r = await getUsdBrlRate();
    expect(r.source).toBe("cache");
    expect(r.rate).toBeCloseTo(4.95 * 1.1, 4);
  });

  it("fetch falha e sem cache: usa fallback hardcoded", async () => {
    mockSettings({ cache: null, spread: 1.1 });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network"));

    const r = await getUsdBrlRate();
    expect(r.source).toBe("fallback");
    expect(r.rate).toBeCloseTo(FALLBACK_COMMERCIAL_RATE * 1.1, 4);
  });

  it("clamping de spread fora do range [1.00, 1.30]", async () => {
    mockSettings({ cache: null, spread: 99 }); // fora
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ USDBRL: { bid: "5.00" } }),
    });
    const r = await getUsdBrlRate();
    expect(r.rate).toBeCloseTo(5.0 * 1.3, 4); // clamp em 1.30
  });

  it("default spread 1.10 quando setting ausente", async () => {
    mockSettings({ cache: null, spread: null });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ USDBRL: { bid: "5.00" } }),
    });
    const r = await getUsdBrlRate();
    expect(DEFAULT_CARD_SPREAD).toBe(1.1);
    expect(r.rate).toBeCloseTo(5.0 * 1.1, 4);
  });

  it("memoíza em memória dentro de 4h após primeira chamada", async () => {
    mockSettings({ cache: null, spread: 1.1 });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ USDBRL: { bid: "5.30" } }),
    });
    const a = await getUsdBrlRate();
    const b = await getUsdBrlRate();
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
    expect(b.rate).toBe(a.rate);
  });
});
