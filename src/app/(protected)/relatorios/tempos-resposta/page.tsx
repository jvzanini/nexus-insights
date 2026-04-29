import { Clock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Tempos de resposta | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={Clock} title="Tempos de resposta" subtitle="Métricas de atendimento" />
      <ComingSoon />
    </div>
  );
}
