import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { NexBubble } from "@/components/nex/nex-bubble";
import { TourProvider } from "@/components/tour/tour-provider";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";
import { getKnownAccounts } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getVisibleReportKeys } from "@/lib/reports/visibility";
import { isNexBubbleEnabled } from "@/lib/llm/get-nex-bubble-enabled";

const ACCOUNT_COOKIE = "nexus_active_account";
const DEFAULT_ACCOUNT_ID = 9; // Matrix Fitness Group

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const platformRole =
    ((session.user as any)?.platformRole as keyof typeof PLATFORM_ROLE_LABELS) ??
    "viewer";
  const isOwner = (session.user as any)?.isOwner ?? false;
  const avatarUrl = (session.user as any)?.avatarUrl ?? null;
  const userId = ((session.user as any)?.id as string) ?? "";

  const user = {
    id: userId,
    name: session.user.name || session.user.email || "Usuário",
    email: session.user.email || "",
    role: PLATFORM_ROLE_LABELS[platformRole] || "Usuário",
    platformRole,
    isOwner,
    avatarUrl,
  };

  // Resolve accounts disponíveis: super_admin → todas conhecidas; demais →
  // apenas as accounts em UserAccountAccess.
  let availableAccounts: Array<{ id: number; name: string }> = [];

  if (platformRole === "super_admin") {
    availableAccounts = await getKnownAccounts();
  } else if (userId) {
    const rows = await prisma.userAccountAccess.findMany({
      where: { userId },
      select: { chatwootAccountId: true, chatwootAccountName: true },
      distinct: ["chatwootAccountId"],
    });
    availableAccounts = rows.map(
      (r: { chatwootAccountId: number; chatwootAccountName: string }) => ({
        id: r.chatwootAccountId,
        name: r.chatwootAccountName,
      }),
    );
  }

  const allowedIds = new Set(availableAccounts.map((a) => a.id));

  const cookieStore = await cookies();
  const cookieRaw = cookieStore.get(ACCOUNT_COOKIE)?.value;
  const cookieParsed = cookieRaw ? Number.parseInt(cookieRaw, 10) : Number.NaN;
  const cookieAccountId =
    Number.isFinite(cookieParsed) && cookieParsed > 0 ? cookieParsed : null;

  let activeAccountId: number;
  if (cookieAccountId && allowedIds.has(cookieAccountId)) {
    activeAccountId = cookieAccountId;
  } else if (allowedIds.has(DEFAULT_ACCOUNT_ID)) {
    activeAccountId = DEFAULT_ACCOUNT_ID;
  } else if (availableAccounts[0]) {
    activeAccountId = availableAccounts[0].id;
  } else {
    activeAccountId = DEFAULT_ACCOUNT_ID;
  }

  const enabledReportKeys = Array.from(await getVisibleReportKeys(platformRole));
  const nexBubbleEnabled = await isNexBubbleEnabled();

  return (
    <TourProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar
          user={user}
          accounts={availableAccounts}
          activeAccountId={activeAccountId}
          enabledReportKeys={enabledReportKeys}
        />
        <main className="flex-1 overflow-y-auto overscroll-contain">
          <div className="pt-16 pb-8 sm:pt-8">{children}</div>
        </main>
        {nexBubbleEnabled ? <NexBubble /> : null}
      </div>
    </TourProvider>
  );
}
