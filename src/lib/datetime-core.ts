// Helpers PUROS de datetime — sem dependências de DB ou Node-only.
// Pode ser importado por Client Components, Server Components, libs.
//
// A versão server-side completa (com leitura de settings da plataforma)
// vive em `@/lib/datetime`, que re-exporta este módulo.

import {
  startOfDay,
  endOfDay,
  startOfMonth,
  startOfWeek,
  addDays,
  addMonths,
  addWeeks,
} from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export type PeriodKey = "hoje" | "semana_atual" | "mes_atual" | "custom";

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface CustomRangeInput {
  start: Date;
  end: Date;
}

export const DEFAULT_TZ = "America/Sao_Paulo";
export const DEFAULT_LOCALE = "pt-BR";

/**
 * Calcula o intervalo (em UTC) correspondente ao "dia/semana/mês" no
 * timezone informado. Para `semana_atual` é ISO week (segunda-feira).
 */
export function getPeriodInTz(
  key: PeriodKey,
  tz: string,
  customRange?: CustomRangeInput,
): PeriodRange {
  const nowUtc = new Date();
  const nowInTz = toZonedTime(nowUtc, tz);

  switch (key) {
    case "hoje": {
      const startLocal = startOfDay(nowInTz);
      const endLocal = endOfDay(nowInTz);
      return {
        start: fromZonedTime(startLocal, tz),
        end: fromZonedTime(endLocal, tz),
      };
    }

    case "semana_atual": {
      const weekStartLocal = startOfWeek(nowInTz, { weekStartsOn: 1 });
      const nextWeekStartLocal = addWeeks(weekStartLocal, 1);
      return {
        start: fromZonedTime(weekStartLocal, tz),
        end: fromZonedTime(nextWeekStartLocal, tz),
      };
    }

    case "mes_atual": {
      const monthStartLocal = startOfMonth(nowInTz);
      const nextMonthStartLocal = addMonths(monthStartLocal, 1);
      return {
        start: fromZonedTime(monthStartLocal, tz),
        end: fromZonedTime(nextMonthStartLocal, tz),
      };
    }

    case "custom": {
      if (!customRange) {
        throw new Error(
          'getPeriodInTz: customRange é obrigatório para key="custom"',
        );
      }
      const startInTz = toZonedTime(customRange.start, tz);
      const endInTz = toZonedTime(customRange.end, tz);
      const startLocal = startOfDay(startInTz);
      const endLocal = endOfDay(endInTz);
      return {
        start: fromZonedTime(startLocal, tz),
        end: fromZonedTime(endLocal, tz),
      };
    }

    default: {
      const _exhaustive: never = key;
      throw new Error(`getPeriodInTz: chave desconhecida "${String(_exhaustive)}"`);
    }
  }
}

export function addDaysInTz(date: Date, tz: string, days: number): Date {
  const inTz = toZonedTime(date, tz);
  const moved = addDays(inTz, days);
  return fromZonedTime(moved, tz);
}

export function formatDateInTz(
  d: Date,
  tz: string,
  locale: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const fmt = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...opts,
  });
  return fmt.format(d);
}

export function formatDateTimeInTz(
  d: Date,
  tz: string,
  locale: string,
): string {
  const fmt = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(d);
}

export function formatRelativeTimeInTz(d: Date, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const diffMs = d.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, "hour");
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, "day");
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, "month");
  const diffYear = Math.round(diffMonth / 12);
  return rtf.format(diffYear, "year");
}
