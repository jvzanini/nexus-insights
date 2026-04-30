import { MessageSquare } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { AdvancedFilters } from "@/components/reports/advanced-filters";
import { ConversasTable } from "@/components/reports/conversas-table";
import { RefreshButton } from "@/components/reports/refresh-button";
import { FilterTransitionProvider } from "@/components/reports/filter-transition";
import { ContentLoadingWrapper } from "@/components/reports/content-loading-wrapper";
import { TourButton } from "@/components/tour/tour-button";
import { conversasTour } from "@/lib/tours/conversas-tour";
import { getCurrentUser } from "@/lib/auth";
import {
  getInboxes,
  getTeams,
  getUsers,
} from "@/lib/chatwoot/queries/meta-cache";
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
    excludeMatrixIA,
  };

  // Carrega meta + dados em paralelo. Cada chamada é resiliente a falhas
  // do Chatwoot (cache fallback), por isso o `.catch(() => null)`.
  const [inboxesResult, teamsResult, usersResult, conversasResult] =
    await Promise.all([
      getInboxes(accountId).catch(() => null),
      getTeams(accountId).catch(() => null),
      getUsers(accountId).catch(() => null),
      fetchConversas({ filters: reportFilters, accountId }),
    ]);

  const inboxes = inboxesResult?.data ?? [];
  const teams = teamsResult?.data ?? [];
  const assignees = usersResult?.data ?? [];

  const stale =
    conversasResult.stale ||
    Boolean(inboxesResult?.stale) ||
    Boolean(teamsResult?.stale) ||
    Boolean(usersResult?.stale);

  return (
    <div>
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
          <div data-tour="filters">
            <AdvancedFilters
              inboxes={inboxes}
              teams={teams}
              assignees={assignees}
              initial={filterState}
              accountId={accountId}
            />
          </div>

          <ContentLoadingWrapper>
            <div data-tour="table">
              <ConversasTable
                initialRows={conversasResult.rows}
                initialCursor={conversasResult.nextCursor}
                accountId={accountId}
                filters={reportFilters}
              />
            </div>
          </ContentLoadingWrapper>
        </div>
      </FilterTransitionProvider>
    </div>
  );
}
