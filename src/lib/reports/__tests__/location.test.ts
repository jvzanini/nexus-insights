import { describe, it, expect } from "@jest/globals";
import {
  ESTADOS,
  ESTADO_FALLBACK,
  normalizeCountry,
  normalizeEstado,
} from "@/lib/reports/location";

describe("ESTADOS", () => {
  it("contém exatamente 27 unidades federativas", () => {
    expect(ESTADOS).toHaveLength(27);
  });

  it("tem nomes canônicos com acentos", () => {
    const byUf = new Map(ESTADOS.map((e) => [e.uf, e.nome]));
    expect(byUf.get("SP")).toBe("São Paulo");
    expect(byUf.get("CE")).toBe("Ceará");
    expect(byUf.get("ES")).toBe("Espírito Santo");
    expect(byUf.get("GO")).toBe("Goiás");
    expect(byUf.get("PB")).toBe("Paraíba");
    expect(byUf.get("PR")).toBe("Paraná");
  });
});

describe("normalizeCountry", () => {
  it("'Brasil' → 'Brasil'", () => {
    expect(normalizeCountry("Brasil")).toBe("Brasil");
  });
  it("'Brazil' → 'Brasil'", () => {
    expect(normalizeCountry("Brazil")).toBe("Brasil");
  });
  it("'BR' → 'Brasil'", () => {
    expect(normalizeCountry("BR")).toBe("Brasil");
  });
  it("'' → null", () => {
    expect(normalizeCountry("")).toBeNull();
  });
  it("null → null", () => {
    expect(normalizeCountry(null)).toBeNull();
  });
  it("undefined → null", () => {
    expect(normalizeCountry(undefined)).toBeNull();
  });
  it("valor desconhecido retorna trimado original (defensivo)", () => {
    expect(normalizeCountry("  Argentina  ")).toBe("Argentina");
  });
});

describe("normalizeEstado", () => {
  it("'MG-Minas Gerais' → 'MG-Minas Gerais'", () => {
    expect(normalizeEstado("MG-Minas Gerais")).toBe("MG-Minas Gerais");
  });
  it("'BA-Bahia' → 'BA-Bahia'", () => {
    expect(normalizeEstado("BA-Bahia")).toBe("BA-Bahia");
  });
  it("'Bahia' → 'BA-Bahia'", () => {
    expect(normalizeEstado("Bahia")).toBe("BA-Bahia");
  });
  it("'Goias' → 'GO-Goiás'", () => {
    expect(normalizeEstado("Goias")).toBe("GO-Goiás");
  });
  it("'ESPÍRITO SANTO' → 'ES-Espírito Santo'", () => {
    expect(normalizeEstado("ESPÍRITO SANTO")).toBe("ES-Espírito Santo");
  });
  it("'AM Amazonas' → 'AM-Amazonas'", () => {
    expect(normalizeEstado("AM Amazonas")).toBe("AM-Amazonas");
  });
  it("'Contagem-MG' → 'MG-Minas Gerais'", () => {
    expect(normalizeEstado("Contagem-MG")).toBe("MG-Minas Gerais");
  });
  it("'Crato-CE' → 'CE-Ceará'", () => {
    expect(normalizeEstado("Crato-CE")).toBe("CE-Ceará");
  });
  it("'Anápolis- Go' → 'GO-Goiás'", () => {
    expect(normalizeEstado("Anápolis- Go")).toBe("GO-Goiás");
  });
  it("'Maringá - Paraná' → 'PR-Paraná'", () => {
    expect(normalizeEstado("Maringá - Paraná")).toBe("PR-Paraná");
  });
  it("'BA' → 'BA-Bahia'", () => {
    expect(normalizeEstado("BA")).toBe("BA-Bahia");
  });
  it("'Brasília' → 'DF-Distrito Federal'", () => {
    expect(normalizeEstado("Brasília")).toBe("DF-Distrito Federal");
  });
  it("'Fortaleza' → 'CE-Ceará'", () => {
    expect(normalizeEstado("Fortaleza")).toBe("CE-Ceará");
  });
  it("'Maceió ' → 'AL-Alagoas'", () => {
    expect(normalizeEstado("Maceió ")).toBe("AL-Alagoas");
  });
  it("'João Pessoa' → 'PB-Paraíba'", () => {
    expect(normalizeEstado("João Pessoa")).toBe("PB-Paraíba");
  });
  it("'CE-Alagoas' → 'AL-Alagoas' (nome vence prefixo UF)", () => {
    expect(normalizeEstado("CE-Alagoas")).toBe("AL-Alagoas");
  });
  it("'Maralhão' (typo) → fallback", () => {
    expect(normalizeEstado("Maralhão")).toBe("ZZ-Outros Estados");
  });
  it("'ZZ-Outros Estados' → 'ZZ-Outros Estados'", () => {
    expect(normalizeEstado("ZZ-Outros Estados")).toBe(ESTADO_FALLBACK);
  });
  it("'' → null", () => {
    expect(normalizeEstado("")).toBeNull();
  });
  it("null → null", () => {
    expect(normalizeEstado(null)).toBeNull();
  });
  it("undefined → null", () => {
    expect(normalizeEstado(undefined)).toBeNull();
  });
  it("'Mato Grosso do Sul' → 'MS-Mato Grosso do Sul' (não casar MT antes)", () => {
    expect(normalizeEstado("Mato Grosso do Sul")).toBe("MS-Mato Grosso do Sul");
  });
  it("'Mato Grosso' → 'MT-Mato Grosso'", () => {
    expect(normalizeEstado("Mato Grosso")).toBe("MT-Mato Grosso");
  });
  it("'São Paulo' → 'SP-São Paulo'", () => {
    expect(normalizeEstado("São Paulo")).toBe("SP-São Paulo");
  });
  it("'SP-São Paulo' → 'SP-São Paulo'", () => {
    expect(normalizeEstado("SP-São Paulo")).toBe("SP-São Paulo");
  });
  it("colapsa espaços múltiplos", () => {
    expect(normalizeEstado("  São    Paulo  ")).toBe("SP-São Paulo");
  });
});
