"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  CheckCircle2,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  PieChart as PieChartIcon,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  getDashboardData,
  type DashboardActionResult,
  type DashboardPeriod,
} from "@/lib/actions/dashboard";
import { formatDuration } from "@/lib/utils/format-time";
import { CHART_COLORS } from "@/lib/charts/colors";
import { ConversationsLineChart } from "./conversations-line-chart";
import { DashboardFilters } from "./dashboard-filters";
import { Top5ListCard } from "./top5-list-card";
import { KpiClickableCard } from "./kpi-clickable-card";
import { Sparkline } from "./sparkline";
import { NoResponseCard } from "./no-response-card";
import { DepartmentDistributionCard } from "./department-distribution-card";
import { InboxDistributionCard } from "./inbox-distribution-card";
import { StatusDistributionCard } from "./status-distribution-card";
import { NoResponseDrillDownContent } from "./no-response-drill-down";
import { TeamDrillDownContent } from "./team-drill-down";
import {
  OpenDrillDownContent,
  ReceivedDrillDownContent,
  ResolutionRateDrillDownContent,
  ResolvedDrillDownContent,
  StatusDrillDownContent,
} from "./drill-down-contents";
import { DrillDownDialog } from "@/components/ui/drill-down-dialog";
import { TourButton } from "@/components/tour/tour-button";
import { FactsFreshness } from "@/components/reports/facts-freshness";
import { dashboardTour } from "@/lib/tours/dashboard-tour";
import type { DashboardStatusCode } from "@/lib/chatwoot/queries/dashboard-data";

type DashboardSnapshot = NonNullable<DashboardActionResult["data"]>;

interface DashboardContentProps {
  userName: string;
  initialAccountId: number;
  /** Timezone da plataforma (lida no server). */
  tz: string;
  /** Lista de contas acessíveis — usada apenas para empty state. */
  initialAccounts: Array<{ id: number; name: string }>;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

const POLL_INTERVAL = 60_000;

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];
const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

type DrillDownState =
  | null
  | "received"
  | "resolved"
  | "open"
  | "rate"
  | "noResponse"
  | { kind: "team"; id: number | null; name: string }
  | { kind: "inbox"; id: number; name: string }
  | { kind: "status"; status: DashboardStatusCode };

function isDrillDownObject(
  d: DrillDownState,
): d is Exclude<DrillDownState, null | string> {
  return typeof d === "object" && d !== null;
}

