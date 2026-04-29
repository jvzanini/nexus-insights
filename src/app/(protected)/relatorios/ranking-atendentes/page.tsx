import { Trophy } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Ranking de atendentes | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={Trophy} title="Ranking de atendentes" subtitle="Performance individual" />
      <ComingSoon />
    </div>
  );
}
