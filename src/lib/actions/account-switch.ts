"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getKnownAccounts } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

const COOKIE_NAME = "nexus_active_account";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

/**
 * Troca a account ativa do usuário, persistindo a escolha em cookie HttpOnly
 * lido pelas pages de relatório via `cookies().get("nexus_active_account")`.
 *
 * Apenas super_admin pode trocar livremente entre accounts; demais users
 * ficam restritos às accounts em que possuem `UserAccountAccess`.
 */
export async function switchAccount(
  accountId: number,
): Promise<ActionResult<{ accountId: number }>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Não autenticado" };
    }

    if (!Number.isInteger(accountId) || accountId <= 0) {
      return { success: false, error: "Account inválida" };
    }

    // Determina lista de accounts permitidas para o usuário corrente.
    let allowedIds: number[] = [];
    if (user.platformRole === "super_admin") {
      const known = await getKnownAccounts();
      allowedIds = known.map((a) => a.id);
    } else {
      allowedIds = user.accountIds;
    }

    if (!allowedIds.includes(accountId)) {
      return { success: false, error: "Acesso negado a esta conta" };
    }

    const store = await cookies();
    const previousRaw = store.get(COOKIE_NAME)?.value;
    const previous = previousRaw ? Number.parseInt(previousRaw, 10) : null;
    const fromAccountId = Number.isFinite(previous) && previous && previous > 0
      ? previous
      : null;

    if (fromAccountId === accountId) {
      // Nada a fazer, mas confirma sucesso.
      return { success: true, data: { accountId } };
    }

    store.set(COOKIE_NAME, String(accountId), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });

    // Resolve nomes (apenas para o audit log).
    const accessRows = await prisma.userAccountAccess.findMany({
      where: { chatwootAccountId: { in: [accountId, ...(fromAccountId ? [fromAccountId] : [])] } },
      select: { chatwootAccountId: true, chatwootAccountName: true },
      distinct: ["chatwootAccountId"],
    });
    const nameMap = new Map<number, string>(
      accessRows.map((r: { chatwootAccountId: number; chatwootAccountName: string }) => [
        r.chatwootAccountId,
        r.chatwootAccountName,
      ]),
    );

    await logAudit({
      userId: user.id,
      action: "account_switched",
      details: {
        from: fromAccountId,
        fromName: fromAccountId ? nameMap.get(fromAccountId) ?? null : null,
        to: accountId,
        toName: nameMap.get(accountId) ?? null,
      },
    });

    revalidatePath("/", "layout");

    return { success: true, data: { accountId } };
  } catch (err) {
    console.error("[account-switch.switchAccount]", err);
    return { success: false, error: "Erro ao trocar de conta" };
  }
}
