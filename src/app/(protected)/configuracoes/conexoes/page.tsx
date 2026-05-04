import { redirect } from "next/navigation";
import { Database } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import {
  ConnectionList,
  type ConnectionListItem,
} from "@/components/settings/nexus-chat/connection-list";
import type { BindingListItem } from "@/components/settings/nexus-chat/binding-list-sheet";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "Bancos Nexus Chat | Nexus Insights",
};
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  // Fetch connections + bindings em paralelo. Ambos respeitam soft-delete.
  const [connections, bindings] = await Promise.all([
    prisma.nexusChatConnection.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.companyChatBinding.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Agrupa bindings por connection e calcula count de enabled (= empresas
  // ativas). O Sheet só lê este map quando aberto.
  const bindingsByConnection: Record<string, BindingListItem[]> = {};
  const enabledCountByConnection = new Map<string, number>();
  for (const b of bindings) {
    const list = bindingsByConnection[b.connectionId] ?? [];
    list.push({
      id: b.id,
      connectionId: b.connectionId,
      chatwootAccountId: b.chatwootAccountId,
      displayName: b.displayName,
      enabled: b.enabled,
    });
    bindingsByConnection[b.connectionId] = list;
    if (b.enabled) {
      enabledCountByConnection.set(
        b.connectionId,
        (enabledCountByConnection.get(b.connectionId) ?? 0) + 1,
      );
    }
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
  }));

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={Database}
        title="Bancos Nexus Chat"
        subtitle="Gerencie as conexões a bancos Postgres do Nexus Chat e os bindings de empresas (chatwoot_account_id)."
      />

      <ConnectionList
        connections={items}
        bindingsByConnection={bindingsByConnection}
      />
    </PageShell>
  );
}
