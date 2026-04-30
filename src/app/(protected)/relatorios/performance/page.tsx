import { Suspense } from "react";
import { Zap } from "lucide-react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import { RefreshButton } from "@/components/reports/refresh-button";
import { FilterTransitionProvider } from "@/components/reports/filter-transition";
import { ContentLoadingWrapper } from "@/components/reports/content-loading-wrapper";
import { TabsShell } from "@/components/reports/dashboards/tabs-shell";
import { TemposRespostaContent } from "@/components/reports/dashboards/tempos-resposta-content";
import { SlaContent } from "@/components/reports/dashboards/sla-content";
import { CsatContent } from "@/components/reports/dashboards/csat-content";
import { ChartSkeleton, CardSkeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { parseReportSearchParams } from "@/lib/reports/parse-search-params";

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

  const sp = await searchParams;
  const { period, customStart, customEnd, tab } = parseReportSearchParams(sp);
  const accountId = await getActiveAccountId();

  const contentProps = { accountId, period, customStart, customEnd };

  return (
    <div>
      <PageHeader
        icon={Zap}
        title="Performance"
        subtitle="Tempos de resposta, SLA e CSAT"
      />

      <FilterTransitionProvider>
        <div className="mb-6 flex items-center gap-2">
          <PeriodSelectorUrl value={period} accountId={accountId} />
          <RefreshButton />
        </div>

        <ContentLoadingWrapper>
          <TabsShell
            activeValue={tab ?? "tempos"}
            tabs={[
              {
                value: "tempos",
                label: "Tempos de resposta",
                content: (
                  <Suspense fallback={<TemposFallback />}>
                    <TemposRespostaContent {...contentProps} />
                  </Suspense>
                ),
              },
              {
                value: "sla",
                label: "SLA",
                content: (
                  <Suspense fallback={<SlaFallback />}>
                    <SlaContent {...contentProps} />
                  </Suspense>
                ),
              },
              {
                value: "csat",
                label: "CSAT",
                content: (
                  <Suspense fallback={<CsatFallback />}>
                    <CsatContent {...contentProps} />
                  </Suspense>
                ),
              },
            ]}
          />
        </ContentLoadingWrapper>
      </FilterTransitionProvider>
    </div>
  );
}
