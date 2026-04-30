//
// Helper PURO de cálculo de período do dashboard.
// Sem dependência de DB ou Node-only — pode ser usado em Client e Server.

import {
  startOfDay,
  endOfDay,
  startOfWeek,
  startOfMonth,
} from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export type DashboardPeriod = "hoje" | "semana" | "mes";
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
}

export interface DashboardPeriodResult {
  current: PeriodRange;
  prev: PeriodRange;
}

const ROLLING_DAYS: Record<DashboardPeriod, number> = {
  hoje: 1,
  semana: 7,
  mes: 30,
};

export function getDashboardPeriod(
  input: DashboardPeriodInput,
): DashboardPeriodResult {
  const { period, mode, weekStartsOn, tz } = input;
  const nowUtc = new Date();
  const nowInTz = toZonedTime(nowUtc, tz);

  if (period !== "hoje" && mode === "rolling") {
    const days = ROLLING_DAYS[period];
    const startUtc = new Date(nowUtc.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      current: { start: startUtc, end: nowUtc },
      prev: {
        start: new Date(startUtc.getTime() - days * 24 * 60 * 60 * 1000),
        end: new Date(startUtc.getTime() - 1),
      },
    };
  }

  let startLocal: Date;
  let endLocal: Date;

  if (period === "hoje") {
    startLocal = startOfDay(nowInTz);
    endLocal = endOfDay(nowInTz);
  } else if (period === "semana") {
    startLocal = startOfWeek(nowInTz, { weekStartsOn });
    endLocal = endOfDay(nowInTz);
  } else {
    startLocal = startOfMonth(nowInTz);
    endLocal = endOfDay(nowInTz);
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
