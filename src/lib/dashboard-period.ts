//
// Helper PURO de cálculo de período do dashboard.
// Sem dependência de DB ou Node-only — pode ser usado em Client e Server.

import {
  startOfDay,
  endOfDay,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  endOfWeek,
} from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * v0.14.0: tipos `dia | semana | mes`. "hoje" é alias legado mantido
 * para callers antigos que possam ter cacheado o type.
 */
export type DashboardPeriod = "dia" | "semana" | "mes";
export type DashboardMode = "current" | "rolling";
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface DashboardPeriodInput {
  period: DashboardPeriod;
  mode: DashboardMode;
  weekStartsOn: WeekStartsOn;
  tz: string;
  /**
   * Data de referência para calcular o range. Default = `now`.
   * Permite navegar entre períodos (dia anterior, semana passada, mês anterior).
   */
  referenceDate?: Date;
}

export interface DashboardPeriodResult {
  current: PeriodRange;
  prev: PeriodRange;
}

const ROLLING_DAYS: Record<DashboardPeriod, number> = {
  dia: 1,
  semana: 7,
  mes: 30,
};

export function getDashboardPeriod(
  input: DashboardPeriodInput,
): DashboardPeriodResult {
  const { period, mode, weekStartsOn, tz, referenceDate } = input;
  const refUtc = referenceDate ?? new Date();
  const refInTz = toZonedTime(refUtc, tz);

  if (period !== "dia" && mode === "rolling") {
    const days = ROLLING_DAYS[period];
    const startUtc = new Date(refUtc.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      current: { start: startUtc, end: refUtc },
      prev: {
        start: new Date(startUtc.getTime() - days * 24 * 60 * 60 * 1000),
        end: new Date(startUtc.getTime() - 1),
      },
    };
  }

  let startLocal: Date;
  let endLocal: Date;

  if (period === "dia") {
    // Dia inteiro: 00:00..23:59 da referenceDate
    startLocal = startOfDay(refInTz);
    endLocal = endOfDay(refInTz);
  } else if (period === "semana") {
    // Semana inteira: do início configurado até o domingo (ou o último dia)
    startLocal = startOfWeek(refInTz, { weekStartsOn });
    endLocal = endOfWeek(refInTz, { weekStartsOn });
  } else {
    // Mês inteiro: dia 1 a último dia do mês
    startLocal = startOfMonth(refInTz);
    endLocal = endOfMonth(refInTz);
  }

  const start = fromZonedTime(startLocal, tz);
  const end = fromZonedTime(endLocal, tz);
  const spanMs = end.getTime() - start.getTime();

  return {
    current: { start, end },
    prev: {
      start: new Date(start.getTime() - spanMs - 1),
      end: new Date(start.getTime() - 1),
    },
  };
}
