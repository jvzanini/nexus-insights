"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Inbox,
  Loader2,
  Pause,
  Play,
  Radio,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listRecentSyncRuns,
  type SyncRunEvent,
} from "@/lib/actions/nexus-chat/sync-stream";

/**
 * Aba 2 — Sincronização (substitui Tempo real / Webhook).
 *
 * v0.41 — polling delta universal. Mostra:
 *  1. 4 KPI cards polling-aware (Última sync, Runs última 1h estimada,
 *     Erros 24h, Linhas sync 1h estimadas).
 *  2. Lista de runs recentes (até 200 audit logs `polling_*`).
 *  3. Pause/Play do polling 5s da UI (≠ do polling do worker, que roda
 *     a cada `pollingIntervalSeconds`).
 *
 * IMPORTANTE: o worker faz apenas 1/100 audit em runs OK (sample rate em
 * B16 — `polling_sync_completed` só rola Math.random() < 0.01). Erros são
 * 100% audited. KPIs corrigem isso multiplicando por 100 (estimativa).
 *
 * Polling: setInterval 5s quando !paused. Cleanup no unmount + ao trocar
 * paused. Sem virtualização nesta versão (200 rows é leve).
 *
 * Paleta semântica (ui-ux-pro-max):
 *  - emerald: success / sync recente
 *  - amber:  warning / sync atrasado moderado
 *  - rose:   error / falha de sync
 *  - violet: neutro / contadores
 *  - zinc:   sem dado
 */

const POLL_INTERVAL_MS = 5000;
const AUDIT_SAMPLE_RATE = 100; // 1/100 sample em runs OK (B16)

interface Props {
  connectionId: string;
  /** Timestamp ISO do último polling delta com sucesso. `null` = nunca rodou. */
  lastSyncAt: string | null;
  /** Intervalo em segundos entre cada tick do worker (default 30, mín 20). */
  pollingIntervalSeconds: number;
}

