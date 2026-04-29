import { Trophy, Users, Crown, Clock, Inbox } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { KpiCard } from "@/components/reports/kpi-card";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import {
  getPeriod,
  type PeriodKey,
} from "@/lib/reports/period";
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
import { rankingAtendentes } from "@/lib/chatwoot/queries/ranking-atendentes";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { formatDuration } from "@/lib/utils/format-time";

export const metadata = { title: "Ranking de atendentes | Nexus Insights" };
export const dynamic = "force-dynamic";

const ACCOUNT_ID = 9;

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

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default async function Page({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const periodRaw =
    typeof sp.period === "string" ? (sp.period as PeriodKey) : null;
  const period: PeriodKey =
    periodRaw && VALID_PERIODS.includes(periodRaw) ? periodRaw : "30d";

  const range = getPeriod(period);
  const filters: ReportFilters = { period: range };

  const result = await rankingAtendentes({
    accountId: ACCOUNT_ID,
    filters,
    limit: 50,
  });

  const rows = result.data;
  const totalAtendentes = rows.length;
  const topAgent = rows[0] ?? null;

  const p50Values = rows
    .map((r) => r.p50FirstResponseSec)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const avgP50 =
    p50Values.length > 0
      ? Math.round(p50Values.reduce((a, b) => a + b, 0) / p50Values.length)
      : 0;

  const top10 = rows.slice(0, 10).map((r) => ({
    name: r.name ?? `User ${r.userId}`,
    volume: r.volume,
  }));

  return (
    <div>
      <PageHeader
        icon={Trophy}
        title="Ranking de atendentes"
        subtitle="Performance individual"
        actions={
          result.cachedAt ? <CachedBadge cachedAt={result.cachedAt} /> : null
        }
      />

      {result.stale ? <StaleBanner cachedAt={result.cachedAt} /> : null}

      <div className="mb-6">
        <PeriodSelectorUrl value={period} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          icon={Users}
          label="Total de atendentes"
          value={totalAtendentes.toLocaleString("pt-BR")}
          hint="atendentes ativos no período"
        />
        <KpiCard
          icon={Crown}
          label="Top atendente"
          value={topAgent?.name ?? "—"}
          hint={
            topAgent
              ? `${topAgent.volume.toLocaleString("pt-BR")} conversas`
              : "sem dados"
          }
        />
        <KpiCard
          icon={Clock}
          label="Tempo médio 1ª resposta"
          value={avgP50 > 0 ? formatDuration(avgP50) : "—"}
          hint="média dos p50 individuais"
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-muted/30 p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40">
            <Inbox className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium text-foreground">
            Sem atendentes com atividade no período
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajuste o período acima para ver outros resultados.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 rounded-2xl border border-border bg-muted/30 p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold tracking-tight">
                Top 10 atendentes por volume
              </h2>
              <p className="text-xs text-muted-foreground">
                Conversas atribuídas no período.
              </p>
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
                    Atendente
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Volume
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Resolvidas
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                    p50 1ª resposta
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={row.userId} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600/15 text-xs font-semibold text-violet-300">
                          {getInitials(row.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {row.name ?? `User ${row.userId}`}
                          </p>
                          {row.email ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {row.email}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">
                        {row.volume.toLocaleString("pt-BR")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {row.resolved.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {row.p50FirstResponseSec
                        ? formatDuration(row.p50FirstResponseSec)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
