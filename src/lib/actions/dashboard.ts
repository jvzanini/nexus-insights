"use server";

import { getCurrentUser } from "@/lib/auth";
import { getKnownAccounts, getAccessibleAccountIds } from "@/lib/tenant";
import {
  dashboardData,
  type DashboardData,
} from "@/lib/chatwoot/queries/dashboard-data";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import {
  getDashboardPeriod,
  type DashboardPeriod,
  type DashboardMode,
  type WeekStartsOn,
} from "@/lib/dashboard-period";
import {
  getDashboardSettings,
  type DashboardSettings,
} from "@/lib/dashboard-settings";
import { getPlatformTz, DEFAULT_TZ } from "@/lib/datetime";
import type { AuthUser } from "@/lib/auth-helpers";

export type { DashboardPeriod };

export interface DashboardActionResult {
  success: boolean;
  data?: DashboardData & {
    accounts: Array<{ id: number; name: string }>;
    activeAccountId: number;
    /** Echo da config aplicada para o frontend usar no eixo X. */
    settings: DashboardSettings;
    tz: string;
    /** ISO string do início e fim do período aplicado. */
    range: { start: string; end: string };
  };
  error?: string;
}

const FALLBACK_SETTINGS: DashboardSettings = {
  weekStartsOn: 1 as WeekStartsOn,
  weekMode: "current" as DashboardMode,
  monthMode: "current" as DashboardMode,
};

/**
 * Lê settings com try/catch defensivo. Em caso de qualquer falha,
 * retorna os defaults (segunda + atual + atual). NÃO joga.
 */
async function safeGetDashboardSettings(): Promise<DashboardSettings> {
  try {
    return await getDashboardSettings();
  } catch (err) {
    console.error("[getDashboardSettings] erro — usando defaults:", err);
    return FALLBACK_SETTINGS;
  }
}

async function safeGetPlatformTz(): Promise<string> {
  try {
    return await getPlatformTz();
  } catch (err) {
    console.error("[getPlatformTz] erro — usando default:", err);
    return DEFAULT_TZ;
  }
}

export async function getDashboardData(args: {
  accountId: number;
  period: DashboardPeriod;
}): Promise<DashboardActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Não autenticado" };
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      isOwner: user.isOwner,
      mustChangePassword: user.mustChangePassword,
      avatarUrl: user.avatarUrl,
      theme: user.theme,
      accountIds: user.accountIds,
      teamIds: user.teamIds,
    };

    const accessibleIds = await getAccessibleAccountIds(authUser);
    if (!accessibleIds.includes(args.accountId)) {
      return { success: false, error: "Acesso negado a esta conta" };
    }

    const allAccounts = await getKnownAccounts();
    const accounts = allAccounts.filter((a) => accessibleIds.includes(a.id));

    // Settings + tz + matrix com fallbacks defensivos
    const [tz, settings, excludeMatrixIA] = await Promise.all([
      safeGetPlatformTz(),
      safeGetDashboardSettings(),
      shouldExcludeMatrixIA(),
    ]);

    // Calcula período conforme config (current/rolling + weekStartsOn)
    const mode =
      args.period === "semana"
        ? settings.weekMode
        : args.period === "mes"
          ? settings.monthMode
          : "current";

    const { current, prev } = getDashboardPeriod({
      period: args.period,
      mode,
      weekStartsOn: settings.weekStartsOn,
      tz,
    });

    const result = await dashboardData({
      accountId: args.accountId,
      period: current,
      prevPeriod: prev,
      excludeMatrixIA,
    });

    return {
      success: true,
      data: {
        ...result.data,
        accounts,
        activeAccountId: args.accountId,
        settings,
        tz,
        range: {
          start: current.start.toISOString(),
          end: current.end.toISOString(),
        },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[getDashboardData] erro:", message, err);
    return { success: false, error: `Erro ao carregar dashboard: ${message}` };
  }
}
