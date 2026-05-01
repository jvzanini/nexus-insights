"use server";

import { getCurrentUser } from "@/lib/auth";
import { getKnownAccounts, getAccessibleAccountIds } from "@/lib/tenant";
import {
  dashboardData,
  type DashboardData,
} from "@/lib/chatwoot/queries/dashboard-data";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import { getDashboardPeriod } from "@/lib/dashboard-period";
import {
  getDashboardSettings,
  DASHBOARD_DEFAULTS,
} from "@/lib/dashboard-settings";
import { getPlatformTz, DEFAULT_TZ } from "@/lib/datetime";
import type { AuthUser } from "@/lib/auth-helpers";

export type DashboardPeriod = "hoje" | "semana" | "mes";

export interface DashboardActionResult {
  success: boolean;
  data?: DashboardData & {
    accounts: Array<{ id: number; name: string }>;
    activeAccountId: number;
    /** Echo da config aplicada para o frontend usar no eixo X. */
    settings: {
      weekStartsOn: number;
      weekMode: "current" | "rolling";
      monthMode: "current" | "rolling";
    };
    tz: string;
    /** ISO string do início e fim do período aplicado. */
    range: { start: string; end: string };
  };
  error?: string;
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

    // Settings + tz com fallbacks defensivos individuais
    let tz = DEFAULT_TZ;
    let settings = DASHBOARD_DEFAULTS;
    try {
      tz = await getPlatformTz();
    } catch (err) {
      console.error("[getDashboardData] getPlatformTz falhou:", err);
    }
    try {
      settings = await getDashboardSettings();
    } catch (err) {
      console.error("[getDashboardData] getDashboardSettings falhou:", err);
    }

    const excludeMatrixIA = await shouldExcludeMatrixIA();

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
        settings: {
          weekStartsOn: settings.weekStartsOn,
          weekMode: settings.weekMode,
          monthMode: settings.monthMode,
        },
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
