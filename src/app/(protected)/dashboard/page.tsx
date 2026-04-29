import {
  Activity,
  Building2,
  CheckCircle2,
  Clock,
  Home,
  MessageSquare,
  TrendingUp,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import { KpiClickable } from "@/components/dashboard/kpi-clickable";
import { Top5Card } from "@/components/dashboard/top5-card";
import { dashboardKpis } from "@/lib/chatwoot/queries/dashboard-kpis";
import { resolvePeriod } from "@/lib/reports/resolve-period";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { getCurrentUser } from "@/lib/auth";
import { type PeriodKey, isPeriodKey } from "@/lib/reports/period";
import { formatDuration } from "@/lib/utils/format-time";
import type { ReportFilters } from "@/lib/chatwoot/filters";

export const metadata = { title: "Dashboard | Nexus Insights" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const DEFAULT_PERIOD: PeriodKey = "30d";

export default async function DashboardPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const accountId = await getActiveAccountId();

  const sp = await searchParams;
  const periodRaw = typeof sp.period === "string" ? sp.period : null;
  const period: PeriodKey = isPeriodKey(periodRaw)
    ? periodRaw
    : DEFAULT_PERIOD;
  const customStart =
    typeof sp.custom_start === "string" ? sp.custom_start : null;
  const customEnd = typeof sp.custom_end === "string" ? sp.custom_end : null;

  const { range } = await resolvePeriod({
    period,
    customStart,
    customEnd,
  });

  const filters: ReportFilters = { period: range };
  const result = await dashboardKpis({ accountId, filters });
  const kpis = result.data;

  return (
    <div>
      <PageHeader
        icon={Home}
        title="Dashboard"
        subtitle="Visão operacional em tempo real"
        actions={
          result.cachedAt ? <CachedBadge cachedAt={result.cachedAt} /> : null
        }
      />

      {result.stale ? <StaleBanner cachedAt={result.cachedAt} /> : null}

      <div className="mb-6">
        <PeriodSelectorUrl value={period} />
      </div>

      {/* Linha 1: KPIs operacionais clicáveis */}
      <section
        aria-label="Indicadores operacionais"
        className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiClickable
          title="Em Aberto"
          value={kpis.emAberto}
          icon={Activity}
          variant="neutral"
          badge="agora"
          href="/relatorios/conversas?statuses=0"
        />
        <KpiClickable
          title="Pendentes"
          value={kpis.pendentes}
          icon={Clock}
          variant="warning"
          badge="agora"
          href="/relatorios/conversas?statuses=2"
        />
        <KpiClickable
          title="Resolvidas no período"
          value={kpis.resolvidasNoPeriodo}
          icon={CheckCircle2}
          variant="success"
          badge="no período"
          href={`/relatorios/conversas?statuses=1&period=${encodeURIComponent(period)}`}
        />
        <KpiClickable
          title="Mensagens não respondidas"
          value={kpis.mensagensNaoRespondidas}
          icon={MessageSquare}
          variant="urgent"
          badge="agora"
          href="/relatorios/conversas?statuses=0"
        />
      </section>

      {/* Linha 2: Top 5 */}
      <section
        aria-label="Top 5 destaques"
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
      >
        <Top5Card
          title="Atendentes mais rápidos"
          subtitle="Tempo médio de 1ª resposta no período"
          icon={TrendingUp}
          items={kpis.topAtendentesRapidos.map((a) => ({
            name: a.name,
            value: formatDuration(a.avgSeconds),
          }))}
          viewAllHref={`/relatorios/ranking-atendentes?period=${encodeURIComponent(period)}`}
          emptyMessage="Sem first response no período."
        />
        <Top5Card
          title="Mais conversas em aberto"
          subtitle="Atendentes com maior backlog agora"
          icon={Users}
          items={kpis.topAtendentesEmAberto.map((a) => ({
            name: a.name,
            value: a.count.toLocaleString("pt-BR"),
          }))}
          viewAllHref="/relatorios/conversas?statuses=0"
          emptyMessage="Nenhum atendente com backlog em aberto."
        />
        <Top5Card
          title="Inboxes com mais aberto"
          subtitle="Estados/inboxes mais carregados agora"
          icon={Building2}
          items={kpis.topInboxesEmAberto.map((i) => ({
            name: i.name,
            value: i.count.toLocaleString("pt-BR"),
          }))}
          viewAllHref="/relatorios/conversas?statuses=0"
          emptyMessage="Nenhuma inbox com conversas em aberto."
        />
      </section>
    </div>
  );
}
