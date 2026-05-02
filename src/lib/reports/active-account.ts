import { cookies } from "next/headers";
import { cache } from "react";
import { getAccessibleAccountIds } from "@/lib/tenant";
import type { AuthUser } from "@/lib/auth-helpers";

const COOKIE_NAME = "nexus_active_account";

/**
 * Lançado quando o user não tem acesso a NENHUMA conta. Capturado em
 * `(protected)/layout.tsx` para redirecionar com mensagem amigável.
 */
export class NoAccessibleAccountError extends Error {
  constructor(userId: string) {
    super(`User ${userId} não tem acesso a nenhuma conta`);
    this.name = "NoAccessibleAccountError";
  }
}

/**
 * Resolve a conta ativa para o user corrente:
 *   1. Calcula `getAccessibleAccountIds(user)`.
 *   2. Se vazio → throws NoAccessibleAccountError (fail-closed).
 *   3. Lê cookie `nexus_active_account`.
 *   4. Se cookie aponta pra conta permitida → retorna.
 *   5. Caso contrário → primeira permitida (fail-closed, NÃO Matrix=9 hardcoded).
 *
 * Envolto em `cache()` do React → dedupe por request RSC. Layout chama
 * 1× → 8 pages chamam 1× cada (mas todas dentro do mesmo render tree
 * compartilham o cache).
 *
 * NOTA: substituiu a versão pre-v0.21 que devolvia DEFAULT_ACCOUNT_ID=9
 * (Matrix) sem checar acesso — leak latente para users sem cookie ou
 * com cookie stale.
 */
export const getActiveAccountId = cache(
  async (user: AuthUser): Promise<number> => {
    const allowed = await getAccessibleAccountIds(user);

    if (allowed.length === 0) {
      throw new NoAccessibleAccountError(user.id);
    }

    const store = await cookies();
    const raw = store.get(COOKIE_NAME)?.value;
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    const cookieAccountId =
      Number.isFinite(parsed) && parsed > 0 ? parsed : null;

    if (cookieAccountId !== null && allowed.includes(cookieAccountId)) {
      return cookieAccountId;
    }

    return allowed[0];
  },
);
