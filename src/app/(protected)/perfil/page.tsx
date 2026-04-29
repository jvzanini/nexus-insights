import { redirect } from "next/navigation";
import { UserCog } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PersonalInfoCard } from "@/components/profile/personal-info-card";
import { EmailChangeCard } from "@/components/profile/email-change-card";
import { PasswordChangeCard } from "@/components/profile/password-change-card";
import { AppearanceCard } from "@/components/profile/appearance-card";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Meu Perfil | Nexus Insights" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div>
      <PageHeader
        icon={UserCog}
        title="Meu Perfil"
        subtitle="Suas informações pessoais e preferências"
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <PersonalInfoCard
          user={{
            name: user.name,
            avatarUrl: user.avatarUrl,
          }}
        />
        <EmailChangeCard email={user.email} />
        <PasswordChangeCard />
        <AppearanceCard currentTheme={user.theme} />
      </div>
    </div>
  );
}
