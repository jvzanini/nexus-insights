import { ListChecks } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Status das conversas | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={ListChecks} title="Status das conversas" subtitle="Distribuição e backlog" />
      <ComingSoon />
    </div>
  );
}
