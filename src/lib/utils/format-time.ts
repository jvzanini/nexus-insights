/**
 * Formata duração em segundos para texto curto em pt-BR.
 *
 * Exemplos:
 *  - 0 → "-"
 *  - 45 → "45s"
 *  - 90 → "2min"
 *  - 3600 → "1h"
 *  - 5400 → "1h 30min"
 *  - 90000 → "1d"
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  const d = Math.floor(seconds / 86400);
  return `${d}d`;
}
