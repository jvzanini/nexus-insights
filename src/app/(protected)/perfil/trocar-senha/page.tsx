import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Trocar senha | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={KeyRound} title="Trocar senha" subtitle="Defina uma nova senha" />
      <ComingSoon />
    </div>
  );
}
