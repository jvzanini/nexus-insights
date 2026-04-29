import { ListChecks, Inbox, CheckCircle2, Clock4, Moon } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { KpiCard } from "@/components/reports/kpi-card";
import { StatusPieChart } from "@/components/reports/status-pie-chart";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import { type PeriodKey } from "@/lib/reports/period";
import { resolvePeriod } from "@/lib/reports/resolve-period";
import { getCurrentUser } from "@/lib/auth";
import { statusDistribution } from "@/lib/chatwoot/queries/status-distribution";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { getActiveAccountId } from "@/lib/reports/active-account";

export const metadata = { title: "Status das conversas | Nexus Insights" };
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

  const result = await statusDistribution({
    accountId,
    filters,
  });

  const map = new Map<number, number>();
  for (const r of result.data) map.set(r.status, r.total);

  const open = map.get(0) ?? 0;
  const resolved = map.get(1) ?? 0;
  const pending = map.get(2) ?? 0;
  const snoozed = map.get(3) ?? 0;
  const total = open + resolved + pending + snoozed;

  return (
    <div>
      <PageHeader
        icon={ListChecks}
        title="Status das conversas"
        subtitle="Distribuição e backlog"
        actions={
          result.cachedAt ? <CachedBadge cachedAt={result.cachedAt} /> : null
        }
      />

      {result.stale ? <StaleBanner cachedAt={result.cachedAt} /> : null}

      <div className="mb-6">
        <PeriodSelectorUrl value={period} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Inbox}
          label="Em aberto"
          value={open.toLocaleString("pt-BR")}
          tone="warning"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Resolvidas"
          value={resolved.toLocaleString("pt-BR")}
          tone="success"
        />
        <KpiCard
          icon={Clock4}
          label="Pendentes"
          value={pending.toLocaleString("pt-BR")}
          tone="default"
        />
        <KpiCard
          icon={Moon}
          label="Adiadas"
          value={snoozed.toLocaleString("pt-BR")}
        />
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold tracking-tight">
            Distribuição por status
          </h2>
          <p className="text-xs text-muted-foreground">
            {total > 0
              ? `${total.toLocaleString("pt-BR")} conversas no período.`
              : "Sem dados no período."}
          </p>
        </div>

        {total === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Sem conversas no período selecionado.
          </div>
        ) : (
          <StatusPieChart data={result.data} />
        )}
      </div>
    </div>
  );
}
