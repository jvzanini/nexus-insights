// Wrapper de compatibilidade do antigo módulo de períodos.
//
// A fonte canônica agora é `@/lib/datetime`, que calcula tudo em UTC
// considerando o timezone configurado da plataforma (tabela `app_settings`).
//
// Mantemos exports legados (`getPeriod`, `PeriodKey` estendido, etc.)
// para preservar consumidores existentes enquanto a migração acontece.

import {
  getPeriodInTz,
  type PeriodKey as NewPeriodKey,
  type PeriodRange,
  type CustomRangeInput,
} from "@/lib/datetime-core";

// Tipo estendido: une as 4 chaves novas (canônicas) com chaves legadas
// que ainda são referenciadas em páginas/componentes existentes.
// As chaves novas devem ser preferidas em código novo.
export type PeriodKey =
  | NewPeriodKey
  | "ontem"
  | "7d"
  | "30d"
  | "mes_anterior";

// Re-export do helper canônico em UTC + tipos auxiliares.
export { getPeriodInTz };
export type { PeriodRange, CustomRangeInput };

// As 5 opções "canônicas" exibidas aos usuários (inclui "Todos" — sem corte).
export const PERIOD_OPTIONS: Array<{ key: NewPeriodKey; label: string }> = [
  { key: "hoje", label: "Hoje" },
  { key: "semana_atual", label: "Esta semana" },
  { key: "mes_atual", label: "Este mês" },
  { key: "todos", label: "Todos" },
  { key: "custom", label: "Personalizado" },
];

// Conjunto de chaves consideradas válidas no runtime.
// Atenção: somente as 5 canônicas. As chaves legadas continuam aceitas
// pelo *tipo* (compat estática), mas `isPeriodKey` rejeita strings legadas.
export const VALID_PERIODS = new Set<NewPeriodKey>([
  "hoje",
  "semana_atual",
  "mes_atual",
  "todos",
  "custom",
]);

export function isPeriodKey(value: unknown): value is NewPeriodKey {
  return (
    typeof value === "string" && VALID_PERIODS.has(value as NewPeriodKey)
  );
}

/**
 * @deprecated Use `getPeriodInTz(key, tz, customRange?)` de `@/lib/datetime`.
 *
 * Wrapper síncrono que calcula o período usando o timezone padrão
 * (`America/Sao_Paulo`). Mantido apenas para Server Components legados
 * que ainda não passaram a aguardar `getPlatformTz()`.
 *
 * Para chaves legadas (`ontem` / `7d` / `30d` / `mes_anterior`), usamos
 * cálculos baseados em `Date` local do servidor, idênticos à versão antiga,
 * pra preservar comportamento durante a migração.
 */
export function getPeriod(key: PeriodKey): PeriodRange {
  if (isPeriodKey(key)) {
    return getPeriodInTz(key, "America/Sao_Paulo");
  }

  // Fallback legado: replica o comportamento histórico (Date local do server).
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  switch (key) {
    case "ontem": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 1);
      return { start, end: startOfToday };
    }
    case "7d": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 6);
      return { start, end: endOfToday };
    }
    case "30d": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 29);
      return { start, end: endOfToday };
    }
    case "mes_anterior": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start, end };
    }
    default: {
      // Não deveria acontecer (todas as chaves legadas estão acima).
      return getPeriodInTz("hoje", "America/Sao_Paulo");
    }
  }
}
