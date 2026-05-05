//
// Wrapper sobre `getCanonicalPeriod` (canonical-v0.42+).
//
// `weekStartsOn` é lido de `app_settings` (via `getDashboardSettings`) e
// passado para `getCanonicalPeriod` — afeta o cálculo de semana.
//
// `mode` (rolling/current) é ignorado — sempre usa current (mês civil,
// semana ISO). Rolling foi removido em v0.42.
//
// `end` é EXCLUSIVE (próximo 00:00 BRT) para consistência com SQL
// `column >= start AND column < end`.
//
// @canonical see src/lib/datetime-core.ts (getCanonicalPeriod)

import { getCanonicalPeriod } from "@/lib/datetime-core";

export type DashboardPeriod = "dia" | "semana" | "mes";
/** @deprecated v0.42 — sempre tratado como "current" (canonical). */
export type DashboardMode = "current" | "rolling";
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface DashboardPeriodInput {
  period: DashboardPeriod;
  /** @deprecated v0.42 — ignorado. */
  mode: DashboardMode;
  /** Dia de início da semana. Lido de app_settings. Default = 1 (segunda). */
  weekStartsOn: WeekStartsOn;
  tz: string;
  referenceDate?: Date;
}

export interface DashboardPeriodResult {
  current: PeriodRange;
  prev: PeriodRange;
}

const PERIOD_TO_LABEL = {
  dia: "hoje",
  semana: "semana",
  mes: "mes",
} as const;

export function getDashboardPeriod(
  input: DashboardPeriodInput,
): DashboardPeriodResult {
  const { period, tz, weekStartsOn, referenceDate } = input;
  const r = getCanonicalPeriod({
    label: PERIOD_TO_LABEL[period],
    tz,
    weekStartsOn,
    refIso: (referenceDate ?? new Date()).toISOString(),
  });
  return {
    current: { start: r.start, end: r.end },
    prev: { start: r.prev.start, end: r.prev.end },
  };
}
