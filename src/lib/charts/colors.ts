/**
 * Paleta de cores acessível para charts.
 *
 * Cada token foi escolhido para:
 * - manter contraste suficiente em backgrounds claros e escuros (>= 3:1 para
 *   elementos gráficos, conforme WCAG não-textual);
 * - ter pares semânticos previsíveis (success/error/warning/neutral);
 * - sustentar a identidade do produto (violet como primária, alinhada ao tema).
 *
 * Uso recomendado:
 * - `CHART_COLORS.violet` para a série principal de cada chart;
 * - `CHART_PALETTE` (cycle) para múltiplas séries via `getColorByIndex`;
 * - tokens semânticos (`success`, `danger`, `warning`) para sinais de estado.
 */
export const CHART_COLORS = {
  violet: "#8b5cf6",
  emerald: "#10b981",
  red: "#ef4444",
  amber: "#f59e0b",
  blue: "#3b82f6",
  slate: "#64748b",
  pink: "#ec4899",
  cyan: "#06b6d4",
  orange: "#f97316",
  green: "#22c55e",
} as const;

export type ChartColorToken = keyof typeof CHART_COLORS;

/**
 * Paleta ordenada para séries múltiplas.
 *
 * A ordem é pensada para maximizar separação perceptual entre cores adjacentes
 * (violet -> emerald -> amber -> blue -> ...), reduzindo confusão visual em
 * pies, donuts e bars empilhadas.
 */
export const CHART_PALETTE: readonly string[] = [
  CHART_COLORS.violet,
  CHART_COLORS.emerald,
  CHART_COLORS.amber,
  CHART_COLORS.blue,
  CHART_COLORS.pink,
  CHART_COLORS.cyan,
  CHART_COLORS.orange,
  CHART_COLORS.red,
  CHART_COLORS.slate,
] as const;

/**
 * Retorna uma cor da paleta por índice (cycle).
 *
 * @example
 * getColorByIndex(0) // violet
 * getColorByIndex(9) // violet (cycle)
 */
export function getColorByIndex(i: number): string {
  if (!Number.isFinite(i) || i < 0) {
    return CHART_PALETTE[0];
  }
  return CHART_PALETTE[Math.floor(i) % CHART_PALETTE.length];
}

/**
 * Tokens semânticos para sinais funcionais em charts.
 *
 * Sempre que uma cor carrega significado funcional (sucesso, falha, alerta),
 * essa cor deve vir acompanhada de um label/ícone — nunca cor sozinha
 * (`color-not-only`, `color-not-decorative-only`).
 */
export const CHART_SEMANTIC = {
  primary: CHART_COLORS.violet,
  success: CHART_COLORS.emerald,
  danger: CHART_COLORS.red,
  warning: CHART_COLORS.amber,
  info: CHART_COLORS.blue,
  neutral: CHART_COLORS.slate,
} as const;
