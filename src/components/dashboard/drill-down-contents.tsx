"use client";

/**
 * Conteúdos das 4 sheets de drill-down do dashboard.
 *
 * Cada componente:
 *  - recebe `accountId` e `period`,
 *  - dispara fetch via Server Action quando `enabled = true` (i.e. sheet aberta),
 *  - mostra skeleton enquanto carrega,
 *  - mostra empty/error state quando aplicável,
 *  - reaproveita charts genéricos de `@/components/charts`.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import {
  InteractiveAreaChart,
  InteractiveBarChart,
  DonutWithCenter,
  type AreaChartSeries,
  type BarChartSeries,
} from "@/components/charts";
import { fillBuckets } from "./conversations-line-chart";
import { CHART_COLORS } from "@/lib/charts/colors";
import { StatusBadge } from "@/components/reports/status-badge";
import { OpenInChatwoot } from "@/components/reports/open-in-chatwoot";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DrillDownSection,
  DrillDownSkeleton,
} from "@/components/ui/drill-down-dialog";
import { formatRelativeShort } from "@/lib/format/relative-time";
import { DrillDownPagination } from "./drill-down-pagination";
import { TotalBadge } from "./total-badge";
import {
  getOpenDrillDownAction,
  getReceivedDrillDownAction,
  getResolutionRateDrillDownAction,
  getResolvedDrillDownAction,
  getStatusDrillDownAction,
  type DashboardPeriod,
} from "@/lib/actions/dashboard-drill-down";
import type {
  OpenDrillDownData,
  ReceivedDrillDownData,
  ResolutionRateDrillDownData,
  ResolvedDrillDownData,
  StatusDrillDownData,
} from "@/lib/chatwoot/queries/dashboard-drill-down";

interface DrillDownProps {
  accountId: number;
  period: DashboardPeriod;
  enabled: boolean;
}

import { formatBucketLabel } from "@/lib/utils/format-bucket";
import { DEFAULT_TZ } from "@/lib/datetime-core";

/**
 * v0.10: usa `formatBucketLabel` com timezone explícita para evitar que o
 * runtime do navegador mude o resultado. Aceita prop opcional `tz` em cada
 * componente; default = America/Sao_Paulo.
 */
function formatBucket(
  iso: string,
  granularity: "hour" | "day",
  tz: string = DEFAULT_TZ,
): string {
  return formatBucketLabel(iso, granularity, tz);
}

function ConversationTable({
  items,
  accountId,
  emptyMessage,
}: {
  items: Array<{
    id: number;
    displayId: number;
    contactName: string | null;
    inboxName: string | null;
    teamName: string | null;
    assigneeName: string | null;
    status: number;
    lastActivityAt: string;
  }>;
  accountId: number;
  emptyMessage: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table className="min-w-[820px]">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Quando
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Contato
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Estado
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Departamento
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Atendente
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Status
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Ação
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow
                key={item.id}
                className="border-border/50 transition-colors hover:bg-accent/30"
              >
                <TableCell className="py-2.5">
                  <span className="inline-block rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-amber-400">
                    {formatRelativeShort(item.lastActivityAt)}
                  </span>
                </TableCell>
                <TableCell className="py-2.5 text-sm text-foreground">
                  {item.contactName ?? "—"}
                </TableCell>
                <TableCell className="py-2.5 text-sm text-muted-foreground">
                  {item.inboxName ?? "—"}
                </TableCell>
                <TableCell className="py-2.5 text-sm text-muted-foreground">
                  {item.teamName ?? "—"}
                </TableCell>
                <TableCell className="py-2.5 text-sm text-muted-foreground">
                  {item.assigneeName ?? "—"}
                </TableCell>
                <TableCell className="py-2.5">
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell className="py-2.5">
                  <OpenInChatwoot
                    accountId={accountId}
                    displayId={item.displayId}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <p className="text-sm font-medium text-foreground">
        Não foi possível carregar os dados
      </p>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

/* -------------------------- Recebidas — gráfico de linha -------------------------- */

type DistributionView = "estado" | "departamento" | "atendente";

const DISTRIBUTION_OPTIONS: { value: DistributionView; label: string }[] = [
  { value: "estado", label: "Por estado" },
  { value: "departamento", label: "Por departamento" },
  { value: "atendente", label: "Por atendente" },
];

function ReceivedTooltip(props: TooltipContentProps<ValueType, NameType>) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  const windowLabel = (payload[0]?.payload as { windowLabel?: string } | undefined)?.windowLabel;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-sm font-medium text-foreground mb-1">{label}</p>
      {windowLabel ? (
        <p className="text-xs text-muted-foreground/70 mb-2">{windowLabel}</p>
      ) : null}
      {payload.map((entry) => (
        <p key={entry.name} className="text-xs flex items-center gap-2" style={{ color: entry.color }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color as string }} />
          <span className="text-foreground">{entry.name}:</span>
          <span className="font-bold tabular-nums">
            {typeof entry.value === "number" ? entry.value.toLocaleString("pt-BR") : (entry.value ?? "—")}
          </span>
        </p>
      ))}
    </div>
  );
}

