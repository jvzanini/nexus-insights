"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  HeartPulse,
  Inbox,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getConnectionHealthSnapshot,
  type ConnectionHealthSnapshot,
} from "@/lib/actions/nexus-chat/health-metrics";
import {
  listRecentSyncRuns,
  type SyncRunEvent,
} from "@/lib/actions/nexus-chat/sync-stream";

/**
 * Aba 4 — Saúde (v0.41 polling-aware).
 *
 * Mostra:
 *  1. 4 cards heartbeat (lag last sync, runs 24h estimadas, erros 24h,
 *     jobs com erro 24h).
 *  2. **Card "Erros recentes (top 5)"** com tabela de polling_sync_failed
 *     e mensagem do firstError (truncada). Empty state OK quando 0
 *     erros — banner emerald "✓ Nenhum erro de sync nas últimas 24h."
 *  3. Lista de audit logs últimas 50 ações `polling_*` da connection.
 *
 * Diferença vs Aba 2 (Sincronização):
 *  - Aba 2 = polling 5s + KPIs derivados de ~200 events in-memory.
 *  - Aba 4 = snapshot único do banco (counters via prisma.count) + lista
 *    de 50 events pra inspeção rápida + foco em ERROS. Sem polling.
 *
 * Paleta semântica (ui-ux-pro-max):
 *  - emerald: heartbeat fresh (<60min), zero erros
 *  - amber: heartbeat morno (60-360min), warnings
 *  - rose: heartbeat stale (>360min), erros >0
 *  - violet: neutros / contadores positivos
 *  - zinc: indisponível / null
 */

const ACTION_BADGE: Record<
  string,
  { label: string; classes: string }
