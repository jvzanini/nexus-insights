import { redirect } from "next/navigation";
import { listUsers } from "@/lib/actions/users";
import { getCurrentUser } from "@/lib/auth";
import { UsersTabs } from "@/components/users/users-tabs";
import { getTeams } from "@/lib/chatwoot/queries/meta-cache";
import { getAccessibleAccountIds } from "@/lib/tenant";

export const metadata = { title: "Usuários | Nexus Insights" };
export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole === "viewer") redirect("/dashboard");

  const result = await listUsers();
  const users = result.success && result.data ? result.data : [];

  const accountIds = await getAccessibleAccountIds(user as never);
  const accountOptions = await Promise.all(
    accountIds.map(async (id) => {
      // Buscar nome em UserAccountAccess (cacheado)
      const { prisma } = await import("@/lib/prisma");
      const acc = await prisma.userAccountAccess.findFirst({
        where: { chatwootAccountId: id },
        select: { chatwootAccountName: true },
      });
      return { id, name: acc?.chatwootAccountName ?? `Conta ${id}` };
    }),
  );

  // Teams: para o cenário Matrix (account_id=9), pegamos teams reais do Chatwoot
  let teamOptions: Array<{ id: number; name: string }> = [];
  try {
    const teams = await getTeams(9);
    if (teams?.data) {
      teamOptions = teams.data;
    }
  } catch {
    teamOptions = [];
  }

  return (
    <UsersTabs
      users={users}
      currentUser={user as never}
      accountOptions={accountOptions}
      teamOptions={teamOptions}
    />
  );
}
