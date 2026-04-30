import { Suspense } from "react";
import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import { TabsShell } from "@/components/reports/dashboards/tabs-shell";
import { LeadsRecebidosContent } from "@/components/reports/dashboards/leads-recebidos-content";
import { MatrixIaContent } from "@/components/reports/dashboards/matrix-ia-content";
import {
  ChartSkeleton,
  CardSkeleton,
} from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { parseReportSearchParams } from "@/lib/reports/parse-search-params";
import { getAllSettings } from "@/lib/settings/get";
import type { Granularity } from "@/lib/chatwoot/queries/leads-recebidos";

export const metadata = { title: "Origem & IA | Nexus Insights" };
export const dynamic = "force-dynamic";

const VALID_GRANS: Granularity[] = ["day", "week", "month"];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return fallback;
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

  const sp = await searchParams;
  const { period, customStart, customEnd, tab } = parseReportSearchParams(sp);
  const accountId = await getActiveAccountId();

  const granRaw = typeof sp.granularity === "string" ? sp.granularity : null;
  const granularity: Granularity =
    granRaw && (VALID_GRANS as string[]).includes(granRaw)
      ? (granRaw as Granularity)
      : "day";

  // Gate Matrix IA: feature flag + super_admin only.
  const settings = await getAllSettings();
  const restrictMatrixToSuperAdmin = readBoolean(
    settings["feature_flags.matrix_ia_visible_to_super_admin_only"],
    true,
  );
  const matrixVisible =
    !restrictMatrixToSuperAdmin || user.platformRole === "super_admin";

  const contentProps = { accountId, period, customStart, customEnd };

  const tabs = [
    {
      value: "leads",
      label: "Leads recebidos",
      content: (
        <Suspense fallback={<LeadsFallback />}>
          <LeadsRecebidosContent {...contentProps} granularity={granularity} />
        </Suspense>
      ),
    },
  ];

  if (matrixVisible) {
    tabs.push({
      value: "matrix",
      label: "Matrix IA",
      content: (
        <Suspense fallback={<MatrixFallback />}>
          <MatrixIaContent
            {...contentProps}
            showSuperAdminNote={user.platformRole === "super_admin"}
          />
        </Suspense>
      ),
    });
  }

  return (
    <div>
      <PageHeader
        icon={Sparkles}
        title="Origem & IA"
        subtitle="Leads recebidos e canal automatizado Matrix IA"
      />

      <div className="mb-6">
        <PeriodSelectorUrl value={period} />
      </div>

      <TabsShell activeValue={tab ?? "leads"} tabs={tabs} />
    </div>
  );
}
