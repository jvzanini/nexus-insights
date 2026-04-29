import { formatCpf } from "@/lib/utils/format-cpf";

describe("formatCpf", () => {
  it("formata 11 dígitos limpos", () => {
    expect(formatCpf("12345678901")).toBe("123.456.789-01");
  });

  it("formata mesmo com separadores", () => {
    expect(formatCpf("123.456.789-01")).toBe("123.456.789-01");
  });

  it("retorna string vazia para null/undefined/empty", () => {
    expect(formatCpf(null)).toBe("");
    expect(formatCpf(undefined)).toBe("");
    expect(formatCpf("")).toBe("");
  });

  it("retorna o original (trim) quando não tem 11 dígitos", () => {
    expect(formatCpf(" 12345 ")).toBe("12345");
    expect(formatCpf("CPF inválido")).toBe("CPF inválido");
  });
});
