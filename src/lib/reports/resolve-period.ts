// Helper compartilhado pelas pages de relatórios para resolver o período
// (chave + custom range opcional) em um intervalo UTC respeitando o
// timezone configurado da plataforma.
//
// Compatibilidade:
//  - Aceita as 4 chaves canônicas (`hoje`, `semana_atual`, `mes_atual`, `custom`).
//  - Para chaves legadas (`ontem`, `7d`, `30d`, `mes_anterior`) ou strings
//    desconhecidas, faz fallback para `hoje`. URLs antigas continuam
//    funcionando, apenas mostram o dia corrente — comportamento documentado
//    na spec da migração.
//  - Se `period === "custom"` mas o range não foi informado/é inválido,
//    cai no default `hoje` em vez de lançar.

import {
  getPeriodInTz,
  getPlatformTz,
  type PeriodKey as CanonicalPeriodKey,
  type PeriodRange,
} from "@/lib/datetime";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface ResolvePeriodInput {
  /** Valor cru de `?period=` (qualquer string ou null). */
  period: string | null | undefined;
  /** Valor cru de `?custom_start=` (yyyy-mm-dd). */
  customStart?: string | null;
  /** Valor cru de `?custom_end=` (yyyy-mm-dd). */
  customEnd?: string | null;
}

export interface ResolvedPeriod {
  /** Chave canônica resolvida (sempre uma das 4). */
  key: CanonicalPeriodKey;
  /** Intervalo UTC pronto para passar a `ReportFilters.period`. */
  range: PeriodRange;
}

function toCanonical(period: string | null | undefined): CanonicalPeriodKey {
  if (
    period === "hoje" ||
    period === "semana_atual" ||
    period === "mes_atual" ||
    period === "todos" ||
    period === "custom"
  ) {
    return period;
  }
  return "hoje";
}

/**
 * Lê chave de período (potencialmente legada) e custom range opcional,
 * e devolve o intervalo UTC respeitando o timezone da plataforma.
 */
export async function resolvePeriod(
  input: ResolvePeriodInput,
): Promise<ResolvedPeriod> {
  const tz = await getPlatformTz();

  let key = toCanonical(input.period);

  let customRange: { start: Date; end: Date } | undefined;
  if (
    key === "custom" &&
    input.customStart &&
    input.customEnd &&
    ISO_DATE_RE.test(input.customStart) &&
    ISO_DATE_RE.test(input.customEnd)
  ) {
    customRange = {
      start: new Date(input.customStart),
      end: new Date(input.customEnd),
    };
  } else if (key === "custom") {
    // custom sem range válido → fallback hoje (não lança).
    key = "hoje";
  }

  const range = getPeriodInTz(key, tz, customRange);
  return { key, range };
}
