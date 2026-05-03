import { Suspense } from "react";
import { Map } from "lucide-react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { FactsFreshness } from "@/components/reports/facts-freshness";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import { RefreshButton } from "@/components/reports/refresh-button";
import { FilterTransitionProvider } from "@/components/reports/filter-transition";
import { ContentLoadingWrapper } from "@/components/reports/content-loading-wrapper";
import { PageShell } from "@/components/layout/page-shell";
import { TabsShell } from "@/components/reports/dashboards/tabs-shell";
import { PorEstadoContent } from "@/components/reports/dashboards/por-estado-content";
import { VolumetriaContent } from "@/components/reports/dashboards/volumetria-content";
import {
  ChartSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";
import { TourButton } from "@/components/tour/tour-button";
import { distribuicaoTour } from "@/lib/tours/distribuicao-tour";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { getActiveConnectionId } from "@/lib/reports/active-connection";
import { assertAccountAccess } from "@/lib/tenant";
import { parseReportSearchParams } from "@/lib/reports/parse-search-params";
import { isReportVisibleForUser } from "@/lib/reports/visibility";
import type { AuthUser } from "@/lib/auth-helpers";

export const metadata = { title: "Distribuição | Nexus Insights" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function EstadoFallback() {
  return (
    <div className="space-y-6">
      <ChartSkeleton height="h-[320px]" />
      <TableSkeleton rows={6} columns={4} />
    </div>
  );
}

function HorarioFallback() {
  return (
    <div className="space-y-6">
      <ChartSkeleton height="h-[260px]" />
      <ChartSkeleton height="h-[200px]" />
    </div>
  );
}

export default async function Page({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const visible = await isReportVisibleForUser("distribuicao", user.platformRole);
  if (!visible) redirect("/dashboard");

  const sp = await searchParams;
  const { period, customStart, customEnd, tab } = parseReportSearchParams(sp);
  const accountId = await getActiveAccountId(user as AuthUser);
  await assertAccountAccess(user as AuthUser, accountId);
  const connectionId = await getActiveConnectionId(user as AuthUser);

  const contentProps = { accountId, period, customStart, customEnd };

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={Map}
        title="Distribuição"
        subtitle="Estados, inboxes e horários de pico"
        actions={
          <div className="flex items-center gap-2">
            <FactsFreshness connectionId={connectionId} accountId={accountId} />
            <TourButton tour={distribuicaoTour} />
          </div>
        }
      />

      <FilterTransitionProvider>
        <div
          data-tour="dist-period"
          className="mb-6 flex items-center gap-2"
        >
          <PeriodSelectorUrl value={period} accountId={accountId} />
          <RefreshButton />
        </div>

        <ContentLoadingWrapper>
          <div data-tour="dist-tabs">
            <TabsShell
              activeValue={tab ?? "estado"}
              tabs={[
                {
                  value: "estado",
                  label: "Por estado",
                  content: (
                    <div data-tour="dist-tab-estado">
                      <Suspense fallback={<EstadoFallback />}>
                        <PorEstadoContent {...contentProps} />
                      </Suspense>
                    </div>
                  ),
                },
                {
                  value: "horario",
                  label: "Heatmap horário",
                  content: (
                    <div data-tour="dist-tab-horario">
                      <Suspense fallback={<HorarioFallback />}>
                        <VolumetriaContent {...contentProps} />
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
