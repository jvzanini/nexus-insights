import "server-only";

import { auth } from "@/auth";
import { getMatrixIAVisibility } from "./visibility";

/**
 * Decide se as queries de relatório devem excluir conversas da inbox Matrix IA
 * (id=31) com base na visibility 3-níveis e no role do usuário.
 *
 * Regras (alinhadas com o card "Incluir Matrix IA nos relatórios"):
 *   - visibility "all" → inclui pra todos (return false).
 *   - visibility "super_admin_only" → super_admin inclui, demais excluem.
 *   - visibility "none" → exclui pra TODOS (inclusive super_admin) → return true.
 *
 * Sem sessão → exclui por segurança (return true).
 */
export async function shouldExcludeMatrixIA(): Promise<boolean> {
  const session = await auth();
  const role = (session?.user as { platformRole?: string } | undefined)
    ?.platformRole;
  if (!role) return true;
  const v = await getMatrixIAVisibility();
  if (v === "none") return true;
  if (v === "super_admin_only") return role !== "super_admin";
  return false;
}
