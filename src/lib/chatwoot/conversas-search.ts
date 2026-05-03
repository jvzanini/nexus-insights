/**
 * Helper standalone para a cláusula de busca textual em /relatorios/conversas.
 *
 * NÃO entra em buildBaseFilter porque depende dos aliases `ct/ix/tm/u`
 * que só existem na query de conversas-list.ts. Outras 11 queries usam
 * o mesmo buildBaseFilter sem esses JOINs — adicionar a cláusula lá
 * quebraria essas queries.
 *
 * Aplica ILIKE com escape de wildcards (% / _ / \) e ESCAPE '\'.
 *
 * Caller (conversas-list.ts) é responsável por:
 *  - chamar este helper passando o paramOffset atual.
 *  - concatenar `sql` no WHERE com ` AND ` se sql não-vazio.
 *  - dar push de `params` no array de params.
 *
 * Status/prioridade entram no match via CASE WHEN — usuário pode digitar
 * "abert%" para filtrar status=0, "urg%" para priority=3, etc.
 */

import {
  STATUS_LABELS,
  PRIORITY_LABELS,
} from "@/lib/chatwoot/conversas-translations";

const SEARCH_MAX_LEN = 256;

export interface SearchClause {
  /** Fragmento SQL parametrizado (ou string vazia quando search vazio). */
  sql: string;
  /** Params a adicionar ao array (length 0 ou 1). */
  params: unknown[];
}

function sanitize(raw: string): string {
  // Escapa \, %, _ literais para uso com LIKE e ESCAPE '\'.
  // Ordem importa: \ primeiro, senão dupla-escapa.
  const escaped = raw
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return escaped.slice(0, SEARCH_MAX_LEN);
}

/**
 * Constrói a cláusula de busca textual.
 *
 * @deprecated v0.25.0 — busca migrou para client-side em
 * `src/lib/reports/match-search-client.ts`. Helper preservado para
 * compatibilidade dos tests existentes; não usar em novo código.
 *
 * @param search texto digitado pelo usuário (cap 256, sanitize aplicado).
 * @param paramOffset índice do último param já registrado pelo caller
 *                    (ex.: 5 → o próximo placeholder será $6).
 * @returns { sql, params } — concat no WHERE com ` AND ` quando sql não-vazio.
 */
export function buildConversasSearchClause(
  search: string | null | undefined,
  paramOffset: number,
): SearchClause {
  if (search == null) return { sql: "", params: [] };
  const trimmed = search.trim();
  if (!trimmed) return { sql: "", params: [] };

  const value = `%${sanitize(trimmed)}%`;
  const idx = paramOffset + 1;

  const statusCase = `CASE c.status ${Object.entries(STATUS_LABELS)
    .map(([k, v]) => `WHEN ${k} THEN '${v}'`)
    .join(" ")} ELSE '' END`;

  const priorityCase = `CASE c.priority ${Object.entries(PRIORITY_LABELS)
    .map(([k, v]) => `WHEN ${k} THEN '${v}'`)
    .join(" ")} ELSE '' END`;

  const sql = `(
    ct.name ILIKE $${idx} ESCAPE E'\\\\\\\\'
    OR ct.phone_number ILIKE $${idx} ESCAPE E'\\\\\\\\'
    OR ct.identifier ILIKE $${idx} ESCAPE E'\\\\\\\\'
    OR ix.name ILIKE $${idx} ESCAPE E'\\\\\\\\'
    OR tm.name ILIKE $${idx} ESCAPE E'\\\\\\\\'
    OR u.name ILIKE $${idx} ESCAPE E'\\\\\\\\'
    OR c.display_id::text ILIKE $${idx} ESCAPE E'\\\\\\\\'
    OR c.custom_attributes::text ILIKE $${idx} ESCAPE E'\\\\\\\\'
    OR EXISTS (
      SELECT 1 FROM taggings tg
      JOIN tags t ON t.id = tg.tag_id
      WHERE tg.taggable_id = c.id
        AND tg.taggable_type = 'Conversation'
        AND t.name ILIKE $${idx} ESCAPE E'\\\\\\\\'
    )
    OR (${statusCase}) ILIKE $${idx} ESCAPE E'\\\\\\\\'
    OR (${priorityCase}) ILIKE $${idx} ESCAPE E'\\\\\\\\'
  )`;

  return { sql, params: [value] };
}
