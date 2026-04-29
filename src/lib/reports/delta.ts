/**
 * Helpers de comparativo entre períodos.
 * Calcula percentual e direção (up/down/flat) de forma consistente.
 */

export type DeltaDirection = "up" | "down" | "flat";

export interface DeltaResult {
  percent: number;
  direction: DeltaDirection;
}

/**
 * Calcula a variação percentual entre `current` e `previous`.
 * - Se `previous` == 0 e `current` == 0 → flat (0%).
 * - Se `previous` == 0 e `current` > 0 → up (100%).
 * - Caso contrário, percentual absoluto e direção pelo sinal,
 *   considerando flat quando |Δ| < 0.5%.
 */
export function calculateDelta(
  current: number,
  previous: number,
): DeltaResult {
  if (previous === 0) {
    return {
      percent: current === 0 ? 0 : 100,
      direction: current === 0 ? "flat" : "up",
    };
  }
  const pct = ((current - previous) / previous) * 100;
  const direction: DeltaDirection =
    Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down";
  return { percent: Math.abs(pct), direction };
}
