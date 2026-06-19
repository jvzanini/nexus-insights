/**
 * Filtragem client-side de conversas por duração (Sem resposta há / Aberta há /
 * Parada há). Opera sobre segundos EXATOS — a coluna arredonda só para leitura.
 * `stalled_seconds` é derivado de last_activity_at (ISO) usando serverNow para
 * alinhar a base temporal com waiting/open (calculados no servidor).
 */
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import type { DurationFilter, DurationIndicator } from "./filter-state";
import { UNIT_SECONDS, isDurationFilterValid } from "./filter-state";

// Re-exporta UNIT_SECONDS (fonte única em filter-state) para consumidores que
// já importavam daqui.
export { UNIT_SECONDS } from "./filter-state";

export function deriveStalledSeconds(row: ConversaRow, serverNow: number): number | null {
  if (!row.last_activity_at) return null;
  const t = Date.parse(row.last_activity_at);
  if (Number.isNaN(t)) return null;
  return Math.floor((serverNow - t) / 1000);
}

function resolveSeconds(row: ConversaRow, indicator: DurationIndicator, serverNow: number): number | null {
  if (indicator === "waiting") return row.waiting_seconds;
  if (indicator === "open") return row.open_seconds;
  return deriveStalledSeconds(row, serverNow);
}

export function matchDuration(
  rows: ConversaRow[],
  filter: DurationFilter | undefined,
  serverNow: number,
): ConversaRow[] {
  if (!filter || !isDurationFilterValid(filter)) return rows;
  const a = filter.value * UNIT_SECONDS[filter.unit];
  const b = filter.mode === "between"
    ? (filter.valueEnd ?? 0) * UNIT_SECONDS[filter.unitEnd ?? filter.unit]
    : 0;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return rows.filter((r) => {
    const s = resolveSeconds(r, filter.indicator, serverNow);
    if (s == null) return false;
    if (filter.mode === "gte") return s >= a;
    if (filter.mode === "lte") return s <= a;
    return s >= lo && s <= hi;
  });
}