function ReceivedLineChart({ data }: { data: ReceivedDrillDownData }) {
  const chartData = useMemo(
    () =>
      fillBuckets(
        data.chart.map((p) => ({ ...p, open: 0, pending: 0 })),
        data.granularity,
        data.tz,
        data.range,
      ).map((r) => ({
        label: r.label,
        windowLabel: r.windowLabel,
        Recebidas: r.received,
      })),
    [data.chart, data.granularity, data.tz, data.range],
  );

  const isEmpty = chartData.every((p) => p.Recebidas === 0);

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
        Nenhuma conversa recebida no período
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 12, right: 20, left: 8, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="label"
            tick={{ fill: "#a1a1aa", fontSize: 12 }}
            tickLine={false}
            tickMargin={10}
            axisLine={{ stroke: "#3f3f46" }}
            interval="preserveStartEnd"
            minTickGap={20}
            height={36}
          />
          <YAxis
            tick={{ fill: "#a1a1aa", fontSize: 13 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={40}
          />
          <Tooltip content={ReceivedTooltip} cursor={{ stroke: "rgba(63, 63, 70, 0.6)" }} />
          <Line
            type="monotone"
            dataKey="Recebidas"
            name="Recebidas"
            stroke="#22c55e"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------- Recebidas -------------------------- */

export function ReceivedDrillDownContent({
  accountId,
  period,
  enabled,
}: DrillDownProps) {
  const [data, setData] = useState<ReceivedDrillDownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [distributionView, setDistributionView] = useState<DistributionView>("estado");

  // Reset page when period changes
  useEffect(() => {
    setPage(1);
  }, [period]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      const res = await getReceivedDrillDownAction({
        accountId,
        period,
        page,
        pageSize: 50,
      });
      if (cancelled) return;
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error ?? "Erro desconhecido");
      }
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [accountId, period, enabled, page]);

  if (loading && !data) return <DrillDownSkeleton />;
  if (error && !data) return <ErrorState message={error} />;
  if (!data) return null;

  const distributionData = (() => {
    if (distributionView === "estado") {
      return data.byInbox.map((i) => ({ name: i.name, Conversas: i.count }));
    }
    if (distributionView === "departamento") {
      return data.byTeam.map((i) => ({ name: i.name, Conversas: i.count }));
    }
    return data.byAssignee.map((i) => ({ name: i.name, Conversas: i.count }));
  })();

  const distributionSeries: BarChartSeries[] = [
    { key: "Conversas", label: "Conversas", color: "#22c55e" },
  ];

  const distributionDescription = (() => {
    if (distributionView === "estado") return "Top 10 estados que receberam mais conversas";
    if (distributionView === "departamento") return "Todos os departamentos, incluindo sem departamento";
    return "Top 10 atendentes por volume (desc)";
  })();

  const items = data.items ?? data.recent;

  return (
    <div className="space-y-5">
      <DrillDownSection
        title="Volume ao longo do período"
        description={data.granularity === "hour" ? "Por hora" : "Por dia"}
      >
        <ReceivedLineChart data={data} />
      </DrillDownSection>

      <DrillDownSection
        title="Distribuição"
        description={distributionDescription}
        action={
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background/60 p-1">
            {DISTRIBUTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDistributionView(opt.value)}
                className={
                  distributionView === opt.value
                    ? "rounded-md bg-green-500/15 px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-400 transition-colors"
                    : "rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      >
        <InteractiveBarChart
          data={distributionData}
          series={distributionSeries}
          layout="horizontal"
          height={Math.max(280, Math.min(480, distributionData.length * 28 + 60))}
          showLegend={false}
          yAxisWidth={160}
          emptyMessage="Nenhum dado para exibir"
        />
      </DrillDownSection>

      <DrillDownSection
        title={
          <>
            Conversas recebidas
            <TotalBadge n={data.total} />
          </>
        }
        description="Ordenadas por data de criação (mais recente primeiro)"
      >
        <ConversationTable
          items={items}
          accountId={accountId}
          emptyMessage="Nenhuma conversa recebida no período"
        />
        <DrillDownPagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          loading={loading}
          onChange={setPage}
        />
      </DrillDownSection>
    </div>
  );
}

/* -------------------------- Resolvidas — gráfico de linha -------------------------- */

function ResolvedTooltip(props: TooltipContentProps<ValueType, NameType>) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  const windowLabel = (payload[0]?.payload as { windowLabel?: string } | undefined)?.windowLabel;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-sm font-medium text-foreground mb-1">{label}</p>
      {windowLabel ? (
        <p className="text-xs text-muted-foreground/70 mb-2">{windowLabel}</p>
      ) : null}
      {payload.map((entry) => (
        <p key={entry.name} className="text-xs flex items-center gap-2" style={{ color: entry.color }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color as string }} />
          <span className="text-foreground">{entry.name}:</span>
          <span className="font-bold tabular-nums">
            {typeof entry.value === "number" ? entry.value.toLocaleString("pt-BR") : (entry.value ?? "—")}
          </span>
        </p>
      ))}
    </div>
  );
}

