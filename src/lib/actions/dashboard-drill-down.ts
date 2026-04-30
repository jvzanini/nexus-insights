"use server";

import { getCurrentUser } from "@/lib/auth";
import { getAccessibleAccountIds } from "@/lib/tenant";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import type { AuthUser } from "@/lib/auth-helpers";
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

export type DashboardPeriod = "today" | "7d" | "30d";

export interface DrillDownActionResult<T> {
  success: boolean;
  data?: T;
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

  return { current: { start, end }, prev: { start: prevStart, end: prevEnd } };
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
    const { current } = periodRanges(args.period);
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
    const { current } = periodRanges(args.period);
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
    const { current } = periodRanges(args.period);
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
    const { current } = periodRanges(args.period);
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
    const { current } = periodRanges(args.period);
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
    const { current, prev } = periodRanges(args.period);
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
