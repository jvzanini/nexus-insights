"use server";

import { getCurrentUser } from "@/lib/auth";
import { getAccessibleAccountIds } from "@/lib/tenant";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import { getActiveConnectionId } from "@/lib/reports/active-connection";
import type { AuthUser } from "@/lib/auth-helpers";
import {
  getOpenDrillDown,
  getReceivedDrillDown,
  getResolutionRateDrillDown,
  getResolvedDrillDown,
  getStatusDrillDown,
  getNoResponseDrillDown,
  getByTeamDrillDown,
  type OpenDrillDownData,
  type ReceivedDrillDownData,
  type ResolutionRateDrillDownData,
  type ResolvedDrillDownData,
  type StatusDrillDownData,
  type NoResponseDrillDownData,
  type ByTeamDrillDownData,
} from "@/lib/chatwoot/queries/dashboard-drill-down";
import { getDashboardPeriod } from "@/lib/dashboard-period";
import {
  getDashboardSettings,
  DASHBOARD_DEFAULTS,
} from "@/lib/dashboard-settings";
import { getPlatformTz, DEFAULT_TZ } from "@/lib/datetime";

export type DashboardPeriod = "dia" | "semana" | "mes";

export interface DrillDownActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Calcula período conforme configurações do dashboard, com fallback
 * defensivo para defaults se algo falhar.
 */
async function resolvePeriodRanges(period: DashboardPeriod): Promise<{
  current: { start: Date; end: Date };
  prev: { start: Date; end: Date };
}> {
  let tz = DEFAULT_TZ;
  let settings = DASHBOARD_DEFAULTS;
  try {
    tz = await getPlatformTz();
  } catch (err) {
    console.error("[drill-down] getPlatformTz falhou:", err);
  }
  try {
    settings = await getDashboardSettings();
  } catch (err) {
    console.error("[drill-down] getDashboardSettings falhou:", err);
  }
  const mode =
    period === "semana"
      ? settings.weekMode
      : period === "mes"
        ? settings.monthMode
        : "current";
  return getDashboardPeriod({
    period,
    mode,
    weekStartsOn: settings.weekStartsOn,
    tz,
  });
}

async function authorize(accountId: number): Promise<{
  ok: true;
  excludeMatrixIA: boolean;
  connectionId: string;
} | {
  ok: false;
  error: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado" };

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
  if (!accessibleIds.includes(accountId)) {
    return { ok: false, error: "Acesso negado a esta conta" };
  }
  const excludeMatrixIA = await shouldExcludeMatrixIA();
  // WHY: connectionId resolvido via binding ativo do account → escopa as
  // queries no pool dinâmico da nexus_chat_connection correta (multi-tenant
  // fase 1). Erros (No/Ambiguous binding) propagam pra catch da action.
  const connectionId = await getActiveConnectionId(authUser);
  return { ok: true, excludeMatrixIA, connectionId };
}

export async function getReceivedDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
  page?: number;
  pageSize?: number;
}): Promise<DrillDownActionResult<ReceivedDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = await resolvePeriodRanges(args.period);
    const result = await getReceivedDrillDown(auth.connectionId, {
      accountId: args.accountId,
      period: current,
      excludeMatrixIA: auth.excludeMatrixIA,
      page: args.page,
      pageSize: args.pageSize,
    });
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[getReceivedDrillDownAction]", err);
    return { success: false, error: "Erro ao carregar drill-down" };
  }
}

export async function getResolvedDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
  page?: number;
  pageSize?: number;
}): Promise<DrillDownActionResult<ResolvedDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = await resolvePeriodRanges(args.period);
    const result = await getResolvedDrillDown(auth.connectionId, {
      accountId: args.accountId,
      period: current,
      excludeMatrixIA: auth.excludeMatrixIA,
      page: args.page,
      pageSize: args.pageSize,
    });
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[getResolvedDrillDownAction]", err);
    return { success: false, error: "Erro ao carregar drill-down" };
  }
}

/**
 * Drill-down genérico de status (Aberto/Resolvido/Pendente/Adiado).
 * v0.13.0 — substitui `getOpenDrillDownAction` (que vira wrapper compat).
 */
export async function getStatusDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
  status: 0 | 1 | 2 | 3;
  page?: number;
  pageSize?: number;
}): Promise<DrillDownActionResult<StatusDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = await resolvePeriodRanges(args.period);
    const result = await getStatusDrillDown(auth.connectionId, {
      accountId: args.accountId,
      period: current,
      excludeMatrixIA: auth.excludeMatrixIA,
      status: args.status,
      page: args.page,
      pageSize: args.pageSize,
    });
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[getStatusDrillDownAction]", err);
    return { success: false, error: "Erro ao carregar drill-down" };
  }
}

export async function getOpenDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
  page?: number;
  pageSize?: number;
}): Promise<DrillDownActionResult<OpenDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = await resolvePeriodRanges(args.period);
    const result = await getOpenDrillDown(auth.connectionId, {
      accountId: args.accountId,
      period: current,
      excludeMatrixIA: auth.excludeMatrixIA,
      page: args.page,
      pageSize: args.pageSize,
    });
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[getOpenDrillDownAction]", err);
    return { success: false, error: "Erro ao carregar drill-down" };
  }
}

export async function getNoResponseDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
}): Promise<DrillDownActionResult<NoResponseDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = await resolvePeriodRanges(args.period);
    const result = await getNoResponseDrillDown(auth.connectionId, {
      accountId: args.accountId,
      period: current,
      excludeMatrixIA: auth.excludeMatrixIA,
    });
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[getNoResponseDrillDownAction]", err);
    return { success: false, error: "Erro ao carregar drill-down" };
  }
}

export async function getByTeamDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
  teamId: number | null;
}): Promise<DrillDownActionResult<ByTeamDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = await resolvePeriodRanges(args.period);
    const result = await getByTeamDrillDown(auth.connectionId, {
      accountId: args.accountId,
      period: current,
      teamId: args.teamId,
      excludeMatrixIA: auth.excludeMatrixIA,
    });
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[getByTeamDrillDownAction]", err);
    return { success: false, error: "Erro ao carregar drill-down" };
  }
}

export async function getResolutionRateDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
}): Promise<DrillDownActionResult<ResolutionRateDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current, prev } = await resolvePeriodRanges(args.period);
    const result = await getResolutionRateDrillDown(auth.connectionId, {
      accountId: args.accountId,
      period: current,
      prevPeriod: prev,
      excludeMatrixIA: auth.excludeMatrixIA,
    });
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[getResolutionRateDrillDownAction]", err);
    return { success: false, error: "Erro ao carregar drill-down" };
  }
}
