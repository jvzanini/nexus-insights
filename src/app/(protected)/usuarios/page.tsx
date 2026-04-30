import { redirect } from "next/navigation";

import { PageShell } from "@/components/layout/page-shell";
import { UsersTabs } from "@/components/users/users-tabs";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Usuários | Nexus Insights" };
export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole === "viewer") redirect("/dashboard");

  // CurrentUser e AuthUser têm a mesma forma a partir do shape do session.
  return (
    <PageShell variant="narrow">
      <UsersTabs currentUser={user as never} />
    </PageShell>
  );
}
