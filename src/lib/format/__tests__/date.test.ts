import { formatXAxisDate, formatDuration } from "@/lib/format/date";

describe("formatXAxisDate", () => {
  it("retorna 30/ABR para 30 de abril", () => {
    expect(formatXAxisDate(new Date(2026, 3, 30))).toBe("30/ABR");
  });

  it("retorna 01/MAI para 01 de maio", () => {
    expect(formatXAxisDate(new Date(2026, 4, 1))).toBe("01/MAI");
  });
});

describe("formatDuration", () => {
  it("ms (< 1s)", () => {
    expect(formatDuration(200)).toBe("200 ms");
  });

  it("segundos arredondados (< 60s)", () => {
    expect(formatDuration(1500)).toBe("2 s");
  });

  it("min + s quando há resto de segundos", () => {
    expect(formatDuration(90000)).toBe("1 min 30 s");
  });

  it("min apenas quando não há resto", () => {
    expect(formatDuration(60000)).toBe("1 min");
  });

  it("horas inteiras", () => {
    expect(formatDuration(7200000)).toBe("2 h");
  });

  it("h + min quando há resto", () => {
    expect(formatDuration(3900000)).toBe("1 h 5 min");
  });

  it("retorna placeholder em ms negativo", () => {
    expect(formatDuration(-1)).toBe("—");
  });

  it("retorna placeholder em NaN", () => {
    expect(formatDuration(NaN)).toBe("—");
  });
});
