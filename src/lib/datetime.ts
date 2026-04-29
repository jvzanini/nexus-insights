// Helpers puros de datetime: leitura de timezone/locale da plataforma
// (via tabela `app_settings`) e cálculo de períodos respeitando o
// fuso horário configurado.
//
// Sem "use client" — pode ser importado tanto por Server Components
// quanto por Server Actions e libs server-only.

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

import { pgPool } from "@/lib/pg-pool";

// ---------------------------------------------------------------------------
// Cache in-memory das settings de plataforma (TTL 60s)
// ---------------------------------------------------------------------------

interface CachedValue {
  value: string;
  expiresAt: number;
}

const SETTINGS_CACHE = new Map<string, CachedValue>();
const CACHE_TTL_MS = 60_000; // 60s

const DEFAULT_TZ = "America/Sao_Paulo";
const DEFAULT_LOCALE = "pt-BR";

const KEY_TZ = "platform.timezone";
const KEY_LOCALE = "platform.locale";

/**
 * Lê uma setting de string da tabela `app_settings`.
 * Aceita tanto JSON string puro (ex.: `"America/Sao_Paulo"`) quanto
 * objeto JSON com a chave `value` (ex.: `{"value":"America/Sao_Paulo"}`).
 */
async function readSettingString(
  key: string,
  fallback: string,
): Promise<string> {
  const cached = SETTINGS_CACHE.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let value: string = fallback;
  try {
    const result = await pgPool.query<{ value: unknown }>(
      "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
      [key],
    );
    if (result.rowCount && result.rows[0]) {
      const raw = result.rows[0].value;
      if (typeof raw === "string" && raw.trim().length > 0) {
        value = raw;
      } else if (
        raw &&
        typeof raw === "object" &&
        "value" in (raw as Record<string, unknown>) &&
        typeof (raw as Record<string, unknown>).value === "string"
      ) {
        value = (raw as Record<string, string>).value;
      }
    }
  } catch (err) {
    // Em build-time ou se o banco não existir ainda, usamos o fallback.
    console.warn(`[datetime] Falha ao ler setting "${key}":`, err);
    value = fallback;
  }

  SETTINGS_CACHE.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/**
 * Retorna o timezone configurado da plataforma. Fallback: America/Sao_Paulo.
 */
export async function getPlatformTz(): Promise<string> {
  return readSettingString(KEY_TZ, DEFAULT_TZ);
}

/**
 * Retorna o locale configurado da plataforma. Fallback: pt-BR.
 */
export async function getPlatformLocale(): Promise<string> {
  return readSettingString(KEY_LOCALE, DEFAULT_LOCALE);
}

/**
 * Limpa o cache em memória das settings de plataforma.
 * Deve ser chamado após qualquer UPSERT em `app_settings`.
 */
export function invalidatePlatformSettings(): void {
  SETTINGS_CACHE.clear();
}

// ---------------------------------------------------------------------------
// Períodos calculados em fuso horário arbitrário
// ---------------------------------------------------------------------------

export type PeriodKey = "hoje" | "semana_atual" | "mes_atual" | "custom";

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface CustomRangeInput {
  start: Date;
  end: Date;
}

/**
 * Calcula o intervalo (em UTC) correspondente ao "dia/semana/mês" no
 * timezone informado. Para `semana_atual` é ISO week (segunda-feira).
 *
 * Para `custom`, recebe um range qualquer e ajusta para `startOfDay` /
 * `endOfDay` no tz informado, garantindo que o intervalo cubra os dias
 * inteiros nas pontas.
 */
export function getPeriodInTz(
  key: PeriodKey,
  tz: string,
  customRange?: CustomRangeInput,
): PeriodRange {
  // "Agora" no timezone informado: criamos um Date que, quando lido com
  // getFullYear/getMonth/getDate, devolve os componentes locais do tz.
  const nowUtc = new Date();
  const nowInTz = toZonedTime(nowUtc, tz);

  switch (key) {
    case "hoje": {
      // 00:00 do dia atual no tz → UTC; 23:59:59.999 do mesmo dia → UTC.
      const startLocal = startOfDay(nowInTz);
      const endLocal = endOfDay(nowInTz);
      return {
        start: fromZonedTime(startLocal, tz),
        end: fromZonedTime(endLocal, tz),
      };
    }

    case "semana_atual": {
      // ISO week: começa na segunda-feira. `weekStartsOn: 1`.
      const weekStartLocal = startOfWeek(nowInTz, { weekStartsOn: 1 });
      // Fim da semana = início da segunda seguinte − 1ms
      // Para manter consistência com [start, end exclusivo) usamos
      // a próxima segunda-feira como `end` (00:00 UTC equivalente).
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
      // Exhaustiveness check
      const _exhaustive: never = key;
      throw new Error(`getPeriodInTz: chave desconhecida "${String(_exhaustive)}"`);
    }
  }
}

// Helper exposto caso outros módulos precisem mover um Date "amanhã" no tz.
export function addDaysInTz(date: Date, tz: string, days: number): Date {
  const inTz = toZonedTime(date, tz);
  const moved = addDays(inTz, days);
  return fromZonedTime(moved, tz);
}

// ---------------------------------------------------------------------------
// Formatação com Intl
// ---------------------------------------------------------------------------

/**
 * Formata a porção de data via Intl.DateTimeFormat, aplicando timezone
 * e locale. Aceita opções extras pra customizar (ex.: weekday).
 */
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

/**
 * Formata data + hora via Intl.DateTimeFormat com tz e locale.
 */
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

/**
 * Devolve uma string relativa (ex.: "há 3 minutos") usando Intl.RelativeTimeFormat.
 * Usa diferença entre `d` e o "agora" do sistema; o tz é irrelevante para
 * tempo relativo, então só o locale é necessário.
 */
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
