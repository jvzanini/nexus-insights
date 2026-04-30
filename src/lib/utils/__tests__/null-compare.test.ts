import {
  nullableNumberCompare,
  nullableStringCompare,
  nullableDateCompare,
} from "@/lib/utils/null-compare";

describe("nullableNumberCompare — null como valor mínimo", () => {
  it("retorna 0 quando ambos são null", () => {
    expect(nullableNumberCompare(null, null)).toBe(0);
  });

  it("trata null como menor que qualquer número (null < n)", () => {
    expect(nullableNumberCompare(null, 0)).toBe(-1);
    expect(nullableNumberCompare(null, -100)).toBe(-1);
    expect(nullableNumberCompare(null, 9999)).toBe(-1);
  });

  it("trata número como maior que null (n > null)", () => {
    expect(nullableNumberCompare(0, null)).toBe(1);
    expect(nullableNumberCompare(-50, null)).toBe(1);
    expect(nullableNumberCompare(123, null)).toBe(1);
  });

  it("ordena números crescentes via diferença", () => {
    expect(nullableNumberCompare(1, 2)).toBeLessThan(0);
    expect(nullableNumberCompare(2, 1)).toBeGreaterThan(0);
    expect(nullableNumberCompare(5, 5)).toBe(0);
  });

  it("é simétrico ao inverter direção via factor=-1 (null sempre nas pontas opostas)", () => {
    // asc: null primeiro
    const asc = [3, null, 1, null, 2]
      .slice()
      .sort((a, b) => nullableNumberCompare(a, b));
    expect(asc).toEqual([null, null, 1, 2, 3]);

    // desc (factor -1): null último
    const desc = [3, null, 1, null, 2]
      .slice()
      .sort((a, b) => nullableNumberCompare(a, b) * -1);
    expect(desc).toEqual([3, 2, 1, null, null]);
  });
});

describe("nullableStringCompare — null no fim", () => {
  it("retorna 0 quando ambos são null", () => {
    expect(nullableStringCompare(null, null)).toBe(0);
  });

  it("coloca null depois de qualquer string", () => {
    expect(nullableStringCompare(null, "abc")).toBeGreaterThan(0);
    expect(nullableStringCompare("abc", null)).toBeLessThan(0);
  });

  it("ordena strings com locale pt-BR", () => {
    const arr = ["banana", null, "Ávila", "abc"];
    arr.sort((a, b) => nullableStringCompare(a, b));
    // Strings ordenadas por pt-BR (case insensitive, base sensitivity), null no fim.
    expect(arr[arr.length - 1]).toBeNull();
    expect(arr.slice(0, -1)).toEqual(
      [...arr.slice(0, -1)].sort((a, b) =>
        a!.localeCompare(b!, "pt-BR", { numeric: true, sensitivity: "base" }),
      ),
    );
  });

  it("trata string vazia como null (vai para o fim)", () => {
    expect(nullableStringCompare("", "abc")).toBeGreaterThan(0);
    expect(nullableStringCompare("abc", "")).toBeLessThan(0);
  });
});

describe("nullableDateCompare — null/inválido no fim", () => {
  it("retorna 0 quando ambos são null", () => {
    expect(nullableDateCompare(null, null)).toBe(0);
  });

  it("coloca null depois de datas válidas", () => {
    expect(nullableDateCompare(null, "2026-01-01T00:00:00Z")).toBeGreaterThan(0);
    expect(nullableDateCompare("2026-01-01T00:00:00Z", null)).toBeLessThan(0);
  });

  it("ordena datas crescentes", () => {
    expect(
      nullableDateCompare("2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"),
    ).toBeLessThan(0);
    expect(
      nullableDateCompare("2026-02-01T00:00:00Z", "2026-01-01T00:00:00Z"),
    ).toBeGreaterThan(0);
  });

  it("datas inválidas vão para o fim", () => {
    expect(nullableDateCompare("foo", "2026-01-01T00:00:00Z")).toBeGreaterThan(
      0,
    );
    expect(nullableDateCompare("2026-01-01T00:00:00Z", "bar")).toBeLessThan(0);
    expect(nullableDateCompare("foo", "bar")).toBe(0);
  });
});
