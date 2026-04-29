import { formatPhone } from "@/lib/utils/format-phone";

describe("formatPhone", () => {
  it("retorna vazio quando entrada é null/undefined/empty/sem dígitos", () => {
    expect(formatPhone(null)).toBe("");
    expect(formatPhone(undefined)).toBe("");
    expect(formatPhone("")).toBe("");
    expect(formatPhone("abc")).toBe("");
  });

  it("formata número internacional E.164 com 13 dígitos (móvel BR)", () => {
    expect(formatPhone("+5511987654321")).toBe("+55 (11) 98765-4321");
  });

  it("formata número com DDI sem '+'", () => {
    expect(formatPhone("5511987654321")).toBe("+55 (11) 98765-4321");
  });

  it("formata número fixo com DDI (12 dígitos)", () => {
    expect(formatPhone("551123456789")).toBe("+55 (11) 2345-6789");
  });

  it("formata número sem DDI 11 dígitos (móvel)", () => {
    expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
  });

  it("formata número sem DDI 10 dígitos (fixo)", () => {
    expect(formatPhone("1123456789")).toBe("(11) 2345-6789");
  });

  it("fallback retorna original com '+' quando internacional não cai em formatos BR", () => {
    // 9 dígitos com '+' não bate em nenhum branch BR
    expect(formatPhone("+123456789")).toBe("+123456789");
  });

  it("fallback retorna apenas dígitos quando não começa com '+' e formato curto", () => {
    expect(formatPhone("12345")).toBe("12345");
  });
});
