import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Relatórios | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={BarChart3} title="Relatórios" subtitle="Catálogo de relatórios disponíveis" />
      <ComingSoon />
    </div>
  );
}
