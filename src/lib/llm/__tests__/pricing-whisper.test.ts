import { calculateCost, MODEL_PRICING } from "@/lib/llm/pricing";

describe("calculateCost — whisper-1 (per-minute pricing)", () => {
  it("expõe entrada whisper-1 com perMinuteUsd=0.006 em MODEL_PRICING", () => {
    const pricing = MODEL_PRICING["whisper-1"];
    expect(pricing).toBeDefined();
    expect(pricing.inputPerMillion).toBe(0);
    expect(pricing.outputPerMillion).toBe(0);
    expect(pricing.perMinuteUsd).toBe(0.006);
  });

  it("calcula $0.006 para 1 minuto (60_000ms) de whisper-1", () => {
    expect(calculateCost("whisper-1", 0, 0, { durationMs: 60_000 })).toBeCloseTo(
      0.006,
      6,
    );
  });

  it("calcula $0.003 para 30 segundos (30_000ms) de whisper-1", () => {
    expect(calculateCost("whisper-1", 0, 0, { durationMs: 30_000 })).toBeCloseTo(
      0.003,
      6,
    );
  });

  it("retorna 0 para whisper-1 quando durationMs ausente ou zero", () => {
    expect(calculateCost("whisper-1", 0, 0)).toBe(0);
    expect(calculateCost("whisper-1", 0, 0, {})).toBe(0);
    expect(calculateCost("whisper-1", 0, 0, { durationMs: 0 })).toBe(0);
  });

  it("não regride modelos regulares: gpt-4.1-mini 1M in + 1M out = 2.0", () => {
    // 0.4 + 1.6 = 2.0
    expect(calculateCost("gpt-4.1-mini", 1_000_000, 1_000_000)).toBeCloseTo(
      2.0,
      6,
    );
  });

  it("não regride modelos regulares quando extras é passado por engano", () => {
    expect(
      calculateCost("gpt-4.1-mini", 1_000_000, 1_000_000, { durationMs: 60_000 }),
    ).toBeCloseTo(2.0, 6);
  });

  it("não regride modelo desconhecido (continua retornando 0)", () => {
    expect(calculateCost("modelo-fake-xyz", 1000, 1000)).toBe(0);
    expect(
      calculateCost("modelo-fake-xyz", 1000, 1000, { durationMs: 60_000 }),
    ).toBe(0);
  });
});
