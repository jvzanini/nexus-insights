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

  it("spread sempre 1.10 (hardcoded v0.31), ignorando qualquer valor DB", async () => {
    mockSettings({ cache: null, spread: 1.5 });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ USDBRL: { bid: "5.00" } }),
    });
    const r = await getUsdBrlRate();
    expect(r.spread).toBe(1.1);
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

  describe("getUsdBrlRate — spread fixo (v0.31)", () => {
    it("usa spread=1.10 hardcoded ignorando SPREAD_KEY do DB (cenário do bug user)", async () => {
      __resetUsdBrlCache();
      // Mock DB com spread setado pra 1.40 (cenário do bug onde cost_brl ficou >R$6/USD)
      mockSettings({
        cache: { commercial: 5.0, fetchedAt: new Date().toISOString() },
        spread: 1.4, // User setou em 1.40+ no v0.20+ → bug reportado
      });
      const result = await getUsdBrlRate();
      expect(result.spread).toBe(1.1); // Hardcoded, não 1.4
      expect(result.rate).toBeCloseTo(5.5); // 5.0 × 1.10 — NÃO 5.0 × 1.40
    });
  });
});

describe("setCardSpread — no-op (v0.31)", () => {
  it("vira no-op + console.warn; NÃO persiste no DB", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();
    q.mockClear();
    const { setCardSpread } = await import("../exchange-rate");
    await setCardSpread(1.5);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/setCardSpread.*no-op/i),
    );
    expect(q).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
