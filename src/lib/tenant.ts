import type { AuthUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

/**
 * Lista de accounts (Chatwoot) cacheada localmente em UserAccountAccess.
 * Para super_admin, lê todas as accounts conhecidas via UserAccountAccess.
 */
export async function getKnownAccounts(): Promise<
  Array<{ id: number; name: string }>
> {
  const rows = await prisma.userAccountAccess.findMany({
    select: { chatwootAccountId: true, chatwootAccountName: true },
    distinct: ["chatwootAccountId"],
  });
  if (rows.length === 0) {
    return [
      { id: 9, name: "Matrix Fitness Group" },
      { id: 2, name: "Invest Soluções" },
    ];
  }
  return rows.map((r) => ({
    id: r.chatwootAccountId,
    name: r.chatwootAccountName,
  }));
}

export async function getAccessibleAccountIds(
  user: AuthUser,
): Promise<number[]> {
  if (user.platformRole === "super_admin") {
    const all = await getKnownAccounts();
    return all.map((a) => a.id);
  }
  return user.accountIds;
}

export async function getAccessibleTeamIds(
  user: AuthUser,
  accountId: number,
): Promise<"all" | number[]> {
  if (user.platformRole === "super_admin" || user.platformRole === "admin") {
    return "all";
  }
  const rows = await prisma.userTeamAccess.findMany({
    where: { userId: user.id, chatwootAccountId: accountId },
    select: { chatwootTeamId: true },
  });
  return rows.map((r) => r.chatwootTeamId);
}

export async function assertAccountAccess(
  user: AuthUser,
  accountId: number,
): Promise<void> {
  const ids = await getAccessibleAccountIds(user);
  if (!ids.includes(accountId)) {
    throw new Error("Acesso negado a esta conta.");
  }
}
