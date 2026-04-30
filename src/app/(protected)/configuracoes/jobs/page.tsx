import { redirect } from "next/navigation";
import { Database } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { JobsPanel } from "@/components/settings/jobs-panel";
import { getCurrentUser } from "@/lib/auth";
import { getJobsStatus } from "@/lib/actions/jobs";

export const metadata = {
  title: "Jobs de Pré-agregação | Nexus Insights",
};
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const result = await getJobsStatus();
  const initialStatus = result.success && result.data ? result.data : null;
  const initialError = result.success
    ? null
    : (result.error ?? "Erro ao carregar status dos jobs");

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={Database}
        title="Jobs de Pré-agregação"
        subtitle="Status e disparo manual dos jobs que atualizam os dados dos relatórios."
      />

      <JobsPanel initialStatus={initialStatus} initialError={initialError} />
    </PageShell>
  );
}
