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
  listRecentWebhookEvents,
  type WebhookEvent,
} from "@/lib/actions/nexus-chat/realtime-stream";

/**
 * Aba 2 — Tempo real.
 *
 * Mostra:
 *  1. 4 KPI cards (eventos/h, latência média, erros 24h, última heartbeat).
 *  2. Lista de eventos webhook recentes (até 200).
 *  3. Pause/Play do polling 5s.
 *
 * Polling: setInterval 5s quando !paused. Cleanup no unmount + ao trocar
 * paused. Sem virtualização nesta versão (200 rows é leve).
 *
 * Paleta semântica (ui-ux-pro-max):
 *  - emerald: success/heartbeat fresh/recebido
 *  - amber: warning/rate limit
 *  - rose: error/HMAC rejeitado
 *  - violet: neutro/eventos
 *  - zinc: ignorado/no_binding
 */

const POLL_INTERVAL_MS = 5000;

export function TempoRealTab(props: {
  connectionId: string;
  lastWebhookAt: string | null;
}) {
  const { connectionId, lastWebhookAt } = props;
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEvents = useCallback(
    async (isInitial: boolean) => {
      if (!isInitial) setRefreshing(true);
      const result = await listRecentWebhookEvents({
        connectionId,
        limit: 200,
      });
      if (result.success && result.data) {
        setEvents(result.data);
        setError(null);
      } else {
        setError(result.error ?? "Falha ao carregar eventos.");
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

  const kpis = useMemo(() => deriveKpis(events, lastWebhookAt), [
    events,
    lastWebhookAt,
  ]);

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-violet-500" aria-hidden />
          <h2 className="text-sm font-medium">Stream em tempo real</h2>
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

      <KpiGrid kpis={kpis} loading={initialLoading} />

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
              Falha ao carregar eventos
            </p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      ) : null}

      <EventList events={events} loading={initialLoading} />
    </div>
  );
}

interface Kpis {
  eventsLastHour: number;
  avgDurationMs: number | null;
  errorsLast24h: number;
  heartbeatLabel: string;
  heartbeatTone: "emerald" | "amber" | "rose" | "zinc";
}

function deriveKpis(events: WebhookEvent[], lastWebhookAt: string | null): Kpis {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60_000;
  const oneDayAgo = now - 24 * 60 * 60_000;

  let eventsLastHour = 0;
  let totalDurationMs = 0;
  let durationSamples = 0;
  let errorsLast24h = 0;

  for (const ev of events) {
    const ts = Date.parse(ev.createdAt);
    if (Number.isNaN(ts)) continue;

    if (ev.action === "webhook_received" && ts >= oneHourAgo) {
      eventsLastHour += 1;
      const d = ev.details?.durationMs;
      if (typeof d === "number" && d >= 0) {
        totalDurationMs += d;
        durationSamples += 1;
      }
    }

    if (
      ts >= oneDayAgo &&
      (ev.action === "webhook_rejected_hmac" ||
        ev.action === "webhook_rejected_rate_limit")
    ) {
      errorsLast24h += 1;
    }
  }

  const avgDurationMs =
    durationSamples > 0
      ? Math.round(totalDurationMs / durationSamples)
      : null;

  const { label, tone } = formatHeartbeat(lastWebhookAt);

  return {
    eventsLastHour,
    avgDurationMs,
    errorsLast24h,
    heartbeatLabel: label,
    heartbeatTone: tone,
  };
}

function formatHeartbeat(lastWebhookAt: string | null): {
  label: string;
  tone: "emerald" | "amber" | "rose" | "zinc";
} {
  if (!lastWebhookAt) {
    return { label: "Sem registro", tone: "zinc" };
  }
  const ts = Date.parse(lastWebhookAt);
  if (Number.isNaN(ts)) return { label: "Inválido", tone: "zinc" };
  const lagMin = Math.max(0, Math.floor((Date.now() - ts) / 60_000));
  let tone: "emerald" | "amber" | "rose" = "emerald";
  if (lagMin > 360) tone = "rose";
  else if (lagMin >= 60) tone = "amber";

  return { label: formatLag(lagMin), tone };
}

function formatLag(lagMin: number): string {
  if (lagMin < 1) return "agora";
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
        label="Eventos última 1h"
        value={kpis.eventsLastHour.toString()}
        tone="violet"
      />
      <KpiCard
        label="Latência média (1h)"
        value={
          kpis.avgDurationMs !== null ? `${kpis.avgDurationMs} ms` : "—"
        }
        tone={kpis.avgDurationMs === null ? "zinc" : "violet"}
      />
      <KpiCard
        label="Erros 24h"
        value={kpis.errorsLast24h.toString()}
        tone={kpis.errorsLast24h > 0 ? "rose" : "emerald"}
      />
      <KpiCard
        label="Última heartbeat"
        value={kpis.heartbeatLabel}
        tone={kpis.heartbeatTone}
      />
    </div>
  );
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
  webhook_received: {
    label: "Recebido",
    classes: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  webhook_rejected_hmac: {
    label: "HMAC inválido",
    classes: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  },
  webhook_rejected_rate_limit: {
    label: "Rate limit",
    classes: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  webhook_no_binding: {
    label: "Sem binding",
    classes: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  },
  webhook_token_regenerated: {
    label: "Token regenerado",
    classes: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  },
  webhook_secret_regenerated: {
    label: "Secret regenerado",
    classes: "bg-violet-500/10 text-violet-500 border-violet-500/20",
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

function EventList({
  events,
  loading,
}: {
  events: WebhookEvent[];
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
        <h3 className="text-sm font-medium">Sem eventos webhook</h3>
        <p className="max-w-md text-xs text-muted-foreground">
          Sem eventos webhook nas últimas 24h. Cadastre o webhook no Chatwoot
          (Configurações → Integrações → Webhooks) usando a URL desta conexão.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <ul className="divide-y divide-border">
        {events.map((ev) => {
          const badge = getActionBadge(ev.action);
          const accountId = ev.details?.accountId;
          const event = ev.details?.event;
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
              {typeof accountId === "number" || typeof accountId === "string" ? (
                <span className="font-mono text-muted-foreground">
                  acc#{String(accountId)}
                </span>
              ) : null}
              {typeof event === "string" && event.length > 0 ? (
                <span className="min-w-0 flex-1 truncate text-foreground/80">
                  {event}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
