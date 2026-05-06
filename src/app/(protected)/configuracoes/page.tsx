import { redirect } from "next/navigation";
import { Settings, RefreshCcw, Eye } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PollingSettingsForm } from "@/components/settings/polling-settings-form";
import { VisibilitySettingsForm } from "@/components/settings/visibility-settings-form";
import { PlatformSettingsCard } from "@/components/settings/platform-settings-card";
import { EnabledReportsCard } from "@/components/settings/enabled-reports-card";
import { MatrixIAToggleCard } from "@/components/settings/matrix-ia-toggle-card";
import { DashboardSettingsCard } from "@/components/settings/dashboard-settings-card";
import { ChatwootUrlsCard } from "@/components/settings/chatwoot-urls-card";
import { getCurrentUser } from "@/lib/auth";
import {
  getAllSettings,
  listChatwootAccountUrlsAction,
} from "@/lib/actions/settings";
import { listKnownAccountIds } from "@/lib/chatwoot/accounts";
import { getDashboardSettings } from "@/lib/dashboard-settings";
import { getPlatformLocale, getPlatformTz } from "@/lib/datetime";
import { ALL_REPORT_KEYS } from "@/lib/reports/catalog";
import {
  getMatrixIAVisibility,
  getReportVisibility,
  type Visibility,
} from "@/lib/reports/visibility";

export const metadata = { title: "Configurações | Nexus Insights" };
export const dynamic = "force-dynamic";

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return fallback;
}

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const result = await getAllSettings();
  const data = result.success && result.data ? result.data : {};

  const [
    platformTimezone,
    platformLocale,
    reportVisibilityEntries,
    matrixIaVisibility,
    dashboardSettings,
    knownAccounts,
    chatwootUrls,
  ] = await Promise.all([
    getPlatformTz(),
    getPlatformLocale(),
    Promise.all(
      ALL_REPORT_KEYS.map(
        async (k) => [k, await getReportVisibility(k)] as const,
      ),
    ),
    getMatrixIAVisibility(),
    getDashboardSettings(),
    listKnownAccountIds().catch(() => []),
    listChatwootAccountUrlsAction().then((r) => (r.ok ? r.data ?? [] : [])),
  ]);

  const reportVisibilityMap = Object.fromEntries(
    reportVisibilityEntries,
  ) as Record<string, Visibility>;

  const isSuperAdmin = user.platformRole === "super_admin";

  const polling = {
    liveSeconds: readNumber(data["polling.live_seconds"], 30),
    refreshButtonEnabled: readBoolean(data["polling.refresh_button_enabled"], true),
  };

  const visibility = {
    csatEnabled: readBoolean(data["feature_flags.csat_enabled"], true),
    slaEnabled: readBoolean(data["feature_flags.sla_enabled"], true),
  };

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={Settings}
        title="Configurações"
        subtitle="Ajustes globais da plataforma"
      />

      <div className="space-y-6">
        {isSuperAdmin && (
          <PlatformSettingsCard
            currentTimezone={platformTimezone}
            currentLocale={platformLocale}
            canEdit={isSuperAdmin}
          />
        )}

        {isSuperAdmin && (
          <EnabledReportsCard initialVisibility={reportVisibilityMap} />
        )}

        {isSuperAdmin && (
          <DashboardSettingsCard initial={dashboardSettings} />
        )}

        {isSuperAdmin && (
          <MatrixIAToggleCard initialVisibility={matrixIaVisibility} />
        )}

        {isSuperAdmin && (
          <ChatwootUrlsCard
            accounts={knownAccounts}
            initial={chatwootUrls}
          />
        )}

        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <RefreshCcw className="h-4 w-4 text-violet-500" />
              Atualização
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PollingSettingsForm initial={polling} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Eye className="h-4 w-4 text-violet-500" />
              Visibilidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VisibilitySettingsForm initial={visibility} />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
