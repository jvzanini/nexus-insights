import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Trocar senha | Nexus Insights" };

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div>
      <PageHeader
        icon={KeyRound}
        title="Trocar senha"
        subtitle="Defina uma nova senha"
      />
      <ChangePasswordForm />
    </div>
  );
}
