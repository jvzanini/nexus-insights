import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { NexBubble } from "@/components/nex/nex-bubble";
import { TourProvider } from "@/components/tour/tour-provider";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";
import { getCurrentUser } from "@/lib/auth";
import { getKnownAccounts } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  getActiveAccountId,
  NoAccessibleAccountError,
} from "@/lib/reports/active-account";
import type { AuthUser } from "@/lib/auth-helpers";
import { getVisibleReportKeys } from "@/lib/reports/visibility";
import { isNexBubbleEnabled } from "@/lib/llm/get-nex-bubble-enabled";
import { getNexPromptConfig } from "@/lib/nex/prompt";
import { getActiveLlmConfig } from "@/lib/llm/get-active-config";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authUser = await getCurrentUser();

  if (!authUser) {
    redirect("/login");
  }

  const platformRole = authUser.platformRole;
  const isOwner = authUser.isOwner;
  const avatarUrl = authUser.avatarUrl;
  const userId = authUser.id;

  const user = {
    id: userId,
    name: authUser.name || authUser.email || "Usuário",
    email: authUser.email || "",
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

  // Resolve a conta ativa pelo helper canônico (fonte ÚNICA — mesma usada
  // pelas pages). Se o user não tem acesso a nenhuma conta → redirect /login.
  let activeAccountId: number;
  try {
    activeAccountId = await getActiveAccountId(authUser as AuthUser);
  } catch (err) {
    if (err instanceof NoAccessibleAccountError) {
      redirect("/login?reason=no-access");
    }
    throw err;
  }

  const enabledReportKeys = Array.from(await getVisibleReportKeys(platformRole));
  const nexBubbleEnabled = await isNexBubbleEnabled();

  // Áudio só está realmente habilitado quando: (1) admin marcou o toggle no
  // Prompt config E (2) o provider ativo é OpenAI (única transcrição via
  // Whisper hoje). Falhas em qualquer leitura caem para `false` para não
  // quebrar a SSR de páginas internas.
  const [llmActive, nexCfg] = await Promise.all([
    getActiveLlmConfig().catch(() => null),
    getNexPromptConfig().catch(() => null),
  ]);
  const effectiveAudioEnabled =
    !!nexCfg?.audioInputEnabled && llmActive?.provider === "openai";

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
        {nexBubbleEnabled ? (
          <NexBubble audioInputEnabled={effectiveAudioEnabled} />
        ) : null}
      </div>
    </TourProvider>
  );
}
