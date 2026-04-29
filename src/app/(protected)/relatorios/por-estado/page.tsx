import { Map, Inbox, BarChart3 } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import { type PeriodKey } from "@/lib/reports/period";
import { resolvePeriod } from "@/lib/reports/resolve-period";
import { RankingBarChart } from "@/components/reports/ranking-bar-chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import { porEstado } from "@/lib/chatwoot/queries/por-estado";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { formatDuration } from "@/lib/utils/format-time";
import { getActiveAccountId } from "@/lib/reports/active-account";

export const metadata = { title: "Por estado | Nexus Insights" };
export const dynamic = "force-dynamic";

const VALID_PERIODS: PeriodKey[] = [
  "hoje",
  "ontem",
  "7d",
  "30d",
  "mes_atual",
  "mes_anterior",
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Tenta extrair a sigla UF (2 letras) do nome da inbox.
 * Padrão esperado pelo cliente: "MG-Minas Gerais", "SP-São Paulo".
 * Fallback: primeiras 2 letras do nome em uppercase.
 */
function extractUf(inboxName: string): string {
  const match = inboxName.match(/^([A-Za-z]{2})\b/);
  if (match) return match[1]!.toUpperCase();
  return inboxName.slice(0, 2).toUpperCase();
}

export default async function Page({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const periodRaw =
    typeof sp.period === "string" ? (sp.period as PeriodKey) : null;
  const period: PeriodKey =
    periodRaw && VALID_PERIODS.includes(periodRaw) ? periodRaw : "30d";

  const customStart = typeof sp.custom_start === "string" ? sp.custom_start : null;
  const customEnd = typeof sp.custom_end === "string" ? sp.custom_end : null;
  const { range } = await resolvePeriod({
    period,
    customStart,
    customEnd,
  });
  const filters: ReportFilters = { period: range };

  const accountId = await getActiveAccountId();

  const result = await porEstado({
    accountId,
    filters,
  });

  const rows = result.data;
  const top10 = rows.slice(0, 10).map((r) => ({
    name: r.inboxName,
    volume: r.volume,
  }));

  return (
    <div>
      <PageHeader
        icon={Map}
        title="Por estado"
        subtitle="Distribuição geográfica"
        actions={
          result.cachedAt ? <CachedBadge cachedAt={result.cachedAt} /> : null
        }
      />

      {result.stale ? <StaleBanner cachedAt={result.cachedAt} /> : null}

      <div className="mb-6">
        <PeriodSelectorUrl value={period} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-muted/30 p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40">
            <Inbox className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium text-foreground">
            Sem estados com atividade no período
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajuste o período acima para ver outros resultados.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 rounded-2xl border border-border bg-muted/30 p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/10">
                <BarChart3 className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-tight">
                  Top 10 estados por volume
                </h2>
                <p className="text-xs text-muted-foreground">
                  Conversas por inbox no período.
                </p>
              </div>
            </div>
            <RankingBarChart data={top10} />
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 text-xs uppercase tracking-wide text-muted-foreground">
                    #
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                    Estado
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Volume
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                    Top atendente
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Tempo médio 1ª resposta
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => {
                  const uf = extractUf(row.inboxName);
                  return (
                    <TableRow key={row.inboxId} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="outline"
                            className="font-mono text-[11px]"
                          >
                            {uf}
                          </Badge>
                          <span className="truncate text-sm font-medium">
                            {row.inboxName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">
                          {row.volume.toLocaleString("pt-BR")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-300"
                            title="Abertas"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500/80" />
                            {row.open.toLocaleString("pt-BR")}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300"
                            title="Resolvidas"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
                            {row.resolved.toLocaleString("pt-BR")}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300"
                            title="Pendentes"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500/80" />
                            {row.pending.toLocaleString("pt-BR")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.topAgentName ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {row.avgFirstResponseSec
                          ? formatDuration(row.avgFirstResponseSec)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
