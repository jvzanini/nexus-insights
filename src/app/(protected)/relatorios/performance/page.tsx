import { Suspense } from "react";
import { Zap } from "lucide-react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { FactsFreshness } from "@/components/reports/facts-freshness";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import { RefreshButton } from "@/components/reports/refresh-button";
import { FilterTransitionProvider } from "@/components/reports/filter-transition";
import { ContentLoadingWrapper } from "@/components/reports/content-loading-wrapper";
import { PageShell } from "@/components/layout/page-shell";
import { TabsShell } from "@/components/reports/dashboards/tabs-shell";
import { TemposRespostaContent } from "@/components/reports/dashboards/tempos-resposta-content";
import { SlaContent } from "@/components/reports/dashboards/sla-content";
import { CsatContent } from "@/components/reports/dashboards/csat-content";
import { ChartSkeleton, CardSkeleton } from "@/components/ui/skeleton";
import { TourButton } from "@/components/tour/tour-button";
import { performanceTour } from "@/lib/tours/performance-tour";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { parseReportSearchParams } from "@/lib/reports/parse-search-params";
import { isReportVisibleForUser } from "@/lib/reports/visibility";

export const metadata = { title: "Performance | Nexus Insights" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function TemposFallback() {
  return (
    <div className="space-y-6">
      <CardSkeleton count={4} height="h-28" />
      <ChartSkeleton height="h-[260px]" />
    </div>
  );
}

function SlaFallback() {
  return (
    <div className="space-y-6">
      <CardSkeleton count={3} height="h-28" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <ChartSkeleton height="h-[260px]" />
        <ChartSkeleton height="h-[260px]" />
      </div>
    </div>
  );
}

function CsatFallback() {
  return (
    <div className="space-y-6">
      <CardSkeleton count={2} height="h-28" />
      <ChartSkeleton height="h-[240px]" />
    </div>
  );
}

export default async function Page({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const visible = await isReportVisibleForUser("performance", user.platformRole);
  if (!visible) redirect("/dashboard");

  const sp = await searchParams;
  const { period, customStart, customEnd, tab } = parseReportSearchParams(sp);
  const accountId = await getActiveAccountId();

  const contentProps = { accountId, period, customStart, customEnd };

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={Zap}
        title="Performance"
        subtitle="Tempos de resposta, SLA e CSAT"
        actions={
          <div className="flex items-center gap-2">
            <FactsFreshness accountId={accountId} />
            <TourButton tour={performanceTour} />
          </div>
        }
      />

      <FilterTransitionProvider>
        <div
          data-tour="perf-period"
          className="mb-6 flex items-center gap-2"
        >
          <PeriodSelectorUrl value={period} accountId={accountId} />
          <RefreshButton />
        </div>

        <ContentLoadingWrapper>
          <div data-tour="perf-tabs">
            <TabsShell
              activeValue={tab ?? "tempos"}
              tabs={[
                {
                  value: "tempos",
                  label: "Tempos de resposta",
                  content: (
                    <div data-tour="perf-tab-tempos">
                      <Suspense fallback={<TemposFallback />}>
                        <TemposRespostaContent {...contentProps} />
                      </Suspense>
                    </div>
                  ),
                },
                {
                  value: "sla",
                  label: "SLA",
                  content: (
                    <div data-tour="perf-tab-sla-csat">
                      <Suspense fallback={<SlaFallback />}>
                        <SlaContent {...contentProps} />
                      </Suspense>
                    </div>
                  ),
                },
                {
                  value: "csat",
                  label: "CSAT",
                  content: (
                    <div data-tour="perf-tab-sla-csat">
                      <Suspense fallback={<CsatFallback />}>
                        <CsatContent {...contentProps} />
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
