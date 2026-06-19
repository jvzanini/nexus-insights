// Microcopy e formatação compartilhada dos filtros de Data e Duração em
// Conversas. Reaproveitada entre o bloco do modal, a frase-exemplo viva e os
// chips de filtros aplicados. Mantém a terminologia precisa (sem "≥"/"até"
// isolado) que o usuário pediu para evitar filtro errado.

import type {
  DateField,
  DurationFilter,
  DurationIndicator,
  DurationMode,
  DurationUnit,
} from "./filter-state";

export const DATE_FIELD_LABELS: Record<DateField, string> = {
  created: "Criado em",
  updated: "Última atualização em",
};

export const DATE_FIELD_HELP: Record<DateField, string> = {
  created:
    "Filtra pela data em que a conversa foi criada. Mostra apenas as que começaram no período, mesmo sem atividade depois.",
  updated:
    "Filtra pela data da última movimentação. Mostra tudo que teve atividade no período, mesmo conversas antigas.",
};

export const INDICATOR_LABELS: Record<DurationIndicator, string> = {
  waiting: "Sem resposta há",
  open: "Aberta há",
  stalled: "Parada há",
};

export const INDICATOR_HELP: Record<DurationIndicator, string> = {
  waiting:
    "Tempo desde a última mensagem do cliente sem o atendente responder. Só conversas não resolvidas em que o cliente foi o último a falar. Uma nota interna do atendente também encerra essa contagem.",
  open: "Tempo desde a última ação do atendente numa conversa ainda aberta. Normalmente aguardando retorno do cliente ou sem fechamento.",
  stalled:
    "Tempo desde a última movimentação, seja de quem for. Encontra conversas estagnadas/esquecidas, independente do status.",
};

export const MODE_LABELS: Record<DurationMode, string> = {
  gte: "no mínimo",
  lte: "no máximo",
  between: "entre",
};

/** Rótulo da unidade no select (mês/ano com a aproximação explícita). */
export const UNIT_SELECT_LABELS: Record<DurationUnit, string> = {
  minute: "minuto",
  hour: "hora",
  day: "dia",
  month: "mês (≈30 dias)",
  year: "ano (≈365 dias)",
};

const UNIT_NOUN: Record<DurationUnit, [string, string]> = {
  minute: ["minuto", "minutos"],
  hour: ["hora", "horas"],
  day: ["dia", "dias"],
  month: ["mês", "meses"],
  year: ["ano", "anos"],
};

const UNIT_DAYS_APPROX: Partial<Record<DurationUnit, number>> = {
  month: 30,
  year: 365,
};

export const EXACT_TIME_NOTE =
  "O filtro usa o tempo exato da conversa; a coluna mostra um valor arredondado para leitura.";

export const RESOLVED_WARN =
  '"Sem resposta há" e "Aberta há" só existem em conversas não resolvidas — conversas resolvidas não aparecem com este filtro.';

/** Status "Resolvida" no enum do Chatwoot. */
export const STATUS_RESOLVED_ID = 1;

/** Ex.: "10 minutos", "1 hora", "2 meses (≈60 dias)". */
export function formatQty(value: number, unit: DurationUnit): string {
  const [singular, plural] = UNIT_NOUN[unit];
  const noun = value === 1 ? singular : plural;
  const approxPerUnit = UNIT_DAYS_APPROX[unit];
  if (approxPerUnit) {
    return `${value} ${noun} (≈${value * approxPerUnit} dias)`;
  }
  return `${value} ${noun}`;
}

/** Ex.: "no mínimo 10 minutos" / "entre 5 minutos e 1 hora". */
export function describeDuration(df: DurationFilter): string {
  if (df.mode === "between" && df.valueEnd != null) {
    return `entre ${formatQty(df.value, df.unit)} e ${formatQty(
      df.valueEnd,
      df.unitEnd ?? df.unit,
    )}`;
  }
  return `${MODE_LABELS[df.mode]} ${formatQty(df.value, df.unit)}`;
}

/** Chip: "Sem resposta há: no mínimo 10 minutos". */
export function durationChipLabel(df: DurationFilter): string {
  return `${INDICATOR_LABELS[df.indicator]}: ${describeDuration(df)}`;
}

/** Frase-exemplo viva sob os controles. */
export function durationSentence(df: DurationFilter): string {
  return `Mostra conversas com "${INDICATOR_LABELS[df.indicator]} ${describeDuration(df)}".`;
}