function ResolvedLineChart({ data }: { data: ResolvedDrillDownData }) {
  const chartData = useMemo(
    () =>
      fillBuckets(
        data.chart.map((p) => ({ ...p, open: 0, pending: 0 })),
        data.granularity,
        data.tz,
        data.range,
      ).map((r) => ({
        label: r.label,
        windowLabel: r.windowLabel,
        Resolvidas: r.resolved,
      })),
    [data.chart, data.granularity, data.tz, data.range],
  );

  const isEmpty = chartData.every((p) => p.Resolvidas === 0);

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
        Nenhuma conversa resolvida no período
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 12, right: 20, left: 8, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="label"
            tick={{ fill: "#a1a1aa", fontSize: 12 }}
            tickLine={false}
            tickMargin={10}
            axisLine={{ stroke: "#3f3f46" }}
            interval="preserveStartEnd"
            minTickGap={20}
            height={36}
          />
          <YAxis
            tick={{ fill: "#a1a1aa", fontSize: 13 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={40}
          />
          <Tooltip content={ResolvedTooltip} cursor={{ stroke: "rgba(63, 63, 70, 0.6)" }} />
          <Line
            type="monotone"
            dataKey="Resolvidas"
            name="Resolvidas"
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------- Resolvidas -------------------------- */

export function ResolvedDrillDownContent({
  accountId,
  period,
  enabled,
}: DrillDownProps) {
  const [data, setData] = useState<ResolvedDrillDownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [distributionView, setDistributionView] = useState<DistributionView>("estado");

  // Reset page when period changes
  useEffect(() => {
    setPage(1);
  }, [period]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      const res = await getResolvedDrillDownAction({
        accountId,
        period,
        page,
        pageSize: 50,
      });
      if (cancelled) return;
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error ?? "Erro desconhecido");
      }
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [accountId, period, enabled, page]);

  if (loading && !data) return <DrillDownSkeleton />;
  if (error && !data) return <ErrorState message={error} />;
  if (!data) return null;

  const distributionData = (() => {
    if (distributionView === "estado") {
      return data.byInbox.map((i) => ({ name: i.name, Conversas: i.count }));
    }
    if (distributionView === "departamento") {
      return data.byTeam.map((i) => ({ name: i.name, Conversas: i.count }));
    }
    return data.byAssignee.map((i) => ({ name: i.name, Conversas: i.count }));
  })();

  const distributionSeries: BarChartSeries[] = [
    { key: "Conversas", label: "Conversas", color: "#3b82f6" },
  ];

  const distributionDescription = (() => {
    if (distributionView === "estado") return "Top 10 estados com mais resoluções";
    if (distributionView === "departamento") return "Todos os departamentos, incluindo sem departamento";
    return "Top 10 atendentes por volume (desc)";
  })();

  const items = data.items ?? data.recent;

  return (
    <div className="space-y-5">
      <DrillDownSection
        title="Resoluções ao longo do período"
        description={data.granularity === "hour" ? "Por hora" : "Por dia"}
      >
        <ResolvedLineChart data={data} />
      </DrillDownSection>

      <DrillDownSection
        title="Distribuição"
        description={distributionDescription}
        action={
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background/60 p-1">
            {DISTRIBUTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDistributionView(opt.value)}
                className={
                  distributionView === opt.value
                    ? "rounded-md bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 transition-colors"
                    : "rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      >
        <InteractiveBarChart
          data={distributionData}
          series={distributionSeries}
          layout="horizontal"
          height={Math.max(280, Math.min(480, distributionData.length * 28 + 60))}
          showLegend={false}
          yAxisWidth={160}
          emptyMessage="Nenhum dado para exibir"
        />
      </DrillDownSection>

      <DrillDownSection
        title={
          <>
            Conversas resolvidas
            <TotalBadge n={data.total} />
          </>
        }
        description="Ordenadas pela data da resolução"
      >
        <ConversationTable
          items={items}
          accountId={accountId}
          emptyMessage="Nenhuma conversa resolvida no período"
        />
        <DrillDownPagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          loading={loading}
          onChange={setPage}
        />
      </DrillDownSection>
    </div>
  );
}

/* -------------------------- Em aberto -------------------------- */

export function OpenDrillDownContent({
  accountId,
  period,
  enabled,
}: DrillDownProps) {
  const [data, setData] = useState<OpenDrillDownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      const res = await getOpenDrillDownAction({ accountId, period });
      if (cancelled) return;
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error ?? "Erro desconhecido");
      }
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [accountId, period, enabled]);

  if (loading && !data) return <DrillDownSkeleton />;
  if (error && !data) return <ErrorState message={error} />;
  if (!data) return null;

  const STATUS_COLOR: Record<number, string> = {
    0: CHART_COLORS.amber,
    2: CHART_COLORS.violet,
    3: CHART_COLORS.slate,
  };
  const pieData = data.byStatus.map((s) => ({
    name: s.label,
    value: s.count,
    color: STATUS_COLOR[s.status] ?? CHART_COLORS.slate,
  }));

  const byInboxData = data.byInbox.map((i) => ({
    name: i.name,
    Conversas: i.count,
  }));
  const byInboxSeries: BarChartSeries[] = [
    { key: "Conversas", label: "Conversas", color: CHART_COLORS.amber },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DrillDownSection
          title="Distribuição por status"
          description="Snapshot atual"
        >
          <DonutWithCenter
            data={pieData}
            centerLabel="Abertas"
            centerValue={data.total.toLocaleString("pt-BR")}
            height={280}
            emptyMessage="Sem conversas em aberto"
          />
        </DrillDownSection>
        <DrillDownSection
          title="Estados com mais conversas em aberto"
          description="Top 10 — snapshot agora"
        >
          <InteractiveBarChart
            data={byInboxData}
            series={byInboxSeries}
            layout="horizontal"
            height={Math.max(280, Math.min(480, byInboxData.length * 28 + 60))}
            showLegend={false}
            yAxisWidth={160}
            emptyMessage="Sem estados com conversas em aberto"
          />
        </DrillDownSection>
      </div>

      <DrillDownSection
        title={
          <>
            Conversas em aberto agora
            <TotalBadge n={data.total} />
          </>
        }
        description="20 mais antigas (last activity ascendente) — possíveis prioridades"
      >
        <ConversationTable
          items={data.open}
          accountId={accountId}
          emptyMessage="Nenhuma conversa em aberto"
        />
      </DrillDownSection>
    </div>
  );
}

