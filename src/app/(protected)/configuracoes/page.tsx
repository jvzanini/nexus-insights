import { Settings } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Configurações | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={Settings} title="Configurações" subtitle="Ajustes globais da plataforma" />
      <ComingSoon />
    </div>
  );
}
