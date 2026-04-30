/**
 * Testes para `isNexBubbleEnabled`.
 *
 * Estratégia: mockar `@/lib/pg-pool` (raw SQL) e `./get-active-config`
 * (default-condicional) — isolamos o módulo via `jest.isolateModules` para
 * resetar o cache em memória entre cenários.
 */

jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock("../get-active-config", () => ({
  getActiveLlmConfig: jest.fn(),
}));

import { pgPool } from "@/lib/pg-pool";

import { getActiveLlmConfig } from "../get-active-config";

const mockedQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;
const mockedGetActiveLlmConfig =
  getActiveLlmConfig as jest.MockedFunction<typeof getActiveLlmConfig>;

type Mod = typeof import("../get-nex-bubble-enabled");

function loadFresh(): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    mod = require("../get-nex-bubble-enabled") as Mod;
  });
  return mod;
}

beforeEach(() => {
  mockedQuery.mockReset();
  mockedGetActiveLlmConfig.mockReset();
});

describe("isNexBubbleEnabled", () => {
  it("retorna OFF (default) quando não há setting nem config LLM ativa", async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
    mockedGetActiveLlmConfig.mockResolvedValueOnce(null);

    const { isNexBubbleEnabled } = loadFresh();
    await expect(isNexBubbleEnabled()).resolves.toBe(false);
  });

  it("retorna ON (default) quando não há setting mas há config LLM ativa", async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
    mockedGetActiveLlmConfig.mockResolvedValueOnce({
      id: "abc",
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "sk-test",
    });

    const { isNexBubbleEnabled } = loadFresh();
    await expect(isNexBubbleEnabled()).resolves.toBe(true);
  });

  it("respeita setting explícito true (sobrescreve default)", async () => {
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: true }],
    } as never);
    // Setting tem precedência — getActiveLlmConfig não deve nem ser chamado.
    mockedGetActiveLlmConfig.mockResolvedValueOnce(null);

    const { isNexBubbleEnabled } = loadFresh();
    await expect(isNexBubbleEnabled()).resolves.toBe(true);
    expect(mockedGetActiveLlmConfig).not.toHaveBeenCalled();
  });

  it("respeita setting explícito false (sobrescreve default ON)", async () => {
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: false }],
    } as never);
    mockedGetActiveLlmConfig.mockResolvedValueOnce({
      id: "abc",
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "sk-test",
    });

    const { isNexBubbleEnabled } = loadFresh();
    await expect(isNexBubbleEnabled()).resolves.toBe(false);
    expect(mockedGetActiveLlmConfig).not.toHaveBeenCalled();
  });

  it("normaliza valor 'true'/'false' como string para boolean", async () => {
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: "true" }],
    } as never);

    const { isNexBubbleEnabled } = loadFresh();
    await expect(isNexBubbleEnabled()).resolves.toBe(true);
  });

  it("retorna false quando query lança (fail-safe)", async () => {
    mockedQuery.mockImplementationOnce(() => {
      throw new Error("db down");
    });
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const { isNexBubbleEnabled } = loadFresh();
    await expect(isNexBubbleEnabled()).resolves.toBe(false);

    errSpy.mockRestore();
  });

  it("usa cache em memória (TTL) — 2ª chamada não consulta DB", async () => {
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: true }],
    } as never);

    const { isNexBubbleEnabled } = loadFresh();
    await expect(isNexBubbleEnabled()).resolves.toBe(true);
    await expect(isNexBubbleEnabled()).resolves.toBe(true);

    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  it("invalidateNexBubbleEnabled limpa o cache (próxima chamada vai ao DB)", async () => {
    mockedQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ value: true }],
      } as never)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ value: false }],
      } as never);

    const { isNexBubbleEnabled, invalidateNexBubbleEnabled } = loadFresh();

    await expect(isNexBubbleEnabled()).resolves.toBe(true);
    invalidateNexBubbleEnabled();
    await expect(isNexBubbleEnabled()).resolves.toBe(false);

    expect(mockedQuery).toHaveBeenCalledTimes(2);
  });
});
