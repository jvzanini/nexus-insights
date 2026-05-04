"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Database,
  RefreshCcw,
  History,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  CircleSlash,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getJobsStatus,
  triggerRefresh,
  triggerBackfill,
  type JobsStatusRow,
} from "@/lib/actions/jobs";
import { cn } from "@/lib/utils";

interface JobsPanelProps {
  initialStatus: { rows: JobsStatusRow[] } | null;
  initialError?: string | null;
  /**
   * Quando setado, o painel filtra rows e ações pelas accounts vinculadas
   * a esta connection via `company_chat_bindings`. Usado pela `<JobsTab>`
   * dentro de `/bancos-de-dados/[id]`.
   */
  connectionId?: string;
}

const POLL_INTERVAL_MS = 5_000;
const BACKFILL_DAYS_DEFAULT = 90;

const DIMENSION_LABELS: Record<string, string> = {
  by_account: "Por account",
  by_inbox: "Por inbox",
  by_agent: "Por atendente",
  by_team: "Por equipe",
  hourly_by_account: "Por hora (account)",
};

const STATUS_META: Record<
  JobsStatusRow["status"],
  {
    label: string;
    icon: typeof CheckCircle2;
    badgeClass: string;
    iconClass: string;
  }
> = {
  fresh: {
    label: "Fresco",
    icon: CheckCircle2,
    badgeClass:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
    iconClass: "text-emerald-500",
  },
  stale: {
    label: "Atrasado",
    icon: Clock,
    badgeClass:
      "bg-amber-500/10 text-amber-600 dark:text-amber-300 ring-amber-500/20",
    iconClass: "text-amber-500",
  },
  lagging: {
    label: "Travado",
    icon: AlertCircle,
    badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-300 ring-rose-500/20",
    iconClass: "text-rose-500",
  },
  never: {
    label: "Sem dados",
    icon: CircleSlash,
    badgeClass:
      "bg-muted text-muted-foreground ring-border",
    iconClass: "text-muted-foreground",
  },
};

