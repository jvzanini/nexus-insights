import { BarChart3, CalendarDays, Grid3x3 } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { DowBarChart } from "@/components/reports/dow-bar-chart";
import { Heatmap } from "@/components/reports/heatmap";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import { type PeriodKey } from "@/lib/reports/period";
import { resolvePeriod } from "@/lib/reports/resolve-period";
import { getCurrentUser } from "@/lib/auth";
import { volumetriaDow } from "@/lib/chatwoot/queries/volumetria-dow";
import { volumetriaHeatmap } from "@/lib/chatwoot/queries/volumetria-heatmap";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { getActiveAccountId } from "@/lib/reports/active-account";

export const metadata = { title: "Volumetria | Nexus Insights" };
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

  const [dowResult, heatmapResult] = await Promise.all([
    volumetriaDow({ accountId, filters }),
    volumetriaHeatmap({ accountId, filters }),
  ]);

  const stale = dowResult.stale || heatmapResult.stale;
  const cachedAt = dowResult.cachedAt ?? heatmapResult.cachedAt;

  const dowTotal = dowResult.data.reduce((acc, r) => acc + r.total, 0);
  const heatTotal = heatmapResult.data.reduce((acc, r) => acc + r.total, 0);

  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title="Volumetria"
        subtitle="Análise por dia e hora"
        actions={cachedAt ? <CachedBadge cachedAt={cachedAt} /> : null}
      />

      {stale ? <StaleBanner cachedAt={cachedAt} /> : null}

      <div className="mb-6">
        <PeriodSelectorUrl value={period} />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="rounded-2xl border border-border bg-muted/30 p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/10">
              <CalendarDays className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Volume por dia da semana
              </h2>
              <p className="text-xs text-muted-foreground">
                Conversas criadas agrupadas por dia da semana.
              </p>
            </div>
          </div>
          {dowTotal === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
              Sem dados no período selecionado.
            </div>
          ) : (
            <DowBarChart data={dowResult.data} />
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/10">
              <Grid3x3 className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Heatmap dia × hora
              </h2>
              <p className="text-xs text-muted-foreground">
                Intensidade do volume ao longo do dia (fuso America/Sao_Paulo).
              </p>
            </div>
          </div>
          {heatTotal === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              Sem dados no período selecionado.
            </div>
          ) : (
            <Heatmap data={heatmapResult.data} />
          )}
        </div>
      </div>
    </div>
  );
}
