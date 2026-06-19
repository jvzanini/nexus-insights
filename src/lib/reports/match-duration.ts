/**
 * Filtragem client-side de conversas por duração (Sem resposta há / Aberta há /
 * Parada há). Opera sobre segundos EXATOS — a coluna arredonda só para leitura.
 * `stalled_seconds` é derivado de last_activity_at (ISO) usando serverNow para
 * alinhar a base temporal com waiting/open (calculados no servidor).
 */
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import type { DurationFilter, DurationIndicator, DurationUnit } from "./filter-state";

export const UNIT_SECONDS: Record<DurationUnit, number> = {
  minute: 60,
  hour: 3_600,
  day: 86_400,
  month: 2_592_000, // ≈30 dias
  year: 31_536_000, // ≈365 dias
};

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

function isValid(f: DurationFilter): boolean {
  if (!Number.isFinite(f.value) || f.value <= 0) return false;
  if (f.mode === "between" && (!f.valueEnd || !Number.isFinite(f.valueEnd) || f.valueEnd <= 0)) return false;
  return true;
}

export function matchDuration(
  rows: ConversaRow[],
  filter: DurationFilter | undefined,
  serverNow: number,
): ConversaRow[] {
  if (!filter || !isValid(filter)) return rows;
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
