import { getPeriod, isPeriodKey } from "@/lib/reports/period";

describe("isPeriodKey", () => {
  it("aceita apenas valores válidos", () => {
    expect(isPeriodKey("hoje")).toBe(true);
    expect(isPeriodKey("ontem")).toBe(true);
    expect(isPeriodKey("7d")).toBe(true);
    expect(isPeriodKey("30d")).toBe(true);
    expect(isPeriodKey("mes_atual")).toBe(true);
    expect(isPeriodKey("mes_anterior")).toBe(true);
  });

  it("rejeita inválidos / não-strings", () => {
    expect(isPeriodKey("")).toBe(false);
    expect(isPeriodKey("amanha")).toBe(false);
    expect(isPeriodKey(null)).toBe(false);
    expect(isPeriodKey(undefined)).toBe(false);
    expect(isPeriodKey(123)).toBe(false);
    expect(isPeriodKey({})).toBe(false);
  });
});

describe("getPeriod", () => {
  // Fixa a data atual em 2026-04-29 12:34:56 (terça-feira)
  const FIXED_NOW = new Date(2026, 3, 29, 12, 34, 56, 789);

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("hoje retorna 00:00 do dia atual e 00:00 do dia seguinte", () => {
    const { start, end } = getPeriod("hoje");
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(3);
    expect(start.getDate()).toBe(29);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(3);
    expect(end.getDate()).toBe(30);
    expect(end.getHours()).toBe(0);
  });

  it("ontem retorna 00:00 ontem e 00:00 hoje", () => {
    const { start, end } = getPeriod("ontem");
    expect(start.getDate()).toBe(28);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(29);
    expect(end.getHours()).toBe(0);
  });

  it("7d retorna intervalo cobrindo últimos 7 dias até amanhã 00:00", () => {
    const { start, end } = getPeriod("7d");
    // start = hoje - 6 dias = 23/04
    expect(start.getDate()).toBe(23);
    expect(start.getMonth()).toBe(3);
    expect(start.getHours()).toBe(0);
    // end = amanhã 00:00
    expect(end.getDate()).toBe(30);
    expect(end.getHours()).toBe(0);
    // diferença total = 7 dias
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(7);
  });

  it("30d retorna intervalo de 30 dias", () => {
    const { start, end } = getPeriod("30d");
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(30);
  });

  it("mes_atual retorna primeiro dia do mês até primeiro dia do próximo mês", () => {
    const { start, end } = getPeriod("mes_atual");
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(3); // abril
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(4); // maio
    expect(end.getDate()).toBe(1);
  });

  it("mes_anterior retorna primeiro dia do mês passado até primeiro dia do mês atual", () => {
    const { start, end } = getPeriod("mes_anterior");
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(2); // março
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(3); // abril
    expect(end.getDate()).toBe(1);
  });
});
