"use server";

/**
 * Server Actions de meta-informação sobre integrações:
 *
 * - getIntegrationsSummaryAction: contadores agregados por status (active /
 *   disabled / errored) para a tela /integracoes/power-bi.
 * - getDimSnapshotFreshnessAction: timestamp do último refresh de cada
 *   dim_*_snapshot, para o badge "última atualização" do worker dim-sync.
 *
 * Apenas super_admin acessa (RBAC duro). Envelope `ActionResult<T>` segue o
 * padrão de `llm-credentials.ts` para evitar throws subindo até o RSC.
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
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
    console.error(`[integrations:${context}] erro inesperado:`, err);
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
  { ok: true; userId: string | null } | { ok: false; error: string }
> {
  const session = await auth();
  const user = (session?.user ?? {}) as SessionUserShape;
  if (user.platformRole !== "super_admin") {
    return {
      ok: false,
      error: "Apenas super_admin pode acessar integrações.",
    };
  }
  return { ok: true, userId: user.id ?? null };
}

export interface IntegrationsSummary {
  powerBi: { active: number; disabled: number; errored: number };
}

export async function getIntegrationsSummaryAction(): Promise<
  ActionResult<IntegrationsSummary>
> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    await ensureIntegrationsTables();

    const [active, disabled, errored] = await Promise.all([
      prisma.integrationProfile.count({
        where: { kind: "power_bi", status: "active", deletedAt: null },
      }),
      prisma.integrationProfile.count({
        where: { kind: "power_bi", status: "disabled", deletedAt: null },
      }),
      prisma.integrationProfile.count({
        where: { kind: "power_bi", status: "error", deletedAt: null },
      }),
    ]);

    return { ok: true, data: { powerBi: { active, disabled, errored } } };
  }, "summary");
}

export interface DimSnapshotFreshness {
  accounts: Date | null;
  inboxes: Date | null;
  agents: Date | null;
  teams: Date | null;
}

export async function getDimSnapshotFreshnessAction(): Promise<
  ActionResult<DimSnapshotFreshness>
> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    await ensureIntegrationsTables();

    const result = await pgPool.query<{ dim: string; max_refreshed: Date | null }>(
      `SELECT 'accounts' AS dim, MAX(refreshed_at) AS max_refreshed FROM powerbi.dim_accounts_snapshot
       UNION ALL
       SELECT 'inboxes', MAX(refreshed_at) FROM powerbi.dim_inboxes_snapshot
       UNION ALL
       SELECT 'agents', MAX(refreshed_at) FROM powerbi.dim_agents_snapshot
       UNION ALL
       SELECT 'teams', MAX(refreshed_at) FROM powerbi.dim_teams_snapshot`,
    );

    const map: DimSnapshotFreshness = {
      accounts: null,
      inboxes: null,
      agents: null,
      teams: null,
    };
    for (const r of result.rows) {
      if (r.dim === "accounts" || r.dim === "inboxes" || r.dim === "agents" || r.dim === "teams") {
        map[r.dim] = r.max_refreshed;
      }
    }

    return { ok: true, data: map };
  }, "freshness");
}
