"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { generateTempPassword } from "@/lib/utils/generate-temp-password";
import {
  canCreateRole,
  canDeleteUser,
  canDeactivateUser,
  canEditUser,
  canGrantAccounts,
  canGrantTeams,
} from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { sendWelcomeEmail } from "@/lib/email";
import {
  CreateUserInput,
  UpdateUserInput,
} from "@/lib/validations/user";
import { getKnownAccounts } from "@/lib/tenant";
import { getTeams } from "@/lib/chatwoot/queries/meta-cache";
import type { PlatformRole } from "@/generated/prisma/client";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  platformRole: PlatformRole;
  isOwner: boolean;
  isActive: boolean;
  createdAt: Date;
  accountsCount: number;
}

export interface UserDetails {
  id: string;
  name: string;
  email: string;
  platformRole: PlatformRole;
  isOwner: boolean;
  isActive: boolean;
  accountIds: number[];
  teamIds: number[];
}

export async function getUserDetails(
  id: string,
): Promise<ActionResult<UserDetails>> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };
    if (me.platformRole === "viewer") {
      return { success: false, error: "Acesso negado" };
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        platformRole: true,
        isOwner: true,
        isActive: true,
        accountAccess: { select: { chatwootAccountId: true } },
        teamAccess: { select: { chatwootTeamId: true } },
      },
    });
    if (!user) return { success: false, error: "Usuário não encontrado" };

    return {
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        platformRole: user.platformRole,
        isOwner: user.isOwner,
        isActive: user.isActive,
        accountIds: Array.from(
          new Set(user.accountAccess.map((a) => a.chatwootAccountId)),
        ),
        teamIds: Array.from(
          new Set(user.teamAccess.map((t) => t.chatwootTeamId)),
        ),
      },
    };
  } catch (err) {
    console.error("[users.getDetails]", err);
    return { success: false, error: "Erro ao carregar usuário" };
  }
}

export interface UserFormOptions {
  accounts: Array<{ id: number; name: string }>;
  teamsByAccount: Record<number, Array<{ id: number; name: string }>>;
}

/**
 * Carrega contas conhecidas + times de cada conta para popular o wizard.
 * Falha silenciosamente em times (read-only Chatwoot pode estar offline) — devolve {} para a conta.
 */
export async function getUserFormOptions(): Promise<
  ActionResult<UserFormOptions>
> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };
    if (me.platformRole === "viewer") {
      return { success: false, error: "Acesso negado" };
    }

    const accounts = await getKnownAccounts();
    const teamsEntries = await Promise.all(
      accounts.map(async (a) => {
        try {
          const result = await getTeams(a.id);
          return [a.id, result.data ?? []] as const;
        } catch {
          return [a.id, [] as Array<{ id: number; name: string }>] as const;
        }
      }),
    );
    const teamsByAccount: Record<number, Array<{ id: number; name: string }>> = {};
    for (const [id, teams] of teamsEntries) {
      teamsByAccount[id] = teams;
    }
    return { success: true, data: { accounts, teamsByAccount } };
  } catch (err) {
    console.error("[users.getUserFormOptions]", err);
    return { success: false, error: "Erro ao carregar opções" };
  }
}

export async function listUsers(): Promise<ActionResult<UserListItem[]>> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };
    if (me.platformRole === "viewer") {
      return { success: false, error: "Acesso negado" };
    }

    const rows = await prisma.user.findMany({
      orderBy: [{ isOwner: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        email: true,
        platformRole: true,
        isOwner: true,
        isActive: true,
        createdAt: true,
        _count: { select: { accountAccess: true } },
      },
    });

    const data: UserListItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      platformRole: r.platformRole,
      isOwner: r.isOwner,
      isActive: r.isActive,
      createdAt: r.createdAt,
      accountsCount: r._count.accountAccess,
    }));

    return { success: true, data };
  } catch (err) {
    console.error("[users.list]", err);
    return { success: false, error: "Erro ao listar usuários" };
  }
}

