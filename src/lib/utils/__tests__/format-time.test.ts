import { formatDuration } from "@/lib/utils/format-time";

describe("formatDuration", () => {
  it("retorna '-' para zero/negativos/NaN/Infinity", () => {
    expect(formatDuration(0)).toBe("-");
    expect(formatDuration(-10)).toBe("-");
    expect(formatDuration(Number.NaN)).toBe("-");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("-");
  });

  it("formata segundos abaixo de 1 minuto", () => {
    expect(formatDuration(10)).toBe("10s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("arredonda segundos abaixo de 60", () => {
    expect(formatDuration(45.4)).toBe("45s");
    expect(formatDuration(45.6)).toBe("46s");
  });

  it("formata minutos quando < 1h", () => {
    expect(formatDuration(60)).toBe("1min");
    expect(formatDuration(300)).toBe("5min");
    expect(formatDuration(90)).toBe("2min");
  });

  it("formata horas exatas", () => {
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(7200)).toBe("2h");
  });

  it("formata horas + minutos", () => {
    expect(formatDuration(5400)).toBe("1h 30min");
    expect(formatDuration(3660)).toBe("1h 1min");
  });

  it("formata dias", () => {
    expect(formatDuration(86400)).toBe("1d");
    expect(formatDuration(172800)).toBe("2d");
    expect(formatDuration(90000)).toBe("1d");
  });
});
