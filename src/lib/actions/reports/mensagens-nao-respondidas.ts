"use server";

import { getCurrentUser } from "@/lib/auth";
import {
  mensagensNaoRespondidas,
  type MensagemNaoRespondidaRow,
} from "@/lib/chatwoot/queries/mensagens-nao-respondidas";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { getAccessibleTeamIds } from "@/lib/tenant";
import type { AuthUser } from "@/lib/auth-helpers";

const DEFAULT_ACCOUNT_ID = 9;

export interface FetchMensagensNaoRespondidasInput {
  filters: ReportFilters;
  accountId?: number;
  limit?: number;
}

export interface FetchMensagensNaoRespondidasResult {
  rows: MensagemNaoRespondidaRow[];
  total: number;
  avgWaitingSeconds: number;
  oldestWaitingSeconds: number;
  stale: boolean;
  cached: boolean;
  cachedAt?: Date;
  error?: string;
}

export async function fetchMensagensNaoRespondidas(
  args: FetchMensagensNaoRespondidasInput,
): Promise<FetchMensagensNaoRespondidasResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      rows: [],
      total: 0,
      avgWaitingSeconds: 0,
      oldestWaitingSeconds: 0,
      stale: false,
      cached: false,
      error: "Não autenticado",
    };
  }

  const accountId = args.accountId ?? DEFAULT_ACCOUNT_ID;

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

  const scopedFilters: ReportFilters = { ...args.filters };
  if (teamScope !== "all") {
    if (teamScope.length === 0) {
      return {
        rows: [],
        total: 0,
        avgWaitingSeconds: 0,
        oldestWaitingSeconds: 0,
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
          avgWaitingSeconds: 0,
          oldestWaitingSeconds: 0,
          stale: false,
          cached: false,
        };
      }
    } else {
      scopedFilters.teamIds = teamScope;
    }
  }

  try {
    const result = await mensagensNaoRespondidas({
      accountId,
      filters: scopedFilters,
      limit: args.limit,
    });

    return {
      rows: result.data.rows,
      total: result.data.total,
      avgWaitingSeconds: result.data.avgWaitingSeconds,
      oldestWaitingSeconds: result.data.oldestWaitingSeconds,
      stale: result.stale,
      cached: result.cached,
      cachedAt: result.cachedAt,
      error: result.error,
    };
  } catch (err) {
    console.error("[fetchMensagensNaoRespondidas]", err);
    return {
      rows: [],
      total: 0,
      avgWaitingSeconds: 0,
      oldestWaitingSeconds: 0,
      stale: true,
      cached: false,
      error: "Erro ao carregar mensagens não respondidas",
    };
  }
}
