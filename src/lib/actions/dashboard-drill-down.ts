"use server";

import { getCurrentUser } from "@/lib/auth";
import { getAccessibleAccountIds } from "@/lib/tenant";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import type { AuthUser } from "@/lib/auth-helpers";
import {
  getDashboardPeriod,
  type DashboardPeriod,
} from "@/lib/dashboard-period";
import { getDashboardSettings } from "@/lib/dashboard-settings";
import { getPlatformTz } from "@/lib/datetime";
import {
  getOpenDrillDown,
  getReceivedDrillDown,
  getResolutionRateDrillDown,
  getResolvedDrillDown,
  getNoResponseDrillDown,
  getByTeamDrillDown,
  type OpenDrillDownData,
  type ReceivedDrillDownData,
  type ResolutionRateDrillDownData,
  type ResolvedDrillDownData,
  type NoResponseDrillDownData,
  type ByTeamDrillDownData,
} from "@/lib/chatwoot/queries/dashboard-drill-down";

export type { DashboardPeriod };

export interface DrillDownActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function resolvePeriodRanges(period: DashboardPeriod): Promise<{
  current: { start: Date; end: Date };
  prev: { start: Date; end: Date };
}> {
  const [tz, settings] = await Promise.all([
    getPlatformTz(),
    getDashboardSettings(),
  ]);
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
  return { ok: true, excludeMatrixIA };
}

export async function getReceivedDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
}): Promise<DrillDownActionResult<ReceivedDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = await resolvePeriodRanges(args.period);
    const result = await getReceivedDrillDown({
      accountId: args.accountId,
      period: current,
      excludeMatrixIA: auth.excludeMatrixIA,
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
}): Promise<DrillDownActionResult<ResolvedDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = await resolvePeriodRanges(args.period);
    const result = await getResolvedDrillDown({
      accountId: args.accountId,
      period: current,
      excludeMatrixIA: auth.excludeMatrixIA,
    });
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[getResolvedDrillDownAction]", err);
    return { success: false, error: "Erro ao carregar drill-down" };
  }
}

export async function getOpenDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
}): Promise<DrillDownActionResult<OpenDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = await resolvePeriodRanges(args.period);
    const result = await getOpenDrillDown({
      accountId: args.accountId,
      period: current,
      excludeMatrixIA: auth.excludeMatrixIA,
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
    const result = await getNoResponseDrillDown({
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
    const result = await getByTeamDrillDown({
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
    const result = await getResolutionRateDrillDown({
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
