import { redirect } from "next/navigation";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { getKnownAccounts, getAccessibleAccountIds } from "@/lib/tenant";
import type { AuthUser } from "@/lib/auth-helpers";

export const metadata = { title: "Dashboard | Nexus Insights" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    platformRole: user.platformRole,
    isOwner: user.isOwner,
    mustChangePassword: user.mustChangePassword,
    avatarUrl: user.avatarUrl,
    theme: user.theme,
    accountIds: user.accountIds,
    teamIds: user.teamIds,
  };

  const [activeAccountId, allAccounts, accessibleIds] = await Promise.all([
    getActiveAccountId(),
    getKnownAccounts(),
    getAccessibleAccountIds(authUser),
  ]);

  const accounts = allAccounts.filter((a) => accessibleIds.includes(a.id));

  // Se cookie aponta para conta inacessível, usa a primeira disponível.
  const safeAccountId = accounts.some((a) => a.id === activeAccountId)
    ? activeAccountId
    : (accounts[0]?.id ?? activeAccountId);

  return (
    <PageShell variant="wide">
      <DashboardContent
        userName={user.name}
        initialAccountId={safeAccountId}
        initialAccounts={accounts}
      />
    </PageShell>
  );
}