/* -------------------------- Status genérico (v0.13.0) -------------------------- */

const STATUS_LABEL: Record<0 | 1 | 2 | 3, string> = {
  0: "Aberto",
  1: "Resolvido",
  2: "Pendente",
  3: "Adiado",
};

export function StatusDrillDownContent({
  accountId,
  period,
  status,
  enabled,
}: DrillDownProps & { status: 0 | 1 | 2 | 3 }) {
  const [data, setData] = useState<StatusDrillDownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [period, status]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      const res = await getStatusDrillDownAction({
        accountId,
        period,
        status,
        page,
        pageSize: 50,
      });
      if (cancelled) return;
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error ?? "Erro desconhecido");
      }
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [accountId, period, status, enabled, page]);

  if (loading && !data) return <DrillDownSkeleton />;
  if (error && !data) return <ErrorState message={error} />;
  if (!data) return null;

  const label = STATUS_LABEL[status];
  const byInboxData = data.byInbox.map((i) => ({
    name: i.name,
    Conversas: i.count,
  }));
  const byInboxSeries: BarChartSeries[] = [
    { key: "Conversas", label: "Conversas", color: CHART_COLORS.violet },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DrillDownSection
          title={`Total de conversas com status "${label}"`}
          description={`Coorte: criadas no período + status = ${label.toLowerCase()}`}
        >
          <div className="flex h-[280px] flex-col items-center justify-center rounded-lg border border-border bg-background/40">
            <p className="font-heading text-5xl font-bold tabular-nums text-foreground">
              {data.total.toLocaleString("pt-BR")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{label}</p>
          </div>
        </DrillDownSection>
        <DrillDownSection
          title="Top estados"
          description="10 estados com mais conversas neste status"
        >
          <InteractiveBarChart
            data={byInboxData}
            series={byInboxSeries}
            layout="horizontal"
            height={Math.max(280, Math.min(480, byInboxData.length * 28 + 60))}
            showLegend={false}
            yAxisWidth={160}
            emptyMessage="Sem estados com conversas neste status"
          />
        </DrillDownSection>
      </div>

      <DrillDownSection
        title={
          <>
            {`Conversas em "${label}"`}
            <TotalBadge n={data.total} />
          </>
        }
        description="Ordenadas por última atividade"
      >
        <ConversationTable
          items={data.items}
          accountId={accountId}
          emptyMessage={`Nenhuma conversa "${label.toLowerCase()}" no período`}
        />
        <DrillDownPagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          loading={loading}
          onChange={setPage}
        />
      </DrillDownSection>
    </div>
  );
}

