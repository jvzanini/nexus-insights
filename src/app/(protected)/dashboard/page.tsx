import { Home } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Dashboard | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={Home} title="Dashboard" subtitle="Visão geral dos atendimentos" />
      <ComingSoon />
    </div>
  );
}
