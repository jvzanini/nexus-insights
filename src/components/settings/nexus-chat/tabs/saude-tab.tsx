"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
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
  listRecentWebhookEvents,
  type WebhookEvent,
} from "@/lib/actions/nexus-chat/realtime-stream";

/**
 * Aba 4 — Saúde.
 *
 * Mostra:
 *  1. 4 cards heartbeat (lag, eventos 24h, erros 24h, jobs com erro 24h).
 *  2. Lista de audit logs últimas 50 ações webhook_* da connection.
 *
 * Diferença vs Aba 2 (Tempo real):
 *  - Aba 2 = polling 5s + KPIs derivados de ~200 eventos in-memory.
 *  - Aba 4 = snapshot único do banco (counters via prisma.count) + lista
 *    de 50 eventos pra inspeção rápida. Sem polling.
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
  if (details.event && typeof details.event === "string") {
    keys.push(`event=${details.event}`);
  }
  if (typeof details.accountId === "number" || typeof details.accountId === "string") {
    keys.push(`acc#${details.accountId}`);
  }
  if (typeof details.durationMs === "number") {
    keys.push(`${details.durationMs}ms`);
  }
  if (typeof details.kind === "string" && !details.event) {
    keys.push(details.kind);
  }
  return keys.join(" · ");
}

export function SaudeTab({ connectionId }: { connectionId: string }) {
  const [snapshot, setSnapshot] = useState<ConnectionHealthSnapshot | null>(
    null,
  );
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [healthResult, eventsResult] = await Promise.all([
        getConnectionHealthSnapshot(connectionId),
        listRecentWebhookEvents({ connectionId, limit: 50 }),
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

  return (
    <div className="grid gap-4">
      <header className="flex items-center gap-2">
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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : snapshot ? (
        <HealthCardsGrid snapshot={snapshot} />
      ) : null}

      <div className="grid gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          Audit logs recentes (50 últimos)
        </h3>
        {loading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-medium">Sem audit logs webhook</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Não há registros de webhook recentes para esta conexão.
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
  const heartbeat = formatLag(snapshot.lastWebhookLagMinutes);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <HealthCard
        label="Heartbeat"
        value={heartbeat.label}
        tone={heartbeat.tone}
      />
      <HealthCard
        label="Eventos 24h"
        value={snapshot.webhooksLast24h.toString()}
        tone={snapshot.webhooksLast24h > 0 ? "violet" : "zinc"}
      />
      <HealthCard
        label="Erros 24h"
        value={snapshot.errorsLast24h.toString()}
        tone={snapshot.errorsLast24h > 0 ? "rose" : "emerald"}
      />
      <HealthCard
        label="Jobs com erro 24h"
        value={snapshot.jobErrorsLast24h.toString()}
        tone={snapshot.jobErrorsLast24h > 0 ? "rose" : "emerald"}
      />
    </div>
  );
}
