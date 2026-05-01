/**
 * Página `/integracoes/power-bi` — Server Component.
 *
 * Lista de perfis Power BI cadastrados. Apenas super_admin acessa
 * (RBAC duro: redirect para /dashboard caso contrário).
 *
 * Soft cap: lê `INTEGRATION_PROFILE_SOFT_CAP` (default 50). Quando
 * atingido, o botão "Novo perfil" no header fica disabled com tooltip.
 *
 * Empty state quando não há perfis: ilustração + CTA centralizado.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Plug, ArrowLeft, AlertTriangle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";
import { listProfilesAction } from "@/lib/actions/integrations-power-bi";

import { ProfileList } from "@/components/integracoes/power-bi/profile-list";
import { ProfileListEmpty } from "@/components/integracoes/power-bi/profile-list-empty";
import { NewProfileButton } from "@/components/integracoes/power-bi/new-profile-button";

export const metadata = { title: "Power BI · Integrações | Nexus Insights" };
export const dynamic = "force-dynamic";

function getSoftCap(): number {
  const raw = process.env.INTEGRATION_PROFILE_SOFT_CAP ?? "50";
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
}

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const result = await listProfilesAction();
  const profiles = result.ok && result.data ? result.data : [];
  const loadError = result.ok ? null : result.error;

  const softCap = getSoftCap();
  const activeCount = profiles.filter((p) => p.status === "active").length;
  const softCapReached = activeCount >= softCap;

  return (
    <PageShell variant="wide">
      <div className="mb-3">
        <Link
          href="/integracoes"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Integrações
        </Link>
      </div>

      <PageHeader
        icon={Plug}
        title="Power BI"
        subtitle="Crie e gerencie perfis para integração com Power BI"
        actions={
          profiles.length > 0 ? (
            <NewProfileButton
              softCapReached={softCapReached}
              softCap={softCap}
            />
          ) : null
        }
      />

      {loadError ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle
            className="h-5 w-5 shrink-0 text-destructive mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Não foi possível carregar os perfis
            </p>
            <p className="text-sm text-muted-foreground mt-1">{loadError}</p>
          </div>
        </div>
      ) : null}

      {softCapReached && profiles.length > 0 ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle
            className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Limite de {softCap} perfis ativos atingido
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Para criar novos perfis, desative ou delete um existente. Esse
              limite protege contra criação descontrolada — para aumentá-lo,
              ajuste a env <code>INTEGRATION_PROFILE_SOFT_CAP</code>.
            </p>
          </div>
        </div>
      ) : null}

      {profiles.length === 0 && !loadError ? (
        <ProfileListEmpty
          softCapReached={softCapReached}
          softCap={softCap}
        />
      ) : profiles.length > 0 ? (
        <>
          <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground tabular-nums">
                {profiles.length}
              </span>{" "}
              perfil{profiles.length === 1 ? "" : "s"} no total ·{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {activeCount}
              </span>{" "}
              ativo{activeCount === 1 ? "" : "s"}
            </span>
            {softCap > 0 ? (
              <span className="text-muted-foreground/60">
                / soft cap {softCap}
              </span>
            ) : null}
          </div>
          <ProfileList profiles={profiles} />
        </>
      ) : null}
    </PageShell>
  );
}