export function DashboardContent({
  userName,
  initialAccountId,
  tz,
  initialAccounts,
}: DashboardContentProps) {
  const [accountId] = useState(initialAccountId);
  const [period, setPeriod] = useState<DashboardPeriod>("dia");
  /** ISO date — quando trocada via PeriodNavigator, refaz fetch. */
  const [referenceDate, setReferenceDate] = useState<string | null>(null);
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [drillDown, setDrillDown] = useState<DrillDownState>(null);
  const closeDrillDown = useCallback(() => setDrillDown(null), []);

  const chartPoints = data?.chart;
  const receivedSpark = useMemo(
    () => (chartPoints ? chartPoints.map((p) => p.received) : []),
    [chartPoints],
  );
  const resolvedSpark = useMemo(
    () => (chartPoints ? chartPoints.map((p) => p.resolved) : []),
    [chartPoints],
  );
  const rateSpark = useMemo(
    () =>
      chartPoints
        ? chartPoints.map((p) =>
            p.received > 0 ? (p.resolved / p.received) * 100 : 0,
          )
        : [],
    [chartPoints],
  );

  const fetchData = useCallback(
    async (showSkeleton = false) => {
      if (showSkeleton) {
        await Promise.resolve();
        setIsLoading(true);
      }
      try {
        const result = await getDashboardData({
          accountId,
          period,
          referenceDate: referenceDate ?? undefined,
        });
        if (result.success && result.data) {
          setData(result.data);
          setError(null);
        } else {
          setError(result.error ?? "Erro ao carregar dados");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[fetchData] erro ao chamar getDashboardData:", err);
        setError(`Erro de conexão: ${message}`);
      } finally {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    },
    [accountId, period, referenceDate],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData(isInitialLoad);

    timerRef.current = setInterval(() => {
      void fetchData(false);
    }, POLL_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, period, referenceDate]);

  function handleRefresh() {
    if (timerRef.current) clearInterval(timerRef.current);
    fetchData(false);
    timerRef.current = setInterval(() => fetchData(false), POLL_INTERVAL);
  }

  function handlePeriodChange(p: DashboardPeriod) {
    setPeriod(p);
    // Reseta navegação ao trocar de filtro
    setReferenceDate(null);
  }

  function handleReferenceDateChange(iso: string | null) {
    setReferenceDate(iso);
  }

  const now = new Date();
  const weekday = WEEKDAYS[now.getDay()]!;
  const today = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${now.getDate()} de ${MONTHS[now.getMonth()]} de ${now.getFullYear()}`;

  if (isInitialLoad && !data) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 bg-card border border-border rounded-xl"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 h-[200px] bg-card border border-border rounded-xl" />
          <div className="h-[200px] bg-card border border-border rounded-xl" />
        </div>
        <div className="h-[350px] bg-card border border-border rounded-xl" />
      </div>
    );
  }

  if (!data && error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
          <LayoutDashboard className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Não foi possível carregar o dashboard
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">{error}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  if (initialAccounts.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-20 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
          <Building2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Nenhuma empresa vinculada
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Para visualizar os dados do dashboard, você precisa estar vinculado a
          pelo menos uma empresa. Entre em contato com o administrador.
        </p>
      </motion.div>
    );
  }

  const {
    stats,
    chart,
    granularity,
    topAgents,
    topInboxes,
    byTeam,
    byStatus,
    noResponse,
  } = data;

  const resolutionRateLabel =
    stats.resolutionRate !== null
      ? `${stats.resolutionRate.toFixed(1)}%`
      : "—";

  function trendFor(
    value: number | null | undefined,
    suffix = "%",
  ): {
    direction: "up" | "down" | "flat";
    value: string;
  } | null {
    if (value === null || value === undefined) return null;
    const direction = value > 0.05 ? "up" : value < -0.05 ? "down" : "flat";
    const sign = value > 0 ? "+" : "";
    return {
      direction,
      value: `${sign}${value.toFixed(1)}${suffix}`,
    };
  }

  const teamDrill = isDrillDownObject(drillDown) && drillDown.kind === "team"
    ? drillDown
    : null;
  const inboxDrill = isDrillDownObject(drillDown) && drillDown.kind === "inbox"
    ? drillDown
    : null;
  const statusDrill = isDrillDownObject(drillDown) && drillDown.kind === "status"
    ? drillDown
    : null;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Greeting */}
      <motion.div
        variants={itemVariants}
        className="flex items-start justify-between gap-3"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Olá, {userName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <FactsFreshness accountId={accountId} />
          <TourButton tour={dashboardTour} />
        </div>
      </motion.div>

      {/* Filtros (sem account selector — vive no sidebar) */}
      <motion.div variants={itemVariants} data-tour="dashboard-filters">
        <DashboardFilters
          selectedPeriod={period}
          isLoading={isLoading}
          onPeriodChange={handlePeriodChange}
          onRefresh={handleRefresh}
        />
      </motion.div>

      {/* KPIs (mesma coorte) */}
      <motion.div
        variants={itemVariants}
        data-tour="dashboard-kpis"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        <KpiClickableCard
          icon={Inbox}
          iconBg="bg-violet-500/10"
          iconColor="text-violet-400"
          label="Conversas recebidas"
          value={stats.received.toLocaleString("pt-BR")}
          trend={trendFor(stats.comparison.received, "%")}
          miniChart={
            <Sparkline
              data={receivedSpark}
              color={CHART_COLORS.violet}
              ariaLabel="Tendência de recebidas no período"
            />
          }
          onClick={() => setDrillDown("received")}
        />
        <KpiClickableCard
          icon={CheckCircle2}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-400"
          label="Conversas resolvidas"
          value={stats.resolved.toLocaleString("pt-BR")}
          trend={trendFor(stats.comparison.resolved, "%")}
          miniChart={
            <Sparkline
              data={resolvedSpark}
              color={CHART_COLORS.emerald}
              ariaLabel="Tendência de resolvidas no período"
            />
          }
          onClick={() => setDrillDown("resolved")}
        />
        <KpiClickableCard
          icon={MessageSquare}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-400"
          label="Abertas"
          sublabel="(no período)"
          value={stats.open.toLocaleString("pt-BR")}
          trend={trendFor(stats.comparison.open, "%")}
          onClick={() => setDrillDown("open")}
        />
        <KpiClickableCard
          icon={TrendingUp}
          iconBg="bg-violet-500/10"
          iconColor="text-violet-400"
          label="Taxa de resolução"
          value={resolutionRateLabel}
          trend={trendFor(stats.comparison.resolutionRate, "%")}
          miniChart={
            <Sparkline
              data={rateSpark}
              color={CHART_COLORS.violet}
              ariaLabel="Histórico da taxa de resolução"
            />
          }
          onClick={() => setDrillDown("rate")}
        />
      </motion.div>

      {/* Chart por hora/dia (v0.14.3: trocou de posição com Sem resposta + Atendentes) */}
      <motion.div variants={itemVariants} data-tour="dashboard-chart">
        <ConversationsLineChart
          data={chart}
          granularity={granularity}
          tz={data.tz ?? tz}
          range={data.range}
          period={period}
          weekStartsOn={data.settings?.weekStartsOn ?? 1}
          referenceDate={referenceDate}
          nextAvailable={data.nextAvailable ?? false}
          onReferenceDateChange={handleReferenceDateChange}
        />
      </motion.div>

      {/* Sem resposta (hero) + Atendentes mais rápidos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <NoResponseCard
            data={noResponse}
            accountId={accountId}
            onSeeAll={() => setDrillDown("noResponse")}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <Top5ListCard
            icon={TrendingUp}
            iconColor="text-violet-400"
            iconBg="bg-violet-500/10"
            title="Atendentes mais rápidos"
            subtitle="Tempo médio de 1ª resposta"
            items={topAgents.map((a) => ({
              name: a.name,
              value: formatDuration(a.avgSeconds),
            }))}
            emptyMessage="Sem first response no período."
          />
        </motion.div>
      </div>

      {/* Distribuições por inbox e departamento */}
      <div
        data-tour="dashboard-distributions"
        className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6"
      >
        <motion.div variants={itemVariants}>
          <InboxDistributionCard
            data={topInboxes}
            onSelect={(inbox) =>
              setDrillDown({ kind: "inbox", id: inbox.id, name: inbox.name })
            }
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <DepartmentDistributionCard
            data={byTeam}
            onSelect={(team) =>
              setDrillDown({ kind: "team", id: team.id, name: team.name })
            }
          />
        </motion.div>
      </div>

      {/* Distribuição por status */}
      <motion.div variants={itemVariants} data-tour="dashboard-status">
        <StatusDistributionCard
          data={byStatus}
          onSelect={(status) => setDrillDown({ kind: "status", status })}
        />
      </motion.div>

      {/* Drill-down dialogs (KPIs) */}
      <DrillDownDialog
        open={drillDown === "received"}
        onOpenChange={(o) => (o ? setDrillDown("received") : closeDrillDown())}
        title="Conversas recebidas no período"
        subtitle="Volume, distribuição e últimas chegadas"
        icon={Inbox}
        iconColor="text-violet-400"
        iconBg="bg-violet-500/10"
        size="xl"
      >
        <ReceivedDrillDownContent
          accountId={accountId}
          period={period}
          enabled={drillDown === "received"}
        />
      </DrillDownDialog>

      <DrillDownDialog
        open={drillDown === "resolved"}
        onOpenChange={(o) => (o ? setDrillDown("resolved") : closeDrillDown())}
        title="Conversas resolvidas no período"
        subtitle="Mesma coorte de criação — taxa coerente"
        icon={CheckCircle2}
        iconColor="text-emerald-400"
        iconBg="bg-emerald-500/10"
        size="xl"
      >
        <ResolvedDrillDownContent
          accountId={accountId}
          period={period}
          enabled={drillDown === "resolved"}
        />
      </DrillDownDialog>

      <DrillDownDialog
        open={drillDown === "open"}
        onOpenChange={(o) => (o ? setDrillDown("open") : closeDrillDown())}
        title="Conversas abertas no período"
        subtitle="Criadas no período e ainda em aberto"
        icon={MessageSquare}
        iconColor="text-amber-400"
        iconBg="bg-amber-500/10"
        size="xl"
      >
        <OpenDrillDownContent
          accountId={accountId}
          period={period}
          enabled={drillDown === "open"}
        />
      </DrillDownDialog>

      <DrillDownDialog
        open={drillDown === "rate"}
        onOpenChange={(o) => (o ? setDrillDown("rate") : closeDrillDown())}
        title="Análise da taxa de resolução"
        subtitle="Atual vs anterior, histórico e top atendentes"
        icon={TrendingUp}
        iconColor="text-violet-400"
        iconBg="bg-violet-500/10"
        size="xl"
      >
        <ResolutionRateDrillDownContent
          accountId={accountId}
          period={period}
          enabled={drillDown === "rate"}
        />
      </DrillDownDialog>

      {/* Drill-downs novos */}
      <DrillDownDialog
        open={drillDown === "noResponse"}
        onOpenChange={(o) =>
          o ? setDrillDown("noResponse") : closeDrillDown()
        }
        title="Conversas sem resposta"
        subtitle="Aguardando resposta no período selecionado"
        icon={MessageSquare}
        iconColor="text-amber-400"
        iconBg="bg-amber-500/10"
        size="xl"
      >
        <NoResponseDrillDownContent
          accountId={accountId}
          period={period}
          enabled={drillDown === "noResponse"}
        />
      </DrillDownDialog>

      <DrillDownDialog
        open={teamDrill !== null}
        onOpenChange={(o) => (o ? null : closeDrillDown())}
        title={teamDrill ? `Departamento: ${teamDrill.name}` : "Departamento"}
        subtitle="Aberto + pendente + adiado, no período"
        icon={Users}
        iconColor="text-emerald-400"
        iconBg="bg-emerald-500/10"
        size="xl"
      >
        {teamDrill ? (
          <TeamDrillDownContent
            accountId={accountId}
            period={period}
            teamId={teamDrill.id}
            enabled={teamDrill !== null}
          />
        ) : null}
      </DrillDownDialog>

      <DrillDownDialog
        open={inboxDrill !== null}
        onOpenChange={(o) => (o ? null : closeDrillDown())}
        title={inboxDrill ? `Inbox: ${inboxDrill.name}` : "Inbox"}
        subtitle="Conversas em aberto no período"
        icon={Inbox}
        iconColor="text-amber-400"
        iconBg="bg-amber-500/10"
        size="xl"
      >
        {inboxDrill ? (
          <StatusDrillDownContent
            accountId={accountId}
            period={period}
            status={0}
            enabled={inboxDrill !== null}
          />
        ) : null}
      </DrillDownDialog>

      <DrillDownDialog
        open={statusDrill !== null}
        onOpenChange={(o) => (o ? null : closeDrillDown())}
        title={statusDrill ? `Status: ${labelForStatus(statusDrill.status)}` : "Status"}
        subtitle="Conversas no recorte do status"
        icon={PieChartIcon}
        iconColor="text-violet-400"
        iconBg="bg-violet-500/10"
        size="xl"
      >
        {statusDrill ? (
          <StatusDrillDownContent
            accountId={accountId}
            period={period}
            status={statusDrill.status}
            enabled={statusDrill !== null}
          />
        ) : null}
      </DrillDownDialog>
    </motion.div>
  );
}

function labelForStatus(status: DashboardStatusCode): string {
  switch (status) {
    case 0:
      return "Aberto";
    case 1:
      return "Resolvido";
    case 2:
      return "Pendente";
    case 3:
      return "Adiado";
  }
}
