import { Map } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Por estado | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={Map} title="Por estado" subtitle="Distribuição geográfica" />
      <ComingSoon />
    </div>
  );
}
