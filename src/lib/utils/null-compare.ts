/**
 * Comparators que tratam corretamente valores nulos/ausentes em ordenação.
 *
 * Regras:
 * - `nullableNumberCompare`: null é tratado como **valor mínimo**. No asc,
 *   nulls aparecem primeiro; no desc (multiplicando por -1), nulls vão para o
 *   fim. Comportamento simétrico, ideal para colunas onde null = "ainda não
 *   medido / sem dado" (ex.: tempos `waiting_seconds`, `open_seconds`).
 * - `nullableStringCompare` e `nullableDateCompare`: null vai sempre para o
 *   fim (asc), seguindo a convenção tradicional de planilhas para textos.
 *
 * Os retornos seguem a convenção `Array.sort`: negativo se a < b, zero se
 * iguais, positivo se a > b. Não normalizam para `-1/0/1` porque diferenças
 * numéricas são úteis para ordenação estável.
 */

export function nullableNumberCompare(
  a: number | null,
  b: number | null,
): number {
  if (a === b) return 0;
  // null é o menor possível: null vem antes de qualquer número no asc.
  if (a == null) return -1;
  if (b == null) return 1;
  return a - b;
}

export function nullableStringCompare(
  a: string | null,
  b: string | null,
): number {
  // string vazia é equivalente a ausência para fins de UX em listas.
  const av = a === "" ? null : a;
  const bv = b === "" ? null : b;
  if (av === bv) return 0;
  // null vai para o fim no asc (convenção planilha).
  if (av == null) return 1;
  if (bv == null) return -1;
  return av.localeCompare(bv, "pt-BR", { numeric: true, sensitivity: "base" });
}

export function nullableDateCompare(
  a: string | null,
  b: string | null,
): number {
  const av = a ? new Date(a).getTime() : Number.NaN;
  const bv = b ? new Date(b).getTime() : Number.NaN;
  const aInvalid = Number.isNaN(av);
  const bInvalid = Number.isNaN(bv);
  if (aInvalid && bInvalid) return 0;
  // datas null/inválidas vão para o fim no asc.
  if (aInvalid) return 1;
  if (bInvalid) return -1;
  return av - bv;
}
