import type { PlatformRole } from "@/generated/prisma";
import type { AuthUser } from "@/lib/auth-helpers";
import { PLATFORM_ROLE_HIERARCHY } from "@/lib/constants/roles";

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

export interface MinimalTargetUser {
  id: string;
  platformRole: PlatformRole;
  isOwner: boolean;
}

/** Pode criar usuário com role X? */
export function canCreateRole(
  creator: AuthUser,
  role: PlatformRole,
): boolean {
  if (creator.platformRole === "viewer") return false;
  return (
    PLATFORM_ROLE_HIERARCHY[role] <=
    PLATFORM_ROLE_HIERARCHY[creator.platformRole]
  );
}

/** Pode editar este usuário? */
export function canEditUser(
  actor: AuthUser,
  target: MinimalTargetUser,
): PermissionResult {
  if (target.isOwner && actor.id !== target.id) {
    return { allowed: false, reason: "Owner imutável" };
  }
  if (
    PLATFORM_ROLE_HIERARCHY[target.platformRole] >
    PLATFORM_ROLE_HIERARCHY[actor.platformRole]
  ) {
    return { allowed: false, reason: "Hierarquia" };
  }
  if (actor.platformRole === "viewer") {
    return { allowed: false, reason: "Viewer não edita" };
  }
  return { allowed: true };
}

/** Pode excluir este usuário? */
export function canDeleteUser(
  actor: AuthUser,
  target: MinimalTargetUser,
): PermissionResult {
  if (target.isOwner) {
    return { allowed: false, reason: "Owner indeletável" };
  }
  if (actor.id === target.id) {
    return { allowed: false, reason: "Não pode excluir a si mesmo" };
  }
  if (
    PLATFORM_ROLE_HIERARCHY[target.platformRole] >=
    PLATFORM_ROLE_HIERARCHY[actor.platformRole]
  ) {
    return { allowed: false, reason: "Hierarquia" };
  }
  if (actor.platformRole === "viewer") {
    return { allowed: false, reason: "Viewer não exclui" };
  }
  return { allowed: true };
}

/** Pode desativar/reativar este usuário? */
export function canDeactivateUser(
  actor: AuthUser,
  target: MinimalTargetUser,
): PermissionResult {
  if (target.isOwner) {
    return { allowed: false, reason: "Owner sempre ativo" };
  }
  if (actor.id === target.id) {
    return { allowed: false, reason: "Não pode desativar a si mesmo" };
  }
  if (
    PLATFORM_ROLE_HIERARCHY[target.platformRole] >=
    PLATFORM_ROLE_HIERARCHY[actor.platformRole]
  ) {
    return { allowed: false, reason: "Hierarquia" };
  }
  if (actor.platformRole === "viewer") {
    return { allowed: false, reason: "Viewer não desativa" };
  }
  return { allowed: true };
}

/** Pode liberar essas accounts? Subset rule: só pode liberar o que o actor já tem. */
export function canGrantAccounts(
  creator: AuthUser,
  requestedAccountIds: number[],
): boolean {
  if (creator.platformRole === "super_admin") return true;
  return requestedAccountIds.every((id) => creator.accountIds.includes(id));
}

/** Pode liberar esses teams? */
export function canGrantTeams(
  creator: AuthUser,
  requestedTeamIds: number[],
): boolean {
  if (
    creator.platformRole === "super_admin" ||
    creator.platformRole === "admin"
  ) {
    return true;
  }
  return requestedTeamIds.every((id) => creator.teamIds.includes(id));
}

/** Pode ver o inbox Matrix IA (id=31)? */
export function canSeeMatrixIA(
  user: AuthUser,
  settings: { matrixIaSuperAdminOnly: boolean },
): boolean {
  if (settings.matrixIaSuperAdminOnly) {
    return user.platformRole === "super_admin";
  }
  return true;
}
