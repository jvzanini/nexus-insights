"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  CircuitBoard,
  Coins,
  DollarSign,
  Hash,
  History,
  Loader2,
  Sparkles,
  Zap,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/reports/kpi-card";
import { PeriodPills } from "@/components/reports/period-pills";
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
import {
  fetchDistinctModelsInRange,
  fetchDistinctProvidersInRange,
  fetchUsageDetails,
  fetchUsageStats,
} from "@/lib/actions/llm-usage";
import {
  type UsageDetailRow,
  type UsageDetailsTotals,
  type UsageSummary,
} from "@/lib/llm/queries/usage-stats";
import { PROVIDER_LABELS } from "@/lib/llm/pricing";
import { formatBrl4, formatUsd4 } from "@/lib/llm/format";
import { formatDuration } from "@/lib/format/date";
import { type PeriodKey as LegacyPeriodKey } from "@/lib/reports/period";
import { getPeriodInTz, type PeriodKey } from "@/lib/datetime-core";
import { CustomSelect } from "@/components/ui/custom-select";
import { UsageDetailSheet } from "@/components/llm/usage-detail-sheet";
import { UsageTableFilters } from "@/components/llm/usage-table-filters";

// ---------------------------------------------------------------------------
// Tipos / constantes
// ---------------------------------------------------------------------------

const TZ = "America/Sao_Paulo";
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSize = 25;

interface ConsumoContentProps {
  /** ISO string da primeira chamada (ou início do mês corrente). */
  minDate: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoLocalToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

function rangeForPills(
  pill: PeriodKey,
  customRange: { start: string; end: string } | undefined,
  minDate: Date,
): { start: Date; end: Date } {
  // "todos" → corta a partir do minDate (1ª chamada do banco) até agora.
  if (pill === "todos") {
    return { start: minDate, end: new Date() };
  }
  if (pill === "custom" && customRange) {
    const start = isoLocalToDate(customRange.start);
    const end = isoLocalToDate(customRange.end);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  return getPeriodInTz(pill, TZ);
}

// ---------------------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------------------

const numberFmt = new Intl.NumberFormat("pt-BR");
// Moeda "bruta" para a tabela: 2 a 6 casas decimais (exibe valores muito
// pequenos sem perder precisão).
const usdRawFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});
const brlRawFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
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

function formatUsdRaw(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return usdRawFmt.format(v);
}