export async function createUser(
  rawInput: unknown,
): Promise<ActionResult<{ id: string; tempPassword?: string }>> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };

    const parsed = CreateUserInput.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    }
    const input = parsed.data;

    if (!canCreateRole(me, input.platformRole)) {
      return { success: false, error: "Você não pode criar este nível de usuário" };
    }
    if (input.platformRole !== "super_admin" && !canGrantAccounts(me, input.accountIds)) {
      return { success: false, error: "Você não pode liberar contas que não tem acesso" };
    }
    if (
      ["manager", "viewer"].includes(input.platformRole) &&
      !canGrantTeams(me, input.teamIds)
    ) {
      return { success: false, error: "Você não pode liberar departamentos que não tem acesso" };
    }

    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists) return { success: false, error: "E-mail já cadastrado" };

    const tempPassword = input.password || generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Pega nomes das accounts/teams pra cachear
    const accountNames = await prisma.userAccountAccess.findMany({
      where: { chatwootAccountId: { in: input.accountIds } },
      select: { chatwootAccountId: true, chatwootAccountName: true },
      distinct: ["chatwootAccountId"],
    });
    const accountNameMap = new Map(
      accountNames.map((a) => [a.chatwootAccountId, a.chatwootAccountName]),
    );

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          password: passwordHash,
          platformRole: input.platformRole,
          isActive: true,
          mustChangePassword: true,
          createdById: me.id,
        },
      });

      if (input.platformRole !== "super_admin") {
        for (const accountId of input.accountIds) {
          await tx.userAccountAccess.create({
            data: {
              userId: user.id,
              chatwootAccountId: accountId,
              chatwootAccountName: accountNameMap.get(accountId) ?? `Account ${accountId}`,
              grantedById: me.id,
            },
          });
        }
        if (["manager", "viewer"].includes(input.platformRole)) {
          for (const teamId of input.teamIds) {
            await tx.userTeamAccess.create({
              data: {
                userId: user.id,
                chatwootAccountId: input.accountIds[0] ?? 9,
                chatwootTeamId: teamId,
                chatwootTeamName: `Team ${teamId}`,
              },
            });
          }
        }
      }

      return user;
    });

    if (input.sendWelcomeEmail) {
      const loginUrl = `${process.env.NEXTAUTH_URL ?? "https://insights.nexusai360.com"}/login`;
      sendWelcomeEmail(input.email, input.name, tempPassword, loginUrl).catch((err) =>
        console.error("[createUser] welcome email failed", err),
      );
    }

    logAudit({
      userId: me.id,
      action: "user_created",
      targetType: "User",
      targetId: created.id,
      details: { email: input.email, platformRole: input.platformRole },
    });

    revalidatePath("/usuarios");
    return { success: true, data: { id: created.id, tempPassword } };
  } catch (err) {
    console.error("[users.create]", err);
    return { success: false, error: "Erro ao criar usuário" };
  }
}

