import { redirect } from "next/navigation";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { getActiveConnectionId } from "@/lib/reports/active-connection";
import {
  getKnownAccounts,
  getAccessibleAccountIds,
  assertAccountAccess,
} from "@/lib/tenant";
import { getPlatformTz } from "@/lib/datetime";
import { getAllSettings } from "@/lib/actions/settings";
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

  const [activeAccountId, allAccounts, accessibleIds, tz, rawSettings] = await Promise.all([
    getActiveAccountId(authUser),
    getKnownAccounts(),
    getAccessibleAccountIds(authUser),
    getPlatformTz(),
    getAllSettings().catch(() => ({ success: false as const, error: "fallback" })),
  ]);

  const settingsMap: Record<string, unknown> =
    rawSettings.success && rawSettings.data ? rawSettings.data : {};

  const pollIntervalMs = Math.max(
    5_000,
    Math.min(300_000, Number(settingsMap["polling.live_seconds"] ?? 30) * 1000),
  );
  const showRefreshButton =
    settingsMap["polling.refresh_button_enabled"] !== false &&
    settingsMap["polling.refresh_button_enabled"] !== "false";

  // Defense-in-depth: garante que a conta resolvida pertence ao escopo do user.
  await assertAccountAccess(authUser, activeAccountId);

  const accounts = allAccounts.filter((a) => accessibleIds.includes(a.id));

  // Se cookie aponta para conta inacessível, usa a primeira disponível.
  const safeAccountId = accounts.some((a) => a.id === activeAccountId)
    ? activeAccountId
    : (accounts[0]?.id ?? activeAccountId);

  // WHY: connectionId precisa do account ativo do binding. Erros (No/Ambiguous
  // Binding) propagam pra error boundary global.
  const connectionId = await getActiveConnectionId(authUser);

  return (
    <PageShell variant="wide">
      <DashboardContent
        userName={user.name}
        initialAccountId={safeAccountId}
        connectionId={connectionId}
        initialAccounts={accounts}
        tz={tz}
        pollIntervalMs={pollIntervalMs}
        showRefreshButton={showRefreshButton}
      />
    </PageShell>
  );
}
