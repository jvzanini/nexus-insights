import "server-only";

import { getInboxes, type MetaItem } from "./meta-cache";
import { isMatrixIAVisibleForUser } from "@/lib/reports/visibility";
import { MATRIX_IA_INBOX_ID } from "@/lib/constants/matrix-ia";

interface UserShape {
  platformRole: string;
}

/**
 * Wrapper sobre `getInboxes()` que respeita a `Visibility` granular do Matrix IA
 * (`reports.matrix_ia_visibility`):
 *   - `all` → todos os roles veem inbox 31.
 *   - `super_admin_only` → apenas super_admin vê.
 *   - `none` → ninguém vê (inclusive super_admin).
 *
 * Aceita tanto a forma legacy (`UserShape`) quanto `string` (apenas `platformRole`).
 * Mantém o cache de meta-cache compartilhado entre usuários; a filtragem é
 * em memória, sem TTL próprio.
 */
export async function getInboxesForUser(
  accountId: number,
  userOrRole: UserShape | string | null | undefined,
): Promise<{ data: MetaItem[]; stale?: boolean }> {
  const result = await getInboxes(accountId);
  const userRole =
    typeof userOrRole === "string" || userOrRole == null
      ? userOrRole
      : userOrRole.platformRole;
  const matrixVisible = await isMatrixIAVisibleForUser(userRole);
  if (matrixVisible) return result;
  return {
    ...result,
    data: result.data.filter((i) => i.id !== MATRIX_IA_INBOX_ID),
  };
}
