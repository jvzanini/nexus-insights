"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  CheckCircle2,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  getDashboardData,
  type DashboardActionResult,
  type DashboardPeriod,
} from "@/lib/actions/dashboard";
import { switchAccount } from "@/lib/actions/account-switch";
import { formatDuration } from "@/lib/utils/format-time";
import { CHART_COLORS } from "@/lib/charts/colors";
import { ConversationsLineChart } from "./conversations-line-chart";
import { DashboardFilters } from "./dashboard-filters";
import { RecentConversationsTable } from "./recent-conversations-table";
import { Top5ListCard } from "./top5-list-card";
import { KpiClickableCard } from "./kpi-clickable-card";
import { Sparkline } from "./sparkline";
import {
  OpenDrillDownContent,
  ReceivedDrillDownContent,
  ResolutionRateDrillDownContent,
  ResolvedDrillDownContent,
} from "./drill-down-contents";
import { DrillDownSheet } from "@/components/ui/drill-down-sheet";
import { TourButton } from "@/components/tour/tour-button";
import { dashboardTour } from "@/lib/tours/dashboard-tour";

type DashboardSnapshot = NonNullable<DashboardActionResult["data"]>;

interface DashboardContentProps {
  userName: string;
  initialAccountId: number;
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

const POLL_INTERVAL = 60_000; // 60s

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

export function DashboardContent({
  userName,
  initialAccountId,
  initialAccounts,
}: DashboardContentProps) {
  const [accountId, setAccountId] = useState(initialAccountId);
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [, startTransition] = useTransition();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  type DrillDownKind = "received" | "resolved" | "open" | "rate" | null;
  const [drillDown, setDrillDown] = useState<DrillDownKind>(null);
  const closeDrillDown = useCallback(() => setDrillDown(null), []);

  // Sparklines extraídos do chart bucketed (declarados antes de qualquer
  // early return para respeitar `react-hooks/rules-of-hooks`).
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
        // Delegado ao próximo microtask para não disparar setState sync em effect.
        await Promise.resolve();
        setIsLoading(true);
      }
      try {
        const result = await getDashboardData({
          accountId,
          period,
        });
        if (result.success && result.data) {
          setData(result.data);
          setError(null);
        } else {
          setError(result.error ?? "Erro ao carregar dados");
        }
      } catch {
        setError("Erro de conexão com o servidor");
      } finally {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    },
    [accountId, period],
  );

  useEffect(() => {
    // setState dentro de fetchData ocorre apenas após await (assíncrono),
    // mas o lint estático sinaliza assim mesmo — silenciamos com justificativa.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData(isInitialLoad);

    timerRef.current = setInterval(() => {
      void fetchData(false); // polling silencioso
    }, POLL_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, period]);

  function handleRefresh() {
    if (timerRef.current) clearInterval(timerRef.current);
    fetchData(false);
    timerRef.current = setInterval(() => fetchData(false), POLL_INTERVAL);
  }

  function handleAccountChange(id: number) {
    setAccountId(id);
    // Persiste cookie no servidor (não bloqueia UI).
    startTransition(async () => {
      try {
        await switchAccount(id);
      } catch {
        // ignora — fetchData devolve erro se não houver acesso
      }
    });
  }

  function handlePeriodChange(p: DashboardPeriod) {
    setPeriod(p);
  }

  // Greeting de hoje
  const now = new Date();
  const weekday = WEEKDAYS[now.getDay()]!;
  const today = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${now.getDate()} de ${MONTHS[now.getMonth()]} de ${now.getFullYear()}`;

  // Skeleton inicial
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
          <div className="lg:col-span-2 h-[350px] bg-card border border-border rounded-xl" />
          <div className="h-[350px] bg-card border border-border rounded-xl" />
        </div>
      </div>
    );
  }

  // Estado de erro permanente
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

  const { stats, chart, granularity, topAgents, topInboxes, topTeams, recent } =
    data;

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
    const direction =
      value > 0.05 ? "up" : value < -0.05 ? "down" : "flat";
    const sign = value > 0 ? "+" : "";
    return {
      direction,
      value: `${sign}${value.toFixed(1)}${suffix}`,
    };
  }

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
        <TourButton tour={dashboardTour} />
      </motion.div>

      {/* Filtros */}
      <motion.div variants={itemVariants} data-tour="dashboard-filters">
        <DashboardFilters
          accounts={initialAccounts}
          selectedAccountId={accountId}
          selectedPeriod={period}
          isLoading={isLoading}
          onAccountChange={handleAccountChange}
          onPeriodChange={handlePeriodChange}
          onRefresh={handleRefresh}
        />
      </motion.div>

      {/* Stats cards (clickable) */}
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
          sublabel="(agora)"
          value={stats.open.toLocaleString("pt-BR")}
          badge="agora"
          onClick={() => setDrillDown("open")}
        />
        <KpiClickableCard
          icon={TrendingUp}
          iconBg="bg-violet-500/10"
          iconColor="text-violet-400"
          label="Taxa de resolução"
          value={resolutionRateLabel}
          trend={trendFor(stats.comparison.resolutionRate, "pp")}
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

      {/* Chart + Top 5 atendentes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <motion.div
          variants={itemVariants}
          data-tour="dashboard-chart"
          className="lg:col-span-2"
        >
          <ConversationsLineChart data={chart} granularity={granularity} />
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

      {/* Top inboxes + top teams */}
      <div
        data-tour="dashboard-tops"
        className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6"
      >
        <motion.div variants={itemVariants}>
          <Top5ListCard
            icon={Inbox}
            iconColor="text-amber-400"
            iconBg="bg-amber-500/10"
            title="Inboxes em aberto"
            subtitle="Snapshot atual"
            items={topInboxes.map((i) => ({
              name: i.name,
              value: i.count.toLocaleString("pt-BR"),
            }))}
            emptyMessage="Nenhuma inbox com conversas em aberto."
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <Top5ListCard
            icon={Users}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/10"
            title="Departamentos com mais resolvidas"
            subtitle="No período selecionado"
            items={topTeams.map((t) => ({
              name: t.name,
              value: t.count.toLocaleString("pt-BR"),
            }))}
            emptyMessage="Nenhum departamento com conversas resolvidas."
          />
        </motion.div>
      </div>

      {/* Recent conversations */}
      <motion.div variants={itemVariants} data-tour="dashboard-recent">
        <RecentConversationsTable items={recent} />
      </motion.div>

      {/* Drill-down sheets (sempre montadas mas só carregam dados quando enabled) */}
      <DrillDownSheet
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
      </DrillDownSheet>

      <DrillDownSheet
        open={drillDown === "resolved"}
        onOpenChange={(o) => (o ? setDrillDown("resolved") : closeDrillDown())}
        title="Conversas resolvidas no período"
        subtitle="Volume, distribuição e últimas resoluções"
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
      </DrillDownSheet>

      <DrillDownSheet
        open={drillDown === "open"}
        onOpenChange={(o) => (o ? setDrillDown("open") : closeDrillDown())}
        title="Conversas em aberto agora"
        subtitle="Snapshot atual — independente do período selecionado"
        icon={MessageSquare}
        iconColor="text-amber-400"
        iconBg="bg-amber-500/10"
        size="xl"
      >
        <OpenDrillDownContent
          accountId={accountId}
          enabled={drillDown === "open"}
        />
      </DrillDownSheet>

      <DrillDownSheet
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
      </DrillDownSheet>
    </motion.div>
  );
}
