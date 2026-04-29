import { MessageSquare } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import {
  ConversasFilters,
  deserializeFilters,
} from "@/components/reports/conversas-filters";
import { ConversasTable } from "@/components/reports/conversas-table";
import { getCurrentUser } from "@/lib/auth";
import { getInboxes, getTeams } from "@/lib/chatwoot/queries/meta-cache";
import { getPeriod } from "@/components/reports/period-selector";
import { fetchConversas } from "@/lib/actions/reports/conversas";
import type { ReportFilters } from "@/lib/chatwoot/filters";

export const metadata = { title: "Conversas | Nexus Insights" };
export const dynamic = "force-dynamic";

const ACCOUNT_ID = 9; // Matrix Fitness Group.

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConversasPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
    else if (Array.isArray(v) && v.length > 0) params.set(k, v[0] ?? "");
  }
  const filterValue = deserializeFilters(params);
  const period = getPeriod(filterValue.period);

  const reportFilters: ReportFilters = {
    period,
    inboxIds: filterValue.inboxIds.length ? filterValue.inboxIds : undefined,
    teamIds: filterValue.teamIds.length ? filterValue.teamIds : undefined,
    statuses: filterValue.statuses.length ? filterValue.statuses : undefined,
  };

  // Carrega meta + dados em paralelo. Cada chamada é resiliente
  // a falhas do Chatwoot (cache fallback).
  const [inboxesResult, teamsResult, conversasResult] = await Promise.all([
    getInboxes(ACCOUNT_ID).catch(() => null),
    getTeams(ACCOUNT_ID).catch(() => null),
    fetchConversas({ filters: reportFilters, accountId: ACCOUNT_ID }),
  ]);

  const inboxes = inboxesResult?.data ?? [];
  const teams = teamsResult?.data ?? [];

  const stale =
    conversasResult.stale ||
    Boolean(inboxesResult?.stale) ||
    Boolean(teamsResult?.stale);

  return (
    <div>
      <PageHeader
        icon={MessageSquare}
        title="Conversas"
        subtitle="Lista detalhada de conversas com filtros"
        actions={
          conversasResult.cachedAt ? (
            <CachedBadge cachedAt={conversasResult.cachedAt} />
          ) : null
        }
      />

      {stale ? <StaleBanner cachedAt={conversasResult.cachedAt} /> : null}

      <ConversasFilters
        inboxes={inboxes}
        teams={teams}
        initial={filterValue}
      />

      <ConversasTable
        initialRows={conversasResult.rows}
        initialCursor={conversasResult.nextCursor}
        accountId={ACCOUNT_ID}
        filters={reportFilters}
      />
    </div>
  );
}
