import { type PeriodKey } from "@/lib/reports/period";

const VALID_PERIODS: PeriodKey[] = [
  "hoje",
  "ontem",
  "7d",
  "30d",
  "mes_atual",
  "mes_anterior",
];

export interface ParsedReportParams {
  period: PeriodKey;
  customStart: string | null;
  customEnd: string | null;
  tab: string | null;
}

/**
 * Helper canônico para extrair os parâmetros comuns das pages de relatórios
 * (period, custom_start, custom_end, tab) — usado pelos super-relatórios B8.
 */
export function parseReportSearchParams(
  sp: Record<string, string | string[] | undefined>,
): ParsedReportParams {
  const periodRaw =
    typeof sp.period === "string" ? (sp.period as PeriodKey) : null;
  const period: PeriodKey =
    periodRaw && VALID_PERIODS.includes(periodRaw) ? periodRaw : "30d";

  const customStart =
    typeof sp.custom_start === "string" ? sp.custom_start : null;
  const customEnd = typeof sp.custom_end === "string" ? sp.custom_end : null;
  const tab = typeof sp.tab === "string" ? sp.tab : null;

  return { period, customStart, customEnd, tab };
}
