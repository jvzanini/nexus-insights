import { buildLocationOptions } from "@/lib/reports/location";

type Row = { contact: { country: string | null; estado: string | null } };

function row(country: string | null, estado: string | null): Row {
  return { contact: { country, estado } };
}

describe("buildLocationOptions — estado", () => {
  it("ordena por posição em ESTADOS (por UF) e atribui ids 1-based na ordem final", () => {
    const rows: Row[] = [
      row(null, "SP-São Paulo"),
      row(null, "MG-Minas Gerais"),
      row(null, "ZZ-Outros Estados"),
      row(null, "BA-Bahia"),
    ];
    expect(buildLocationOptions(rows, "estado")).toEqual([
      { id: 1, name: "BA-Bahia" },
      { id: 2, name: "MG-Minas Gerais" },
      { id: 3, name: "SP-São Paulo" },
      { id: 4, name: "ZZ-Outros Estados" },
    ]);
  });

  it("mantém ZZ-Outros Estados sempre por último", () => {
    const rows: Row[] = [
      row(null, "ZZ-Outros Estados"),
      row(null, "AC-Acre"),
    ];
    expect(buildLocationOptions(rows, "estado")).toEqual([
      { id: 1, name: "AC-Acre" },
      { id: 2, name: "ZZ-Outros Estados" },
    ]);
  });

  it("colapsa duplicados", () => {
    const rows: Row[] = [
      row(null, "SP-São Paulo"),
      row(null, "SP-São Paulo"),
      row(null, "BA-Bahia"),
    ];
    expect(buildLocationOptions(rows, "estado")).toEqual([
      { id: 1, name: "BA-Bahia" },
      { id: 2, name: "SP-São Paulo" },
    ]);
  });

  it("ignora nulls", () => {
    const rows: Row[] = [
      row(null, null),
      row(null, "BA-Bahia"),
      row(null, null),
    ];
    expect(buildLocationOptions(rows, "estado")).toEqual([
      { id: 1, name: "BA-Bahia" },
    ]);
  });

  it("retorna [] para lista vazia ou só nulls", () => {
    expect(buildLocationOptions([], "estado")).toEqual([]);
    expect(
      buildLocationOptions([row(null, null), row(null, null)], "estado"),
    ).toEqual([]);
  });
});

describe("buildLocationOptions — country", () => {
  it("ordena alfabeticamente (pt-BR) e ignora nulls", () => {
    const rows: Row[] = [
      row("Brasil", null),
      row(null, null),
      row("Brasil", null),
    ];
    expect(buildLocationOptions(rows, "country")).toEqual([
      { id: 1, name: "Brasil" },
    ]);
  });

  it("retorna [] para lista vazia", () => {
    expect(buildLocationOptions([], "country")).toEqual([]);
  });
});
