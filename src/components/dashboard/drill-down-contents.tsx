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

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import {
  InteractiveAreaChart,
  InteractiveBarChart,
  DonutWithCenter,
  type AreaChartSeries,
  type BarChartSeries,
} from "@/components/charts";
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
import {
  getOpenDrillDownAction,
  getReceivedDrillDownAction,
  getResolutionRateDrillDownAction,
  getResolvedDrillDownAction,
  type DashboardPeriod,
} from "@/lib/actions/dashboard-drill-down";
import type {
  OpenDrillDownData,
  ReceivedDrillDownData,
  ResolutionRateDrillDownData,
  ResolvedDrillDownData,
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
    assigneeName: string | null;
    status: number;
    lastActivityAt: string;
  }>;
  accountId: number;
  emptyMessage: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Quando
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Contato
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Inbox
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
                colSpan={6}
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
                <TableCell className="py-2.5 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(item.lastActivityAt), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </TableCell>
                <TableCell className="py-2.5 text-sm text-foreground">
                  {item.contactName ?? "—"}
                </TableCell>
                <TableCell className="py-2.5 text-sm text-muted-foreground">
                  {item.inboxName ?? "—"}
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

/* -------------------------- Recebidas -------------------------- */

export function ReceivedDrillDownContent({
  accountId,
  period,
  enabled,
}: DrillDownProps) {
  const [data, setData] = useState<ReceivedDrillDownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      const res = await getReceivedDrillDownAction({ accountId, period });
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

  const chartData = data.chart.map((p) => ({
    name: formatBucket(p.bucket, data.granularity),
    Recebidas: p.received,
  }));
  const series: AreaChartSeries[] = [
    { key: "Recebidas", label: "Recebidas", color: CHART_COLORS.violet },
  ];

  const byInboxData = data.byInbox.map((i) => ({
    name: i.name,
    Conversas: i.count,
  }));
  const byInboxSeries: BarChartSeries[] = [
    { key: "Conversas", label: "Conversas", color: CHART_COLORS.violet },
  ];

  const byHourData = data.byHour.map((h) => ({
    name: `${String(h.hour).padStart(2, "0")}h`,
    Conversas: h.count,
  }));
  const byHourSeries: AreaChartSeries[] = [
    { key: "Conversas", label: "Conversas", color: CHART_COLORS.amber },
  ];

  return (
    <div className="space-y-5">
      <DrillDownSection
        title="Volume ao longo do período"
        description={
          data.granularity === "hour" ? "Por hora" : "Por dia"
        }
      >
        <InteractiveAreaChart
          data={chartData}
          series={series}
          height={280}
          showLegend={false}
          emptyMessage="Sem conversas recebidas no período"
        />
      </DrillDownSection>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DrillDownSection
          title="Distribuição por inbox"
          description="Top 10 inboxes que receberam mais conversas"
        >
          <InteractiveBarChart
            data={byInboxData}
            series={byInboxSeries}
            layout="horizontal"
            height={280}
            showLegend={false}
            yAxisWidth={120}
            emptyMessage="Nenhuma inbox com volume no período"
          />
        </DrillDownSection>
        <DrillDownSection
          title="Distribuição por hora do dia"
          description="Onde está concentrado o volume?"
        >
          <InteractiveAreaChart
            data={byHourData}
            series={byHourSeries}
            height={280}
            showLegend={false}
            emptyMessage="Sem dados de horário"
          />
        </DrillDownSection>
      </div>

      <DrillDownSection
        title="Últimas 20 conversas recebidas"
        description="Ordenadas por data de criação"
      >
        <ConversationTable
          items={data.recent}
          accountId={accountId}
          emptyMessage="Nenhuma conversa recebida no período"
        />
      </DrillDownSection>
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

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      const res = await getResolvedDrillDownAction({ accountId, period });
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

  const chartData = data.chart.map((p) => ({
    name: formatBucket(p.bucket, data.granularity),
    Resolvidas: p.resolved,
  }));
  const series: AreaChartSeries[] = [
    { key: "Resolvidas", label: "Resolvidas", color: CHART_COLORS.emerald },
  ];

  const byInboxData = data.byInbox.map((i) => ({
    name: i.name,
    Conversas: i.count,
  }));
  const byInboxSeries: BarChartSeries[] = [
    { key: "Conversas", label: "Conversas", color: CHART_COLORS.emerald },
  ];

  const byHourData = data.byHour.map((h) => ({
    name: `${String(h.hour).padStart(2, "0")}h`,
    Conversas: h.count,
  }));
  const byHourSeries: AreaChartSeries[] = [
    { key: "Conversas", label: "Conversas", color: CHART_COLORS.cyan },
  ];

  return (
    <div className="space-y-5">
      <DrillDownSection
        title="Resoluções ao longo do período"
        description={data.granularity === "hour" ? "Por hora" : "Por dia"}
      >
        <InteractiveAreaChart
          data={chartData}
          series={series}
          height={280}
          showLegend={false}
          emptyMessage="Nenhuma conversa resolvida no período"
        />
      </DrillDownSection>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DrillDownSection
          title="Distribuição por inbox"
          description="Top 10 inboxes que mais resolveram"
        >
          <InteractiveBarChart
            data={byInboxData}
            series={byInboxSeries}
            layout="horizontal"
            height={280}
            showLegend={false}
            yAxisWidth={120}
            emptyMessage="Sem inboxes com resoluções"
          />
        </DrillDownSection>
        <DrillDownSection
          title="Distribuição por hora do dia"
          description="Quando as resoluções acontecem"
        >
          <InteractiveAreaChart
            data={byHourData}
            series={byHourSeries}
            height={280}
            showLegend={false}
            emptyMessage="Sem dados de horário"
          />
        </DrillDownSection>
      </div>

      <DrillDownSection
        title="Últimas 20 conversas resolvidas"
        description="Ordenadas por data da resolução"
      >
        <ConversationTable
          items={data.recent}
          accountId={accountId}
          emptyMessage="Nenhuma conversa resolvida no período"
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
          title="Inboxes com mais conversas em aberto"
          description="Top 10 — snapshot agora"
        >
          <InteractiveBarChart
            data={byInboxData}
            series={byInboxSeries}
            layout="horizontal"
            height={280}
            showLegend={false}
            yAxisWidth={120}
            emptyMessage="Sem inboxes com conversas em aberto"
          />
        </DrillDownSection>
      </div>

      <DrillDownSection
        title="Conversas em aberto agora"
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
    data.diffPp !== null
      ? `${data.diffPp > 0 ? "+" : ""}${data.diffPp.toFixed(1)}pp`
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
          description={`Anterior: ${previousLabel} • Variação: ${diffLabel}`}
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
