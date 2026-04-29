import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Por departamento | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={Building2} title="Por departamento" subtitle="Métricas por equipe" />
      <ComingSoon />
    </div>
  );
}
