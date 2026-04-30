"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import { pgPool } from "@/lib/pg-pool";
import { ALL_REPORT_KEYS } from "@/lib/reports/catalog";
import { invalidateEnabledReports } from "@/lib/reports/get-enabled-reports";

export interface SetEnabledReportKeysResult {
  ok: boolean;
  error?: string;
}

export async function setEnabledReportKeys(
  keys: string[],
): Promise<SetEnabledReportKeysResult> {
  const session = await auth();
  const userRecord = (session?.user ?? {}) as Record<string, unknown>;
  const role = userRecord.platformRole as string | undefined;
  const userId = (userRecord.id as string | undefined) ?? null;

  if (role !== "super_admin") {
    return { ok: false, error: "Apenas super_admin pode editar" };
  }

  if (!Array.isArray(keys)) {
    return { ok: false, error: "Lista inválida" };
  }
  if (keys.length === 0) {
    return { ok: false, error: "Pelo menos 1 relatório deve estar habilitado" };
  }

  const validKeys = new Set(ALL_REPORT_KEYS);
  const filtered = Array.from(new Set(keys.filter((k) => validKeys.has(k))));
  if (filtered.length === 0) {
    return { ok: false, error: "Nenhuma key válida" };
  }

  await pgPool.query(
    `INSERT INTO app_settings (key, value, category, updated_at, updated_by_id)
     VALUES ('platform.enabled_reports', $1::jsonb, 'platform', NOW(), $2)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           category = EXCLUDED.category,
           updated_at = NOW(),
           updated_by_id = EXCLUDED.updated_by_id`,
    [JSON.stringify(filtered), userId],
  );

  invalidateEnabledReports();

  await logAudit({
    userId,
    action: "setting_updated",
    targetType: "platform_settings",
    targetId: "enabled_reports",
    details: { keys: filtered },
  });

  // Força re-fetch da sidebar (e demais layouts que dependem das keys).
  revalidatePath("/", "layout");

  return { ok: true };
}
