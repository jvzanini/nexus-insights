/**
 * Volumetria de conversas por dia da semana (DOW: 0=domingo … 6=sábado).
 * Histórico — TTL longo.
 *
 * MIGRAÇÃO M4 (pré-agregação):
 *  - Caminho preferido: lê de `chatwoot_facts_daily_by_account` via
 *    `readFactsDaily` e agrega DOW em JS.
 *  - Fallback: quando filtros por inbox/team/assignee/status/priority/label
 *    estão presentes (não suportados nas facts daily by_account), cai para
 *    a query original no Chatwoot.
 *
 * NOTA TZ: bucket_date está em America/Sao_Paulo (data civil local).
 * Para evitar virada de dia por offset (-3 h em SP), usa UTC noon ao
 * computar o DOW a partir do ISO date.
 */

import { getChatwootPool } from "../pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";
import { readFactsDaily } from "../facts";

export interface VolumetriaDowRow {
  dow: number;
  total: number;
}

const DEFAULT_TTL_SECONDS = 300;

interface RawRow {
  dow: string;
  total: string;
}

function shouldUseFacts(filters: ReportFilters): boolean {
  return (
    !filters.inboxIds?.length &&
    !filters.teamIds?.length &&
    !filters.assigneeIds?.length &&
    !filters.statuses?.length &&
    !filters.priorities?.length &&
    !filters.labelIds?.length
  );
}

function dowFromIsoDate(isoDate: string): number {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.getUTCDay();
}

export async function volumetriaDow(args: {
  accountId: number;
  filters: ReportFilters;
  ttlSeconds?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const key = cacheKey({
    scope: "report",
    name: "volumetria-dow",
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<VolumetriaDowRow[]>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<VolumetriaDowRow[]>(
        async () => {
          // ---------------------------------------------------------------
          // Caminho 1: facts (preferido)
          // ---------------------------------------------------------------
          if (
            shouldUseFacts(args.filters) &&
            args.filters.period?.start &&
            args.filters.period?.end
          ) {
            const rows = await readFactsDaily({
              accountId: args.accountId,
              start: args.filters.period.start,
              end: args.filters.period.end,
              excludeMatrixIA: args.filters.excludeMatrixIA ?? true,
            });

            const map = new Map<number, number>();
            for (const r of rows) {
              const dow = dowFromIsoDate(r.bucketDate);
              map.set(dow, (map.get(dow) ?? 0) + r.received);
            }
            return [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
              dow,
              total: map.get(dow) ?? 0,
            }));
          }

          // ---------------------------------------------------------------
          // Caminho 2: fallback Chatwoot
          // ---------------------------------------------------------------
          const pool = getChatwootPool();
          const { whereSql, params } = buildBaseFilter(
            args.filters,
            args.accountId,
          );
          const sql = `
            SELECT
              EXTRACT(DOW FROM (c.created_at AT TIME ZONE 'America/Sao_Paulo'))::int AS dow,
              COUNT(*)::bigint AS total
            FROM conversations c
            WHERE ${whereSql}
            GROUP BY 1
            ORDER BY 1
          `;
          const result = await pool.query<RawRow>(sql, params as unknown[]);
          const map = new Map<number, number>();
          for (const r of result.rows) {
            map.set(Number(r.dow), Number(r.total));
          }
          // Garante 0..6 mesmo sem dados.
          return [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
            dow,
            total: map.get(dow) ?? 0,
          }));
        },
        { fallbackKey: key },
      ),
  });
}
