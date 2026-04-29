"use server";

import { getCurrentUser } from "@/lib/auth";
import {
  conversasList,
  type ConversaRow,
} from "@/lib/chatwoot/queries/conversas-list";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { getAccessibleTeamIds } from "@/lib/tenant";
import type { AuthUser } from "@/lib/auth-helpers";

const DEFAULT_ACCOUNT_ID = 9; // Matrix Fitness Group (single-tenant atualmente).

export interface FetchConversasInput {
  filters: ReportFilters;
  cursor?: string | null;
  accountId?: number;
}

export interface FetchConversasResult {
  rows: ConversaRow[];
  nextCursor: string | null;
  stale: boolean;
  cached: boolean;
  cachedAt?: Date;
  error?: string;
}

/**
 * Busca conversas paginadas para o relatório.
 * Aplica scope multi-tenant via getCurrentUser + getAccessibleTeamIds.
 */
export async function fetchConversas(
  args: FetchConversasInput,
): Promise<FetchConversasResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      rows: [],
      nextCursor: null,
      stale: false,
      cached: false,
      error: "Não autenticado",
    };
  }

  const accountId = args.accountId ?? DEFAULT_ACCOUNT_ID;

  // Aplica scope de teams: se viewer/manager, força filtro pelos teams
  // que o usuário tem acesso. Admin/super_admin veem tudo.
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
      // sem acesso a nenhum team — retorna vazio.
      return {
        rows: [],
        nextCursor: null,
        stale: false,
        cached: false,
      };
    }
    // intersecciona com teams já filtrados (se houver) ou aplica direto.
    if (scopedFilters.teamIds && scopedFilters.teamIds.length > 0) {
      scopedFilters.teamIds = scopedFilters.teamIds.filter((id) =>
        teamScope.includes(id),
      );
      if (scopedFilters.teamIds.length === 0) {
        return {
          rows: [],
          nextCursor: null,
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
      cursor: args.cursor ?? null,
    });

    return {
      rows: result.data.rows,
      nextCursor: result.data.nextCursor,
      stale: result.stale,
      cached: result.cached,
      cachedAt: result.cachedAt,
      error: result.error,
    };
  } catch (err) {
    console.error("[fetchConversas]", err);
    return {
      rows: [],
      nextCursor: null,
      stale: true,
      cached: false,
      error: "Erro ao carregar conversas",
    };
  }
}
