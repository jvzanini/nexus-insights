/**
 * Reconcile job: detecta drift entre o estado declarado nos perfis
 * (DB app: integration_profiles) e o estado real no Postgres (pg_roles +
 * pg_views). Drift detected → marca status='error' + audit
 * provisioning_failed.
 *
 * Cron 6h via BullMQ scheduler.
 *
 * NOTA: depende de T2 (migration Prisma) ter rodado pra que os models
 * IntegrationProfile e IntegrationAuditLog estejam disponíveis no client
 * gerado. Enquanto T2 não roda, o acesso é feito via `as any` para que
 * o typecheck não falhe — e o handler do worker já registrado pode ser
 * ativado assim que T2 rodar (sem mudar código).
 */

import { prisma } from "@/lib/prisma";
import { getIntegrationAdminPool } from "./admin-pool";
import { buildDerivedViewName } from "./sql-builders";

export type Drift =
  | { profileId: string; type: "missing_user" }
  | { profileId: string; type: "missing_views"; missing: string[] };

interface IntegrationProfileRow {
  id: string;
  pgUsername: string;
  allowedTables: string[];
}

export async function reconcileIntegrations(): Promise<{ drifts: Drift[] }> {
  // Acesso via `as any`: depende de T2 (Prisma migration) — descomentar/limpar
  // após T2 regenerar o client com os novos models.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileDelegate = (prisma as any).integrationProfile;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auditDelegate = (prisma as any).integrationAuditLog;

  if (!profileDelegate || !auditDelegate) {
    // T2 ainda não rodou — skeleton: retorna sem drifts (no-op seguro).
    console.warn(
      "[integrations.reconcile] Prisma client sem IntegrationProfile/IntegrationAuditLog — aguardando T2.",
    );
    return { drifts: [] };
  }

  const profiles = (await profileDelegate.findMany({
    where: { deletedAt: null, status: { not: "disabled" } },
    select: { id: true, pgUsername: true, allowedTables: true },
  })) as IntegrationProfileRow[];

  const drifts: Drift[] = [];
  const adminPool = getIntegrationAdminPool();

  for (const p of profiles) {
    const client = await adminPool.connect();
    try {
      const userRow = await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname = $1 AND rolcanlogin = true",
        [p.pgUsername],
      );
      if (userRow.rowCount === 0) {
        drifts.push({ profileId: p.id, type: "missing_user" });
        continue;
      }
      const expectedViews = (p.allowedTables as string[]).map((t) =>
        buildDerivedViewName(p.id, t),
      );
      const actualResult = await client.query(
        "SELECT viewname FROM pg_views WHERE schemaname='powerbi' AND viewname = ANY($1)",
        [expectedViews],
      );
      const actualSet = new Set(
        (actualResult.rows as Array<{ viewname: string }>).map(
          (r) => r.viewname,
        ),
      );
      const missing = expectedViews.filter((v) => !actualSet.has(v));
      if (missing.length > 0) {
        drifts.push({ profileId: p.id, type: "missing_views", missing });
      }
    } finally {
      client.release();
    }
  }

  // Para cada drift: marca profile + audit
  for (const d of drifts) {
    await profileDelegate.update({
      where: { id: d.profileId },
      data: { status: "error", lastProvisionError: `drift: ${d.type}` },
    });
    await auditDelegate.create({
      data: {
        profileId: d.profileId,
        event: "provisioning_failed",
        details: { drift: d } as object,
      },
    });
  }

  return { drifts };
}
