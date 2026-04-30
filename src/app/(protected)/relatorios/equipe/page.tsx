import { Suspense } from "react";
import { UsersRound } from "lucide-react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { FactsFreshness } from "@/components/reports/facts-freshness";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import { RefreshButton } from "@/components/reports/refresh-button";
import { FilterTransitionProvider } from "@/components/reports/filter-transition";
import { ContentLoadingWrapper } from "@/components/reports/content-loading-wrapper";
import { PageShell } from "@/components/layout/page-shell";
import { TabsShell } from "@/components/reports/dashboards/tabs-shell";
import { RankingAtendentesContent } from "@/components/reports/dashboards/ranking-atendentes-content";
import { PorDepartamentoContent } from "@/components/reports/dashboards/por-departamento-content";
import {
  ChartSkeleton,
  CardSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";
import { TourButton } from "@/components/tour/tour-button";
import { equipeTour } from "@/lib/tours/equipe-tour";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { parseReportSearchParams } from "@/lib/reports/parse-search-params";
import { isReportVisibleForUser } from "@/lib/reports/visibility";

export const metadata = { title: "Equipe | Nexus Insights" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function RankingFallback() {
  return (
    <div className="space-y-6">
      <CardSkeleton count={3} height="h-28" />
      <ChartSkeleton height="h-[320px]" />
      <TableSkeleton rows={6} columns={4} />
    </div>
  );
}

function DepartamentoFallback() {
  return (
    <div className="space-y-6">
      <CardSkeleton count={4} height="h-40" />
      <ChartSkeleton height="h-[320px]" />
    </div>
  );
}

export default async function Page({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const visible = await isReportVisibleForUser("equipe", user.platformRole);
  if (!visible) redirect("/dashboard");

  const sp = await searchParams;
  const { period, customStart, customEnd, tab } = parseReportSearchParams(sp);
  const accountId = await getActiveAccountId();

  const contentProps = { accountId, period, customStart, customEnd };

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={UsersRound}
        title="Equipe"
        subtitle="Ranking de atendentes e departamentos"
        actions={
          <div className="flex items-center gap-2">
            <FactsFreshness accountId={accountId} />
            <TourButton tour={equipeTour} />
          </div>
        }
      />

      <FilterTransitionProvider>
        <div
          data-tour="equipe-period"
          className="mb-6 flex items-center gap-2"
        >
          <PeriodSelectorUrl value={period} accountId={accountId} />
          <RefreshButton />
        </div>

        <ContentLoadingWrapper>
          <div data-tour="equipe-tabs">
            <TabsShell
              activeValue={tab ?? "ranking"}
              tabs={[
                {
                  value: "ranking",
                  label: "Ranking de atendentes",
                  content: (
                    <div data-tour="equipe-tab-ranking">
                      <Suspense fallback={<RankingFallback />}>
                        <RankingAtendentesContent {...contentProps} />
                      </Suspense>
                    </div>
                  ),
                },
                {
                  value: "departamento",
                  label: "Por departamento",
                  content: (
                    <div data-tour="equipe-tab-departamento">
                      <Suspense fallback={<DepartamentoFallback />}>
                        <PorDepartamentoContent {...contentProps} />
                      </Suspense>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </ContentLoadingWrapper>
      </FilterTransitionProvider>
    </PageShell>
  );
}
