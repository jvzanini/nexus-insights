import type { PlatformRole } from "@/generated/prisma/client";
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

/**
 * Mensagens de erro padronizadas para guards de gestão de usuários.
 * Mantidas como constantes para facilitar testes e i18n futuro.
 */
export const PERMISSION_REASONS = {
  ownerImmutable: "Não é possível editar o owner da plataforma.",
  ownerUndeletable: "Não é possível excluir o owner da plataforma.",
  selfEdit:
    "Você não pode editar seu próprio usuário aqui. Use a página /perfil.",
  selfDelete: "Você não pode excluir seu próprio usuário.",
  superAdminOnly:
    "Apenas super admins podem editar outros super admins.",
  hierarchy: "Você só pode editar usuários com nível inferior ao seu.",
  viewerNoAccess: "Visualizadores não têm acesso a esta ação.",
  managerNoAccess: "Gerentes não têm acesso a esta ação.",
} as const;

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

/**
 * Pode editar este usuário?
 *
 * Regras (em ordem de avaliação):
 *  1. Owner é IMUTÁVEL: ninguém edita o owner via /usuarios — nem mesmo o
 *     próprio owner (owner se edita pela página /perfil).
 *  2. Self-edit é bloqueado na tabela /usuarios; o usuário se edita via /perfil.
 *  3. Apenas super_admin pode editar super_admin (mesmo level OK, exceto owner).
 *  4. Admin pode editar apenas manager/viewer (não outros admin, nem super_admin).
 *  5. Manager/viewer não editam ninguém.
 */
export function canEditUser(
  actor: AuthUser,
  target: MinimalTargetUser,
): PermissionResult {
  if (target.isOwner) {
    return { allowed: false, reason: PERMISSION_REASONS.ownerImmutable };
  }
  if (actor.id === target.id) {
    return { allowed: false, reason: PERMISSION_REASONS.selfEdit };
  }
  if (target.platformRole === "super_admin") {
    if (actor.platformRole !== "super_admin") {
      return { allowed: false, reason: PERMISSION_REASONS.superAdminOnly };
    }
    return { allowed: true };
  }
  if (actor.platformRole === "super_admin") {
    return { allowed: true };
  }
  if (actor.platformRole === "admin") {
    if (
      target.platformRole === "manager" ||
      target.platformRole === "viewer"
    ) {
      return { allowed: true };
    }
    return { allowed: false, reason: PERMISSION_REASONS.hierarchy };
  }
  if (actor.platformRole === "manager") {
    return { allowed: false, reason: PERMISSION_REASONS.managerNoAccess };
  }
  return { allowed: false, reason: PERMISSION_REASONS.viewerNoAccess };
}

/**
 * Pode excluir este usuário?
 *
 * Mesma regra de edição + reforço explícito de "não excluir owner" e
 * "não excluir a si mesmo".
 */
export function canDeleteUser(
  actor: AuthUser,
  target: MinimalTargetUser,
): PermissionResult {
  if (target.isOwner) {
    return { allowed: false, reason: PERMISSION_REASONS.ownerUndeletable };
  }
  if (actor.id === target.id) {
    return { allowed: false, reason: PERMISSION_REASONS.selfDelete };
  }
  return canEditUser(actor, target);
}

/**
 * Pode desativar/reativar este usuário?
 *
 * Owner sempre ativo, e ninguém desativa a si mesmo. Demais regras seguem
 * canEditUser.
 */
export function canDeactivateUser(
  actor: AuthUser,
  target: MinimalTargetUser,
): PermissionResult {
  if (target.isOwner) {
    return { allowed: false, reason: PERMISSION_REASONS.ownerImmutable };
  }
  if (actor.id === target.id) {
    return { allowed: false, reason: PERMISSION_REASONS.selfEdit };
  }
  return canEditUser(actor, target);
}

/** Alias semântico para guards de mudança de status (ativar/desativar). */
export const canActivate = canDeactivateUser;

/**
 * Pode atribuir essa role ao target?
 *
 * Combina canEditUser com a hierarquia de promoção:
 *  - super_admin pode atribuir qualquer role (exceto se target é owner).
 *  - admin pode atribuir apenas manager ou viewer (nunca super_admin nem admin).
 *  - manager/viewer não atribuem nada.
 */
export function canChangeRole(
  actor: AuthUser,
  target: MinimalTargetUser,
  newRole: PlatformRole,
): PermissionResult {
  const editCheck = canEditUser(actor, target);
  if (!editCheck.allowed) return editCheck;
  if (actor.platformRole === "super_admin") return { allowed: true };
  if (actor.platformRole === "admin") {
    if (newRole === "manager" || newRole === "viewer") {
      return { allowed: true };
    }
    return { allowed: false, reason: PERMISSION_REASONS.hierarchy };
  }
  return { allowed: false, reason: PERMISSION_REASONS.hierarchy };
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
