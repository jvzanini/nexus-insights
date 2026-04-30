"use server";

import { getCurrentUser } from "@/lib/auth";
import { getKnownAccounts, getAccessibleAccountIds } from "@/lib/tenant";
import {
  dashboardData,
  type DashboardData,
} from "@/lib/chatwoot/queries/dashboard-data";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import { getDashboardPeriod, type DashboardPeriod } from "@/lib/dashboard-period";
import { getDashboardSettings } from "@/lib/dashboard-settings";
import { getPlatformTz } from "@/lib/datetime";
import type { AuthUser } from "@/lib/auth-helpers";

export type { DashboardPeriod };

export interface DashboardActionResult {
  success: boolean;
  data?: DashboardData & {
    accounts: Array<{ id: number; name: string }>;
    activeAccountId: number;
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

    const [tz, settings, excludeMatrixIA] = await Promise.all([
      getPlatformTz(),
      getDashboardSettings(),
      shouldExcludeMatrixIA(),
    ]);

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
      },
    };
  } catch (err) {
    console.error("[getDashboardData]", err);
    return { success: false, error: "Erro ao carregar dashboard" };
  }
}