> = {
  polling_sync_completed: {
    label: "Sync OK",
    classes: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  polling_sync_failed: {
    label: "Sync falhou",
    classes: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  },
  polling_full_sweep_started: {
    label: "Sweep iniciado",
    classes: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  },
  polling_full_sweep_completed: {
    label: "Sweep OK",
    classes: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  },
  polling_interval_updated: {
    label: "Intervalo alterado",
    classes: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
};

function getActionBadge(action: string): { label: string; classes: string } {
  return (
    ACTION_BADGE[action] ?? {
      label: action,
      classes: "bg-muted text-muted-foreground border-border",
    }
  );
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

function formatLag(lagMin: number | null): {
  label: string;
  tone: "emerald" | "amber" | "rose" | "zinc";
} {
  if (lagMin === null) return { label: "Sem registro", tone: "zinc" };
  let tone: "emerald" | "amber" | "rose" = "emerald";
  if (lagMin > 360) tone = "rose";
  else if (lagMin >= 60) tone = "amber";

  let label: string;
  if (lagMin < 1) label = "agora";
  else if (lagMin < 60) label = `há ${lagMin} min`;
  else if (lagMin < 24 * 60) label = `há ${Math.floor(lagMin / 60)}h`;
  else label = `há ${Math.floor(lagMin / 60 / 24)}d`;

  return { label, tone };
}

const TONE_CLASSES: Record<
  "emerald" | "amber" | "rose" | "violet" | "zinc",
  { value: string; bullet: string }
> = {
  emerald: {
    value: "text-emerald-500",
    bullet: "bg-emerald-500",
  },
  amber: {
    value: "text-amber-500",
    bullet: "bg-amber-500",
  },
  rose: {
    value: "text-rose-500",
    bullet: "bg-rose-500",
  },
  violet: {
    value: "text-violet-500",
    bullet: "bg-violet-500",
  },
  zinc: {
    value: "text-muted-foreground",
    bullet: "bg-zinc-400",
  },
};

function HealthCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "rose" | "violet" | "zinc";
}) {
  const classes = TONE_CLASSES[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${classes.bullet}`}
          aria-hidden
        />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p
        className={`mt-2 font-heading text-2xl font-semibold tabular-nums ${classes.value}`}
      >
        {value}
      </p>
    </div>
  );
}

function detailsSnippet(details: Record<string, unknown>): string {
  const keys: string[] = [];
  if (typeof details.totalRows === "number") {
    keys.push(`${details.totalRows} linhas`);
  }
  if (typeof details.durationMs === "number") {
    keys.push(`${details.durationMs}ms`);
  }
  if (typeof details.hadChanges === "boolean") {
    keys.push(details.hadChanges ? "com mudanças" : "sem mudanças");
  }
  if (typeof details.next === "number") {
    keys.push(`→ ${details.next}s`);
  }
  return keys.join(" · ");
}

export function SaudeTab({ connectionId }: { connectionId: string }) {
  const [snapshot, setSnapshot] = useState<ConnectionHealthSnapshot | null>(
    null,
  );
  const [events, setEvents] = useState<SyncRunEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [healthResult, eventsResult] = await Promise.all([
        getConnectionHealthSnapshot(connectionId),
        listRecentSyncRuns({ connectionId, limit: 50 }),
      ]);
      if (cancelled) return;

      if (healthResult.success && healthResult.data) {
        setSnapshot(healthResult.data);
      } else {
        setError(healthResult.error ?? "Falha ao carregar saúde.");
      }

      if (eventsResult.success && eventsResult.data) {
        setEvents(eventsResult.data);
      }

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  const recentErrors = events
    .filter((ev) => ev.action === "polling_sync_failed")
    .slice(0, 5);

  return (
    <div className="grid gap-4">
      <header
        data-tour="saude-header"
        className="flex items-center gap-2"
      >
        <HeartPulse className="h-4 w-4 text-violet-500" aria-hidden />
        <h2 className="text-sm font-medium">Saúde da conexão</h2>
        {loading ? (
          <Loader2
            className="h-3 w-3 animate-spin text-muted-foreground"
            aria-label="Carregando"
          />
        ) : null}
      </header>

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" aria-hidden />
          <div className="grid gap-0.5">
            <p className="text-sm font-medium text-rose-500">
              Falha ao carregar snapshot
            </p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div
          data-tour="saude-kpis"
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : snapshot ? (
        <div data-tour="saude-kpis">
          <HealthCardsGrid snapshot={snapshot} />
        </div>
      ) : null}

      {/* L-1: Erros recentes (top 5) — mostra rapidamente os polling_sync_failed
          mais recentes pra triagem. Empty state OK quando 0 erros. */}
      <div className="grid gap-2" data-tour="saude-erros">
        <h3 className="text-xs font-medium text-muted-foreground">
          Erros recentes (top 5)
        </h3>
        {loading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : recentErrors.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 px-3 py-3 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Nenhum erro de sync nas últimas 24h.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-rose-500/30 bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">Quando</TableHead>
                  <TableHead className="text-xs">Tabela</TableHead>
                  <TableHead className="text-xs">Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentErrors.map((ev) => {
                  const errors = (ev.details?.errors ?? []) as Array<{
                    tableName: string;
                    error: string;
                  }>;
                  const firstError = errors[0];
                  return (
                    <TableRow
                      key={ev.id}
                      className="border-border hover:bg-muted/50"
                    >
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {formatDateTime(ev.createdAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {firstError?.tableName ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-md truncate text-xs text-rose-500">
                        {(firstError?.error ?? "—").slice(0, 200)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="grid gap-2" data-tour="saude-audit">
        <h3 className="text-xs font-medium text-muted-foreground">
          Audit logs recentes (50 últimos)
        </h3>
        {loading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-medium">Sem audit logs de sync</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Não há registros de polling delta recentes para esta conexão.
              Aguarde o próximo tick do worker.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">Ação</TableHead>
                  <TableHead className="text-xs">Detalhes</TableHead>
                  <TableHead className="text-xs">Quando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev) => {
                  const badge = getActionBadge(ev.action);
                  return (
                    <TableRow
                      key={ev.id}
                      className="border-border hover:bg-muted/50"
                    >
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[11px] ${badge.classes}`}
                        >
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {detailsSnippet(ev.details) || (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(ev.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function HealthCardsGrid({
  snapshot,
}: {
  snapshot: ConnectionHealthSnapshot;
}) {
  const heartbeat = formatLag(snapshot.lastSyncLagMinutes);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <HealthCard
        label="Heartbeat"
        value={heartbeat.label}
        tone={heartbeat.tone}
      />
      <HealthCard
        label="Runs 24h (est.)"
        value={snapshot.syncRunsLast24h.toString()}
        tone={snapshot.syncRunsLast24h > 0 ? "violet" : "zinc"}
      />
      <HealthCard
        label="Erros 24h"
        value={snapshot.syncErrorsLast24h.toString()}
        tone={snapshot.syncErrorsLast24h > 0 ? "rose" : "emerald"}
      />
      <HealthCard
        label="Jobs com erro 24h"
        value={snapshot.jobErrorsLast24h.toString()}
        tone={snapshot.jobErrorsLast24h > 0 ? "rose" : "emerald"}
      />
    </div>
  );
}
