import { MessageSquare } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { ConversasPageClient } from "@/components/reports/conversas-page-client";
import { RefreshButton } from "@/components/reports/refresh-button";
import { FilterTransitionProvider } from "@/components/reports/filter-transition";
import { PageShell } from "@/components/layout/page-shell";
import { TourButton } from "@/components/tour/tour-button";
import { conversasTour } from "@/lib/tours/conversas-tour";
import { getCurrentUser } from "@/lib/auth";
import { isReportVisibleForUser } from "@/lib/reports/visibility";
import { getTeams, getUsers, getLabels } from "@/lib/chatwoot/queries/meta-cache";
import { getInboxesForUser } from "@/lib/chatwoot/queries/meta-cache-for-user";
import { fetchConversas } from "@/lib/actions/reports/conversas";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { assertAccountAccess } from "@/lib/tenant";
import { resolvePeriod } from "@/lib/reports/resolve-period";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import { deserializeFilterState } from "@/lib/reports/filter-state";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import type { AuthUser } from "@/lib/auth-helpers";

export const metadata = { title: "Conversas | Nexus Insights" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConversasPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const visible = await isReportVisibleForUser("conversas", user.platformRole);
  if (!visible) redirect("/dashboard");

  const accountId = await getActiveAccountId(user as AuthUser);
  await assertAccountAccess(user as AuthUser, accountId);
  const sp = await searchParams;

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
    else if (Array.isArray(v) && v.length > 0) params.set(k, v[0] ?? "");
  }
  const filterState = deserializeFilterState(params);

  const { range: period } = await resolvePeriod({
    period: filterState.period,
    customStart: filterState.customRange?.start ?? null,
    customEnd: filterState.customRange?.end ?? null,
  });

  const excludeMatrixIA = await shouldExcludeMatrixIA();

  const reportFilters: ReportFilters = {
    period,
    inboxIds: filterState.inboxIds.length ? filterState.inboxIds : undefined,
    teamIds: filterState.teamIds.length ? filterState.teamIds : undefined,
    assigneeIds: filterState.assigneeIds.length
      ? filterState.assigneeIds
      : undefined,
    statuses: filterState.statuses.length ? filterState.statuses : undefined,
    priorities: filterState.priorities.length
      ? filterState.priorities
      : undefined,
    labelIds: filterState.labelIds.length ? filterState.labelIds : undefined,
    excludeMatrixIA,
    // search removido: virou client-side em ConversasPageClient (T10).
  };

  // Carrega meta + dados em paralelo. Cada chamada é resiliente a falhas
  // do Chatwoot (cache fallback), por isso o `.catch(() => null)`.
  const [
    inboxesResult,
    teamsResult,
    usersResult,
    labelsResult,
    conversasResult,
  ] = await Promise.all([
    getInboxesForUser(accountId, user).catch(() => null),
    getTeams(accountId).catch(() => null),
    getUsers(accountId).catch(() => null),
    getLabels(accountId).catch(() => null),
    fetchConversas({
      filters: reportFilters,
      accountId,
      page: 1,
      pageSize: 50_000,
    }),
  ]);

  const inboxes = inboxesResult?.data ?? [];
  const teams = teamsResult?.data ?? [];
  const assignees = usersResult?.data ?? [];
  const labels = labelsResult?.data ?? [];

  const stale =
    conversasResult.stale ||
    Boolean(inboxesResult?.stale) ||
    Boolean(teamsResult?.stale) ||
    Boolean(usersResult?.stale) ||
    Boolean(labelsResult?.stale);

  const conversasTotal = conversasResult.total ?? 0;
  const conversasOverCap = conversasTotal > 50_000;

  return (
    <>
      <a href="#conversas-table" className="sr-only">
        Pular para a tabela de conversas
      </a>
      <PageShell variant="wide">
        <PageHeader
        icon={MessageSquare}
        title="Conversas"
        subtitle="Lista detalhada de conversas com filtros avançados"
        actions={
          <div className="flex items-center gap-2">
            {conversasResult.cachedAt ? (
              <CachedBadge cachedAt={conversasResult.cachedAt} />
            ) : null}
            <RefreshButton />
            <TourButton tour={conversasTour} />
          </div>
        }
      />

      {conversasOverCap ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground"
        >
          Período retornou {conversasTotal.toLocaleString("pt-BR")} conversas
          (acima do cap de 50.000 pra busca global). Mostrando as primeiras
          50.000. Refine o período ou os filtros para incluir mais.
        </div>
      ) : null}

      {stale ? <StaleBanner cachedAt={conversasResult.cachedAt} /> : null}

      <FilterTransitionProvider>
        <div className="mt-6 space-y-6">
          <ConversasPageClient
            inboxes={inboxes}
            teams={teams}
            assignees={assignees}
            labels={labels}
            filterState={filterState}
            accountId={accountId}
            initialRows={conversasResult.rows}
            reportFilters={reportFilters}
            conditionGroup={
              filterState.mode === "advanced"
                ? filterState.conditionGroup
                : undefined
            }
            currentChatwootUserId={null}
          />
        </div>
      </FilterTransitionProvider>
      </PageShell>
    </>
  );
}
