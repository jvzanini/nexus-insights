import {
  Bot,
  MessageSquare,
  AlertTriangle,
  Gauge,
  Timer,
  ListOrdered,
} from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { KpiCard } from "@/components/reports/kpi-card";
import { StatusBadge } from "@/components/reports/status-badge";
import { OpenInChatwoot } from "@/components/reports/open-in-chatwoot";
import { getCurrentUser } from "@/lib/auth";
import { getAllSettings } from "@/lib/settings/get";
import { matrixIaMetrics } from "@/lib/chatwoot/queries/matrix-ia";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { formatDuration } from "@/lib/utils/format-time";
import { getActiveAccountId } from "@/lib/reports/active-account";

export const metadata = { title: "Matrix IA | Nexus Insights" };
export const dynamic = "force-dynamic";

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return fallback;
}

function truncate(text: string | null, max = 120): string {
  if (!text) return "(sem mensagem)";
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + "…";
}

function formatDateTimePtBR(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Gate: super_admin only quando feature flag estiver ativa.
  const settings = await getAllSettings();
  const restrictToSuperAdmin = readBoolean(
    settings["feature_flags.matrix_ia_visible_to_super_admin_only"],
    true,
  );
  if (restrictToSuperAdmin && user.platformRole !== "super_admin") {
    redirect("/dashboard");
  }

  const accountId = await getActiveAccountId();

  // Override do excludeMatrixIA — a query força inbox 31 internamente.
  const filters: ReportFilters = { excludeMatrixIA: false };

  const result = await matrixIaMetrics({ accountId: accountId, filters });
  const m = result.data;

  return (
    <div>
      <PageHeader
        icon={Bot}
        title="Matrix IA"
        subtitle="Métricas do canal automatizado"
        actions={
          result.cachedAt ? <CachedBadge cachedAt={result.cachedAt} /> : null
        }
      />

      {result.stale ? <StaleBanner cachedAt={result.cachedAt} /> : null}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={MessageSquare}
          label="Total de conversas"
          value={m.totalConversas.toLocaleString("pt-BR")}
          hint="Inbox Matrix IA"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Cliente sem resposta da IA"
          value={m.cliente_sem_resposta.toLocaleString("pt-BR")}
          hint="Open + última msg do cliente > 5min"
          tone={m.cliente_sem_resposta > 10 ? "warning" : "default"}
        />
        <KpiCard
          icon={Gauge}
          label="p50 resposta da IA"
          value={
            m.p50RespostaIaSec === null
              ? "-"
              : formatDuration(m.p50RespostaIaSec)
          }
          hint="Mediana"
        />
        <KpiCard
          icon={Timer}
          label="Avg resposta da IA"
          value={
            m.avgRespostaIaSec === null
              ? "-"
              : formatDuration(m.avgRespostaIaSec)
          }
          hint="Média"
        />
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/10">
            <ListOrdered className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Últimas 10 conversas da IA
            </h2>
            <p className="text-xs text-muted-foreground">
              Conversas mais recentes no inbox Matrix IA.
            </p>
          </div>
        </div>

        {m.ultimas10.length === 0 ? (
          <div className="flex h-[160px] items-center justify-center text-sm text-muted-foreground">
            Sem conversas no inbox Matrix IA.
          </div>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
            {m.ultimas10.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 bg-background/40 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      #{c.displayId}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {c.contactName ?? "(sem nome)"}
                    </span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {truncate(c.lastMessage)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDateTimePtBR(c.lastActivityAt)}
                  </p>
                </div>
                <div className="shrink-0 sm:pt-1">
                  <OpenInChatwoot
                    accountId={accountId}
                    displayId={c.displayId}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        Visível somente para super admin. Métrica
        <span className="mx-1 font-medium text-foreground">transferidas</span>
        no período: {m.transferidas.toLocaleString("pt-BR")} (heurística:
        conversas atribuídas a usuários humanos).
      </div>
    </div>
  );
}
