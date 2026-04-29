import { detectDocument } from "@/lib/utils/format-document";

describe("detectDocument", () => {
  it("retorna null sem inputs", () => {
    expect(detectDocument({})).toBeNull();
    expect(
      detectDocument({ identifier: null, additional_attributes: null }),
    ).toBeNull();
  });

  it("detecta CPF a partir de identifier com 11 dígitos limpos", () => {
    expect(detectDocument({ identifier: "12345678901" })).toEqual({
      type: "cpf",
      raw: "12345678901",
      formatted: "123.456.789-01",
    });
  });

  it("detecta CPF a partir de identifier com formato", () => {
    expect(detectDocument({ identifier: "123.456.789-01" })).toEqual({
      type: "cpf",
      raw: "12345678901",
      formatted: "123.456.789-01",
    });
  });

  it("detecta CNPJ a partir de identifier com 14 dígitos", () => {
    expect(detectDocument({ identifier: "11222333000181" })).toEqual({
      type: "cnpj",
      raw: "11222333000181",
      formatted: "11.222.333/0001-81",
    });
  });

  it("detecta CNPJ a partir de identifier com formato", () => {
    expect(detectDocument({ identifier: "11.222.333/0001-81" })).toEqual({
      type: "cnpj",
      raw: "11222333000181",
      formatted: "11.222.333/0001-81",
    });
  });

  it("detecta CPF a partir de additional_attributes.cpf", () => {
    expect(
      detectDocument({
        additional_attributes: { cpf: "987.654.321-00" },
      }),
    ).toEqual({
      type: "cpf",
      raw: "98765432100",
      formatted: "987.654.321-00",
    });
  });

  it("detecta CNPJ a partir de additional_attributes.CNPJ", () => {
    expect(
      detectDocument({
        additional_attributes: { CNPJ: "11222333000181" },
      }),
    ).toEqual({
      type: "cnpj",
      raw: "11222333000181",
      formatted: "11.222.333/0001-81",
    });
  });

  it("detecta CPF via regex no description", () => {
    expect(
      detectDocument({
        additional_attributes: {
          description: "Cliente premium. CPF: 123.456.789-01 — VIP",
        },
      }),
    ).toEqual({
      type: "cpf",
      raw: "12345678901",
      formatted: "123.456.789-01",
    });
  });

  it("detecta CNPJ via regex no description", () => {
    expect(
      detectDocument({
        additional_attributes: {
          description: "Empresa parceira CNPJ 11.222.333/0001-81.",
        },
      }),
    ).toEqual({
      type: "cnpj",
      raw: "11222333000181",
      formatted: "11.222.333/0001-81",
    });
  });

  it("prioriza identifier sobre additional_attributes", () => {
    expect(
      detectDocument({
        identifier: "12345678901",
        additional_attributes: { cpf: "98765432100" },
      }),
    ).toEqual({
      type: "cpf",
      raw: "12345678901",
      formatted: "123.456.789-01",
    });
  });

  it("retorna null para identifier inválido sem fallback", () => {
    expect(detectDocument({ identifier: "abc-xyz" })).toBeNull();
    expect(detectDocument({ identifier: "" })).toBeNull();
  });

  it("ignora identifier inválido e usa fallback de description", () => {
    expect(
      detectDocument({
        identifier: "user-42",
        additional_attributes: {
          description: "CPF: 123.456.789-01",
        },
      }),
    ).toEqual({
      type: "cpf",
      raw: "12345678901",
      formatted: "123.456.789-01",
    });
  });

  it("retorna null se description não tem CPF/CNPJ", () => {
    expect(
      detectDocument({
        additional_attributes: {
          description: "Cliente desde 2020.",
        },
      }),
    ).toBeNull();
  });
});
