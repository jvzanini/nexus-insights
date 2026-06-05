/**
 * Filtragem de conversas por localização (país e/ou estado) do contato.
 *
 * AND entre país e estado: ambas as listas ativas exigem que a row case nas duas
 * dimensões. Lista vazia desativa aquela dimensão. Rows com `country`/`estado`
 * nulo são excluídas quando a dimensão correspondente está ativa.
 * Listas vazias em ambas = sem filtro (retorna a mesma referência).
 */
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

export function matchLocation(
  rows: ConversaRow[],
  countries: string[],
  estados: string[],
): ConversaRow[] {
  if (!countries.length && !estados.length) return rows;
  return rows.filter(
    (r) =>
      (!countries.length || (r.contact.country != null && countries.includes(r.contact.country))) &&
      (!estados.length || (r.contact.estado != null && estados.includes(r.contact.estado))),
  );
}
