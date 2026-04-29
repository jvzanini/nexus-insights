import { Calendar } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Leads recebidos | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={Calendar} title="Leads recebidos" subtitle="Volume de leads por período" />
      <ComingSoon />
    </div>
  );
}
