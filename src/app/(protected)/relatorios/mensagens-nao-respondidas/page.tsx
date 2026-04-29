import { MessageSquareWarning, Clock, AlertTriangle, ListChecks, ExternalLink } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { mensagensNaoRespondidas } from "@/lib/chatwoot/queries/mensagens-nao-respondidas";
import { formatPhone } from "@/lib/utils/format-phone";
import type { ReportFilters } from "@/lib/chatwoot/filters";

export const metadata = {
  title: "Mensagens não respondidas | Nexus Insights",
};
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function formatWaiting(seconds: number): string {
  if (!seconds || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(seconds / 3600);
  const remMin = Math.round((seconds % 3600) / 60);
  if (hours < 24) return remMin > 0 ? `${hours}h ${remMin}min` : `${hours}h`;
  const days = Math.floor(seconds / 86400);
  const remHours = Math.floor((seconds % 86400) / 3600);
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

function chatwootUrl(accountId: number, displayId: number): string {
  const base =
    process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL ||
    process.env.CHATWOOT_BASE_URL ||
    "https://chatwoot.znsolucoes.com.br";
  return `${base}/app/accounts/${accountId}/conversations/${displayId}`;
}

export default async function MensagensNaoRespondidasPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const accountId = await getActiveAccountId();
  await searchParams; // reservado para filtros futuros (inbox/team/atendente)

  const filters: ReportFilters = {};

  const result = await mensagensNaoRespondidas({
    accountId,
    filters,
  }).catch(() => ({
    data: { rows: [], total: 0, avgWaitingSeconds: 0, oldestWaitingSeconds: 0 },
    cachedAt: null as string | null,
    stale: true,
  }));

  const data = "data" in result ? result.data : result;
  const cachedAt = "cachedAt" in result ? result.cachedAt : null;
  const stale = "stale" in result ? result.stale : false;

  return (
    <div>
      <PageHeader
        icon={MessageSquareWarning}
        title="Mensagens não respondidas"
        subtitle="Conversas em aberto cuja última mensagem foi do contato"
        actions={cachedAt ? <CachedBadge cachedAt={cachedAt} /> : null}
      />

      {stale ? <StaleBanner cachedAt={cachedAt} /> : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KpiCard
          icon={ListChecks}
          label="Total"
          value={data.total.toString()}
          tone="danger"
        />
        <KpiCard
          icon={Clock}
          label="Tempo médio de espera"
          value={formatWaiting(data.avgWaitingSeconds)}
          tone="warning"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Mais antigo"
          value={formatWaiting(data.oldestWaitingSeconds)}
          tone="danger"
        />
      </div>

      {data.rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-muted/20 p-12 text-center">
          <h3 className="text-sm font-medium text-foreground">
            Nenhuma conversa aguardando resposta
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Todas as conversas em aberto já tiveram resposta da equipe.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border">
            {data.rows.map((row) => (
              <div key={row.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-[10px] text-muted-foreground block mb-1">
                      #{row.display_id}
                    </span>
                    <h3 className="text-sm font-medium text-foreground truncate">
                      {row.contact_name ?? "—"}
                    </h3>
                    {row.contact_phone ? (
                      <p className="text-xs text-muted-foreground">
                        {formatPhone(row.contact_phone)}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={chatwootUrl(accountId, row.display_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400 hover:text-violet-300 p-1.5"
                    aria-label="Abrir no Chatwoot"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground block">Estado</span>
                    <span className="text-foreground/80">{row.inbox_name ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground block">Atendente</span>
                    <span className="text-foreground/80">{row.assignee_name ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground block">Departamento</span>
                    <span className="text-foreground/80">{row.team_name ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground block">Aguardando há</span>
                    <span className="font-medium text-red-400">{formatWaiting(row.waiting_seconds)}</span>
                  </div>
                </div>
                {row.snippet ? (
                  <p className="text-xs text-muted-foreground line-clamp-2 italic">
                    "{row.snippet}"
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <table className="hidden md:table w-full">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left text-xs uppercase tracking-wide text-muted-foreground px-4 py-3 w-16">#</th>
                <th className="text-left text-xs uppercase tracking-wide text-muted-foreground px-4 py-3">Nome</th>
                <th className="text-left text-xs uppercase tracking-wide text-muted-foreground px-4 py-3">WhatsApp</th>
                <th className="text-left text-xs uppercase tracking-wide text-muted-foreground px-4 py-3">Estado</th>
                <th className="text-left text-xs uppercase tracking-wide text-muted-foreground px-4 py-3">Departamento</th>
                <th className="text-left text-xs uppercase tracking-wide text-muted-foreground px-4 py-3">Atendente</th>
                <th className="text-left text-xs uppercase tracking-wide text-muted-foreground px-4 py-3">Aguardando há</th>
                <th className="text-left text-xs uppercase tracking-wide text-muted-foreground px-4 py-3">Mensagem</th>
                <th className="text-right text-xs uppercase tracking-wide text-muted-foreground px-4 py-3 w-20">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="font-mono text-xs text-muted-foreground px-4 py-3">#{row.display_id}</td>
                  <td className="text-sm font-medium text-foreground px-4 py-3 truncate max-w-[200px]">
                    {row.contact_name ?? "—"}
                  </td>
                  <td className="text-xs text-muted-foreground px-4 py-3 whitespace-nowrap">
                    {row.contact_phone ? formatPhone(row.contact_phone) : "—"}
                  </td>
                  <td className="text-xs text-muted-foreground px-4 py-3">{row.inbox_name ?? "—"}</td>
                  <td className="text-xs text-muted-foreground px-4 py-3">{row.team_name ?? "—"}</td>
                  <td className="text-xs text-muted-foreground px-4 py-3">{row.assignee_name ?? "—"}</td>
                  <td className="text-xs font-medium text-red-400 px-4 py-3 whitespace-nowrap">
                    {formatWaiting(row.waiting_seconds)}
                  </td>
                  <td className="text-xs text-muted-foreground px-4 py-3 max-w-xs">
                    <span className="truncate block italic" title={row.snippet ?? undefined}>
                      {row.snippet ? `"${row.snippet}"` : "—"}
                    </span>
                  </td>
                  <td className="text-right px-4 py-3">
                    <Link
                      href={chatwootUrl(accountId, row.display_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex text-violet-400 hover:text-violet-300 p-1.5"
                      aria-label="Abrir no Chatwoot"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
