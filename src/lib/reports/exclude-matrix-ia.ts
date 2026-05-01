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
  return shouldExcludeMatrixIAForRole(role);
}

/**
 * Variante que recebe o role explicitamente. Útil em Server Actions onde o
 * caller já resolveu a session — evita reentrância de `auth()` (que no
 * Next.js 16 pode retornar `null` quando chamada dentro de outra Server
 * Action sem cookies forwarded). Bug observado no v0.13.9: Nex tratava
 * super_admin como sem role e excluía Matrix IA mesmo com visibility
 * `super_admin_only`.
 */
export async function shouldExcludeMatrixIAForRole(
  role: string | null | undefined,
): Promise<boolean> {
  if (!role) return true;
  const v = await getMatrixIAVisibility();
  if (v === "none") return true;
  if (v === "super_admin_only") return role !== "super_admin";
  return false;
}
