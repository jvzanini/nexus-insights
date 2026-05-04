import { redirect } from "next/navigation";
import { Database } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import {
  ConnectionList,
  type ConnectionListItem,
} from "@/components/settings/nexus-chat/connection-list";
import { OnboardingWizardLauncher } from "@/components/settings/nexus-chat/wizard/onboarding-wizard-launcher";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "Bancos de dados | Nexus Insights",
};
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  // Fetch connections + count de bindings enabled em paralelo.
  const [connections, bindings] = await Promise.all([
    prisma.nexusChatConnection.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.companyChatBinding.findMany({
      where: { deletedAt: null, enabled: true },
      select: { connectionId: true },
    }),
  ]);

  const enabledCountByConnection = new Map<string, number>();
  for (const b of bindings) {
    enabledCountByConnection.set(
      b.connectionId,
      (enabledCountByConnection.get(b.connectionId) ?? 0) + 1,
    );
  }

  const items: ConnectionListItem[] = connections.map((c) => ({
    id: c.id,
    name: c.name,
    host: c.host,
    port: c.port,
    database: c.database,
    username: c.username,
    sslMode: c.sslMode,
    applicationName: c.applicationName,
    status: c.status,
    lastTestAt: c.lastTestAt ? c.lastTestAt.toISOString() : null,
    lastTestError: c.lastTestError,
    bindingsCount: enabledCountByConnection.get(c.id) ?? 0,
    webhookToken: c.webhookToken,
  }));

  const wizardConnections = items.map((c) => ({
    id: c.id,
    name: c.name,
    webhookToken: c.webhookToken,
    status: c.status,
  }));

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={Database}
        title="Bancos de dados"
        subtitle="Gerencie as conexões a bancos Postgres do Nexus Chat e as empresas vinculadas (account_id)."
        actions={<OnboardingWizardLauncher connections={wizardConnections} />}
      />

      <ConnectionList connections={items} />
    </PageShell>
  );
}
