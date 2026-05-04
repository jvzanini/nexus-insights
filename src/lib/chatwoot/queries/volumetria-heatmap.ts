/**
 * Heatmap de volumetria: dia da semana × hora do dia.
 * Histórico — TTL longo. Hora é convertida para America/Sao_Paulo.
 *
 * MIGRAÇÃO M4 (pré-agregação):
 *  - Caminho preferido: lê de `chatwoot_facts_hourly_by_account` via
 *    `readFactsHourly` e agrega (DOW × hour) em JS. Latência drasticamente
 *    menor (1-2 s → ~50 ms) para ranges longos.
 *  - Fallback: quando os filtros restringem por inbox/team (`inboxIds` /
 *    `teamIds`), as facts horárias atuais não têm essa granularidade ainda.
 *    Nesse caso caímos para a query original no Nexus Chat (multi-tenant
 *    via `queryNexusChat`).
 *
 * NOTA TZ: a tabela hourly armazena buckets em America/Sao_Paulo
 * (`bucket_date` é a data civil local; `bucket_hour` ∈ [0..23] local).
 * Logo, para computar DOW basta criar um Date a partir de `bucketDate`
 * em UTC noon — assim o dia civil não vira por offset (-3 h em SP).
 */

import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";
import { readFactsHourly } from "../facts";

export interface VolumetriaHeatmapRow {
  dow: number;
  hour: number;
  total: number;
}

const DEFAULT_TTL_SECONDS = 300;

type RawRow = {
  dow: string;
  hour: string;
  total: string;
} & Record<string, unknown>;

function shouldUseFacts(filters: ReportFilters): boolean {
  // Facts hourly só estão no nível by_account. Qualquer restrição por inbox
  // ou team força fallback. statuses/priorities/labels/assignees também não
  // existem em facts → fallback.
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
  // UTC noon evita virada de dia por offset; "YYYY-MM-DD" → DOW (0..6).
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.getUTCDay();
}

export async function volumetriaHeatmap(args: {
  connectionId: string;
  accountId: number;
  filters: ReportFilters;
  ttlSeconds?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const key = cacheKey({
    scope: "report",
    name: "volumetria-heatmap",
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<VolumetriaHeatmapRow[]>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<VolumetriaHeatmapRow[]>(
        async () => {
          // ---------------------------------------------------------------
          // Caminho 1: facts (preferido)
          // ---------------------------------------------------------------
          if (
            shouldUseFacts(args.filters) &&
            args.filters.period?.start &&
            args.filters.period?.end
          ) {
            const rows = await readFactsHourly({
              accountId: args.accountId,
              start: args.filters.period.start,
              end: args.filters.period.end,
              excludeMatrixIA: args.filters.excludeMatrixIA ?? true,
            });

            const map = new Map<string, number>();
            for (const r of rows) {
              const dow = dowFromIsoDate(r.bucketDate);
              const hour = r.bucketHour;
              const k = `${dow}:${hour}`;
              map.set(k, (map.get(k) ?? 0) + r.received);
            }
            const out: VolumetriaHeatmapRow[] = [];
            for (const [k, total] of map) {
              const [dow, hour] = k.split(":").map(Number);
              out.push({ dow, hour, total });
            }
            // Ordena (dow, hour) para saída estável.
            out.sort((a, b) =>
              a.dow !== b.dow ? a.dow - b.dow : a.hour - b.hour,
            );
            return out;
          }

          // ---------------------------------------------------------------
          // Caminho 2: fallback Nexus Chat (multi-tenant)
          // ---------------------------------------------------------------
          const { whereSql, params } = buildBaseFilter(
            args.filters,
            args.accountId,
          );
          const sql = `
            SELECT
              EXTRACT(DOW  FROM (c.created_at AT TIME ZONE 'America/Sao_Paulo'))::int AS dow,
              EXTRACT(HOUR FROM (c.created_at AT TIME ZONE 'America/Sao_Paulo'))::int AS hour,
              COUNT(*)::bigint AS total
            FROM conversations c
            WHERE ${whereSql}
            GROUP BY 1, 2
            ORDER BY 1, 2
          `;
          const result = await queryNexusChat<RawRow>(
            args.connectionId,
            sql,
            params as unknown[],
          );
          return result.rows.map((r) => ({
            dow: Number(r.dow),
            hour: Number(r.hour),
            total: Number(r.total),
          }));
        },
        { fallbackKey: key },
      ),
  });
}
