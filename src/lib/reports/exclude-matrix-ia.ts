import "server-only";

import { auth } from "@/auth";
import { getMatrixIAIncluded } from "./matrix-ia-setting";

/**
 * Decide se as queries de relatório devem excluir conversas da inbox Matrix IA
 * (id=31) com base no role do usuário e na flag global `reports.include_matrix_ia`.
 *
 * Regras:
 *   - super_admin → SEMPRE inclui (`false`).
 *   - outros roles + flag ON → inclui (`false`).
 *   - outros roles + flag OFF → exclui (`true`).
 *
 * Sem sessão (caso anômalo) → exclui por segurança.
 */
export async function shouldExcludeMatrixIA(): Promise<boolean> {
  const session = await auth();
  const role = (session?.user as { platformRole?: string } | undefined)
    ?.platformRole;
  if (role === "super_admin") return false;
  const enabled = await getMatrixIAIncluded();
  return !enabled;
}
