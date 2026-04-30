import { getDashboardPeriod } from "@/lib/dashboard-period";

describe("getDashboardPeriod", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-30T17:30:00Z")); // 14:30 BRT (quinta)
  });
  afterAll(() => jest.useRealTimers());

  const tz = "America/Sao_Paulo";

  it("hoje: start=00:00 BRT, end=23:59:59.999 BRT do dia atual", () => {
    const { current } = getDashboardPeriod({ period: "hoje", mode: "current", weekStartsOn: 1, tz });
    expect(current.start.toISOString()).toBe("2026-04-30T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-01T02:59:59.999Z");
  });

  it("hoje: prev = ontem inteiro", () => {
    const { prev } = getDashboardPeriod({ period: "hoje", mode: "current", weekStartsOn: 1, tz });
    expect(prev.start.toISOString()).toBe("2026-04-29T03:00:00.000Z");
    expect(prev.end.toISOString()).toBe("2026-04-30T02:59:59.999Z");
  });

  it("semana current weekStartsOn=1: segunda → fim do dia atual (quinta)", () => {
    const { current } = getDashboardPeriod({ period: "semana", mode: "current", weekStartsOn: 1, tz });
    expect(current.start.toISOString()).toBe("2026-04-27T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-01T02:59:59.999Z");
  });

  it("semana current weekStartsOn=0 (domingo)", () => {
    const { current } = getDashboardPeriod({ period: "semana", mode: "current", weekStartsOn: 0, tz });
    expect(current.start.toISOString()).toBe("2026-04-26T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-01T02:59:59.999Z");
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

  it("mes current: dia 1 → fim do dia atual", () => {
    const { current } = getDashboardPeriod({ period: "mes", mode: "current", weekStartsOn: 1, tz });
    expect(current.start.toISOString()).toBe("2026-04-01T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-01T02:59:59.999Z");
  });

  it("mes current: prev mesma janela de tamanho", () => {
    const { current, prev } = getDashboardPeriod({ period: "mes", mode: "current", weekStartsOn: 1, tz });
    expect(prev.end.getTime() - prev.start.getTime()).toBe(current.end.getTime() - current.start.getTime());
  });

  it("mes rolling: now-30d → now", () => {
    const { current } = getDashboardPeriod({ period: "mes", mode: "rolling", weekStartsOn: 1, tz });
    const expectedStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(current.start.toISOString()).toBe(expectedStart.toISOString());
  });
});
