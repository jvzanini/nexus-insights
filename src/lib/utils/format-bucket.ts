import { DEFAULT_TZ } from "@/lib/datetime-core";

export type BucketGranularity = "hour" | "day";

/**
 * Formata um timestamp ISO como label de bucket no timezone especificado.
 *
 * Necessário porque `Date.prototype.toLocaleTimeString()` usa o TZ do runtime
 * (servidor ou navegador), o que produzia "15:00" para um bucket de 13:00 BRT
 * quando o navegador do operador estava em outra TZ.
 */
export function formatBucketLabel(
  iso: string,
  granularity: BucketGranularity,
  tz: string,
): string {
  const date = new Date(iso);
  const timeZone = tz && tz.length > 0 ? tz : DEFAULT_TZ;

  if (granularity === "hour") {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(date);
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
  }).format(date);
}
