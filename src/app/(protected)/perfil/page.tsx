import { redirect } from "next/navigation";
import { User } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { InfoCard } from "@/components/profile/info-card";
import { ProfileForm } from "@/components/profile/profile-form";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Perfil | Nexus Insights" };

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { createdAt: true },
  });

  return (
    <div>
      <PageHeader
        icon={User}
        title="Perfil"
        subtitle="Suas informações pessoais"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InfoCard
          email={user.email}
          platformRole={user.platformRole}
          isOwner={user.isOwner}
          createdAt={dbUser?.createdAt ?? null}
        />
        <ProfileForm
          initial={{
            name: user.name,
            theme: user.theme,
          }}
        />
      </div>
    </div>
  );
}