export async function updateUser(rawInput: unknown): Promise<ActionResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };

    const parsed = UpdateUserInput.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    }
    const input = parsed.data;

    const target = await prisma.user.findUnique({
      where: { id: input.id },
      select: { id: true, platformRole: true, isOwner: true, email: true },
    });
    if (!target) return { success: false, error: "Usuário não encontrado" };

    const allowed = canEditUser(me, target);
    if (!allowed.allowed) {
      return { success: false, error: allowed.reason ?? "Sem permissão" };
    }

    if (input.platformRole && !canCreateRole(me, input.platformRole)) {
      return { success: false, error: "Você não pode atribuir este nível" };
    }
    if (input.accountIds && !canGrantAccounts(me, input.accountIds)) {
      return { success: false, error: "Você não pode liberar essas contas" };
    }
    if (input.teamIds && !canGrantTeams(me, input.teamIds)) {
      return { success: false, error: "Você não pode liberar esses departamentos" };
    }

    await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};
      if (input.name) data.name = input.name;
      if (input.platformRole) data.platformRole = input.platformRole;
      if (input.password) {
        data.password = await bcrypt.hash(input.password, 10);
        data.mustChangePassword = true;
      }
      if (Object.keys(data).length > 0) {
        await tx.user.update({ where: { id: input.id }, data });
      }

      if (input.accountIds) {
        await tx.userAccountAccess.deleteMany({ where: { userId: input.id } });
        const accountNames = await tx.userAccountAccess.findMany({
          where: { chatwootAccountId: { in: input.accountIds } },
          select: { chatwootAccountId: true, chatwootAccountName: true },
          distinct: ["chatwootAccountId"],
        });
        const map = new Map(accountNames.map((a) => [a.chatwootAccountId, a.chatwootAccountName]));
        for (const accountId of input.accountIds) {
          await tx.userAccountAccess.create({
            data: {
              userId: input.id,
              chatwootAccountId: accountId,
              chatwootAccountName: map.get(accountId) ?? `Account ${accountId}`,
              grantedById: me.id,
            },
          });
        }
      }
      if (input.teamIds) {
        await tx.userTeamAccess.deleteMany({ where: { userId: input.id } });
        for (const teamId of input.teamIds) {
          await tx.userTeamAccess.create({
            data: {
              userId: input.id,
              chatwootAccountId: 9,
              chatwootTeamId: teamId,
              chatwootTeamName: `Team ${teamId}`,
            },
          });
        }
      }
    });

    logAudit({
      userId: me.id,
      action: "user_updated",
      targetType: "User",
      targetId: input.id,
      details: { changes: input },
    });

    revalidatePath("/usuarios");
    return { success: true };
  } catch (err) {
    console.error("[users.update]", err);
    return { success: false, error: "Erro ao atualizar usuário" };
  }
}

export async function setUserActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, platformRole: true, isOwner: true },
    });
    if (!target) return { success: false, error: "Usuário não encontrado" };

    const allowed = canDeactivateUser(me, target);
    if (!allowed.allowed) {
      return { success: false, error: allowed.reason ?? "Sem permissão" };
    }

    await prisma.user.update({ where: { id }, data: { isActive: active } });

    logAudit({
      userId: me.id,
      action: active ? "user_activated" : "user_deactivated",
      targetType: "User",
      targetId: id,
    });

    revalidatePath("/usuarios");
    return { success: true };
  } catch (err) {
    console.error("[users.setActive]", err);
    return { success: false, error: "Erro" };
  }
}

export async function deleteUser(id: string): Promise<ActionResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, platformRole: true, isOwner: true },
    });
    if (!target) return { success: false, error: "Usuário não encontrado" };

    const allowed = canDeleteUser(me, target);
    if (!allowed.allowed) {
      return { success: false, error: allowed.reason ?? "Sem permissão" };
    }

    await prisma.user.delete({ where: { id } });

    logAudit({
      userId: me.id,
      action: "user_deleted",
      targetType: "User",
      targetId: id,
    });

    revalidatePath("/usuarios");
    return { success: true };
  } catch (err) {
    console.error("[users.delete]", err);
    return { success: false, error: "Erro" };
  }
}

export async function regeneratePassword(id: string): Promise<ActionResult<{ tempPassword: string }>> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, platformRole: true, isOwner: true },
    });
    if (!target) return { success: false, error: "Usuário não encontrado" };

    const allowed = canEditUser(me, target);
    if (!allowed.allowed) {
      return { success: false, error: allowed.reason ?? "Sem permissão" };
    }

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { password: hash, mustChangePassword: true },
    });

    const loginUrl = `${process.env.NEXTAUTH_URL ?? "https://insights.nexusai360.com"}/login`;
    sendWelcomeEmail(target.email, target.name, tempPassword, loginUrl).catch((err) =>
      console.error("[regenPassword] email failed", err),
    );

    logAudit({
      userId: me.id,
      action: "user_updated",
      targetType: "User",
      targetId: id,
      details: { reason: "password_regenerated" },
    });

    revalidatePath("/usuarios");
    return { success: true, data: { tempPassword } };
  } catch (err) {
    console.error("[users.regenPassword]", err);
    return { success: false, error: "Erro" };
  }
}
