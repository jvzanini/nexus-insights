"use server";

import { getCurrentUser } from "@/lib/auth";
import { getKnownAccounts, getAccessibleAccountIds } from "@/lib/tenant";
import {
  dashboardData,
  type DashboardData,
} from "@/lib/chatwoot/queries/dashboard-data";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import type { AuthUser } from "@/lib/auth-helpers";

export type DashboardPeriod = "today" | "7d" | "30d";

export interface DashboardActionResult {
  success: boolean;
  data?: DashboardData & {
    accounts: Array<{ id: number; name: string }>;
    activeAccountId: number;
  };
  error?: string;
}

function periodRanges(period: DashboardPeriod): {
  current: { start: Date; end: Date };
  prev: { start: Date; end: Date };
} {
  const now = new Date();
  const end = now;
  let start: Date;
  let prevStart: Date;
  let prevEnd: Date;

  switch (period) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      start = d;
      prevEnd = d;
      const ps = new Date(d);
      ps.setDate(ps.getDate() - 1);
      prevStart = ps;
      break;
    }
    case "7d": {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevEnd = start;
      prevStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    }
    case "30d":
    default: {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      prevEnd = start;
      prevStart = new Date(start.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    }
  }

  return {
    current: { start, end },
    prev: { start: prevStart, end: prevEnd },
  };
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

    const { current, prev } = periodRanges(args.period);

    const excludeMatrixIA = await shouldExcludeMatrixIA();

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
