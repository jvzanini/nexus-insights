import { Suspense } from "react";
import { LayoutDashboard } from "lucide-react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { FactsFreshness } from "@/components/reports/facts-freshness";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import { RefreshButton } from "@/components/reports/refresh-button";
import {
  FilterTransitionProvider,
} from "@/components/reports/filter-transition";
import { ContentLoadingWrapper } from "@/components/reports/content-loading-wrapper";
import { PageShell } from "@/components/layout/page-shell";
import { TabsShell } from "@/components/reports/dashboards/tabs-shell";
import { StatusPieContent } from "@/components/reports/dashboards/status-pie-content";
import { VolumetriaContent } from "@/components/reports/dashboards/volumetria-content";
import { ChartSkeleton, CardSkeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { getActiveConnectionId } from "@/lib/reports/active-connection";
import { assertAccountAccess } from "@/lib/tenant";
import { parseReportSearchParams } from "@/lib/reports/parse-search-params";
import { isReportVisibleForUser } from "@/lib/reports/visibility";
import type { AuthUser } from "@/lib/auth-helpers";

export const metadata = { title: "Visão Geral | Nexus Insights" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function StatusFallback() {
  return (
    <div className="space-y-6">
      <CardSkeleton count={4} height="h-28" />
      <ChartSkeleton height="h-[320px]" />
    </div>
  );
}

function VolumetriaFallback() {
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

  const visible = await isReportVisibleForUser("visao-geral", user.platformRole);
  if (!visible) redirect("/dashboard");

  const sp = await searchParams;
  const { period, customStart, customEnd, tab } = parseReportSearchParams(sp);
  const accountId = await getActiveAccountId(user as AuthUser);
  await assertAccountAccess(user as AuthUser, accountId);
  // WHY: connectionId vem do binding ativo. Erros (No/Ambiguous) propagam
  // pra error boundary — UX padrão do app já cobre o caso.
  const connectionId = await getActiveConnectionId(user as AuthUser);

  const contentProps = { accountId, period, customStart, customEnd };

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={LayoutDashboard}
        title="Visão Geral"
        subtitle="Status das conversas e volumetria geral"
        actions={<FactsFreshness connectionId={connectionId} accountId={accountId} />}
      />

      <FilterTransitionProvider>
        <div className="mb-6 flex items-center gap-2">
          <PeriodSelectorUrl value={period} accountId={accountId} />
          <RefreshButton />
        </div>

        <ContentLoadingWrapper>
          <TabsShell
            activeValue={tab ?? "status"}
            tabs={[
              {
                value: "status",
                label: "Status",
                content: (
                  <Suspense fallback={<StatusFallback />}>
                    <StatusPieContent {...contentProps} />
                  </Suspense>
                ),
              },
              {
                value: "volumetria",
                label: "Volumetria",
                content: (
                  <Suspense fallback={<VolumetriaFallback />}>
                    <VolumetriaContent {...contentProps} />
                  </Suspense>
                ),
              },
            ]}
          />
        </ContentLoadingWrapper>
      </FilterTransitionProvider>
    </PageShell>
  );
}
