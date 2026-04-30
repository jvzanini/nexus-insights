jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock("../../ensure-tables", () => ({
  ensureLlmTables: jest.fn(async () => {}),
}));

jest.mock("../../exchange-rate", () => ({
  getUsdBrlRate: jest.fn(),
}));

import { pgPool } from "@/lib/pg-pool";
import { getUsdBrlRate } from "../../exchange-rate";
import { logUsage } from "../usage-logger";

const q = pgPool.query as jest.MockedFunction<typeof pgPool.query>;
const rate = getUsdBrlRate as jest.MockedFunction<typeof getUsdBrlRate>;

beforeEach(() => {
  q.mockReset();
  rate.mockReset();
});

describe("logUsage", () => {
  it("registra cost_brl e usd_to_brl_rate quando rate fetch funciona", async () => {
    rate.mockResolvedValueOnce({
      rate: 5.61,
      commercial: 5.1,
      spread: 1.1,
      source: "live",
      fetchedAt: new Date(),
    });
    q.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await logUsage({
      provider: "openai",
      model: "gpt-4o",
      tokensInput: 100,
      tokensOutput: 50,
      costUsd: 0.001,
      promptChars: 200,
      responseChars: 100,
    });

    const params = q.mock.calls[0][1] as unknown[];
    // Layout: [provider, model, tokens_in, tokens_out, cost_usd, cost_brl, usd_rate, prompt, resp, user, dur, err]
    expect(params[5]).toBeCloseTo(0.001 * 5.61, 6);
    expect(params[6]).toBeCloseTo(5.61, 4);
  });

  it("falha de rate não bloqueia INSERT (NULL nos campos novos)", async () => {
    rate.mockRejectedValueOnce(new Error("network"));
    q.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await logUsage({
      provider: "openai",
      model: "gpt-4o",
      tokensInput: 1,
      tokensOutput: 1,
      costUsd: 0.0,
      promptChars: 0,
      responseChars: 0,
    });

    const params = q.mock.calls[0][1] as unknown[];
    expect(params[5]).toBeNull();
    expect(params[6]).toBeNull();
  });

  it("erro no INSERT é silencioso (não propaga)", async () => {
    rate.mockResolvedValueOnce({
      rate: 5.5,
      commercial: 5.0,
      spread: 1.1,
      source: "fallback",
      fetchedAt: new Date(),
    });
    q.mockRejectedValueOnce(new Error("DB fora do ar") as never);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      logUsage({
        provider: "openai",
        model: "gpt-4o",
        tokensInput: 1,
        tokensOutput: 1,
        costUsd: 0,
        promptChars: 0,
        responseChars: 0,
      }),
    ).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
