import "server-only";

import { getInboxes, type MetaItem } from "./meta-cache";
import { getMatrixIAIncluded } from "@/lib/reports/matrix-ia-setting";
import { MATRIX_IA_INBOX_ID } from "@/lib/constants/matrix-ia";

interface UserShape {
  platformRole: string;
}

/**
 * Wrapper sobre `getInboxes()` que respeita a flag `reports.include_matrix_ia`
 * e o role do usuário:
 *   - super_admin → SEMPRE vê a inbox 31.
 *   - demais + flag ON → vê.
 *   - demais + flag OFF → não vê (filtra em memória após o cache compartilhado).
 *
 * Mantém o cache de meta-cache compartilhado entre usuários; a filtragem é
 * em memória, sem TTL próprio.
 */
export async function getInboxesForUser(
  accountId: number,
  user: UserShape,
): Promise<{ data: MetaItem[]; stale?: boolean }> {
  const result = await getInboxes(accountId);
  if (user.platformRole === "super_admin") return result;
  const included = await getMatrixIAIncluded();
  if (included) return result;
  return {
    ...result,
    data: result.data.filter((i) => i.id !== MATRIX_IA_INBOX_ID),
  };
}