function formatBrlRaw(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return brlRawFmt.format(v);
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

function isWhisperModel(model: string): boolean {
  return /whisper/i.test(model);
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ConsumoContent({ minDate: minDateIso }: ConsumoContentProps) {
  const prefersReducedMotion = useReducedMotion();
  const minDate = useMemo(() => new Date(minDateIso), [minDateIso]);

  const [pill, setPill] = useState<PeriodKey>("mes_atual");
  const [customRange, setCustomRange] = useState<
    { start: string; end: string } | undefined
  >();

  const [stats, setStats] = useState<UsageSummary | null>(null);
  const [details, setDetails] = useState<UsageDetailRow[]>([]);
  const [detailsTotal, setDetailsTotal] = useState(0);
  const [detailsTotals, setDetailsTotals] = useState<UsageDetailsTotals | null>(
    null,
  );
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  // Filtro global de provider (afeta KPIs, charts e tabela). Sincroniza com URL.
  const [globalProvider, setGlobalProvider] = useState<string | undefined>(
    () => {
      if (typeof window === "undefined") return undefined;
      const params = new URLSearchParams(window.location.search);
      return params.get("provider") ?? undefined;
    },
  );
  const [filterProvider, setFilterProvider] = useState<string | undefined>(
    () => {
      if (typeof window === "undefined") return undefined;
      const params = new URLSearchParams(window.location.search);
      return params.get("provider") ?? undefined;
    },
  );
  const [filterModel, setFilterModel] = useState<string | undefined>();
  const [providers, setProviders] = useState<string[]>([]);
  const [modelsByProvider, setModelsByProvider] = useState<
    Record<string, string[]>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sheetRow, setSheetRow] = useState<UsageDetailRow | null>(null);

  // Calcula intervalo efetivo a partir da pill atual.
  const range = useMemo(
    () => rangeForPills(pill, customRange, minDate),
    [pill, customRange, minDate],
  );

  // Reseta paginação ao trocar período / filtros / pageSize.
  useEffect(() => {
    setPage(0);
  }, [pill, customRange, globalProvider, filterProvider, filterModel, pageSize]);

  // Sincroniza filtro global com URL (?provider=...).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (globalProvider) url.searchParams.set("provider", globalProvider);
    else url.searchParams.delete("provider");
    window.history.replaceState({}, "", url.toString());
  }, [globalProvider]);

  // Quando o filtro global muda, espelha no filtro da tabela e reseta o modelo
  // (evita estado inválido onde modelo pertence a outro provider).
  useEffect(() => {
    setFilterProvider(globalProvider);
    setFilterModel(undefined);
  }, [globalProvider]);

  // Fetch stats + first page de details.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    startTransition(async () => {
      try {
        const startIso = range.start.toISOString();
        const endIso = range.end.toISOString();
        const [s, d] = await Promise.all([
          fetchUsageStats({
            start: startIso,
            end: endIso,
            provider: globalProvider ?? null,
          }),
          fetchUsageDetails({
            start: startIso,
            end: endIso,
            limit: pageSize,
            offset: page * pageSize,
            provider: filterProvider ?? null,
            model: filterModel ?? null,
          }),
        ]);
        if (cancelled) return;
        setStats(s);
        setDetails(d.rows);
        setDetailsTotal(d.total);
        setDetailsTotals(d.totals);
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
  }, [range.start.getTime(), range.end.getTime(), page, pageSize, globalProvider, filterProvider, filterModel]);

  // Fetch lista de providers no range (para filtros cascade).
  useEffect(() => {
    let cancelled = false;
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();
    fetchDistinctProvidersInRange({ start: startIso, end: endIso })
      .then((list) => {
        if (cancelled) return;
        setProviders(list);
      })
      .catch(() => {
        if (cancelled) return;
        setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end]);

  // Fetch modelos no range (cascade pelo provider — quando undefined, traz todos
  // e agrupa por provider via consultas paralelas).
  useEffect(() => {
    let cancelled = false;
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();

    async function load() {
      if (providers.length === 0) {
        if (!cancelled) setModelsByProvider({});
        return;
      }
      try {
        const entries = await Promise.all(
          providers.map(async (p) => {
            const list = await fetchDistinctModelsInRange({
              start: startIso,
              end: endIso,
              provider: p,
            });
            return [p, list] as const;
          }),
        );
        if (cancelled) return;
        const map: Record<string, string[]> = {};
        for (const [p, list] of entries) map[p] = list;
        setModelsByProvider(map);
      } catch {
        if (!cancelled) setModelsByProvider({});
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [providers, range.start, range.end]);

  const handlePeriodChange = useCallback(
    (next: LegacyPeriodKey, nextRange?: { start: string; end: string }) => {
      // PeriodPills só emite chaves canonicas (5 opções renderizadas).
      // Se vier alguma key legada por algum motivo, fallback para mes_atual.
      const canonical: PeriodKey =
        next === "hoje" ||
        next === "semana_atual" ||
        next === "mes_atual" ||
        next === "todos" ||
        next === "custom"
          ? next
          : "mes_atual";
      setPill(canonical);
      if (canonical === "custom" && nextRange) {
        setCustomRange(nextRange);
      } else if (canonical !== "custom") {
        setCustomRange(undefined);
      }
    },
    [],
  );

  const totalPages = Math.max(1, Math.ceil(detailsTotal / pageSize));
  const isFirstLoad = stats === null && isPending;

  // ---- Charts data --------------------------------------------------------

  const areaData = useMemo<AreaChartData[]>(() => {
    if (!stats) return [];
    return stats.byDay.map((d) => ({
      name: dayLabelFmt.format(isoLocalToDate(d.day)).replace(".", ""),
      Custo: Number(d.costBrl.toFixed(6)),
    }));
  }, [stats]);

  const providerPieData = useMemo<PieChartData[]>(() => {
    if (!stats) return [];
    return stats.byProvider.map((p, i) => ({
      name: providerLabel(p.provider),
      value: Number(p.costBrl.toFixed(6)),
      color: getColorByIndex(i),
    }));
  }, [stats]);

  const modelBarData = useMemo<BarChartData[]>(() => {
    if (!stats) return [];
    return stats.byModel.slice(0, 12).map((m) => ({
      name: m.model,
      Custo: Number(m.costBrl.toFixed(6)),
    }));
  }, [stats]);

  // Mapa modelo → provider (alimenta o sub-rótulo "(Provider)" do BarChart).
  const providersByModel = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const m of stats?.byModel ?? []) {
      map[m.model] = providerLabel(m.provider);
    }
    return map;
  }, [stats]);

  const totalCostBrlFormatted = useMemo(
    () => (stats ? formatBrl4(stats.totalCostBrl) : "—"),
    [stats],
  );
  const totalCostUsdFormatted = useMemo(
    () => (stats ? formatUsd4(stats.totalCost) : "—"),
    [stats],
  );

  // ---- Render -------------------------------------------------------------

  // Range visível (mostrando X-Y de N). Quando há filtros, N é detailsTotal.
  const rangeStartIdx = detailsTotal === 0 ? 0 : page * pageSize + 1;
  const rangeEndIdx = Math.min((page + 1) * pageSize, detailsTotal);

  // Trocar de página fecha o sheet (evita cursor stale).
  const handlePageChange = (next: number) => {
    setPage(next);
    setSheetRow(null);
  };

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* Filtros — PeriodPills compartilhada + filtro global de Provider */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <PeriodPills
            value={pill}
            customRange={customRange}
            onChange={handlePeriodChange}
          />
          <CustomSelect
            value={globalProvider ?? "__all__"}
            onChange={(v) =>
              setGlobalProvider(v === "__all__" ? undefined : v)
            }
            options={[
              { value: "__all__", label: "Todos os providers" },
              ...providers.map((p) => ({
                value: p,
                label: providerLabel(p),
              })),
            ]}
            triggerClassName="min-h-[36px] h-9 w-[200px]"
            aria-label="Filtrar por provider (global)"
          />
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
            icon: Activity,
            label: "Total de chamadas",
            value: stats ? numberFmt.format(stats.totalCalls) : "—",
            subtitle: "no período",
            tone: "default" as const,
          },
          {
            icon: Hash,
            label: "Tokens de entrada",
            value: stats ? formatTokens(stats.totalTokensInput) : "—",
            subtitle: "no período",
            tone: "default" as const,
          },
          {
            icon: Zap,
            label: "Tokens de saída",
            value: stats ? formatTokens(stats.totalTokensOutput) : "—",
            subtitle: "no período",
            tone: "default" as const,
          },
          {
            icon: DollarSign,
            label: "Custo total",
            value: totalCostBrlFormatted,
            subtitle: `≈ ${totalCostUsdFormatted}`,
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
              subtitle={card.subtitle}
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
                  {
                    key: "Custo",
                    label: "Custo (R$)",
                    color: CHART_COLORS.violet,
                  },
                ]}
                height={300}
                formatValue={formatBrlRaw}
                yAxisCurrency="BRL"
                xAxisFontSize={13}
                xAxisPadding={12}
                ariaLabel="Custo diário em BRL"
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
                centerValue={totalCostBrlFormatted}
                height={300}
                formatValue={formatBrl4}
                tooltipPosition="top-right"
                ariaLabel="Custo agrupado por provider em BRL"
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
                {
                  key: "Custo",
                  label: "Custo (R$)",
                  color: CHART_COLORS.violet,
                },
              ]}
              height={320}
              layout={modelBarData.length > 6 ? "horizontal" : "vertical"}
              yAxisWidth={180}
              formatValue={formatBrlRaw}
              yAxisCurrency="BRL"
              xAxisFontSize={13}
              xAxisPadding={12}
              showLegend={false}
              providersByModel={providersByModel}
              ariaLabel="Custo agrupado por modelo em BRL"
              emptyMessage="Sem chamadas por modelo no período"
            />
          )}
        </CardContent>
      </Card>

      {/* Histórico de chamadas */}
      <Card className="rounded-2xl border border-border bg-muted/30">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-violet-500" />
            Histórico de chamadas
          </CardTitle>
          <UsageTableFilters
            providers={providers}
            modelsByProvider={modelsByProvider}
            selectedProvider={filterProvider}
            selectedModel={filterModel}
            onProviderChange={(p) => setFilterProvider(p)}
            onModelChange={(m) => setFilterModel(m)}
          />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/hora</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="hidden md:table-cell">Modelo</TableHead>
                  <TableHead
                    className="text-right"
                    title="Whisper (transcrição) é cobrado por minuto. Tokens não se aplicam a chamadas de áudio."
                  >
                    Tokens de entrada
                  </TableHead>
                  <TableHead
                    className="text-right"
                    title="Whisper (transcrição) é cobrado por minuto. Tokens não se aplicam a chamadas de áudio."
                  >
                    Tokens de saída
                  </TableHead>
                  <TableHead className="hidden md:table-cell text-right">
                    Duração
                  </TableHead>
                  <TableHead className="text-right">Custo USD</TableHead>
                  <TableHead className="text-right">Custo BRL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Linha de TOTAL no topo — sutil (label uppercase, sem ícone) */}
                {detailsTotals && detailsTotals.count > 0 ? (
                  <TableRow className="sticky top-0 z-[1] bg-muted/30 border-b border-border/40 text-foreground font-semibold text-xs uppercase tracking-wide">
                    <TableCell colSpan={3} className="whitespace-nowrap">
                      <span>Total no filtro</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {numberFmt.format(detailsTotals.tokensInput)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {numberFmt.format(detailsTotals.tokensOutput)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right tabular-nums">
                      {formatDuration(detailsTotals.durationMsTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUsdRaw(detailsTotals.costUsd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBrlRaw(detailsTotals.costBrl)}
                    </TableCell>
                  </TableRow>
                ) : null}

                {details.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {isPending
                        ? "Carregando…"
                        : "Nenhuma chamada no período."}
                    </TableCell>
                  </TableRow>
                ) : (
                  details.map((row) => {
                    const whisper = isWhisperModel(row.model);
                    return (
                      <TableRow
                        key={row.id}
                        className="group cursor-pointer transition-colors hover:bg-muted/40"
                        onClick={() => setSheetRow(row)}
                      >
                        <TableCell className="relative whitespace-nowrap tabular-nums pl-7">
                          <ChevronRight
                            className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60"
                            aria-hidden="true"
                          />
                          {dateTimeFmt.format(new Date(row.createdAt))}
                        </TableCell>
                        <TableCell>{providerLabel(row.provider)}</TableCell>
                        <TableCell className="hidden md:table-cell font-mono text-xs">
                          {row.model}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            whisper && "text-muted-foreground",
                          )}
                        >
                          {whisper ? "—" : numberFmt.format(row.tokensInput)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            whisper && "text-muted-foreground",
                          )}
                        >
                          {whisper ? "—" : numberFmt.format(row.tokensOutput)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right tabular-nums text-muted-foreground">
                          {row.durationMs == null
                            ? "—"
                            : `${numberFmt.format(row.durationMs)} ms`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatUsdRaw(row.costUsd)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBrlRaw(row.costBrl)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação footer com 3 zonas */}
          {detailsTotal > 0 ? (
            <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-border pt-4 sm:flex-row">
              {/* Zona 1: Mostrando X-Y de N */}
              <p className="text-xs text-muted-foreground tabular-nums">
                Mostrando {numberFmt.format(rangeStartIdx)}–
                {numberFmt.format(rangeEndIdx)} de{" "}
                {numberFmt.format(detailsTotal)}
              </p>

              {/* Zona 2: Página X de Y + setas */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Página anterior"
                  onClick={() => handlePageChange(Math.max(0, page - 1))}
                  disabled={page === 0 || isPending}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Página {page + 1} de {totalPages}
                </span>
                <button
                  type="button"
                  aria-label="Próxima página"
                  onClick={() =>
                    handlePageChange(Math.min(totalPages - 1, page + 1))
                  }
                  disabled={page >= totalPages - 1 || isPending}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>

              {/* Zona 3: {n} por página via CustomSelect */}
              <div className="inline-flex items-center text-xs text-muted-foreground">
                <CustomSelect
                  value={String(pageSize)}
                  onChange={(v) => {
                    const next = Number(v) as PageSize;
                    if (PAGE_SIZE_OPTIONS.includes(next)) {
                      setPageSize(next);
                      // O reset de page já é tratado no useEffect dedicado.
                    }
                  }}
                  options={PAGE_SIZE_OPTIONS.map((n) => ({
                    value: String(n),
                    label: `${n} por página`,
                  }))}
                  triggerClassName="h-8 min-h-[34px] w-[140px] text-xs"
                  aria-label="Itens por página"
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Drill-down sheet */}
      <UsageDetailSheet
        open={sheetRow !== null}
        onOpenChange={(open) => {
          if (!open) setSheetRow(null);
        }}
        row={sheetRow}
      />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

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
