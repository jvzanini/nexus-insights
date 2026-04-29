import { Building2, Inbox, BarChart3 } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import {
  getPeriod,
  type PeriodKey,
} from "@/lib/reports/period";
import { DepartamentoBarChart } from "@/components/reports/departamento-bar-chart";
import { getCurrentUser } from "@/lib/auth";
import { porDepartamento } from "@/lib/chatwoot/queries/por-departamento";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { formatDuration } from "@/lib/utils/format-time";
import { cn } from "@/lib/utils";
import { getActiveAccountId } from "@/lib/reports/active-account";

export const metadata = { title: "Por departamento | Nexus Insights" };
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

interface MiniDistributionBarProps {
  open: number;
  resolved: number;
  pending: number;
}

function MiniDistributionBar({
  open,
  resolved,
  pending,
}: MiniDistributionBarProps) {
  const total = open + resolved + pending;
  if (total === 0) {
    return (
      <div className="h-1.5 w-full rounded-full bg-muted/40" aria-hidden />
    );
  }
  const pOpen = (open / total) * 100;
  const pResolved = (resolved / total) * 100;
  const pPending = (pending / total) * 100;
  return (
    <div
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/40"
      aria-label="Distribuição open/resolved/pending"
    >
      {pOpen > 0 ? (
        <div
          className="h-full bg-blue-500/70"
          style={{ width: `${pOpen}%` }}
        />
      ) : null}
      {pResolved > 0 ? (
        <div
          className="h-full bg-emerald-500/70"
          style={{ width: `${pResolved}%` }}
        />
      ) : null}
      {pPending > 0 ? (
        <div
          className="h-full bg-amber-500/70"
          style={{ width: `${pPending}%` }}
        />
      ) : null}
    </div>
  );
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

  const accountId = await getActiveAccountId();

  const result = await porDepartamento({
    accountId,
    filters,
  });

  const rows = result.data;
  const chartData = rows.map((r) => ({
    name: r.teamName,
    volume: r.volume,
  }));

  return (
    <div>
      <PageHeader
        icon={Building2}
        title="Por departamento"
        subtitle="Métricas por equipe"
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
            Sem departamentos com atividade no período
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Conversas sem `team_id` não são contabilizadas. Ajuste o período
            para ver outros resultados.
          </p>
        </div>
      ) : (
        <>
          <div
            className={cn(
              "mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2",
              rows.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
            )}
          >
            {rows.map((row) => (
              <div
                key={row.teamId}
                className="rounded-2xl border border-border bg-muted/30 p-5 transition-colors hover:border-foreground/20"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold tracking-tight">
                      {row.teamName}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {row.volume.toLocaleString("pt-BR")} conversas
                    </p>
                  </div>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600/10">
                    <Building2 className="h-4 w-4 text-violet-400" />
                  </div>
                </div>

                <div className="mb-3">
                  <MiniDistributionBar
                    open={row.open}
                    resolved={row.resolved}
                    pending={row.pending}
                  />
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-muted-foreground">
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-500/70 align-middle" />
                      Abertas {row.open.toLocaleString("pt-BR")}
                    </span>
                    <span className="text-muted-foreground">
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500/70 align-middle" />
                      Resolvidas {row.resolved.toLocaleString("pt-BR")}
                    </span>
                    <span className="text-muted-foreground">
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500/70 align-middle" />
                      Pendentes {row.pending.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>

                <div className="border-t border-border/60 pt-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    1ª resposta (média)
                  </p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums">
                    {row.avgFirstResponseSec
                      ? formatDuration(row.avgFirstResponseSec)
                      : "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/10">
                <BarChart3 className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-tight">
                  Volume por departamento
                </h2>
                <p className="text-xs text-muted-foreground">
                  Comparativo de conversas no período.
                </p>
              </div>
            </div>
            <DepartamentoBarChart data={chartData} />
          </div>
        </>
      )}
    </div>
  );
}
