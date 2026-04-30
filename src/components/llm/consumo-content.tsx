"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ptBR } from "date-fns/locale";
import { type DateRange } from "react-day-picker";
import {
  Calendar as CalendarIcon,
  CircuitBoard,
  Coins,
  DollarSign,
  Hash,
  Loader2,
  PhoneCall,
  Sparkles,
  Zap,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/reports/kpi-card";
import {
  InteractiveAreaChart,
  InteractiveBarChart,
  DonutWithCenter,
  type AreaChartData,
  type BarChartData,
  type PieChartData,
} from "@/components/charts";
import { CHART_COLORS, getColorByIndex } from "@/lib/charts/colors";
import { cn } from "@/lib/utils";
import { fetchUsageDetails, fetchUsageStats } from "@/lib/actions/llm-usage";
import {
  type UsageDetailRow,
  type UsageSummary,
} from "@/lib/llm/queries/usage-stats";
import { PROVIDER_LABELS } from "@/lib/llm/pricing";

// ---------------------------------------------------------------------------
// Tipos / constantes
// ---------------------------------------------------------------------------

type PillKey = "hoje" | "7d" | "30d" | "90d" | "tudo" | "custom";

const PILLS: Array<{ key: PillKey; label: string }> = [
  { key: "hoje", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "tudo", label: "Tudo" },
  { key: "custom", label: "Personalizado" },
];

const PAGE_SIZE = 25;
const MOBILE_BREAKPOINT = 640;
const TZ = "America/Sao_Paulo";

interface ConsumoContentProps {
  /** ISO string da primeira chamada (ou início do mês corrente). */
  minDate: string;
}

interface DateRangeIso {
  start: string;
  end: string;
}

// ---------------------------------------------------------------------------
// Helpers de data
// ---------------------------------------------------------------------------

function startOfTodayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function endOfTodayLocal(): Date {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );
}

function pillToRange(pill: PillKey, minDate: Date): { start: Date; end: Date } {
  const end = endOfTodayLocal();
  const startToday = startOfTodayLocal();

  switch (pill) {
    case "hoje":
      return { start: startToday, end };
    case "7d": {
      const start = new Date(startToday);
      start.setDate(start.getDate() - 6);
      return { start, end };
    }
    case "30d": {
      const start = new Date(startToday);
      start.setDate(start.getDate() - 29);
      return { start, end };
    }
    case "90d": {
      const start = new Date(startToday);
      start.setDate(start.getDate() - 89);
      return { start, end };
    }
    case "tudo":
      return { start: minDate, end };
    case "custom":
      return { start: startToday, end };
    default:
      return { start: startToday, end };
  }
}

function dateToIsoLocal(d: Date): string {
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoLocalToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

function formatRangeShort(start: string, end: string): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  });
  const sStr = fmt.format(isoLocalToDate(start)).replace(".", "");
  const eStr = fmt.format(isoLocalToDate(end)).replace(".", "");
  return `${sStr} – ${eStr}`;
}

function useIsMobile(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = () => setM(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return m;
}

// ---------------------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------------------

const numberFmt = new Intl.NumberFormat("pt-BR");
const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});
const usdFmtCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const dayLabelFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

function formatCost(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v < 0.01 && v > 0) return usdFmt.format(v);
  return usdFmtCompact.format(v);
}

function formatTokens(v: number): string {
  return numberFmt.format(Math.round(v));
}

function providerLabel(key: string): string {
  return (
    (PROVIDER_LABELS as Record<string, string>)[key] ??
    key.charAt(0).toUpperCase() + key.slice(1)
  );
}

// ---------------------------------------------------------------------------
// Custom range picker (sem cap superior; respeita minDate)
// ---------------------------------------------------------------------------

interface CustomRangePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRange?: DateRangeIso;
  minDate: Date;
  onApply: (range: DateRangeIso) => void;
  trigger: React.ReactNode;
  isMobile: boolean;
}

