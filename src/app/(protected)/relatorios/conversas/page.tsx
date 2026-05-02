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
import { resolvePeriod } from "@/lib/reports/resolve-period";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import { deserializeFilterState } from "@/lib/reports/filter-state";
import type { ReportFilters } from "@/lib/chatwoot/filters";

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

  const accountId = await getActiveAccountId();
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
      page: filterState.page ?? 1,
      pageSize: 1000,
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
  const conversasPage = conversasResult.page ?? 1;
  const conversasPageSize = conversasResult.pageSize ?? 1000;
  const conversasTotalPages = conversasResult.totalPages ?? 0;

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
            total={conversasTotal}
            page={conversasPage}
            pageSize={conversasPageSize}
            totalPages={conversasTotalPages}
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
