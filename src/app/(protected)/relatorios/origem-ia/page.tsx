import { Suspense } from "react";
import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { FactsFreshness } from "@/components/reports/facts-freshness";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import { RefreshButton } from "@/components/reports/refresh-button";
import { FilterTransitionProvider } from "@/components/reports/filter-transition";
import { ContentLoadingWrapper } from "@/components/reports/content-loading-wrapper";
import { PageShell } from "@/components/layout/page-shell";
import { TabsShell } from "@/components/reports/dashboards/tabs-shell";
import { LeadsRecebidosContent } from "@/components/reports/dashboards/leads-recebidos-content";
import { MatrixIaContent } from "@/components/reports/dashboards/matrix-ia-content";
import {
  ChartSkeleton,
  CardSkeleton,
} from "@/components/ui/skeleton";
import { TourButton } from "@/components/tour/tour-button";
import { origemIaTour } from "@/lib/tours/origem-ia-tour";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { assertAccountAccess } from "@/lib/tenant";
import { parseReportSearchParams } from "@/lib/reports/parse-search-params";
import {
  isMatrixIAVisibleForUser,
  isReportVisibleForUser,
} from "@/lib/reports/visibility";
import type { Granularity } from "@/lib/chatwoot/queries/leads-recebidos";
import type { AuthUser } from "@/lib/auth-helpers";

export const metadata = { title: "Origem & IA | Nexus Insights" };
export const dynamic = "force-dynamic";

const VALID_GRANS: Granularity[] = ["day", "week", "month"];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function LeadsFallback() {
  return (
    <div className="space-y-6">
      <CardSkeleton count={3} height="h-28" />
      <ChartSkeleton height="h-[320px]" />
    </div>
  );
}

function MatrixFallback() {
  return (
    <div className="space-y-6">
      <CardSkeleton count={4} height="h-28" />
      <ChartSkeleton height="h-[200px]" />
    </div>
  );
}

export default async function Page({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const visible = await isReportVisibleForUser("origem-ia", user.platformRole);
  if (!visible) redirect("/dashboard");

  const sp = await searchParams;
  const { period, customStart, customEnd, tab } = parseReportSearchParams(sp);
  const accountId = await getActiveAccountId(user as AuthUser);
  await assertAccountAccess(user as AuthUser, accountId);

  const granRaw = typeof sp.granularity === "string" ? sp.granularity : null;
  const granularity: Granularity =
    granRaw && (VALID_GRANS as string[]).includes(granRaw)
      ? (granRaw as Granularity)
      : "day";

  // Gate Matrix IA: usa a visibility 3-níveis (all | super_admin_only | none)
  // que governa todas as visualizações da plataforma. Mantém consistência
  // com `getInboxesForUser` e `shouldExcludeMatrixIA`.
  const matrixVisible = await isMatrixIAVisibleForUser(user.platformRole);

  const contentProps = { accountId, period, customStart, customEnd };

  const tabs = [
    {
      value: "leads",
      label: "Leads recebidos",
      content: (
        <div data-tour="origem-tab-leads">
          <Suspense fallback={<LeadsFallback />}>
            <LeadsRecebidosContent {...contentProps} granularity={granularity} />
          </Suspense>
        </div>
      ),
    },
  ];

  if (matrixVisible) {
    tabs.push({
      value: "matrix",
      label: "Matrix IA",
      content: (
        <div data-tour="origem-tab-matrix">
          <Suspense fallback={<MatrixFallback />}>
            <MatrixIaContent
              {...contentProps}
              showSuperAdminNote={user.platformRole === "super_admin"}
            />
          </Suspense>
        </div>
      ),
    });
  }

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={Sparkles}
        title="Origem & IA"
        subtitle="Leads recebidos e canal automatizado Matrix IA"
        actions={
          <div className="flex items-center gap-2">
            <FactsFreshness accountId={accountId} />
            <TourButton tour={origemIaTour} />
          </div>
        }
      />

      <FilterTransitionProvider>
        <div
          data-tour="origem-period"
          className="mb-6 flex items-center gap-2"
        >
          <PeriodSelectorUrl value={period} accountId={accountId} />
          <RefreshButton />
        </div>

        <ContentLoadingWrapper>
          <div data-tour="origem-tabs">
            <TabsShell activeValue={tab ?? "leads"} tabs={tabs} />
          </div>
        </ContentLoadingWrapper>
      </FilterTransitionProvider>
    </PageShell>
  );
}
