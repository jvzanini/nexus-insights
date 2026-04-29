import { Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Usuários | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={Users} title="Usuários" subtitle="Gerencie os usuários da plataforma" />
      <ComingSoon />
    </div>
  );
}
