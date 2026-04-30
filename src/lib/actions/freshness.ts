"use server";

/**
 * Server Action: leitura da freshness das tabelas de pré-agregação (facts).
 *
 * Retorna o estado da dimensão "guarda-chuva" `by_account` para a conta dada,
 * usado pelo badge `<FactsFreshness />` no header dos relatórios.
 *
 * Permissões: qualquer usuário autenticado com acesso à conta pode ler a
 * meta. Não expõe dados sensíveis (apenas timestamps, contagens e status).
 */

import { auth } from "@/auth";
import { readFactsMeta, type FactsMeta } from "@/lib/chatwoot/facts";

export interface FreshnessSummary {
  lagSeconds: number | null;
  status: FactsMeta["status"];
  /** ISO string para serializar bem entre server/client. null = nunca rodou. */
  lastRefreshAt: string | null;
}

export interface FreshnessResult {
  ok: boolean;
  error?: string;
  data?: FreshnessSummary;
}

export async function getFreshnessForAccount(
  accountId: number,
): Promise<FreshnessResult> {
  if (!Number.isFinite(accountId) || accountId <= 0) {
    return { ok: false, error: "accountId inválido" };
  }

  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Não autenticado" };
  }

  try {
    const rows = await readFactsMeta({ accountId, dimension: "by_account" });
    const row = rows[0];

    if (!row) {
      return {
        ok: true,
        data: { lagSeconds: null, status: "never", lastRefreshAt: null },
      };
    }

    return {
      ok: true,
      data: {
        lagSeconds: row.lagSeconds,
        status: row.status,
        lastRefreshAt: row.lastRefreshAt
          ? row.lastRefreshAt.toISOString()
          : null,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro ao ler freshness",
    };
  }
}
