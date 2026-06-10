/**
 * withChatwootResilience — serve o último dado bom (stale) quando o fetch ao
 * Chatwoot falha (ex.: "too many connections for role chatwoot_leitura").
 * O dado bom é gravado por withCache sob `${key}:last` (TTL longo), separado da
 * cópia fresca de curta duração — assim a tela NUNCA fica sem dado por um pico.
 */

const store = new Map<string, string>();
const mockGet = jest.fn(async (k: string) => store.get(k) ?? null);
const mockSet = jest.fn(async (k: string, v: string) => {
  store.set(k, v);
  return "OK";
});
const mockDel = jest.fn(async (k: string) => {
  store.delete(k);
  return 1;
});

jest.mock("@/lib/redis", () => ({
  redis: {
    get: (...a: [string]) => mockGet(...a),
    set: (...a: [string, string]) => mockSet(...a),
    del: (...a: [string]) => mockDel(...a),
  },
}));

import { withChatwootResilience } from "../resilience";

beforeEach(() => {
  store.clear();
  mockGet.mockClear();
  mockSet.mockClear();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

describe("withChatwootResilience", () => {
  it("retorna dado fresco quando o fetch tem sucesso", async () => {
    const r = await withChatwootResilience(async () => ({ n: 1 }), {
      fallbackKey: "k",
    });
    expect(r).toEqual({ data: { n: 1 }, stale: false });
  });

  it("serve o último dado bom (stale) quando o fetch falha e há `${key}:last`", async () => {
    store.set("k:last", JSON.stringify({ d: { n: 42 }, t: "2026-06-10" }));

    const r = await withChatwootResilience(
      async () => {
        throw new Error("too many connections for role \"chatwoot_leitura\"");
      },
      { fallbackKey: "k" },
    );

    expect(r.stale).toBe(true);
    expect(r.data).toEqual({ n: 42 });
    expect(r.error).toBe("chatwoot_unavailable");
  });

  it("relança quando o fetch falha e NÃO há último dado bom", async () => {
    await expect(
      withChatwootResilience(
        async () => {
          throw new Error("boom");
        },
        { fallbackKey: "k" },
      ),
    ).rejects.toThrow("boom");
  });

  it("relança quando o fetch falha e não há fallbackKey", async () => {
    await expect(
      withChatwootResilience(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
