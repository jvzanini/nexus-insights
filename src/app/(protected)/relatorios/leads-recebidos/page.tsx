import { Calendar, Sigma, TrendingUp, BarChart2 } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { KpiCard } from "@/components/reports/kpi-card";
import { LeadsLineChart } from "@/components/reports/leads-line-chart";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import { GranularitySelector } from "@/components/reports/granularity-selector";
import {
  getPeriod,
  type PeriodKey,
} from "@/components/reports/period-selector";
import { getCurrentUser } from "@/lib/auth";
import {
  leadsRecebidos,
  type Granularity,
} from "@/lib/chatwoot/queries/leads-recebidos";
import type { ReportFilters } from "@/lib/chatwoot/filters";

export const metadata = { title: "Leads recebidos | Nexus Insights" };
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

const VALID_GRANS: Granularity[] = ["day", "week", "month"];

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

  const granRaw =
    typeof sp.granularity === "string"
      ? (sp.granularity as Granularity)
      : null;
  const granularity: Granularity =
    granRaw && VALID_GRANS.includes(granRaw) ? granRaw : "day";

  const range = getPeriod(period);
  const filters: ReportFilters = { period: range };

  const result = await leadsRecebidos({
    accountId: ACCOUNT_ID,
    filters,
    granularity,
  });

  const total = result.data.reduce((acc, r) => acc + r.total, 0);

  // Média por bucket no período (não exatamente "média diária", mas
  // funciona em qualquer granularidade).
  const avg =
    result.data.length > 0
      ? Math.round((total / result.data.length) * 10) / 10
      : 0;

  const peak = result.data.reduce(
    (acc, r) => (r.total > acc ? r.total : acc),
    0,
  );

  return (
    <div>
      <PageHeader
        icon={Calendar}
        title="Leads recebidos"
        subtitle="Volume de leads por período"
        actions={
          result.cachedAt ? <CachedBadge cachedAt={result.cachedAt} /> : null
        }
      />

      {result.stale ? <StaleBanner cachedAt={result.cachedAt} /> : null}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <PeriodSelectorUrl value={period} />
        <GranularitySelector value={granularity} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          icon={Sigma}
          label="Total no período"
          value={total.toLocaleString("pt-BR")}
        />
        <KpiCard
          icon={TrendingUp}
          label={
            granularity === "day"
              ? "Média diária"
              : granularity === "week"
                ? "Média semanal"
                : "Média mensal"
          }
          value={avg.toLocaleString("pt-BR")}
        />
        <KpiCard
          icon={BarChart2}
          label="Pico no período"
          value={peak.toLocaleString("pt-BR")}
        />
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold tracking-tight">
            Volume ao longo do tempo
          </h2>
          <p className="text-xs text-muted-foreground">
            Conversas criadas por{" "}
            {granularity === "day"
              ? "dia"
              : granularity === "week"
                ? "semana"
                : "mês"}
            .
          </p>
        </div>
        {result.data.length === 0 || total === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Sem leads no período selecionado.
          </div>
        ) : (
          <LeadsLineChart data={result.data} granularity={granularity} />
        )}
      </div>
    </div>
  );
}