function CustomRangePicker({
  open,
  onOpenChange,
  initialRange,
  minDate,
  onApply,
  trigger,
  isMobile,
}: CustomRangePickerProps) {
  const panel = open ? (
    <PickerPanel
      key={`${initialRange?.start ?? ""}-${initialRange?.end ?? ""}`}
      initialRange={initialRange}
      minDate={minDate}
      onApply={(range) => {
        onApply(range);
        onOpenChange(false);
      }}
      onCancel={() => onOpenChange(false)}
      isMobile={isMobile}
    />
  ) : null;

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger render={trigger as React.ReactElement} />
        <DialogContent className="max-w-[calc(100%-2rem)] p-4 sm:max-w-md">
          <DialogTitle className="mb-2">Período personalizado</DialogTitle>
          {panel}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger as React.ReactElement} />
      <PopoverContent
        align="start"
        className="w-auto max-w-[min(calc(100vw-2rem),640px)] p-3"
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}

interface PickerPanelProps {
  initialRange?: DateRangeIso;
  minDate: Date;
  onApply: (range: DateRangeIso) => void;
  onCancel: () => void;
  isMobile: boolean;
}

function PickerPanel({
  initialRange,
  minDate,
  onApply,
  onCancel,
  isMobile,
}: PickerPanelProps) {
  const [range, setRange] = useState<DateRange | undefined>(() =>
    initialRange
      ? {
          from: isoLocalToDate(initialRange.start),
          to: isoLocalToDate(initialRange.end),
        }
      : undefined,
  );

  // Normaliza minDate para meia-noite local (DayPicker compara dias).
  const minDay = useMemo(
    () =>
      new Date(
        minDate.getFullYear(),
        minDate.getMonth(),
        minDate.getDate(),
        0,
        0,
        0,
        0,
      ),
    [minDate],
  );

  const error = useMemo(() => {
    if (!range?.from || !range?.to) return null;
    if (range.to.getTime() < range.from.getTime()) {
      return "A data final deve ser igual ou posterior à data inicial.";
    }
    if (range.from.getTime() < minDay.getTime()) {
      return "Datas anteriores ao primeiro registro não estão disponíveis.";
    }
    return null;
  }, [range, minDay]);

  const canApply = !!range?.from && !!range?.to && !error;

  const handleApply = () => {
    if (!canApply || !range?.from || !range?.to) return;
    onApply({
      start: dateToIsoLocal(range.from),
      end: dateToIsoLocal(range.to),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Calendar
        mode="range"
        selected={range}
        onSelect={setRange}
        locale={ptBR}
        numberOfMonths={isMobile ? 1 : 2}
        defaultMonth={range?.from ?? minDay}
        disabled={[{ before: minDay }]}
        showOutsideDays
      />
      {error ? (
        <p role="alert" className="px-1 text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">
          Selecione qualquer intervalo a partir de{" "}
          {dayLabelFmt.format(minDay).replace(".", "")}.
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleApply}
          disabled={!canApply}
        >
          Aplicar
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ConsumoContent({ minDate: minDateIso }: ConsumoContentProps) {
  const prefersReducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const minDate = useMemo(() => new Date(minDateIso), [minDateIso]);

  const [pill, setPill] = useState<PillKey>("30d");
  const [customRange, setCustomRange] = useState<DateRangeIso | undefined>();
  const [pickerOpen, setPickerOpen] = useState(false);

  const [stats, setStats] = useState<UsageSummary | null>(null);
  const [details, setDetails] = useState<UsageDetailRow[]>([]);
  const [detailsTotal, setDetailsTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Calcula intervalo efetivo a partir da pill atual.
  const range = useMemo(() => {
    if (pill === "custom" && customRange) {
      const start = isoLocalToDate(customRange.start);
      const end = isoLocalToDate(customRange.end);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    return pillToRange(pill, minDate);
  }, [pill, customRange, minDate]);

  // Reseta paginação ao trocar período.
  useEffect(() => {
    setPage(0);
  }, [pill, customRange]);

  // Fetch stats + first page de details.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    startTransition(async () => {
      try {
        const startIso = range.start.toISOString();
        const endIso = range.end.toISOString();
        const [s, d] = await Promise.all([
          fetchUsageStats({ start: startIso, end: endIso }),
          fetchUsageDetails({
            start: startIso,
            end: endIso,
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
          }),
        ]);
        if (cancelled) return;
        setStats(s);
        setDetails(d.rows);
        setDetailsTotal(d.total);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Falha ao carregar dados.";
        setError(msg);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.getTime(), range.end.getTime(), page]);

  const handlePillClick = useCallback((key: PillKey) => {
    if (key === "custom") {
      setPickerOpen(true);
      return;
    }
    setPill(key);
  }, []);

  const handleApplyCustom = useCallback((next: DateRangeIso) => {
    setCustomRange(next);
    setPill("custom");
  }, []);

  const totalPages = Math.max(1, Math.ceil(detailsTotal / PAGE_SIZE));
  const isEmpty =
    !!stats && stats.totalCalls === 0 && page === 0 && !isPending;
  const isFirstLoad = stats === null && isPending;

  // ---- Charts data --------------------------------------------------------

  const areaData = useMemo<AreaChartData[]>(() => {
    if (!stats) return [];
    return stats.byDay.map((d) => ({
      name: dayLabelFmt.format(isoLocalToDate(d.day)).replace(".", ""),
      Custo: Number(d.cost.toFixed(6)),
    }));
  }, [stats]);

  const providerPieData = useMemo<PieChartData[]>(() => {
    if (!stats) return [];
    return stats.byProvider.map((p, i) => ({
      name: providerLabel(p.provider),
      value: Number(p.cost.toFixed(6)),
      color: getColorByIndex(i),
    }));
  }, [stats]);

  const modelBarData = useMemo<BarChartData[]>(() => {
    if (!stats) return [];
    return stats.byModel.slice(0, 12).map((m) => ({
      name: m.model,
      Custo: Number(m.cost.toFixed(6)),
    }));
  }, [stats]);

  const totalCostFormatted = useMemo(
    () => (stats ? formatCost(stats.totalCost) : "—"),
    [stats],
  );

  // ---- Render -------------------------------------------------------------

  if (isEmpty && !error) {
    return (
      <EmptyConsumoState />
    );
  }

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Período"
          className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 snap-x snap-mandatory sm:flex-wrap sm:overflow-visible sm:pb-0"
        >
          {PILLS.map((opt) => {
            const active = opt.key === pill;
            const isCustom = opt.key === "custom";
            const labelContent = isCustom ? (
              <>
                <CalendarIcon className="mr-1.5 h-4 w-4" />
                {active && customRange
                  ? formatRangeShort(customRange.start, customRange.end)
                  : opt.label}
              </>
            ) : (
              opt.label
            );

            const pillClasses = cn(
              "inline-flex h-11 shrink-0 snap-start items-center rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              "border border-transparent",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              isCustom && active && "border-primary/50",
            );

            if (isCustom) {
              return (
                <CustomRangePicker
                  key={opt.key}
                  open={pickerOpen}
                  onOpenChange={setPickerOpen}
                  initialRange={customRange}
                  minDate={minDate}
                  onApply={handleApplyCustom}
                  isMobile={isMobile}
                  trigger={
                    <button
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => handlePillClick(opt.key)}
                      className={pillClasses}
                    >
                      {labelContent}
                    </button>
                  }
                />
              );
            }

            return (
              <button
                key={opt.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handlePillClick(opt.key)}
                className={pillClasses}
              >
                {labelContent}
              </button>
            );
          })}
        </div>

        {isPending ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Atualizando…
          </span>
        ) : null}
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : null}

      {/* KPI cards */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: { staggerChildren: 0.06 },
          },
        }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {[
          {
            icon: PhoneCall,
            label: "Total de chamadas",
            value: stats ? numberFmt.format(stats.totalCalls) : "—",
            tone: "default" as const,
          },
          {
            icon: Hash,
            label: "Tokens de input",
            value: stats ? formatTokens(stats.totalTokensInput) : "—",
            tone: "default" as const,
          },
          {
            icon: Zap,
            label: "Tokens de output",
            value: stats ? formatTokens(stats.totalTokensOutput) : "—",
            tone: "default" as const,
          },
          {
            icon: DollarSign,
            label: "Custo total (USD)",
            value: totalCostFormatted,
            tone: "default" as const,
          },
        ].map((card) => (
          <motion.div
            key={card.label}
            variants={{
              hidden: { opacity: 0, y: 16 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.25, ease: "easeOut" },
              },
            }}
          >
            <KpiCard
              icon={card.icon}
              label={card.label}
              value={card.value}
              tone={card.tone}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border border-border bg-muted/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-violet-500" />
              Custo por dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isFirstLoad ? (
              <ChartSkeleton />
            ) : (
              <InteractiveAreaChart
                data={areaData}
                series={[
                  { key: "Custo", label: "Custo (USD)", color: CHART_COLORS.violet },
                ]}
                height={300}
                formatValue={formatCost}
                ariaLabel="Custo diário em USD"
                emptyMessage="Sem custos no período"
                emptyHint="Tente ampliar o intervalo de datas."
              />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border bg-muted/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircuitBoard className="h-4 w-4 text-violet-500" />
              Distribuição por provider
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isFirstLoad ? (
              <ChartSkeleton />
            ) : (
              <DonutWithCenter
                data={providerPieData}
                centerLabel="Custo total"
                centerValue={totalCostFormatted}
                height={300}
                formatValue={formatCost}
                ariaLabel="Custo agrupado por provider"
                emptyMessage="Sem dados de provider"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border border-border bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Custo por modelo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isFirstLoad ? (
            <ChartSkeleton height={320} />
          ) : (
            <InteractiveBarChart
              data={modelBarData}
              series={[
                { key: "Custo", label: "Custo (USD)", color: CHART_COLORS.violet },
              ]}
              height={320}
              layout={modelBarData.length > 6 ? "horizontal" : "vertical"}
              yAxisWidth={180}
              formatValue={formatCost}
              showLegend={false}
              ariaLabel="Custo agrupado por modelo"
              emptyMessage="Sem chamadas por modelo no período"
            />
          )}
        </CardContent>
      </Card>

      {/* Tabela detalhada */}
      <Card className="rounded-2xl border border-border bg-muted/30">
        <CardHeader>
          <CardTitle>Chamadas detalhadas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/hora</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="hidden md:table-cell">Modelo</TableHead>
                  <TableHead className="text-right">Tokens in</TableHead>
                  <TableHead className="text-right">Tokens out</TableHead>
                  <TableHead className="hidden md:table-cell text-right">
                    Duração
                  </TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {isPending
                        ? "Carregando…"
                        : "Nenhuma chamada no período."}
                    </TableCell>
                  </TableRow>
                ) : (
                  details.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {dateTimeFmt.format(new Date(row.createdAt))}
                      </TableCell>
                      <TableCell>{providerLabel(row.provider)}</TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs">
                        {row.model}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {numberFmt.format(row.tokensInput)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {numberFmt.format(row.tokensOutput)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right tabular-nums text-muted-foreground">
                        {row.durationMs == null
                          ? "—"
                          : `${numberFmt.format(row.durationMs)} ms`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCost(row.costUsd)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {detailsTotal > PAGE_SIZE ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground tabular-nums">
                Página {page + 1} de {totalPages} · {numberFmt.format(detailsTotal)}{" "}
                chamadas
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || isPending}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1 || isPending}
                >
                  Próxima
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Empty state e skeleton
// ---------------------------------------------------------------------------

function EmptyConsumoState() {
  return (
    <Card className="rounded-2xl border border-border bg-muted/30">
      <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/10">
          <Sparkles className="h-7 w-7 text-violet-500" aria-hidden />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-semibold">
            Nenhuma chamada ao Agente IA registrada ainda
          </h2>
          <p className="text-sm text-muted-foreground">
            Configure o provedor em Configurações e use o agente flutuante para
            começar a registrar consumo.
          </p>
        </div>
        <Link
          href="/configuracoes"
          className={buttonVariants({ variant: "default", size: "default" })}
        >
          Ir para Configurações
        </Link>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div
      role="status"
      aria-label="Carregando gráfico"
      className="w-full animate-pulse rounded-md bg-muted/40"
      style={{ height }}
    />
  );
}
