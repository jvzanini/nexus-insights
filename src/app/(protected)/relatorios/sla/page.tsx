import { Shield } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "SLA | Nexus Insights" };

export default function Page() {
  return (
    <div>
      <PageHeader icon={Shield} title="SLA" subtitle="Cumprimento de acordos" />
      <ComingSoon />
    </div>
  );
}
