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
import { getActiveConnectionId } from "@/lib/reports/active-connection";
import type { AuthUser } from "@/lib/auth-helpers";

export type DashboardPeriod = "dia" | "semana" | "mes";

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
    /** Indica se o frontend pode oferecer setinha "→" para período seguinte. */
    nextAvailable: boolean;
  };
  error?: string;
}

export async function getDashboardData(args: {
  accountId: number;
  period: DashboardPeriod;
  /** ISO date opcional. Default = now. Permite navegar entre períodos. */
  referenceDate?: string;
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

    const referenceDate = args.referenceDate
      ? new Date(args.referenceDate)
      : undefined;

    const { current, prev } = getDashboardPeriod({
      period: args.period,
      mode,
      weekStartsOn: settings.weekStartsOn,
      tz,
      referenceDate,
    });

    // Forçar granularity: "dia" → hour, "semana"/"mes" → day
    const forcedGranularity: "hour" | "day" =
      args.period === "dia" ? "hour" : "day";

    // WHY: connectionId resolvido via binding ativo do account → escopa a
    // query no pool dinâmico da nexus_chat_connection correta (multi-tenant
    // fase 1).
    const connectionId = await getActiveConnectionId(authUser);

    const result = await dashboardData(connectionId, {
      accountId: args.accountId,
      period: current,
      prevPeriod: prev,
      excludeMatrixIA,
      forcedGranularity,
    });

    const nowMs = Date.now();
    const nextAvailable = current.end.getTime() < nowMs;

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
        nextAvailable,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[getDashboardData] erro:", message, err);
    return { success: false, error: `Erro ao carregar dashboard: ${message}` };
  }
}
