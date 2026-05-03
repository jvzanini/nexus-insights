import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getActiveAccountId } from "@/lib/reports/active-account";
import {
  NoActiveBindingError,
  AmbiguousBindingError,
} from "@/lib/nexus-chat/errors";
import type { AuthUser } from "@/lib/auth-helpers";

/**
 * Resolve o `connectionId` (UUID da `nexus_chat_connection`) ativo para o
 * usuário corrente, a partir do `chatwoot_account_id` ativo (cookie ou
 * fallback) e do binding correspondente.
 *
 * Defesa em profundidade — falha-fechada em 2 cenários:
 *   - 0 bindings enabled para o account → `NoActiveBindingError`.
 *   - 2+ bindings enabled (mesmo account em 2+ connections) →
 *     `AmbiguousBindingError`. NUNCA escolher arbitrariamente: risco de
 *     vazar dados entre tenants. O constraint operacional na Server Action
 *     de `createCompanyChatBinding` previne isso, mas o resolver é a última
 *     camada de defesa.
 *
 * Envolto em `cache()` do React → dentro do mesmo render server, várias
 * chamadas (Server Action + Page + Layout) compartilham o resultado sem
 * refetch do Prisma.
 */
export const getActiveConnectionId = cache(
  async (user: AuthUser): Promise<string> => {
    const accountId = await getActiveAccountId(user);
    const bindings = await prisma.companyChatBinding.findMany({
      where: {
        chatwootAccountId: accountId,
        enabled: true,
        deletedAt: null,
        connection: { deletedAt: null, status: "active" },
      },
      select: { id: true, connectionId: true },
    });
    if (bindings.length === 0) throw new NoActiveBindingError(accountId);
    if (bindings.length > 1) {
      throw new AmbiguousBindingError(
        accountId,
        bindings.map((b) => b.connectionId),
      );
    }
    return bindings[0].connectionId;
  },
);
