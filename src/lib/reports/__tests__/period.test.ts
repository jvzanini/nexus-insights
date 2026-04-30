import {
  getPeriod,
  isPeriodKey,
  PERIOD_OPTIONS,
  VALID_PERIODS,
} from "@/lib/reports/period";

describe("isPeriodKey", () => {
  it("aceita as 5 chaves canônicas", () => {
    expect(isPeriodKey("hoje")).toBe(true);
    expect(isPeriodKey("semana_atual")).toBe(true);
    expect(isPeriodKey("mes_atual")).toBe(true);
    expect(isPeriodKey("todos")).toBe(true);
    expect(isPeriodKey("custom")).toBe(true);
  });

  it("rejeita chaves legadas e inválidas", () => {
    expect(isPeriodKey("ontem")).toBe(false);
    expect(isPeriodKey("7d")).toBe(false);
    expect(isPeriodKey("30d")).toBe(false);
    expect(isPeriodKey("mes_anterior")).toBe(false);
    expect(isPeriodKey("")).toBe(false);
    expect(isPeriodKey("amanha")).toBe(false);
    expect(isPeriodKey(null)).toBe(false);
    expect(isPeriodKey(undefined)).toBe(false);
    expect(isPeriodKey(123)).toBe(false);
    expect(isPeriodKey({})).toBe(false);
  });
});

describe("PERIOD_OPTIONS", () => {
  it("expõe exatamente as 5 opções canônicas (inclui Todos)", () => {
    expect(PERIOD_OPTIONS).toHaveLength(5);
    expect(PERIOD_OPTIONS.map((p) => p.key)).toEqual([
      "hoje",
      "semana_atual",
      "mes_atual",
      "todos",
      "custom",
    ]);
  });

  it("VALID_PERIODS contém as 5 canônicas", () => {
    expect(VALID_PERIODS.size).toBe(5);
    for (const opt of PERIOD_OPTIONS) {
      expect(VALID_PERIODS.has(opt.key)).toBe(true);
    }
  });
});

describe("getPeriod (canônicas)", () => {
  // 2026-04-29 (quarta-feira) — usado como referência
  const FIXED_NOW = new Date("2026-04-29T15:34:56.789Z"); // 12:34 BRT

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("hoje devolve range coerente (start < end, mesmo dia BRT)", () => {
    const { start, end } = getPeriod("hoje");
    expect(start.getTime()).toBeLessThan(end.getTime());
    // Range total <= 24h
    const diffMs = end.getTime() - start.getTime();
    expect(diffMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("semana_atual devolve range de até 7 dias", () => {
    const { start, end } = getPeriod("semana_atual");
    expect(start.getTime()).toBeLessThan(end.getTime());
    const diffMs = end.getTime() - start.getTime();
    expect(diffMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  it("mes_atual devolve range cobrindo no máximo 31 dias", () => {
    const { start, end } = getPeriod("mes_atual");
    expect(start.getTime()).toBeLessThan(end.getTime());
    const diffMs = end.getTime() - start.getTime();
    expect(diffMs).toBeLessThanOrEqual(31 * 24 * 60 * 60 * 1000);
  });

  it("todos devolve range desde o epoch até agora", () => {
    const { start, end } = getPeriod("todos");
    expect(start.getTime()).toBe(0);
    expect(end.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("getPeriod (chaves legadas — fallback Date local)", () => {
  const FIXED_NOW = new Date(2026, 3, 29, 12, 34, 56, 789); // 29 abril, hora local

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("ontem retorna 00:00 ontem e 00:00 hoje", () => {
    const { start, end } = getPeriod("ontem" as never);
    expect(start.getDate()).toBe(28);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(29);
    expect(end.getHours()).toBe(0);
  });

  it("7d retorna intervalo de 7 dias", () => {
    const { start, end } = getPeriod("7d" as never);
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(7);
  });

  it("30d retorna intervalo de 30 dias", () => {
    const { start, end } = getPeriod("30d" as never);
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(30);
  });

  it("mes_anterior retorna primeiro dia do mês passado até primeiro dia do mês atual", () => {
    const { start, end } = getPeriod("mes_anterior" as never);
    expect(start.getMonth()).toBe(2); // março
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(3); // abril
    expect(end.getDate()).toBe(1);
  });
});
