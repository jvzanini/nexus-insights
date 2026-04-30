import { redirect } from "next/navigation";
import { Settings, RefreshCcw, Eye } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PollingSettingsForm } from "@/components/settings/polling-settings-form";
import { VisibilitySettingsForm } from "@/components/settings/visibility-settings-form";
import { PlatformSettingsCard } from "@/components/settings/platform-settings-card";
import { EnabledReportsCard } from "@/components/settings/enabled-reports-card";
import { MatrixIAToggleCard } from "@/components/settings/matrix-ia-toggle-card";
import { LlmConfigCard } from "@/components/settings/llm-config-card";
import { getCurrentUser } from "@/lib/auth";
import { getAllSettings } from "@/lib/actions/settings";
import { getPlatformLocale, getPlatformTz } from "@/lib/datetime";
import { getEnabledReportKeys } from "@/lib/reports/get-enabled-reports";
import { getMatrixIAIncluded } from "@/lib/reports/matrix-ia-setting";
import { getPublicActiveLlmConfig } from "@/lib/llm/get-active-config";
import { isNexBubbleEnabled } from "@/lib/llm/get-nex-bubble-enabled";

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
    enabledReportKeys,
    llmConfig,
    matrixIAIncluded,
    nexBubbleEnabled,
  ] = await Promise.all([
    getPlatformTz(),
    getPlatformLocale(),
    getEnabledReportKeys(),
    getPublicActiveLlmConfig(),
    getMatrixIAIncluded(),
    isNexBubbleEnabled(),
  ]);

  const isSuperAdmin = user.platformRole === "super_admin";

  const polling = {
    liveSeconds: readNumber(data["polling.live_seconds"], 30),
    historicalSeconds: readNumber(data["polling.historical_seconds"], 300),
    refreshButtonEnabled: readBoolean(data["polling.refresh_button_enabled"], true),
    sseEnabled: readBoolean(data["realtime.sse_enabled"], true),
  };

  const visibility = {
    matrixIaVisibleToSuperAdminOnly: readBoolean(
      data["feature_flags.matrix_ia_visible_to_super_admin_only"],
      true,
    ),
    excludeMatrixIaGlobally: readBoolean(
      data["feature_flags.exclude_matrix_ia_globally"],
      true,
    ),
    csatEnabled: readBoolean(data["feature_flags.csat_enabled"], true),
    slaEnabled: readBoolean(data["feature_flags.sla_enabled"], true),
  };

  return (
    <div>
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
          <EnabledReportsCard
            initialEnabled={Array.from(enabledReportKeys)}
          />
        )}

        {isSuperAdmin && (
          <MatrixIAToggleCard initialEnabled={matrixIAIncluded} />
        )}

        {isSuperAdmin && (
          <LlmConfigCard
            initial={llmConfig}
            initialNexEnabled={nexBubbleEnabled}
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
    </div>
  );
}
