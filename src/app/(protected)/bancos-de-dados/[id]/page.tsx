import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Database } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import {
  BindingsTable,
  type BindingTableItem,
} from "@/components/settings/nexus-chat/bindings-table";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "Empresas da conexão | Nexus Insights",
};
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const { id } = await params;

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
        subtitle={`Empresas (account_id) vinculadas ao banco ${connection.database} em ${connection.host}.`}
      />

      <BindingsTable connectionId={connection.id} bindings={items} />
    </PageShell>
  );
}
