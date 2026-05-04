import { CalendarDays, Grid3x3 } from "lucide-react";

import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { Heatmap } from "@/components/reports/heatmap";
import { InteractiveBarChart, EmptyChartState } from "@/components/charts";
import { ErrorState } from "@/components/error-state";
import { resolvePeriod } from "@/lib/reports/resolve-period";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import { volumetriaDow } from "@/lib/chatwoot/queries/volumetria-dow";
import { volumetriaHeatmap } from "@/lib/chatwoot/queries/volumetria-heatmap";
import type { ReportFilters } from "@/lib/chatwoot/filters";

import type { DashboardContentProps } from "./types";

const DOW_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export async function VolumetriaContent({
  connectionId,
  accountId,
  period,
  customStart,
  customEnd,
}: DashboardContentProps) {
  let dowResult;
  let heatmapResult;
  try {
    const { range } = await resolvePeriod({ period, customStart, customEnd });
    const excludeMatrixIA = await shouldExcludeMatrixIA();
    const filters: ReportFilters = { period: range, excludeMatrixIA };
    [dowResult, heatmapResult] = await Promise.all([
      volumetriaDow({ connectionId, accountId, filters }),
      volumetriaHeatmap({ connectionId, accountId, filters }),
    ]);
  } catch (err) {
    console.error("[VolumetriaContent] erro:", err);
    return (
      <ErrorState
        title="Não foi possível carregar Volumetria"
        message="Tente novamente em instantes ou ajuste o período selecionado."
      />
    );
  }

  const stale = dowResult.stale || heatmapResult.stale;
  const cachedAt = dowResult.cachedAt ?? heatmapResult.cachedAt;

  const dowTotal = dowResult.data.reduce((acc, r) => acc + r.total, 0);
  const heatTotal = heatmapResult.data.reduce((acc, r) => acc + r.total, 0);

  const dowChartData = dowResult.data.map((r) => ({
    name: DOW_LABEL[r.dow] ?? String(r.dow),
    Volume: r.total,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Volumetria</h2>
          <p className="text-xs text-muted-foreground">
            Volume por dia da semana e heatmap por hora.
          </p>
        </div>
        {cachedAt ? <CachedBadge cachedAt={cachedAt} /> : null}
      </div>

      {stale ? <StaleBanner cachedAt={cachedAt} /> : null}

      <div className="grid grid-cols-1 gap-6">
        <div className="rounded-2xl border border-border bg-muted/30 p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/10">
              <CalendarDays className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight">
                Volume por dia da semana
              </h3>
              <p className="text-xs text-muted-foreground">
                Conversas criadas agrupadas por dia da semana.
              </p>
            </div>
          </div>
          {dowTotal === 0 ? (
            <EmptyChartState
              message="Sem dados no período selecionado"
              height={260}
            />
          ) : (
            <InteractiveBarChart
              data={dowChartData}
              series={[{ key: "Volume", label: "Conversas" }]}
              height={260}
              ariaLabel="Volume por dia da semana"
            />
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/10">
              <Grid3x3 className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight">
                Heatmap dia × hora
              </h3>
              <p className="text-xs text-muted-foreground">
                Intensidade do volume ao longo do dia (fuso America/Sao_Paulo).
              </p>
            </div>
          </div>
          {heatTotal === 0 ? (
            <EmptyChartState
              message="Sem dados no período selecionado"
              height={200}
            />
          ) : (
            <Heatmap data={heatmapResult.data} />
          )}
        </div>
      </div>
    </div>
  );
}
