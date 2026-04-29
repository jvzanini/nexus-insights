// Helpers puros — usados tanto em Server Components quanto no Client.
import {
  type PeriodKey,
  isPeriodKey,
} from "@/lib/reports/period";

export interface CustomRangeSerialized {
  // Datas no formato ISO yyyy-mm-dd (sem hora, sem timezone).
  // A interpretação fina (start-of-day / end-of-day no tz da plataforma)
  // é responsabilidade de `getPeriodInTz`.
  start: string;
  end: string;
}

export interface ConversasFiltersValue {
  period: PeriodKey;
  inboxIds: number[];
  teamIds: number[];
  statuses: number[];
  customRange?: CustomRangeSerialized;
}

export const DEFAULT_PERIOD: PeriodKey = "30d";

// Regex simples pra ISO yyyy-mm-dd. Não tenta validar dia 31 de fevereiro;
// downstream (`new Date(...)`, `getPeriodInTz`) cuida do refinamento.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: string | null): string | null {
  if (!value) return null;
  return ISO_DATE_RE.test(value) ? value : null;
}

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

  let customRange: CustomRangeSerialized | undefined;
  if (period === "custom") {
    const start = parseIsoDate(params.get("custom_start"));
    const end = parseIsoDate(params.get("custom_end"));
    if (start && end) {
      customRange = { start, end };
    }
  }

  return {
    period,
    inboxIds: parseIds("inboxes"),
    teamIds: parseIds("teams"),
    statuses: parseIds("statuses"),
    customRange,
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
  if (filters.period === "custom" && filters.customRange) {
    sp.set("custom_start", filters.customRange.start);
    sp.set("custom_end", filters.customRange.end);
  }
  return sp;
}
