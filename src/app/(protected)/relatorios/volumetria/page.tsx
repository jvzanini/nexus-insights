import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Volumetria | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={BarChart3} title="Volumetria" subtitle="Análise de volume por dia e hora" />
      <ComingSoon />
    </div>
  );
}
