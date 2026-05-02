"use server";

/**
 * Server Actions auxiliares para o wizard Power BI: leitura dos snapshots
 * `dim_accounts_snapshot` e `dim_teams_snapshot` (schema `powerbi.*`) para
 * popular MultiSelect de filtros (`accountIdFilter` / `teamIdFilter`).
 *
 * Apenas super_admin (RBAC duro). Quando o snapshot ainda não foi populado
 * (instalação fresh), retorna lista vazia — UI mostra empty state pedindo
 * para aguardar próxima sincronização ou disparar manualmente via
 * `triggerDimSyncAction`.
 *
 * Envelope `ActionResult<T>` mantém compatibilidade com o resto do código.
 */

import { auth } from "@/auth";
import { pgPool } from "@/lib/pg-pool";
import { ensureIntegrationsTables } from "@/lib/integrations/ensure-tables";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function safeAction<T>(
  fn: () => Promise<ActionResult<T>>,
  context: string,
): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[integrations-options:${context}] erro inesperado:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Erro inesperado: ${msg.slice(0, 200)}`,
    };
  }
}

interface SessionUserShape {
  id?: string;
  platformRole?: string;
}

async function requireSuperAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await auth();
  const user = (session?.user ?? {}) as SessionUserShape;
  if (user.platformRole !== "super_admin") {
    return {
      ok: false,
      error: "Apenas super_admin pode acessar opções de integração.",
    };
  }
  return { ok: true };
}

export interface AccountOption {
  account_id: number;
  name: string;
}

export interface TeamOption {
  account_id: number;
  team_id: number;
  name: string;
}

/**
 * Lista contas disponíveis para filtro (ordenadas por name asc).
 * Quando o snapshot está vazio (sync ainda não rodou), retorna [] com ok=true.
 */
export async function getAvailableAccountsForFilterAction(): Promise<
  ActionResult<AccountOption[]>
> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    await ensureIntegrationsTables();

    let result;
    try {
      result = await pgPool.query<{ account_id: number; name: string }>(
        `SELECT account_id, name
         FROM powerbi.dim_accounts_snapshot
         ORDER BY name ASC, account_id ASC`,
      );
    } catch (err) {
      // Schema/tabela ausente (instalação fresh sem migration aplicada) →
      // retorna [] em vez de quebrar a UI. Loga pra observabilidade.
      console.warn(
        "[integrations-options:accounts] snapshot indisponível, retornando vazio:",
        err instanceof Error ? err.message : String(err),
      );
      return { ok: true, data: [] };
    }

    const rows: AccountOption[] = result.rows.map((r) => ({
      account_id: Number(r.account_id),
      name: r.name,
    }));
    return { ok: true, data: rows };
  }, "accounts");
}

/**
 * Lista times disponíveis para filtro (ordenados por account_id, name).
 * Quando `accountIdFilter` é não-null, retorna apenas times daquele subset.
 * Snapshot vazio → [] com ok=true.
 */
export async function getAvailableTeamsForFilterAction(
  accountIdFilter?: number[] | null,
): Promise<ActionResult<TeamOption[]>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    await ensureIntegrationsTables();

    const hasFilter =
      Array.isArray(accountIdFilter) && accountIdFilter.length > 0;

    // Sanitiza para inteiros positivos (defesa em profundidade — server actions
    // recebem qualquer coisa do client).
    const safeIds = hasFilter
      ? Array.from(
          new Set(
            (accountIdFilter as number[])
              .map((n) => Number(n))
              .filter((n) => Number.isInteger(n) && n > 0),
          ),
        )
      : [];

    let result;
    try {
      if (hasFilter && safeIds.length > 0) {
        result = await pgPool.query<{
          account_id: number;
          team_id: number;
          name: string;
        }>(
          `SELECT account_id, team_id, name
           FROM powerbi.dim_teams_snapshot
           WHERE account_id = ANY($1::int[])
           ORDER BY account_id ASC, name ASC, team_id ASC`,
          [safeIds],
        );
      } else if (hasFilter && safeIds.length === 0) {
        // Filtro presente mas vazio após sanitize → ninguém atende.
        return { ok: true, data: [] };
      } else {
        result = await pgPool.query<{
          account_id: number;
          team_id: number;
          name: string;
        }>(
          `SELECT account_id, team_id, name
           FROM powerbi.dim_teams_snapshot
           ORDER BY account_id ASC, name ASC, team_id ASC`,
        );
      }
    } catch (err) {
      console.warn(
        "[integrations-options:teams] snapshot indisponível, retornando vazio:",
        err instanceof Error ? err.message : String(err),
      );
      return { ok: true, data: [] };
    }

    const rows: TeamOption[] = result.rows.map((r) => ({
      account_id: Number(r.account_id),
      team_id: Number(r.team_id),
      name: r.name,
    }));
    return { ok: true, data: rows };
  }, "teams");
}
