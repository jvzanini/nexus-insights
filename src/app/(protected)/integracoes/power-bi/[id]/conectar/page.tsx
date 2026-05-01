/**
 * Página `/integracoes/power-bi/[id]/conectar` — Server Component.
 *
 * Connect page do perfil Power BI: tutorial passo-a-passo com 3 abas
 * (Power BI Desktop / Service-Gateway / Snippet M).
 *
 * Guards:
 *  - super_admin only (redirect /dashboard caso contrário).
 *  - perfil existente e não soft-deleted (redirect /integracoes/power-bi).
 *
 * Compute server-side:
 *  - `views`: mapeia `profile.allowedTables` → `{ table, label, viewName }`
 *    usando `getCatalogEntry` + `buildDerivedViewName`.
 *  - `connectionInfo`: monta a partir de `INTEGRATION_DB_HOST_PUBLIC`
 *    (server env, não acessível em client). `passwordLast4` vem do perfil.
 *
 * Banner amarelo se host vazio: ajuda a operador identificar config
 * faltante antes do usuário tentar conectar.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Plug } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";
import { getProfileByIdAction } from "@/lib/actions/integrations-power-bi";
import { buildDerivedViewName } from "@/lib/integrations/power-bi/sql-builders";
import { getCatalogEntry } from "@/lib/integrations/power-bi/catalog";

import { ConnectTabs } from "@/components/integracoes/power-bi/connect-tabs";

export const metadata = {
  title: "Conectar Power BI · Integrações | Nexus Insights",
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

  const views = (profile.allowedTables as string[]).map((t) => ({
    table: t,
    label: getCatalogEntry(t)?.label ?? t,
    viewName: buildDerivedViewName(profile.id, t),
  }));

  const host = process.env.INTEGRATION_DB_HOST_PUBLIC ?? "";
  const port = parseInt(process.env.INTEGRATION_DB_PORT_PUBLIC ?? "5432", 10);
  const database = process.env.INTEGRATION_DB_NAME_PUBLIC ?? "nexus_insights";

  const connectionInfo = {
    host,
    port,
    database,
    user: profile.pgUsername,
    passwordLast4: profile.passwordLast4,
  };

  const hostMissing = host.length === 0;

  return (
    <PageShell variant="wide">
      <div className="mb-3">
        <Link
          href={`/integracoes/power-bi/${profile.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Voltar para o perfil
        </Link>
      </div>

      <PageHeader
        icon={Plug}
        title="Conectar Power BI"
        subtitle={`Perfil "${profile.name}"`}
      />

      {hostMissing ? (
        <div
          role="alert"
          data-testid="host-missing-banner"
          className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300"
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Host de integração não configurado
            </p>
            <p className="text-xs text-amber-700/90 dark:text-amber-300/90 leading-relaxed">
              <code className="font-mono">INTEGRATION_DB_HOST_PUBLIC</code> não
              está configurado em produção. Snippets terão host vazio.
              Configure as variáveis (ver runbook).
            </p>
          </div>
        </div>
      ) : null}

      <ConnectTabs
        profileId={profile.id}
        connectionInfo={connectionInfo}
        views={views}
      />
    </PageShell>
  );
}
