import { getDashboardPeriod } from "@/lib/dashboard-period";

describe("getDashboardPeriod", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-30T17:30:00Z")); // 14:30 BRT (quinta)
  });
  afterAll(() => jest.useRealTimers());

  const tz = "America/Sao_Paulo";

  it("dia: start=00:00 BRT, end=23:59:59.999 BRT do dia atual", () => {
    const { current } = getDashboardPeriod({ period: "dia", mode: "current", weekStartsOn: 1, tz });
    expect(current.start.toISOString()).toBe("2026-04-30T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-01T02:59:59.999Z");
  });

  it("dia: prev = ontem inteiro", () => {
    const { prev } = getDashboardPeriod({ period: "dia", mode: "current", weekStartsOn: 1, tz });
    expect(prev.start.toISOString()).toBe("2026-04-29T03:00:00.000Z");
    expect(prev.end.toISOString()).toBe("2026-04-30T02:59:59.999Z");
  });

  it("dia: aceita referenceDate (ontem)", () => {
    const ref = new Date("2026-04-29T17:30:00Z"); // 14:30 BRT do dia 29
    const { current } = getDashboardPeriod({
      period: "dia",
      mode: "current",
      weekStartsOn: 1,
      tz,
      referenceDate: ref,
    });
    expect(current.start.toISOString()).toBe("2026-04-29T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-04-30T02:59:59.999Z");
  });

  it("semana current weekStartsOn=1: cobre seg→dom completo (mesmo dias futuros)", () => {
    const { current } = getDashboardPeriod({ period: "semana", mode: "current", weekStartsOn: 1, tz });
    // segunda 27/04 00:00 BRT até domingo 03/05 23:59 BRT
    expect(current.start.toISOString()).toBe("2026-04-27T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-04T02:59:59.999Z");
  });

  it("semana current weekStartsOn=0: domingo→sábado", () => {
    const { current } = getDashboardPeriod({ period: "semana", mode: "current", weekStartsOn: 0, tz });
    // domingo 26/04 00:00 BRT até sábado 02/05 23:59 BRT
    expect(current.start.toISOString()).toBe("2026-04-26T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-03T02:59:59.999Z");
  });

  it("semana current: prev tem mesmo tamanho da janela atual", () => {
    const { current, prev } = getDashboardPeriod({ period: "semana", mode: "current", weekStartsOn: 1, tz });
    const span = current.end.getTime() - current.start.getTime();
    const prevSpan = prev.end.getTime() - prev.start.getTime();
    expect(prevSpan).toBe(span);
    expect(prev.end.getTime()).toBe(current.start.getTime() - 1);
  });

  it("semana rolling: now-7d → now", () => {
    const { current } = getDashboardPeriod({ period: "semana", mode: "rolling", weekStartsOn: 1, tz });
    const expectedStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(current.start.toISOString()).toBe(expectedStart.toISOString());
  });

  it("mes current: dia 1 → último dia do mês (cobre dias futuros)", () => {
    const { current } = getDashboardPeriod({ period: "mes", mode: "current", weekStartsOn: 1, tz });
    // 01/04 00:00 BRT até 30/04 23:59 BRT (abril tem 30 dias)
    expect(current.start.toISOString()).toBe("2026-04-01T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-01T02:59:59.999Z");
  });

  it("mes current: aceita referenceDate (mês passado)", () => {
    const ref = new Date("2026-03-15T17:30:00Z"); // meados de março
    const { current } = getDashboardPeriod({
      period: "mes",
      mode: "current",
      weekStartsOn: 1,
      tz,
      referenceDate: ref,
    });
    // 01/03 00:00 BRT até 31/03 23:59 BRT
    expect(current.start.toISOString()).toBe("2026-03-01T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-04-01T02:59:59.999Z");
  });

  it("mes current: prev mesma janela de tamanho (aproximada)", () => {
    const { current, prev } = getDashboardPeriod({ period: "mes", mode: "current", weekStartsOn: 1, tz });
    expect(prev.end.getTime() - prev.start.getTime()).toBe(current.end.getTime() - current.start.getTime());
  });

  it("mes rolling: now-30d → now", () => {
    const { current } = getDashboardPeriod({ period: "mes", mode: "rolling", weekStartsOn: 1, tz });
    const expectedStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(current.start.toISOString()).toBe(expectedStart.toISOString());
  });
});
