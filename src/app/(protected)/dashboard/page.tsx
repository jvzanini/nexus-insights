import {
  Calendar,
  Clock,
  Home,
  Inbox,
  Users,
  UserX,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { CachedBadge } from "@/components/reports/cached-badge";
import { KpiCard } from "@/components/reports/kpi-card";
import { StaleBanner } from "@/components/reports/stale-banner";
import { homeSummary } from "@/lib/chatwoot/queries/home-summary";
import { calculateDelta } from "@/lib/reports/delta";
import { getActiveAccountId } from "@/lib/reports/active-account";

export const metadata = { title: "Dashboard | Nexus Insights" };

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export default async function Page() {
  const accountId = await getActiveAccountId();
  const summary = await homeSummary({ accountId, filters: {} });
  const { data, cachedAt, stale } = summary;

  const backlogTone: "default" | "warning" =
    data.backlog > 100 ? "warning" : "default";
  const orfasTone: "default" | "danger" =
    data.orfas > 50 ? "danger" : "default";

  const sortedAtendentes = [...data.topAtendentes]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);

  const conversasDelta = calculateDelta(
    data.conversasHoje,
    data.conversasOntem,
  );

  return (
    <div>
      <PageHeader
        icon={Home}
        title="Dashboard"
        subtitle="Visão geral dos atendimentos"
        actions={<CachedBadge cachedAt={cachedAt} />}
      />

      {stale ? <StaleBanner cachedAt={cachedAt} /> : null}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Calendar}
          label="Conversas hoje"
          value={data.conversasHoje.toLocaleString("pt-BR")}
          delta={{
            percent: conversasDelta.percent,
            direction: conversasDelta.direction,
            period: "vs ontem",
          }}
        />
        <KpiCard
          icon={Inbox}
          label="Backlog atual"
          value={data.backlog.toLocaleString("pt-BR")}
          hint="Abertas + pendentes"
          tone={backlogTone}
        />
        <KpiCard
          icon={UserX}
          label="Sem atendente"
          value={data.orfas.toLocaleString("pt-BR")}
          hint="Conversas órfãs em aberto"
          tone={orfasTone}
        />
        <KpiCard
          icon={Clock}
          label="Tempo 1ª resposta (p50)"
          value={formatDuration(data.p50FirstResponseSec)}
          hint="últimas 24h"
        />
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-5 transition-colors hover:border-foreground/20">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/10">
              <Users className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Top atendentes
              </h2>
              <p className="text-xs text-muted-foreground">
                Volume nas últimas 24h
              </p>
            </div>
          </div>
        </div>

        {sortedAtendentes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sem atividade de atendentes nas últimas 24h.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {sortedAtendentes.map((a, idx) => (
              <li
                key={a.id}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="w-5 text-xs font-medium text-muted-foreground">
                  {idx + 1}
                </span>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600/15 text-xs font-semibold text-violet-300">
                  {getInitials(a.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.name}</p>
                </div>
                <Badge variant="secondary">
                  {a.volume.toLocaleString("pt-BR")}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
