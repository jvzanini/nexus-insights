import {
  MODEL_PRICING,
  PROVIDER_LABELS,
  PROVIDER_MODELS,
  calculateCost,
} from "@/lib/llm/pricing";

describe("calculateCost", () => {
  it("calcula custo USD correto para gpt-4o-mini (0.15 in / 0.60 out)", () => {
    // 1.000.000 input * 0.15 / 1M = 0.15
    // 1.000.000 output * 0.60 / 1M = 0.60
    // total = 0.75
    expect(calculateCost("gpt-4o-mini", 1_000_000, 1_000_000)).toBeCloseTo(
      0.75,
      6,
    );
  });

  it("calcula custo proporcional a tokens menores", () => {
    // 1000 input * 2.50 / 1M = 0.0025
    // 500 output * 10.00 / 1M = 0.005
    // total = 0.0075
    expect(calculateCost("gpt-4o", 1000, 500)).toBeCloseTo(0.0075, 6);
  });

  it("retorna 0 para modelos desconhecidos", () => {
    expect(calculateCost("modelo-fake", 1000, 1000)).toBe(0);
  });

  it("retorna 0 quando tokens são 0", () => {
    expect(calculateCost("gpt-4o", 0, 0)).toBe(0);
  });

  it("arredonda para 6 casas decimais para evitar drift de float", () => {
    const cost = calculateCost("claude-3-5-sonnet-20241022", 1, 1);
    expect(cost).toEqual(Number(cost.toFixed(6)));
  });
});

describe("PROVIDER_MODELS", () => {
  it("todos os modelos listados existem em MODEL_PRICING", () => {
    for (const provider of Object.keys(PROVIDER_MODELS) as Array<
      keyof typeof PROVIDER_MODELS
    >) {
      for (const model of PROVIDER_MODELS[provider]) {
        expect(MODEL_PRICING[model]).toBeDefined();
      }
    }
  });

  it("cada provider tem ao menos um modelo", () => {
    for (const provider of Object.keys(PROVIDER_MODELS) as Array<
      keyof typeof PROVIDER_MODELS
    >) {
      expect(PROVIDER_MODELS[provider].length).toBeGreaterThan(0);
    }
  });
});

describe("PROVIDER_LABELS", () => {
  it("define label legível para todos os providers", () => {
    for (const provider of Object.keys(PROVIDER_MODELS) as Array<
      keyof typeof PROVIDER_MODELS
    >) {
      expect(PROVIDER_LABELS[provider]).toBeTruthy();
      expect(typeof PROVIDER_LABELS[provider]).toBe("string");
    }
  });
});