function formatLag(lagSeconds: number | null): string {
  if (lagSeconds === null) return "—";
  if (lagSeconds < 60) return `${lagSeconds}s`;
  const minutes = Math.floor(lagSeconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}min`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatDateTimeShort(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function JobsPanel({
  initialStatus,
  initialError,
  connectionId,
}: JobsPanelProps) {
  const [rows, setRows] = useState<JobsStatusRow[]>(
    initialStatus?.rows ?? [],
  );
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startAction] = useTransition();

  const fetchStatus = useCallback(async () => {
    const result = await getJobsStatus(
      connectionId ? { connectionId } : {},
    );
    if (!result.success || !result.data) {
      setError(result.error ?? "Erro ao carregar status");
      return;
    }
    setError(null);
    setRows(result.data.rows);
  }, [connectionId]);

  useEffect(() => {
    const id = window.setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [fetchStatus]);

  const accountIds = useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) set.add(r.accountId);
    return Array.from(set).sort((a, b) => a - b);
  }, [rows]);

  function rowKey(row: JobsStatusRow, action: "refresh" | "backfill") {
    return `${row.accountId}:${row.dimension}:${action}`;
  }

  async function handleRefresh(row: JobsStatusRow) {
    const key = rowKey(row, "refresh");
    setPendingKey(key);
    startAction(async () => {
      const r = await triggerRefresh({
        dimension: row.dimension,
        ...(connectionId ? { connectionId } : {}),
      });
      setPendingKey(null);
      if (!r.success) {
        toast.error(r.error ?? "Falha ao enfileirar refresh");
        return;
      }
      toast.success(
        `Refresh enfileirado · ${DIMENSION_LABELS[row.dimension] ?? row.dimension}`,
      );
      fetchStatus();
    });
  }

  async function handleBackfill(row: JobsStatusRow) {
    const key = rowKey(row, "backfill");
    setPendingKey(key);
    startAction(async () => {
      const r = await triggerBackfill({
        dimension: row.dimension,
        days: BACKFILL_DAYS_DEFAULT,
        ...(connectionId ? { connectionId } : {}),
      });
      setPendingKey(null);
      if (!r.success) {
        toast.error(r.error ?? "Falha ao enfileirar backfill");
        return;
      }
      toast.success(
        `Backfill ${BACKFILL_DAYS_DEFAULT} dias enfileirado · ${
          DIMENSION_LABELS[row.dimension] ?? row.dimension
        }`,
      );
      fetchStatus();
    });
  }

  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <Database className="h-[18px] w-[18px] text-violet-500" />
          </div>
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-foreground">
              Jobs de Pré-agregação
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Status e disparo manual dos jobs que populam{" "}
              <span className="tabular-nums">chatwoot_facts_*</span>. Atualiza
              automaticamente a cada 5s.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {error ? (
          <div
            className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
            role="status"
            aria-live="polite"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="leading-snug">{error}</span>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/40 px-6 py-10 text-center">
            <CircleSlash className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">
              Nenhum job registrado ainda
            </p>
            {connectionId ? (
              <p className="max-w-md text-xs text-muted-foreground">
                Nenhum job registrado ainda para esta conexão. Os jobs aparecem
                após o primeiro polling delta detectar mudanças.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Os jobs rodam em cron de 30 min. Use &ldquo;Rodar agora&rdquo; abaixo se houver
                accounts ativas mas a tabela de meta ainda não foi populada.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {accountIds.map((accountId) => {
              const accountRows = rows.filter(
                (r) => r.accountId === accountId,
              );
              return (
                <section
                  key={accountId}
                  aria-labelledby={`jobs-account-${accountId}`}
                  className="space-y-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3
                      id={`jobs-account-${accountId}`}
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Account {accountId}
                    </h3>
                    <span className="text-[11px] text-muted-foreground/70">
                      {accountRows.length} dimensão{accountRows.length === 1 ? "" : "es"}
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-border bg-background/40">
                    {/* Tabela responsiva: cada linha vira card em telas pequenas. */}
                    <ul className="divide-y divide-border">
                      {accountRows.map((row) => {
                        const meta = STATUS_META[row.status];
                        const StatusIcon = meta.icon;
                        const refreshKey = rowKey(row, "refresh");
                        const backfillKey = rowKey(row, "backfill");
                        const refreshing = pendingKey === refreshKey;
                        const backfilling = pendingKey === backfillKey;
                        return (
                          <li
                            key={`${row.accountId}-${row.dimension}`}
                            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <StatusIcon
                                className={cn(
                                  "mt-0.5 h-4 w-4 shrink-0",
                                  meta.iconClass,
                                )}
                                aria-hidden="true"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium text-foreground">
                                    {DIMENSION_LABELS[row.dimension] ??
                                      row.dimension}
                                  </p>
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                                      meta.badgeClass,
                                    )}
                                  >
                                    {meta.label}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground tabular-nums">
                                    Lag: {formatLag(row.lagSeconds)}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  Último refresh:{" "}
                                  <span className="tabular-nums">
                                    {formatDateTimeShort(row.lastRefreshAt)}
                                  </span>
                                  {row.newestBucketDate ? (
                                    <>
                                      {" "}
                                      · Bucket mais recente:{" "}
                                      <span className="tabular-nums">
                                        {row.newestBucketDate}
                                      </span>
                                    </>
                                  ) : null}
                                </p>
                                {row.lastError ? (
                                  <p className="mt-1 line-clamp-2 break-words text-[11px] text-rose-500">
                                    {row.lastError}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleRefresh(row)}
                                disabled={refreshing || backfilling}
                                className="cursor-pointer min-h-[36px]"
                              >
                                {refreshing ? (
                                  <Loader2
                                    className="mr-1.5 h-4 w-4 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <RefreshCcw
                                    className="mr-1.5 h-4 w-4"
                                    aria-hidden="true"
                                  />
                                )}
                                Rodar agora
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleBackfill(row)}
                                disabled={refreshing || backfilling}
                                className="cursor-pointer min-h-[36px]"
                              >
                                {backfilling ? (
                                  <Loader2
                                    className="mr-1.5 h-4 w-4 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <History
                                    className="mr-1.5 h-4 w-4"
                                    aria-hidden="true"
                                  />
                                )}
                                Backfill {BACKFILL_DAYS_DEFAULT} dias
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </section>
              );
            })}

            <p className="text-[11px] text-muted-foreground">
              Status: <span className="text-emerald-500">Fresco</span> &lt; 10min ·
              <span className="ml-1 text-amber-500">Atrasado</span> 10–30min ·
              <span className="ml-1 text-rose-500">Travado</span> &gt; 30min.
              Backfill enfileira um job único com <code>days={BACKFILL_DAYS_DEFAULT}</code>;
              o processador respeitará o parâmetro em release seguinte (TODO T8.1).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
