import { MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Conversas | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={MessageSquare} title="Conversas" subtitle="Lista detalhada de conversas com filtros" />
      <ComingSoon />
    </div>
  );
}
