import { User } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Perfil | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={User} title="Perfil" subtitle="Suas informações pessoais" />
      <ComingSoon />
    </div>
  );
}
