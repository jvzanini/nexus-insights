import { getDashboardPeriod } from "@/lib/dashboard-period";

// v0.42 (Task 11): a partir desta versão `mode: 'rolling'` e `weekStartsOn` !== 1
// são IGNORADOS — semana é sempre segunda → próxima segunda (canônico).
// O parâmetro continua na assinatura para compat com callers legados.

describe("getDashboardPeriod", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-30T17:30:00Z")); // 14:30 BRT (quinta)
  });
  afterAll(() => jest.useRealTimers());

  const tz = "America/Sao_Paulo";

  it("dia: start=00:00 BRT, end=próximo 00:00 BRT do dia atual (end-exclusive)", () => {
    const { current } = getDashboardPeriod({
      period: "dia",
      mode: "current",
      weekStartsOn: 1,
      tz,
    });
    expect(current.start.toISOString()).toBe("2026-04-30T03:00:00.000Z");
    // end-exclusive: próximo dia 00:00 BRT
    expect(current.end.toISOString()).toBe("2026-05-01T03:00:00.000Z");
  });

  it("dia: prev = ontem inteiro (24h imediatamente antes do start)", () => {
    const { current, prev } = getDashboardPeriod({
      period: "dia",
      mode: "current",
      weekStartsOn: 1,
      tz,
    });
    expect(prev.start.toISOString()).toBe("2026-04-29T03:00:00.000Z");
    expect(prev.end.toISOString()).toBe("2026-04-30T03:00:00.000Z");
    expect(prev.end.getTime()).toBe(current.start.getTime());
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
    expect(current.end.toISOString()).toBe("2026-04-30T03:00:00.000Z");
  });

  it("semana current weekStartsOn=1: cobre seg→próxima seg (end-exclusive)", () => {
    const { current } = getDashboardPeriod({
      period: "semana",
      mode: "current",
      weekStartsOn: 1,
      tz,
    });
    // segunda 27/04 00:00 BRT até segunda 04/05 00:00 BRT (end-exclusive)
    expect(current.start.toISOString()).toBe("2026-04-27T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-04T03:00:00.000Z");
  });

  it("semana: weekStartsOn=0 (domingo) é IGNORADO — sempre segunda canônico", () => {
    const { current } = getDashboardPeriod({
      period: "semana",
      mode: "current",
      weekStartsOn: 0, // ← ignorado pelo helper canônico
      tz,
    });
    // Mesmo passando 0, retorna segunda → segunda
    expect(current.start.toISOString()).toBe("2026-04-27T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-04T03:00:00.000Z");
  });

  it("semana current: prev tem mesmo tamanho da janela atual", () => {
    const { current, prev } = getDashboardPeriod({
      period: "semana",
      mode: "current",
      weekStartsOn: 1,
      tz,
    });
    const span = current.end.getTime() - current.start.getTime();
    const prevSpan = prev.end.getTime() - prev.start.getTime();
    expect(prevSpan).toBe(span);
    expect(prev.end.getTime()).toBe(current.start.getTime());
  });

  it("semana mode='rolling' é IGNORADO — sempre 'current' (canônico seg→seg)", () => {
    const { current } = getDashboardPeriod({
      period: "semana",
      mode: "rolling", // ← ignorado
      weekStartsOn: 1,
      tz,
    });
    // Mesmo resultado da semana ISO atual:
    expect(current.start.toISOString()).toBe("2026-04-27T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-04T03:00:00.000Z");
  });

  it("mes current: dia 1 → dia 1 do mês seguinte (end-exclusive)", () => {
    const { current } = getDashboardPeriod({
      period: "mes",
      mode: "current",
      weekStartsOn: 1,
      tz,
    });
    // 01/04 00:00 BRT até 01/05 00:00 BRT
    expect(current.start.toISOString()).toBe("2026-04-01T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-01T03:00:00.000Z");
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
    // 01/03 00:00 BRT até 01/04 00:00 BRT
    expect(current.start.toISOString()).toBe("2026-03-01T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-04-01T03:00:00.000Z");
  });

  it("mes current: prev mesma janela de tamanho", () => {
    const { current, prev } = getDashboardPeriod({
      period: "mes",
      mode: "current",
      weekStartsOn: 1,
      tz,
    });
    expect(prev.end.getTime() - prev.start.getTime()).toBe(
      current.end.getTime() - current.start.getTime(),
    );
    expect(prev.end.getTime()).toBe(current.start.getTime());
  });

  it("mes mode='rolling' é IGNORADO — sempre mês civil canônico", () => {
    const { current } = getDashboardPeriod({
      period: "mes",
      mode: "rolling", // ← ignorado
      weekStartsOn: 1,
      tz,
    });
    expect(current.start.toISOString()).toBe("2026-04-01T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-01T03:00:00.000Z");
  });
});