/* -------------------------- Taxa de Resolução -------------------------- */

export function ResolutionRateDrillDownContent({
  accountId,
  period,
  enabled,
}: DrillDownProps) {
  const [data, setData] = useState<ResolutionRateDrillDownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      const res = await getResolutionRateDrillDownAction({ accountId, period });
      if (cancelled) return;
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error ?? "Erro desconhecido");
      }
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [accountId, period, enabled]);

  if (loading && !data) return <DrillDownSkeleton />;
  if (error && !data) return <ErrorState message={error} />;
  if (!data) return null;

  const currentLabel =
    data.current !== null ? `${data.current.toFixed(1)}%` : "—";
  const previousLabel =
    data.previous !== null ? `${data.previous.toFixed(1)}%` : "—";
  const diffLabel =
    data.diffPct !== null
      ? `${data.diffPct > 0 ? "+" : ""}${data.diffPct.toFixed(1)}%`
      : "—";

  // Donut: representação da taxa atual como `resolved` vs `restante (não resolvido)`.
  // Quando o denominador é zero, o donut entra em empty state automaticamente.
  const donutData = (() => {
    if (data.current === null) return [];
    const resolvedPct = Math.max(0, Math.min(100, data.current));
    const remainingPct = Math.max(0, 100 - resolvedPct);
    return [
      { name: "Resolvidas", value: resolvedPct, color: CHART_COLORS.emerald },
      { name: "Não resolvidas", value: remainingPct, color: CHART_COLORS.slate },
    ];
  })();

  const historyData = data.history.map((p) => ({
    name: formatBucket(
      p.bucket,
      data.history.length > 0 &&
        new Date(data.history[data.history.length - 1]!.bucket).getTime() -
          new Date(data.history[0]!.bucket).getTime() <=
          1000 * 60 * 60 * 48
        ? "hour"
        : "day",
    ),
    Taxa: p.rate ?? 0,
  }));
  const historySeries: AreaChartSeries[] = [
    { key: "Taxa", label: "Taxa de resolução (%)", color: CHART_COLORS.violet },
  ];

  const topAgentsData = data.topAgents.map((a) => ({
    name: a.name,
    Taxa: Number(a.resolutionRate.toFixed(1)),
  }));
  const topAgentsSeries: BarChartSeries[] = [
    { key: "Taxa", label: "Taxa (%)", color: CHART_COLORS.emerald },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DrillDownSection
          title="Taxa de resolução atual"
          description={`Anterior: ${previousLabel} → Atual: ${currentLabel} (variação: ${diffLabel})`}
        >
          <DonutWithCenter
            data={donutData}
            centerLabel="Taxa atual"
            centerValue={currentLabel}
            height={280}
            showPercentInTooltip={false}
            formatValue={(v) => `${v.toFixed(1)}%`}
            emptyMessage="Sem volume suficiente para calcular taxa"
          />
        </DrillDownSection>
        <DrillDownSection
          title="Top atendentes por taxa"
          description="Mín. 5 conversas atribuídas no período"
        >
          <InteractiveBarChart
            data={topAgentsData}
            series={topAgentsSeries}
            layout="horizontal"
            height={280}
            showLegend={false}
            yAxisWidth={140}
            formatValue={(v) => `${v.toFixed(1)}%`}
            emptyMessage="Volume insuficiente para ranking"
            emptyHint="É preciso pelo menos 5 conversas atribuídas por atendente."
          />
        </DrillDownSection>
      </div>

      <DrillDownSection
        title="Histórico da taxa no período"
        description="Calculada por bucket: resolvidas / recebidas"
      >
        <InteractiveAreaChart
          data={historyData}
          series={historySeries}
          height={280}
          showLegend={false}
          formatValue={(v) => `${v.toFixed(1)}%`}
          emptyMessage="Sem histórico calculável no período"
        />
      </DrillDownSection>
    </div>
  );
}
