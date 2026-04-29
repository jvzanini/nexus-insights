import { Bot } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Matrix IA | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={Bot} title="Matrix IA" subtitle="Métricas do canal automatizado" />
      <ComingSoon />
    </div>
  );
}
