import { redirect } from "next/navigation";
import { TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { ConsumoContent } from "@/components/llm/consumo-content";
import { getCurrentUser } from "@/lib/auth";
import { getSystemCreatedAt } from "@/lib/llm/queries/usage-stats";

export const metadata = { title: "Consumo do Agente Nex | Nexus Insights" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const minDate = await getSystemCreatedAt();

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={TrendingUp}
        title="Consumo do Agente Nex"
        subtitle="Tokens, custo e estatísticas de uso da IA por período"
      />
      <ConsumoContent minDate={minDate.toISOString()} />
    </PageShell>
  );
}
