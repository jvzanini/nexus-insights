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

export type DashboardPeriod = "hoje" | "semana" | "mes";

export interface DrillDownActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * v0.13.3 (hotfix): voltou para lógica simples (rolling 24h/7d/30d).
 * O pipeline de getDashboardPeriod + getDashboardSettings introduzido
 * no v0.13.0 causou crash em produção.
 */
async function resolvePeriodRanges(period: DashboardPeriod): Promise<{
  current: { start: Date; end: Date };
  prev: { start: Date; end: Date };
}> {
  const now = new Date();
  let start: Date;
  let prevStart: Date;
  let prevEnd: Date;

  if (period === "hoje") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    start = d;
    prevEnd = d;
    const ps = new Date(d);
    ps.setDate(ps.getDate() - 1);
    prevStart = ps;
  } else if (period === "semana") {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    prevEnd = start;
    prevStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    prevEnd = start;
    prevStart = new Date(start.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return {
    current: { start, end: now },
    prev: { start: prevStart, end: prevEnd },
  };
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
  page?: number;
  pageSize?: number;
}): Promise<DrillDownActionResult<ReceivedDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = await resolvePeriodRanges(args.period);
    const result = await getReceivedDrillDown({
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
    const result = await getResolvedDrillDown({
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
    const result = await getStatusDrillDown({
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
    const result = await getOpenDrillDown({
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
