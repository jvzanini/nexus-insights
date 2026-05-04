import { MailWarning, Hourglass, Timer, ListTodo } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { KpiCard } from "@/components/reports/kpi-card";
import {
  MensagensNaoRespondidasFilters,
  type MensagensFiltersValue,
} from "@/components/reports/mensagens-nao-respondidas-filters";
import { MensagensNaoRespondidasTable } from "@/components/reports/mensagens-nao-respondidas-table";
import { RealtimeMount } from "@/components/reports/realtime-mount";
import { RefreshButton } from "@/components/reports/refresh-button";
import { FilterTransitionProvider } from "@/components/reports/filter-transition";
import { ContentLoadingWrapper } from "@/components/reports/content-loading-wrapper";
import { PageShell } from "@/components/layout/page-shell";
import { TourButton } from "@/components/tour/tour-button";
import { mensagensNaoRespondidasTour } from "@/lib/tours/mensagens-nao-respondidas-tour";
import { getCurrentUser } from "@/lib/auth";
import { isReportVisibleForUser } from "@/lib/reports/visibility";
import { getTeams, getUsers } from "@/lib/chatwoot/queries/meta-cache";
import { getInboxesForUser } from "@/lib/chatwoot/queries/meta-cache-for-user";
import { fetchMensagensNaoRespondidas } from "@/lib/actions/reports/mensagens-nao-respondidas";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { getActiveConnectionId } from "@/lib/reports/active-connection";
import { assertAccountAccess } from "@/lib/tenant";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import { formatDuration } from "@/lib/utils/format-time";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import type { AuthUser } from "@/lib/auth-helpers";

export const metadata = {
  title: "Mensagens não respondidas | Nexus Insights",
};
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function parseIds(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

export default async function MensagensNaoRespondidasPage({
  searchParams,
}: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const visible = await isReportVisibleForUser("mensagens-nao-respondidas", user.platformRole);
  if (!visible) redirect("/dashboard");

  const accountId = await getActiveAccountId(user as AuthUser);
  await assertAccountAccess(user as AuthUser, accountId);
  const connectionId = await getActiveConnectionId(user as AuthUser);
  const sp = await searchParams;

  const inboxRaw = typeof sp.inbox === "string" ? sp.inbox : undefined;
  const teamRaw = typeof sp.team === "string" ? sp.team : undefined;
  const assigneeRaw = typeof sp.assignee === "string" ? sp.assignee : undefined;

  const filterValue: MensagensFiltersValue = {
    inboxIds: parseIds(inboxRaw),
    teamIds: parseIds(teamRaw),
    assigneeIds: parseIds(assigneeRaw),
  };

  const excludeMatrixIA = await shouldExcludeMatrixIA();

  const reportFilters: ReportFilters = {
    inboxIds: filterValue.inboxIds.length ? filterValue.inboxIds : undefined,
    teamIds: filterValue.teamIds.length ? filterValue.teamIds : undefined,
    assigneeIds: filterValue.assigneeIds.length
      ? filterValue.assigneeIds
      : undefined,
    excludeMatrixIA,
  };

  const [inboxesResult, teamsResult, usersResult, dataResult] =
    await Promise.all([
      getInboxesForUser(connectionId, accountId, user).catch(() => null),
      getTeams(connectionId, accountId).catch(() => null),
      getUsers(connectionId, accountId).catch(() => null),
      fetchMensagensNaoRespondidas({
        filters: reportFilters,
        accountId,
      }),
    ]);

  const inboxes = inboxesResult?.data ?? [];
  const teams = teamsResult?.data ?? [];
  const assignees = usersResult?.data ?? [];

  const stale =
    dataResult.stale ||
    Boolean(inboxesResult?.stale) ||
    Boolean(teamsResult?.stale) ||
    Boolean(usersResult?.stale);

  const totalLabel = dataResult.total.toLocaleString("pt-BR");
  const avgLabel = formatDuration(dataResult.avgWaitingSeconds);
  const oldestLabel = formatDuration(dataResult.oldestWaitingSeconds);

  return (
    <PageShell variant="wide">
      <RealtimeMount connectionId={connectionId} accountId={accountId} />
      <PageHeader
        icon={MailWarning}
        title="Mensagens não respondidas"
        subtitle="Conversas em aberto cuja última mensagem foi do contato"
        actions={
          <div className="flex items-center gap-2">
            {dataResult.cachedAt ? (
              <CachedBadge cachedAt={dataResult.cachedAt} />
            ) : null}
            <RefreshButton />
            <TourButton tour={mensagensNaoRespondidasTour} />
          </div>
        }
      />

      {stale ? <StaleBanner cachedAt={dataResult.cachedAt} /> : null}

      <div
        data-tour="mnr-kpis"
        className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <KpiCard
          icon={ListTodo}
          label="Total aguardando"
          value={totalLabel}
          tone={dataResult.total > 0 ? "warning" : "default"}
          hint="Conversas em aberto sem resposta do time"
        />
        <KpiCard
          icon={Timer}
          label="Tempo médio de espera"
          value={avgLabel === "-" ? "—" : avgLabel}
          tone="default"
          hint="Média entre todas em espera"
        />
        <KpiCard
          icon={Hourglass}
          label="Mais antigo"
          value={oldestLabel === "-" ? "—" : oldestLabel}
          tone={dataResult.oldestWaitingSeconds >= 86400 ? "danger" : "warning"}
          hint="Maior tempo aguardando agora"
        />
      </div>

      <FilterTransitionProvider>
        <div data-tour="mnr-filters">
          <MensagensNaoRespondidasFilters
            inboxes={inboxes}
            teams={teams}
            assignees={assignees}
            initial={filterValue}
          />
        </div>

        <ContentLoadingWrapper>
          <div data-tour="mnr-table">
            <MensagensNaoRespondidasTable
              rows={dataResult.rows}
              accountId={accountId}
            />
          </div>
        </ContentLoadingWrapper>
      </FilterTransitionProvider>
    </PageShell>
  );
}
