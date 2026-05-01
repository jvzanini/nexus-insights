/**
 * Filter builder para queries no banco do Chatwoot (read-only).
 *
 * Toda query parte deste builder para garantir:
 *  - Scope obrigatório por `account_id` (multi-tenant guard).
 *  - Exclusão default da inbox `Matrix IA` (id=MATRIX_IA_INBOX_ID), salvo override.
 *  - Filtros opcionais cruzados (estado/inbox, departamento/team, atendente, status, prioridade, label, período).
 *  - Uso 100% parametrizado para evitar SQL injection.
 *
 * Os JOINs mais pesados (taggings) usam EXISTS para evitar full-scan em
 * `cached_label_list` em conversations.
 */

import { MATRIX_IA_INBOX_ID } from "@/lib/constants/matrix-ia";

export interface ReportFilters {
  inboxIds?: number[];
  teamIds?: number[];
  assigneeIds?: number[];
  /** 0=open, 1=resolved, 2=pending, 3=snoozed (Chatwoot enum). */
  statuses?: number[];
  /** 0=low, 1=medium, 2=high, 3=urgent (Chatwoot enum em conversations.priority). */
  priorities?: number[];
  labelIds?: number[];
  period?: { start: Date; end: Date };
  /** Default `true` — exclui Matrix IA (inbox 31). Super admin pode passar `false`. */
  excludeMatrixIA?: boolean;
  /**
   * Texto de busca livre (ILIKE em nome, WhatsApp, documento, estado, departamento,
   * atendente, status texto, prioridade texto, etiquetas, atributos). Aplicado
   * apenas em conversas-list.ts via buildConversasSearchClause.
   */
  search?: string;
}

export interface BuiltFilter {
  whereSql: string;
  params: unknown[];
}

/**
 * Constrói cláusula WHERE parametrizada para `conversations c`.
 * Sempre inclui `c.account_id = $1` e (por default) `c.inbox_id <> 31`.
 */
export function buildBaseFilter(
  filters: ReportFilters,
  accountId: number,
): BuiltFilter {
  const parts: string[] = [];
  const params: unknown[] = [];
  let p = 0;

  parts.push(`c.account_id = $${++p}`);
  params.push(accountId);

  if (filters.excludeMatrixIA !== false) {
    parts.push(`c.inbox_id <> ${MATRIX_IA_INBOX_ID}`);
  }

  if (filters.inboxIds?.length) {
    parts.push(`c.inbox_id = ANY($${++p})`);
    params.push(filters.inboxIds);
  }
  if (filters.teamIds?.length) {
    parts.push(`c.team_id = ANY($${++p})`);
    params.push(filters.teamIds);
  }
  if (filters.assigneeIds?.length) {
    parts.push(`c.assignee_id = ANY($${++p})`);
    params.push(filters.assigneeIds);
  }
  if (filters.statuses?.length) {
    parts.push(`c.status = ANY($${++p})`);
    params.push(filters.statuses);
  }
  if (filters.priorities?.length) {
    parts.push(`c.priority = ANY($${++p})`);
    params.push(filters.priorities);
  }

  if (filters.period?.start) {
    parts.push(`c.created_at >= $${++p}`);
    params.push(filters.period.start);
  }
  if (filters.period?.end) {
    parts.push(`c.created_at < $${++p}`);
    params.push(filters.period.end);
  }

  if (filters.labelIds?.length) {
    parts.push(
      `EXISTS (
        SELECT 1 FROM taggings t
        WHERE t.taggable_id = c.id
          AND t.taggable_type = 'Conversation'
          AND t.tag_id = ANY($${++p})
      )`,
    );
    params.push(filters.labelIds);
  }

  return { whereSql: parts.join(" AND "), params };
}
