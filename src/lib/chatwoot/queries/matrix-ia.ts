/**
 * Métricas do canal automatizado "Matrix IA" (inbox_id = 31).
 *
 * Override do `excludeMatrixIA` — TODA query aqui força `inbox_id = 31`.
 * Apenas super_admin deve invocar (a tela checa antes).
 *
 * Live KPI — TTL 30s.
 *
 * Multi-tenant: usa `queryNexusChat(connectionId, sql, params)`.
 *
 * @canonical periodColumn=created (totalConversas/transferidas).
 *   "cliente_sem_resposta" usa last_classification_msg CTE canônica
 *   (status=open + última msg pública = incoming, ignorando system/template).
 */

import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import type { ReportFilters } from "../filters";
import {
  buildLastClassificationMsgCte,
  MSG_INCOMING,
} from "@/lib/reports/canonical";

const MATRIX_IA_INBOX_ID = 31;
const DEFAULT_TTL_SECONDS = 30;

export interface MatrixIaUltimaConversa {
  id: number;
  displayId: number;
  contactName: string | null;
  lastMessage: string | null;
  lastActivityAt: string;
  status: number;
}

export interface MatrixIaResult {
  totalConversas: number;
  cliente_sem_resposta: number;
  transferidas: number;
  p50RespostaIaSec: number | null;
  avgRespostaIaSec: number | null;
  ultimas10: MatrixIaUltimaConversa[];
}

type RowCount = {
  total: string;
} & Record<string, unknown>;

type RowTempos = {
  p50: string | null;
  avg: string | null;
} & Record<string, unknown>;

type RowUltima = {
  id: number;
  display_id: number;
  contact_name: string | null;
  last_message: string | null;
  last_activity_at: Date | null;
  status: number;
} & Record<string, unknown>;

export async function matrixIaMetrics(args: {
  connectionId: string;
  accountId: number;
  filters: ReportFilters;
  ttlSeconds?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  // Hash inclui filters mas a query força inbox_id=31, ignorando excludeMatrixIA.
  const key = cacheKey({
    scope: "report",
    name: "matrix-ia-canonical-v0.42",
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<MatrixIaResult>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<MatrixIaResult>(
        async () => {
          const periodStart = args.filters.period?.start ?? null;
          const periodEnd = args.filters.period?.end ?? null;

          // Total de conversas no inbox 31.
          // Aplicamos period.created_at se houver; senão é total all-time.
          const totalParams: unknown[] = [args.accountId, MATRIX_IA_INBOX_ID];
          let totalP = 2;
          let totalPeriodSql = "";
          if (periodStart) {
            totalPeriodSql += ` AND c.created_at >= $${++totalP}`;
            totalParams.push(periodStart);
          }
          if (periodEnd) {
            totalPeriodSql += ` AND c.created_at < $${++totalP}`;
            totalParams.push(periodEnd);
          }
          const sqlTotal = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.inbox_id = $2
              ${totalPeriodSql}
          `;

          // Cliente sem resposta da IA: status=open + última msg classificável é incoming
          // pública + last_activity > 5min. Usa CTE canônica (exclui system/template).
          const sqlSemResposta = `
            ${buildLastClassificationMsgCte()}
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            JOIN last_classification_msg lcm ON lcm.conversation_id = c.id
            WHERE c.account_id = $1
              AND c.inbox_id = $2
              AND c.status = 0
              AND c.last_activity_at < (now() - interval '5 minutes')
              AND lcm.message_type = ${MSG_INCOMING}
          `;

          // Transferidas: simplificação — conversas no inbox 31 com assignee_id != NULL e != 1
          // (Admin Chatwoot user_id=1). Heurística: se foi atribuída a alguém, foi transferida.
          const sqlTransferidas = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.inbox_id = $2
              AND c.assignee_id IS NOT NULL
              AND c.assignee_id <> 1
              ${totalPeriodSql}
          `;

          // p50/avg first_response no inbox 31 (reporting_events).
          const tempoParams: unknown[] = [args.accountId, MATRIX_IA_INBOX_ID];
          let tempoP = 2;
          let tempoPeriodSql = "";
          if (periodStart) {
            tempoPeriodSql += ` AND re.created_at >= $${++tempoP}`;
            tempoParams.push(periodStart);
          }
          if (periodEnd) {
            tempoPeriodSql += ` AND re.created_at < $${++tempoP}`;
            tempoParams.push(periodEnd);
          }
          const sqlTempos = `
            SELECT
              percentile_cont(0.5) WITHIN GROUP (ORDER BY re.value)::float AS p50,
              AVG(re.value)::float AS avg
            FROM reporting_events re
            WHERE re.account_id = $1
              AND re.inbox_id = $2
              AND re.name = 'first_response'
              AND re.value IS NOT NULL
              ${tempoPeriodSql}
          `;

          // Últimas 10 conversas do inbox 31, mais recentes primeiro.
          const sqlUltimas = `
            SELECT
              c.id,
              c.display_id,
              c.status,
              c.last_activity_at,
              ct.name AS contact_name,
              (SELECT m.content FROM messages m
                 WHERE m.conversation_id = c.id
                 ORDER BY m.created_at DESC
                 LIMIT 1) AS last_message
            FROM conversations c
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            WHERE c.account_id = $1
              AND c.inbox_id = $2
            ORDER BY c.last_activity_at DESC NULLS LAST, c.id DESC
            LIMIT 10
          `;

          const [
            totalRes,
            semRespostaRes,
            transferidasRes,
            temposRes,
            ultimasRes,
          ] = await Promise.all([
            queryNexusChat<RowCount>(args.connectionId, sqlTotal, totalParams),
            queryNexusChat<RowCount>(args.connectionId, sqlSemResposta, [
              args.accountId,
              MATRIX_IA_INBOX_ID,
            ]),
            queryNexusChat<RowCount>(
              args.connectionId,
              sqlTransferidas,
              totalParams,
            ),
            queryNexusChat<RowTempos>(
              args.connectionId,
              sqlTempos,
              tempoParams,
            ),
            queryNexusChat<RowUltima>(args.connectionId, sqlUltimas, [
              args.accountId,
              MATRIX_IA_INBOX_ID,
            ]),
          ]);

          const p50Raw = temposRes.rows[0]?.p50;
          const avgRaw = temposRes.rows[0]?.avg;

          const data: MatrixIaResult = {
            totalConversas: Number(totalRes.rows[0]?.total ?? 0),
            cliente_sem_resposta: Number(semRespostaRes.rows[0]?.total ?? 0),
            transferidas: Number(transferidasRes.rows[0]?.total ?? 0),
            p50RespostaIaSec:
              p50Raw === null || p50Raw === undefined
                ? null
                : Math.round(Number(p50Raw)),
            avgRespostaIaSec:
              avgRaw === null || avgRaw === undefined
                ? null
                : Math.round(Number(avgRaw)),
            ultimas10: ultimasRes.rows.map((r) => ({
              id: r.id,
              displayId: r.display_id,
              contactName: r.contact_name,
              lastMessage: r.last_message,
              lastActivityAt: r.last_activity_at
                ? r.last_activity_at.toISOString()
                : new Date(0).toISOString(),
              status: r.status,
            })),
          };
          return data;
        },
        { fallbackKey: key },
      ),
  });
}
