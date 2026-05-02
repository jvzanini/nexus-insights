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

  it("calcula custo correto para gpt-5-mini (0.25 in / 2.00 out)", () => {
    // gpt-5.1-mini não existe na OpenAI (validado em /api/docs/models/all
    // May/2026). gpt-5-mini é o ID real correspondente.
    // 1M in * 0.25 / 1M = 0.25
    // 1M out * 2.00 / 1M = 2.00
    // total = 2.25
    expect(calculateCost("gpt-5-mini", 1_000_000, 1_000_000)).toBeCloseTo(
      2.25,
      6,
    );
  });

  it("calcula custo correto para gpt-5 (1.25 in / 10.00 out)", () => {
    expect(calculateCost("gpt-5", 1_000_000, 1_000_000)).toBeCloseTo(11.25, 6);
  });

  it("calcula custo correto para claude-sonnet-4.7 (3.00 in / 15.00 out)", () => {
    expect(
      calculateCost("claude-sonnet-4-7-20250624", 1_000_000, 1_000_000),
    ).toBeCloseTo(18.0, 6);
  });

  it("calcula custo correto para gemini-2.5-flash (0.30 in / 2.50 out)", () => {
    expect(calculateCost("gemini-2.5-flash", 1_000_000, 1_000_000)).toBeCloseTo(
      2.8,
      6,
    );
  });

  it("calculateCost gpt-4o-mini-transcribe usa token-based ($3/M input + $5/M output)", () => {
    expect(
      calculateCost("gpt-4o-mini-transcribe", 1_000_000, 100_000, {}),
    ).toBeCloseTo(3.5, 4);
  });

  it("calculateCost gpt-4o-mini-transcribe ignora durationMs (token-based)", () => {
    // perMinuteUsd não definido → cálculo por tokens
    expect(
      calculateCost("gpt-4o-mini-transcribe", 0, 0, { durationMs: 60000 }),
    ).toBe(0);
  });

  it("whisper-1 mantém perMinuteUsd 0.006", () => {
    expect(calculateCost("whisper-1", 0, 0, { durationMs: 60000 })).toBeCloseTo(
      0.006,
      6,
    );
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