export function SincronizacaoTab({
  connectionId,
  lastSyncAt,
  pollingIntervalSeconds,
}: Props) {
  const [events, setEvents] = useState<SyncRunEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEvents = useCallback(
    async (isInitial: boolean) => {
      if (!isInitial) setRefreshing(true);
      const result = await listRecentSyncRuns({
        connectionId,
        limit: 200,
      });
      if (result.success && result.data) {
        setEvents(result.data);
        setError(null);
      } else {
        setError(result.error ?? "Falha ao carregar runs.");
      }
      if (isInitial) setInitialLoading(false);
      setRefreshing(false);
    },
    [connectionId],
  );

  // Fetch inicial.
  useEffect(() => {
    fetchEvents(true);
  }, [fetchEvents]);

  // Polling.
  useEffect(() => {
    if (paused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      fetchEvents(false);
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [paused, fetchEvents]);

  const kpis = useMemo(() => deriveKpis(events, lastSyncAt), [
    events,
    lastSyncAt,
  ]);

  return (
    <div className="grid gap-4">
      <header
        data-tour="sincronizacao-header"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-violet-500" aria-hidden />
          <h2 className="text-sm font-medium">Sincronização (polling delta)</h2>
          {refreshing ? (
            <Loader2
              className="h-3 w-3 animate-spin text-muted-foreground"
              aria-label="Atualizando"
            />
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Retomar atualização" : "Pausar atualização"}
        >
          {paused ? (
            <>
              <Play className="h-3.5 w-3.5" aria-hidden />
              Retomar
            </>
          ) : (
            <>
              <Pause className="h-3.5 w-3.5" aria-hidden />
              Pausar
            </>
          )}
        </Button>
      </header>

      <p className="text-xs text-muted-foreground">
        Esta tela atualiza a cada 5s. O worker faz o sync efetivo a cada{" "}
        <span className="font-medium tabular-nums text-foreground">
          {pollingIntervalSeconds}s
        </span>{" "}
        (configurável na Aba Conexão).
      </p>

      <div data-tour="sincronizacao-kpis">
        <KpiGrid kpis={kpis} loading={initialLoading} />
      </div>

      {paused ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <Pause className="h-3.5 w-3.5" aria-hidden />
          Atualização pausada — clique em <strong>Retomar</strong> para voltar
          a atualizar a cada 5s.
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" aria-hidden />
          <div className="grid gap-0.5">
            <p className="text-sm font-medium text-rose-500">
              Falha ao carregar runs
            </p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      ) : null}

      <div data-tour="sincronizacao-runs">
        <RunList events={events} loading={initialLoading} />
      </div>
    </div>
  );
}

interface Kpis {
  /** Label formatado da última sync (ex: "há 30s", "agora"). */
  lastSyncLabel: string;
  /** Tom semântico do KPI Última sync. */
  lastSyncTone: "emerald" | "amber" | "rose" | "zinc";
  /** Estimativa de runs/h (sample × 100 em ok + erros 100%). */
  runsLastHourEstimate: number;
  /** Erros nas últimas 24h (counted at 100% no audit). */
  errorsLast24h: number;
  /** Estimativa de linhas sincronizadas na última 1h. */
  rowsLastHourEstimate: number;
}

function deriveKpis(events: SyncRunEvent[], lastSyncAt: string | null): Kpis {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60_000;
  const oneDayAgo = now - 24 * 60 * 60_000;

  let runsOkLastHourSample = 0;
  let runsFailedLastHour = 0;
  let rowsLastHourSample = 0;
  let errorsLast24h = 0;

  for (const ev of events) {
    const ts = Date.parse(ev.createdAt);
    if (Number.isNaN(ts)) continue;

    if (ts >= oneHourAgo && ev.action === "polling_sync_completed") {
      runsOkLastHourSample += 1;
      const total = (ev.details?.totalRows as number | undefined) ?? 0;
      if (typeof total === "number" && Number.isFinite(total) && total >= 0) {
        rowsLastHourSample += total;
      }
    }
    if (ts >= oneHourAgo && ev.action === "polling_sync_failed") {
      runsFailedLastHour += 1;
    }
    if (ts >= oneDayAgo && ev.action === "polling_sync_failed") {
      errorsLast24h += 1;
    }
  }

  // Sample correction: `polling_sync_completed` só audita 1/100 (B16).
  // `polling_sync_failed` é 100% audited.
  const runsLastHourEstimate =
    runsOkLastHourSample * AUDIT_SAMPLE_RATE + runsFailedLastHour;
  const rowsLastHourEstimate = rowsLastHourSample * AUDIT_SAMPLE_RATE;

  const { label, tone } = formatLastSync(lastSyncAt);

  return {
    lastSyncLabel: label,
    lastSyncTone: tone,
    runsLastHourEstimate,
    errorsLast24h,
    rowsLastHourEstimate,
  };
}

function formatLastSync(lastSyncAt: string | null): {
  label: string;
  tone: "emerald" | "amber" | "rose" | "zinc";
} {
  if (!lastSyncAt) {
    return { label: "Sem registro", tone: "zinc" };
  }
  const ts = Date.parse(lastSyncAt);
  if (Number.isNaN(ts)) return { label: "Inválido", tone: "zinc" };
  const lagSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  // Tom emerald até 2× pollingInterval default (60s); amber até 5min;
  // rose acima.
  let tone: "emerald" | "amber" | "rose" = "emerald";
  if (lagSec > 300) tone = "rose";
  else if (lagSec >= 90) tone = "amber";

  return { label: formatLag(lagSec), tone };
}

function formatLag(lagSec: number): string {
  if (lagSec < 1) return "agora";
  if (lagSec < 60) return `há ${lagSec}s`;
  const lagMin = Math.floor(lagSec / 60);
  if (lagMin < 60) return `há ${lagMin} min`;
  const hours = Math.floor(lagMin / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

function KpiGrid({ kpis, loading }: { kpis: Kpis; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard
        label="Última sync"
        value={kpis.lastSyncLabel}
        tone={kpis.lastSyncTone}
      />
      <KpiCard
        label="Runs última 1h (est.)"
        value={kpis.runsLastHourEstimate.toString()}
        tone={kpis.runsLastHourEstimate > 0 ? "violet" : "zinc"}
      />
      <KpiCard
        label="Erros 24h"
        value={kpis.errorsLast24h.toString()}
        tone={kpis.errorsLast24h > 0 ? "rose" : "emerald"}
      />
      <KpiCard
        label="Linhas sync 1h (est.)"
        value={
          kpis.rowsLastHourEstimate > 0
            ? compactNumber(kpis.rowsLastHourEstimate)
            : "0"
        }
        tone={kpis.rowsLastHourEstimate > 0 ? "violet" : "zinc"}
      />
    </div>
  );
}

function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
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

function KpiCard({
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

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

function describeRun(ev: SyncRunEvent): string | null {
  const d = ev.details ?? {};
  if (
    ev.action === "polling_sync_completed" ||
    ev.action === "polling_sync_failed"
  ) {
    const dur = (d.durationMs as number | undefined) ?? null;
    const total = (d.totalRows as number | undefined) ?? null;
    const parts: string[] = [];
    if (typeof dur === "number") parts.push(`${dur}ms`);
    if (typeof total === "number") parts.push(`${total} linhas`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  if (ev.action === "polling_interval_updated") {
    const next = (d.next as number | undefined) ?? null;
    if (typeof next === "number") return `→ ${next}s`;
  }
  return null;
}

function RunList({
  events,
  loading,
}: {
  events: SyncRunEvent[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-2 rounded-xl border border-border bg-card p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground/50" aria-hidden />
        <h3 className="text-sm font-medium">Sem runs registrados ainda</h3>
        <p className="max-w-md text-xs text-muted-foreground">
          O worker registra os primeiros runs assim que detectar mudanças no
          banco do Nexus Chat. Runs OK são amostrados (1/100) — falhas são
          100% registradas.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <ul className="divide-y divide-border">
        {events.map((ev) => {
          const badge = getActionBadge(ev.action);
          const summary = describeRun(ev);
          return (
            <li
              key={ev.id}
              className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-xs hover:bg-muted/50"
            >
              <span className="w-[8.5rem] shrink-0 font-mono tabular-nums text-muted-foreground">
                {formatTimestamp(ev.createdAt)}
              </span>
              <Badge
                variant="outline"
                className={`text-[11px] ${badge.classes}`}
              >
                {badge.label}
              </Badge>
              {summary ? (
                <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                  {summary}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
