import { formatBrl4, formatUsd4 } from "../format";

// Intl pt-BR usa NBSP ( ) entre símbolo e número
const NBSP = " ";
const brl = (n: string) => `R$${NBSP}${n}`;

describe("formatBrl4", () => {
  it("arredonda half-up para 4 casas (0.123456789 → R$ 0,1235)", () => {
    expect(formatBrl4(0.123456789)).toBe(brl("0,1235"));
  });

  it("retorna '—' para null", () => {
    expect(formatBrl4(null)).toBe("—");
  });

  it("retorna '—' para undefined", () => {
    expect(formatBrl4(undefined)).toBe("—");
  });

  it("retorna '—' para NaN", () => {
    expect(formatBrl4(NaN)).toBe("—");
  });

  it("retorna '—' para Infinity", () => {
    expect(formatBrl4(Infinity)).toBe("—");
  });

  it("formata 0 como R$ 0,0000", () => {
    expect(formatBrl4(0)).toBe(brl("0,0000"));
  });

  it("arredonda 0.12345 para 0,1235 (half-up)", () => {
    expect(formatBrl4(0.12345)).toBe(brl("0,1235"));
  });

  it("formata valor inteiro com 4 casas", () => {
    expect(formatBrl4(10)).toBe(brl("10,0000"));
  });
});

describe("formatUsd4", () => {
  it("arredonda half-up para 4 casas e formata em en-US", () => {
    const result = formatUsd4(0.123456789);
    expect(result).toContain("0.1235");
    expect(result).not.toContain(",");
  });

  it("retorna '—' para null", () => {
    expect(formatUsd4(null)).toBe("—");
  });

  it("retorna '—' para undefined", () => {
    expect(formatUsd4(undefined)).toBe("—");
  });

  it("retorna '—' para NaN", () => {
    expect(formatUsd4(NaN)).toBe("—");
  });

  it("retorna '—' para Infinity", () => {
    expect(formatUsd4(Infinity)).toBe("—");
  });

  it("formata 0 com 4 casas decimais", () => {
    const result = formatUsd4(0);
    expect(result).toContain("0.0000");
  });

  it("usa símbolo $ (en-US)", () => {
    const result = formatUsd4(1.5);
    expect(result).toContain("$");
  });
});
