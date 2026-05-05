//
// Wrapper compat sobre `getCanonicalPeriod` (canonical-v0.42).
//
// REGRA SUPREMA do projeto (definida pelo usuário):
//   "começa na segunda e termina no domingo, sempre"
//   → semana é ISO week (segunda → próxima segunda, end-exclusive).
//   → mês é mês civil (dia 1 → dia 1 do mês seguinte, end-exclusive).
//   → "rolling" não existe mais. `mode` é IGNORADO em v0.42+.
//   → `weekStartsOn` é IGNORADO em v0.42+ (sempre 1=segunda).
//
// `end` é EXCLUSIVE (próximo 00:00 BRT) para consistência com SQL
// `column >= start AND column < end`.
//
// @canonical see src/lib/datetime-core.ts (getCanonicalPeriod)

import { getCanonicalPeriod } from "@/lib/datetime-core";

export type DashboardPeriod = "dia" | "semana" | "mes";
/** @deprecated v0.42 — sempre tratado como "current" (canonical seg→seg). */
export type DashboardMode = "current" | "rolling";
/** @deprecated v0.42 — sempre tratado como 1 (segunda). */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface DashboardPeriodInput {
  period: DashboardPeriod;
  /** @deprecated v0.42 — ignorado. */
  mode: DashboardMode;
  /** @deprecated v0.42 — ignorado. */
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
  const { period, tz, referenceDate } = input;
  const r = getCanonicalPeriod({
    label: PERIOD_TO_LABEL[period],
    tz,
    refIso: (referenceDate ?? new Date()).toISOString(),
  });
  return {
    current: { start: r.start, end: r.end },
    prev: { start: r.prev.start, end: r.prev.end },
  };
}
