import "server-only";

import { pgPool } from "@/lib/pg-pool";

const KEY = "reports.include_matrix_ia";

/**
 * Lê a flag `reports.include_matrix_ia` direto de `app_settings`.
 * Default `true` (incluir Matrix IA) caso a chave ainda não exista.
 *
 * Aceita `value` em qualquer formato JSON (boolean, string ou outro
 * truthy/falsy) — normaliza para boolean.
 */
export async function getMatrixIAIncluded(): Promise<boolean> {
  try {
    const r = await pgPool.query<{ value: unknown }>(
      "SELECT value FROM app_settings WHERE key = $1",
      [KEY],
    );
    if (!r.rowCount) return true;
    const v = r.rows[0]!.value;
    if (typeof v === "boolean") return v;
    if (typeof v === "string") return v === "true";
    return Boolean(v);
  } catch (err) {
    console.error("[getMatrixIAIncluded]", err);
    return true;
  }
}
