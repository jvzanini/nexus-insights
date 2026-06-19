/**
 * Glossário canônico de dados — única fonte da verdade para semântica de
 * período, status, tipo de mensagem, exclusão de Matrix IA e CTEs comuns.
 *
 * Toda query nova ou alterada DEVE consumir estes helpers. Toda definição
 * informal espalhada (cláusulas inline, message_type filter ad-hoc, literais
 * de inbox 31) é dívida técnica.
 *
 * Regras (ver docs/runbooks/canonical-data-rules.md):
 *  - Filtro de período padrão é "active": c.last_activity_at (sem COALESCE
 *    para preservar índice — Chatwoot atual tem last_activity_at NOT NULL).
 *  - "Recebidas" é o ÚNICO recorte que filtra por created_at.
 *  - "Sem resposta" / "Aberta há" usam CTEs canônicas (last_classification_msg,
 *    last_incoming_public_msg, last_outgoing_any_msg) — nunca subqueries ad-hoc.
 *  - Matrix IA é o inbox id 31; usa apenas helpers chatwootMatrixIa*Clause.
 */

import { MATRIX_IA_INBOX_ID } from "@/lib/constants/matrix-ia";

export type PeriodColumn = "active" | "created" | "active_public";

/** Status enum do Chatwoot (canônico). */
export const STATUS_OPEN = 0;
export const STATUS_RESOLVED = 1;
export const STATUS_PENDING = 2;
export const STATUS_SNOOZED = 3;

/** Tipos de mensagem do Chatwoot (canônico). */
export const MSG_INCOMING = 0;
export const MSG_OUTGOING = 1;
export const MSG_ACTIVITY = 2;
export const MSG_TEMPLATE = 3;

/**
 * Cláusula SQL para "conversas com movimentação no período".
 * Usa coluna pura (sem COALESCE) para preservar índice em last_activity_at.
 * Schema do Chatwoot atual mantém last_activity_at NOT NULL desde a criação.
 * Se algum dia provar-se NULL, abrir issue separada — fix será voltar para
 * COALESCE + criar índice em expressão (requer permissão de escrita no
 * Chatwoot, que hoje não temos).
 */
export function buildActivePeriodClause(params: {
  start: number;
  end: number;
}): string {
  return `c.last_activity_at >= $${params.start} AND c.last_activity_at < $${params.end}`;
}

/** Cláusula SQL para "conversas criadas no período" (apenas KPI Recebidas). */
export function buildCreatedPeriodClause(params: {
  start: number;
  end: number;
}): string {
  return `c.created_at >= $${params.start} AND c.created_at < $${params.end}`;
}

/**
 * Cláusula SQL para "conversas com MENSAGEM PÚBLICA no período".
 *
 * Diferente de `active` (que usa `c.last_activity_at`, atualizado pelo Chatwoot
 * em QUALQUER evento — inclusive mensagens de sistema/atividade e mudanças de
 * status), este recorte considera apenas movimentação real de pessoas: mensagem
 * do cliente (incoming) ou do atendente (outgoing) PÚBLICA. Exclui:
 *  - mensagens de sistema/atividade (`message_type=2`) e templates (`=3`);
 *  - notas privadas (`private = TRUE`).
 *
 * Usa `EXISTS` correlacionado (sem CTE/JOIN) para não afetar cursor, count nem
 * ordenação de quem consome o `buildBaseFilter`.
 */
export function buildActivePublicPeriodClause(params: {
  start: number;
  end: number;
}): string {
  return `EXISTS (
    SELECT 1 FROM messages m
    WHERE m.conversation_id = c.id
      AND m.message_type IN (${MSG_INCOMING}, ${MSG_OUTGOING})
      AND m.private = FALSE
      AND m.created_at >= $${params.start} AND m.created_at < $${params.end}
  )`;
}

/** Helper para excluir Matrix IA. Default da plataforma. */
export function chatwootMatrixIaClause(excludeMatrixIA: boolean): string {
  return excludeMatrixIA ? `AND c.inbox_id <> ${MATRIX_IA_INBOX_ID}` : "";
}

/** Helper inverso: restringe à Matrix IA (apenas para queries do relatório dedicado). */
export function chatwootMatrixIaOnlyClause(): string {
  return `AND c.inbox_id = ${MATRIX_IA_INBOX_ID}`;
}

/**
 * CTE `last_classification_msg`: última mensagem usada para classificar uma
 * conversa entre "sem resposta" (incoming público) e "aberta há" (outgoing
 * qualquer privacidade).
 *
 * Inclui:
 *  - incoming pública (`message_type=0 AND private=FALSE`) — cliente falou.
 *  - outgoing qualquer privacidade (`message_type=1`) — agente movimentou
 *    (mesmo via nota privada, conta como atividade interna).
 * Exclui:
 *  - incoming privadas (raras/inexistentes; cliente não manda privadas).
 *  - mensagens de sistema (`message_type=2`) e templates outbound puramente
 *    automáticos (`message_type=3`) — não representam movimento humano.
 */
export function buildLastClassificationMsgCte(): string {
  return `
    WITH last_classification_msg AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        m.created_at AS msg_created_at,
        m.message_type,
        m.private
      FROM messages m
      WHERE m.message_type IN (${MSG_INCOMING}, ${MSG_OUTGOING})
        AND NOT (m.message_type = ${MSG_INCOMING} AND m.private = TRUE)
      ORDER BY m.conversation_id, m.created_at DESC
    )
  `;
}

/**
 * CTE `last_incoming_public_msg`: última mensagem do cliente que foi PÚBLICA.
 * Usado para `waiting_seconds = NOW() - last_incoming_public_msg.created_at`.
 */
export function buildLastIncomingPublicMsgCte(): string {
  return `
    WITH last_incoming_public_msg AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        m.created_at AS msg_created_at
      FROM messages m
      WHERE m.message_type = ${MSG_INCOMING}
        AND m.private = FALSE
      ORDER BY m.conversation_id, m.created_at DESC
    )
  `;
}

/**
 * CTE `last_outgoing_any_msg`: última mensagem do agente, pública OU privada.
 * Usado para `open_seconds = NOW() - last_outgoing_any_msg.created_at`.
 */
export function buildLastOutgoingAnyMsgCte(): string {
  return `
    WITH last_outgoing_any_msg AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        m.created_at AS msg_created_at
      FROM messages m
      WHERE m.message_type = ${MSG_OUTGOING}
      ORDER BY m.conversation_id, m.created_at DESC
    )
  `;
}
