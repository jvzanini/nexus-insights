import { Smile } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "CSAT | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={Smile} title="CSAT" subtitle="Satisfação dos clientes" />
      <ComingSoon />
    </div>
  );
}
