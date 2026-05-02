"use server";

import { getCurrentUser } from "@/lib/auth";
import {
  conversasList,
  type ConversaRow,
} from "@/lib/chatwoot/queries/conversas-list";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { getAccessibleTeamIds } from "@/lib/tenant";
import type { AuthUser } from "@/lib/auth-helpers";

const DEFAULT_ACCOUNT_ID = 9;

export interface FetchConversasInput {
  filters: ReportFilters;
  page?: number;
  pageSize?: number;
  accountId?: number;
}

export interface FetchConversasResult {
  rows: ConversaRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stale: boolean;
  cached: boolean;
  cachedAt?: Date;
  error?: string;
}

/**
 * Busca conversas paginadas (page-based) para o relatório.
 * Aplica scope multi-tenant via getCurrentUser + getAccessibleTeamIds.
 *
 * exportConversasAction usa conversasList em modo cursor diretamente —
 * essa Server Action é apenas pra UI paginada.
 */
export async function fetchConversas(
  args: FetchConversasInput,
): Promise<FetchConversasResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      rows: [],
      total: 0,
      page: 1,
      pageSize: 1000,
      totalPages: 0,
      stale: false,
      cached: false,
      error: "Não autenticado",
    };
  }

  const accountId = args.accountId ?? DEFAULT_ACCOUNT_ID;
  const page = args.page ?? 1;
  const pageSize = args.pageSize ?? 1000;

  const teamScope = await getAccessibleTeamIds(
    {
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
    } satisfies AuthUser,
    accountId,
  );

  let scopedFilters: ReportFilters = { ...args.filters };
  if (teamScope !== "all") {
    if (teamScope.length === 0) {
      return {
        rows: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        stale: false,
        cached: false,
      };
    }
    if (scopedFilters.teamIds && scopedFilters.teamIds.length > 0) {
      scopedFilters.teamIds = scopedFilters.teamIds.filter((id) =>
        teamScope.includes(id),
      );
      if (scopedFilters.teamIds.length === 0) {
        return {
          rows: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
          stale: false,
          cached: false,
        };
      }
    } else {
      scopedFilters.teamIds = teamScope;
    }
  }

  try {
    const result = await conversasList({
      accountId,
      filters: scopedFilters,
      page,
      pageSize,
    });

    const total = result.data.total;
    const effectivePageSize = result.data.pageSize;
    const totalPages = total > 0 ? Math.ceil(total / effectivePageSize) : 0;

    return {
      rows: result.data.rows,
      total,
      page: result.data.page,
      pageSize: effectivePageSize,
      totalPages,
      stale: result.stale,
      cached: result.cached,
      cachedAt: result.cachedAt,
      error: result.error,
    };
  } catch (err) {
    console.error("[fetchConversas]", err);
    return {
      rows: [],
      total: 0,
      page: 1,
      pageSize,
      totalPages: 0,
      stale: true,
      cached: false,
      error: "Erro ao carregar conversas",
    };
  }
}
