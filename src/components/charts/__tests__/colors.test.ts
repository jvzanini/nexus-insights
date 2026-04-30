import {
  CHART_COLORS,
  CHART_PALETTE,
  CHART_SEMANTIC,
  getColorByIndex,
} from "@/lib/charts/colors";

describe("CHART_COLORS / CHART_PALETTE", () => {
  it("expõe os 10 tokens base com hex válido", () => {
    const tokens = Object.entries(CHART_COLORS);
    expect(tokens).toHaveLength(10);
    for (const [, value] of tokens) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("CHART_PALETTE tem 9 cores e começa em violet (primária)", () => {
    expect(CHART_PALETTE).toHaveLength(9);
    expect(CHART_PALETTE[0]).toBe(CHART_COLORS.violet);
  });

  it("CHART_PALETTE não contém duplicatas (cada slot é único)", () => {
    const set = new Set(CHART_PALETTE);
    expect(set.size).toBe(CHART_PALETTE.length);
  });

  it("CHART_SEMANTIC mapeia papéis funcionais para cores", () => {
    expect(CHART_SEMANTIC.primary).toBe(CHART_COLORS.violet);
    expect(CHART_SEMANTIC.success).toBe(CHART_COLORS.emerald);
    expect(CHART_SEMANTIC.danger).toBe(CHART_COLORS.red);
    expect(CHART_SEMANTIC.warning).toBe(CHART_COLORS.amber);
    expect(CHART_SEMANTIC.info).toBe(CHART_COLORS.blue);
    expect(CHART_SEMANTIC.neutral).toBe(CHART_COLORS.slate);
  });
});

describe("getColorByIndex", () => {
  it("retorna a cor correspondente ao índice dentro do range", () => {
    expect(getColorByIndex(0)).toBe(CHART_PALETTE[0]);
    expect(getColorByIndex(3)).toBe(CHART_PALETTE[3]);
    expect(getColorByIndex(CHART_PALETTE.length - 1)).toBe(
      CHART_PALETTE[CHART_PALETTE.length - 1],
    );
  });

  it("faz cycle quando o índice excede o tamanho da paleta", () => {
    const len = CHART_PALETTE.length;
    expect(getColorByIndex(len)).toBe(CHART_PALETTE[0]);
    expect(getColorByIndex(len + 2)).toBe(CHART_PALETTE[2]);
    expect(getColorByIndex(len * 3 + 4)).toBe(CHART_PALETTE[4]);
  });

  it("trata valores inválidos como índice 0", () => {
    expect(getColorByIndex(-1)).toBe(CHART_PALETTE[0]);
    expect(getColorByIndex(Number.NaN)).toBe(CHART_PALETTE[0]);
    expect(getColorByIndex(Number.POSITIVE_INFINITY)).toBe(CHART_PALETTE[0]);
  });

  it("trunca floats", () => {
    expect(getColorByIndex(2.7)).toBe(CHART_PALETTE[2]);
  });
});
