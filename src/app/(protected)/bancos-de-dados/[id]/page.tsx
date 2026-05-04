import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Database } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import {
  ConnectionDetailTabs,
  type ConnectionDetailData,
} from "@/components/settings/nexus-chat/connection-detail-tabs";
import type { BindingTableItem } from "@/components/settings/nexus-chat/bindings-table";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "Detalhes da conexão | Nexus Insights",
};
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type TabKey = "conexao" | "tempo-real" | "jobs" | "saude";

function resolveDefaultTab(value: string | undefined): TabKey {
  if (
    value === "conexao" ||
    value === "tempo-real" ||
    value === "jobs" ||
    value === "saude"
  ) {
    return value;
  }
  return "conexao";
}

export default async function Page({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const { id } = await params;
  const sp = await searchParams;
  const tabParam = typeof sp.tab === "string" ? sp.tab : undefined;
  const defaultTab = resolveDefaultTab(tabParam);

  const connection = await prisma.nexusChatConnection.findUnique({
    where: { id, deletedAt: null },
  });
  if (!connection) notFound();

  const bindings = await prisma.companyChatBinding.findMany({
    where: { connectionId: id, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  const items: BindingTableItem[] = bindings.map((b) => ({
    id: b.id,
    connectionId: b.connectionId,
    chatwootAccountId: b.chatwootAccountId,
    displayName: b.displayName,
    enabled: b.enabled,
  }));

  const detailData: ConnectionDetailData = {
    id: connection.id,
    name: connection.name,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.username,
    sslMode: connection.sslMode,
    applicationName: connection.applicationName,
    status: connection.status,
    lastTestAt: connection.lastTestAt?.toISOString() ?? null,
    lastTestError: connection.lastTestError,
    lastWebhookAt: connection.lastWebhookAt?.toISOString() ?? null,
    webhookToken: connection.webhookToken,
    createdAt: connection.createdAt.toISOString(),
  };

  return (
    <PageShell variant="wide">
      <div className="mb-2">
        <Link
          href="/bancos-de-dados"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar para bancos de dados
        </Link>
      </div>

      <PageHeader
        icon={Database}
        title={connection.name}
        subtitle={`Banco ${connection.database} em ${connection.host}.`}
      />

      <ConnectionDetailTabs
        connection={detailData}
        bindings={items}
        defaultTab={defaultTab}
      />
    </PageShell>
  );
}
