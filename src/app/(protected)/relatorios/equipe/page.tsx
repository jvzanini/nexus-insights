import { Suspense } from "react";
import { UsersRound } from "lucide-react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import { TabsShell } from "@/components/reports/dashboards/tabs-shell";
import { RankingAtendentesContent } from "@/components/reports/dashboards/ranking-atendentes-content";
import { PorDepartamentoContent } from "@/components/reports/dashboards/por-departamento-content";
import {
  ChartSkeleton,
  CardSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { parseReportSearchParams } from "@/lib/reports/parse-search-params";

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

  const sp = await searchParams;
  const { period, customStart, customEnd, tab } = parseReportSearchParams(sp);
  const accountId = await getActiveAccountId();

  const contentProps = { accountId, period, customStart, customEnd };

  return (
    <div>
      <PageHeader
        icon={UsersRound}
        title="Equipe"
        subtitle="Ranking de atendentes e departamentos"
      />

      <div className="mb-6">
        <PeriodSelectorUrl value={period} />
      </div>

      <TabsShell
        activeValue={tab ?? "ranking"}
        tabs={[
          {
            value: "ranking",
            label: "Ranking de atendentes",
            content: (
              <Suspense fallback={<RankingFallback />}>
                <RankingAtendentesContent {...contentProps} />
              </Suspense>
            ),
          },
          {
            value: "departamento",
            label: "Por departamento",
            content: (
              <Suspense fallback={<DepartamentoFallback />}>
                <PorDepartamentoContent {...contentProps} />
              </Suspense>
            ),
          },
        ]}
      />
    </div>
  );
}
