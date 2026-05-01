/**
 * Página `/integracoes/power-bi/[id]` — Server Component.
 *
 * Detail page de um perfil Power BI. Apenas super_admin (RBAC duro: redirect
 * pra /dashboard caso contrário). Se o perfil não existir (ou estiver
 * soft-deleted), redirect pro index.
 *
 * Layout:
 *  - Breadcrumb topo (← Power BI).
 *  - PageHeader (Plug, name, description).
 *  - Action bar (Conectar / Desativar|Reativar / Deletar).
 *  - 4 cards verticais (space-y-6):
 *      1. ProfileSummaryCard (status + meta + banner amarelo error).
 *      2. ProfileWhitelistCard (tabelas + colunas + filtros).
 *      3. ProfileCredentialsCard (host/user/password mascarada).
 *      4. ProfileAuditTimeline (últimos 50 eventos).
 *
 * Lookup de users: `auditEvents` traz `userId`. Para mostrar o nome real,
 * fazemos um único `prisma.user.findMany` lateral aqui (Server) e passamos
 * o map ao timeline (Client).
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plug } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProfileByIdAction } from "@/lib/actions/integrations-power-bi";

import { ProfileDetailActions } from "@/components/integracoes/power-bi/profile-detail-actions";
import { ProfileSummaryCard } from "@/components/integracoes/power-bi/profile-summary-card";
import { ProfileCredentialsCard } from "@/components/integracoes/power-bi/profile-credentials-card";
import { ProfileAuditTimeline } from "@/components/integracoes/power-bi/profile-audit-timeline";

export const metadata = {
  title: "Perfil Power BI · Integrações | Nexus Insights",
};
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const { id } = await params;

  const result = await getProfileByIdAction(id);
  if (!result.ok || !result.data) {
    redirect("/integracoes/power-bi");
  }

  const profile = result.data;

  // Lookup lateral para enriquecer o audit timeline com nome dos users.
  const userIds = Array.from(
    new Set(
      profile.auditEvents
        .map((e) => e.userId)
        .filter((u): u is string => Boolean(u)),
    ),
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userById: Record<
    string,
    { id: string; name: string; email: string }
  > = {};
  for (const u of users) {
    userById[u.id] = { id: u.id, name: u.name ?? u.email, email: u.email };
  }

  return (
    <PageShell variant="wide">
      <div className="mb-3">
        <Link
          href="/integracoes/power-bi"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Power BI
        </Link>
      </div>

      <PageHeader
        icon={Plug}
        title={profile.name}
        subtitle={profile.description ?? "Perfil de integração Power BI"}
      />

      <ProfileDetailActions profile={profile} />

      <div className="space-y-6">
        <ProfileSummaryCard profile={profile} />
        <ProfileCredentialsCard
          profile={{
            id: profile.id,
            name: profile.name,
            pgUsername: profile.pgUsername,
            passwordLast4: profile.passwordLast4,
          }}
        />
        <ProfileAuditTimeline
          events={profile.auditEvents.map((e) => ({
            id: e.id,
            event: e.event,
            userId: e.userId,
            details: e.details,
            createdAt: e.createdAt,
          }))}
          userById={userById}
        />
      </div>
    </PageShell>
  );
}
