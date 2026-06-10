/**
 * withCache — single-flight (deduplicação de requisições in-flight).
 *
 * Motivação: com polling de 60s e TTL de 30s, o cache do dashboard sempre
 * expira entre polls; sem single-flight, N requisições concorrentes que erram
 * o cache batem o banco (pool max:1) ao mesmo tempo → saturação → "erro ao
 * carregar". O single-flight garante que apenas 1 fetch bate o banco por chave;
 * os concorrentes aguardam o mesmo resultado.
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

import { withCache } from "../pull-through";

beforeEach(() => {
  store.clear();
  mockGet.mockClear();
  mockSet.mockClear();
  mockDel.mockClear();
});

describe("withCache — single-flight", () => {
  it("deduplica fetches concorrentes com cache miss (fetcher chamado 1x)", async () => {
    let calls = 0;
    const fetcher = jest.fn(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return { data: { n: calls }, stale: false };
    });

    const [a, b] = await Promise.all([
      withCache({ key: "k1", ttlSeconds: 30, fetcher }),
      withCache({ key: "k1", ttlSeconds: 30, fetcher }),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a.data).toEqual({ n: 1 });
    expect(b.data).toEqual({ n: 1 });
  });

  it("não chama o fetcher quando há cache hit", async () => {
    const fetcher = jest.fn(async () => ({ data: { n: 99 }, stale: false }));

    await withCache({ key: "k2", ttlSeconds: 30, fetcher });
    fetcher.mockClear();
    const r = await withCache({ key: "k2", ttlSeconds: 30, fetcher });

    expect(fetcher).not.toHaveBeenCalled();
    expect(r.cached).toBe(true);
    expect(r.data).toEqual({ n: 99 });
  });

  it("libera o in-flight após resolver (chamadas sequenciais com miss refazem o fetch)", async () => {
    // stale: true ⇒ não grava no cache ⇒ a 2ª chamada erra o cache de novo.
    // Se o in-flight não for liberado, ela reusaria a promise antiga (1x);
    // com liberação correta, o fetcher é chamado 2x.
    const fetcher = jest.fn(async () => ({ data: { n: 1 }, stale: true }));

    await withCache({ key: "k3", ttlSeconds: 30, fetcher });
    await withCache({ key: "k3", ttlSeconds: 30, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
