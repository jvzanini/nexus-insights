"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { pgPool } from "@/lib/pg-pool";
import { invalidateSettingsCache } from "@/lib/settings/get";

export interface SetMatrixIAResult {
  ok: boolean;
  error?: string;
}

const KEY = "reports.include_matrix_ia";

/**
 * Liga/desliga a inclusão da inbox Matrix IA (id=31) nos relatórios para
 * usuários que NÃO são `super_admin`. Super admin sempre vê tudo.
 *
 * Persiste em `app_settings` via `pgPool` (raw SQL) e invalida o cache Redis
 * que serve `getAllSettings()` / `getSetting()`.
 */
export async function setMatrixIAEnabled(
  enabled: boolean,
): Promise<SetMatrixIAResult> {
  try {
    const session = await auth();
    const role = (session?.user as { platformRole?: string } | undefined)
      ?.platformRole;
    if (role !== "super_admin") {
      return { ok: false, error: "Apenas super_admin" };
    }

    await pgPool.query(
      `INSERT INTO app_settings (key, value, category, updated_at)
       VALUES ($2, $1::jsonb, 'reports', NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(enabled), KEY],
    );

    await invalidateSettingsCache(KEY);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[setMatrixIAEnabled]", err);
    return { ok: false, error: "Erro ao salvar configuração" };
  }
}
