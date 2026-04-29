// Helpers puros — usados tanto em Server Components quanto no Client.
import {
  type PeriodKey,
  isPeriodKey,
} from "@/lib/reports/period";

export interface ConversasFiltersValue {
  period: PeriodKey;
  inboxIds: number[];
  teamIds: number[];
  statuses: number[];
}

export const DEFAULT_PERIOD: PeriodKey = "30d";

export function deserializeFilters(
  params: URLSearchParams,
): ConversasFiltersValue {
  const periodRaw = params.get("period");
  const period: PeriodKey = isPeriodKey(periodRaw) ? periodRaw : DEFAULT_PERIOD;

  const parseIds = (key: string): number[] => {
    const raw = params.get(key);
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
  };

  return {
    period,
    inboxIds: parseIds("inboxes"),
    teamIds: parseIds("teams"),
    statuses: parseIds("statuses"),
  };
}

export function serializeFilters(
  filters: ConversasFiltersValue,
): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.period && filters.period !== DEFAULT_PERIOD) {
    sp.set("period", filters.period);
  }
  if (filters.inboxIds.length) sp.set("inboxes", filters.inboxIds.join(","));
  if (filters.teamIds.length) sp.set("teams", filters.teamIds.join(","));
  if (filters.statuses.length) sp.set("statuses", filters.statuses.join(","));
  return sp;
}
