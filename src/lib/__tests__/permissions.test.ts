import type { AuthUser } from "@/lib/auth-helpers";
import {
  canActivate,
  canChangeRole,
  canCreateRole,
  canDeactivateUser,
  canDeleteUser,
  canEditUser,
  canGrantAccounts,
  canGrantTeams,
  canSeeMatrixIA,
  PERMISSION_REASONS,
  type MinimalTargetUser,
} from "@/lib/permissions";

const baseUser: AuthUser = {
  id: "owner-uuid",
  email: "owner@example.com",
  name: "Owner",
  platformRole: "super_admin",
  isOwner: true,
  mustChangePassword: false,
  avatarUrl: null,
  theme: "system" as AuthUser["theme"],
  accountIds: [9, 2],
  teamIds: [22, 23, 26, 31],
};

const owner: AuthUser = { ...baseUser };

const superAdmin: AuthUser = {
  ...baseUser,
  isOwner: false,
  id: "sa-uuid",
};

const otherSuperAdmin: AuthUser = {
  ...baseUser,
  isOwner: false,
  id: "sa2-uuid",
  email: "sa2@example.com",
};

const admin: AuthUser = {
  ...baseUser,
  platformRole: "admin",
  isOwner: false,
  id: "admin-uuid",
  accountIds: [9],
};

const otherAdmin: AuthUser = {
  ...baseUser,
  platformRole: "admin",
  isOwner: false,
  id: "admin2-uuid",
  accountIds: [9],
};

const manager: AuthUser = {
  ...baseUser,
  platformRole: "manager",
  isOwner: false,
  id: "mgr-uuid",
  accountIds: [9],
  teamIds: [26],
};

const viewer: AuthUser = {
  ...baseUser,
  platformRole: "viewer",
  isOwner: false,
  id: "v-uuid",
  accountIds: [9],
  teamIds: [26],
};

function asTarget(user: AuthUser): MinimalTargetUser {
  return {
    id: user.id,
    platformRole: user.platformRole,
    isOwner: user.isOwner,
  };
}

describe("canCreateRole", () => {
  it("super_admin pode criar qualquer role", () => {
    expect(canCreateRole(superAdmin, "super_admin")).toBe(true);
    expect(canCreateRole(superAdmin, "admin")).toBe(true);
    expect(canCreateRole(superAdmin, "manager")).toBe(true);
    expect(canCreateRole(superAdmin, "viewer")).toBe(true);
  });

  it("admin pode criar admin/manager/viewer mas não super_admin", () => {
    expect(canCreateRole(admin, "super_admin")).toBe(false);
    expect(canCreateRole(admin, "admin")).toBe(true);
    expect(canCreateRole(admin, "manager")).toBe(true);
    expect(canCreateRole(admin, "viewer")).toBe(true);
  });

  it("manager só cria manager/viewer", () => {
    expect(canCreateRole(manager, "super_admin")).toBe(false);
    expect(canCreateRole(manager, "admin")).toBe(false);
    expect(canCreateRole(manager, "manager")).toBe(true);
    expect(canCreateRole(manager, "viewer")).toBe(true);
  });

  it("viewer não cria nada", () => {
    expect(canCreateRole(viewer, "super_admin")).toBe(false);
    expect(canCreateRole(viewer, "admin")).toBe(false);
    expect(canCreateRole(viewer, "manager")).toBe(false);
    expect(canCreateRole(viewer, "viewer")).toBe(false);
  });
});

describe("canEditUser — Owner é imutável (regra suprema)", () => {
  it("owner não pode ser editado por outro super_admin", () => {
    const result = canEditUser(superAdmin, asTarget(owner));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(PERMISSION_REASONS.ownerImmutable);
  });

  it("owner não pode ser editado por admin", () => {
    expect(canEditUser(admin, asTarget(owner)).allowed).toBe(false);
  });

  it("owner não pode ser editado por manager nem viewer", () => {
    expect(canEditUser(manager, asTarget(owner)).allowed).toBe(false);
    expect(canEditUser(viewer, asTarget(owner)).allowed).toBe(false);
  });

  it("owner não pode editar a si mesmo via /usuarios (faz via /perfil)", () => {
    const result = canEditUser(owner, asTarget(owner));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(PERMISSION_REASONS.ownerImmutable);
  });
});

describe("canEditUser — Self edit bloqueado na tabela /usuarios", () => {
  it("super_admin não-owner não edita a si mesmo via /usuarios", () => {
    const r = canEditUser(superAdmin, asTarget(superAdmin));
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(PERMISSION_REASONS.selfEdit);
  });

  it("admin não edita a si mesmo via /usuarios", () => {
    const r = canEditUser(admin, asTarget(admin));
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(PERMISSION_REASONS.selfEdit);
  });
});

describe("canEditUser — Super Admin (não-owner) edita outros super_admin", () => {
  it("super_admin não-owner edita outro super_admin não-owner", () => {
    const r = canEditUser(superAdmin, asTarget(otherSuperAdmin));
    expect(r.allowed).toBe(true);
  });

  it("super_admin edita admin/manager/viewer", () => {
    expect(canEditUser(superAdmin, asTarget(admin)).allowed).toBe(true);
    expect(canEditUser(superAdmin, asTarget(manager)).allowed).toBe(true);
    expect(canEditUser(superAdmin, asTarget(viewer)).allowed).toBe(true);
  });
});

describe("canEditUser — Admin não pode editar super_admin nem outro admin", () => {
  it("admin não edita super_admin (mesmo não-owner)", () => {
    const r = canEditUser(admin, asTarget(superAdmin));
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(PERMISSION_REASONS.superAdminOnly);
  });

  it("admin não edita outro admin", () => {
    const r = canEditUser(admin, asTarget(otherAdmin));
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(PERMISSION_REASONS.hierarchy);
  });

  it("admin edita manager", () => {
    expect(canEditUser(admin, asTarget(manager)).allowed).toBe(true);
  });

  it("admin edita viewer", () => {
    expect(canEditUser(admin, asTarget(viewer)).allowed).toBe(true);
  });
});

describe("canEditUser — Manager/Viewer não editam ninguém", () => {
  it("manager não edita admin/super_admin/manager/viewer", () => {
    expect(canEditUser(manager, asTarget(admin)).allowed).toBe(false);
    expect(canEditUser(manager, asTarget(superAdmin)).allowed).toBe(false);
    expect(canEditUser(manager, asTarget(viewer)).allowed).toBe(false);
  });

  it("viewer não edita ninguém", () => {
    const otherViewer: MinimalTargetUser = {
      id: "other-v",
      platformRole: "viewer",
      isOwner: false,
    };
    const r = canEditUser(viewer, otherViewer);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(PERMISSION_REASONS.viewerNoAccess);
  });
});

describe("canDeleteUser", () => {
  it("owner é indeletável por qualquer um", () => {
    expect(canDeleteUser(superAdmin, asTarget(owner)).allowed).toBe(false);
    expect(canDeleteUser(otherSuperAdmin, asTarget(owner)).allowed).toBe(false);
    expect(canDeleteUser(admin, asTarget(owner)).allowed).toBe(false);
    expect(canDeleteUser(owner, asTarget(owner)).allowed).toBe(false);
  });

  it("não pode excluir a si mesmo", () => {
    const r = canDeleteUser(superAdmin, asTarget(superAdmin));
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(PERMISSION_REASONS.selfDelete);
  });

  it("super_admin (não-owner) pode excluir outro super_admin (não-owner)", () => {
    expect(canDeleteUser(superAdmin, asTarget(otherSuperAdmin)).allowed).toBe(
      true,
    );
  });

  it("admin não pode excluir super_admin", () => {
    expect(canDeleteUser(admin, asTarget(superAdmin)).allowed).toBe(false);
  });

  it("admin não pode excluir outro admin", () => {
    expect(canDeleteUser(admin, asTarget(otherAdmin)).allowed).toBe(false);
  });

  it("admin exclui manager/viewer", () => {
    expect(canDeleteUser(admin, asTarget(manager)).allowed).toBe(true);
    expect(canDeleteUser(admin, asTarget(viewer)).allowed).toBe(true);
  });

  it("manager/viewer não excluem ninguém", () => {
    expect(canDeleteUser(manager, asTarget(viewer)).allowed).toBe(false);
    expect(canDeleteUser(viewer, asTarget(manager)).allowed).toBe(false);
  });
});

describe("canDeactivateUser / canActivate", () => {
  it("owner sempre ativo", () => {
    const r = canDeactivateUser(superAdmin, asTarget(owner));
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(PERMISSION_REASONS.ownerImmutable);
  });

  it("não pode desativar a si mesmo", () => {
    const r = canDeactivateUser(admin, asTarget(admin));
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(PERMISSION_REASONS.selfEdit);
  });

  it("super_admin desativa outro super_admin (não-owner)", () => {
    expect(canDeactivateUser(superAdmin, asTarget(otherSuperAdmin)).allowed).toBe(
      true,
    );
  });

  it("admin não desativa super_admin nem outro admin", () => {
    expect(canDeactivateUser(admin, asTarget(superAdmin)).allowed).toBe(false);
    expect(canDeactivateUser(admin, asTarget(otherAdmin)).allowed).toBe(false);
  });

  it("admin desativa manager", () => {
    expect(canDeactivateUser(admin, asTarget(manager)).allowed).toBe(true);
  });

  it("viewer não desativa", () => {
    expect(canDeactivateUser(viewer, asTarget(manager)).allowed).toBe(false);
  });

  it("canActivate é alias de canDeactivateUser", () => {
    expect(canActivate(superAdmin, asTarget(otherSuperAdmin))).toEqual(
      canDeactivateUser(superAdmin, asTarget(otherSuperAdmin)),
    );
    expect(canActivate(superAdmin, asTarget(owner))).toEqual(
      canDeactivateUser(superAdmin, asTarget(owner)),
    );
  });
});

describe("canChangeRole", () => {
  it("super_admin pode promover qualquer um (exceto owner) pra qualquer role", () => {
    expect(
      canChangeRole(superAdmin, asTarget(admin), "super_admin").allowed,
    ).toBe(true);
    expect(canChangeRole(superAdmin, asTarget(viewer), "admin").allowed).toBe(
      true,
    );
    expect(
      canChangeRole(superAdmin, asTarget(otherSuperAdmin), "viewer").allowed,
    ).toBe(true);
  });

  it("super_admin não pode mudar role do owner", () => {
    const r = canChangeRole(superAdmin, asTarget(owner), "admin");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(PERMISSION_REASONS.ownerImmutable);
  });

  it("admin não pode promover ninguém para super_admin nem para admin", () => {
    expect(canChangeRole(admin, asTarget(manager), "super_admin").allowed).toBe(
      false,
    );
    expect(canChangeRole(admin, asTarget(manager), "admin").allowed).toBe(false);
  });

  it("admin pode mudar manager <-> viewer", () => {
    expect(canChangeRole(admin, asTarget(manager), "viewer").allowed).toBe(true);
    expect(canChangeRole(admin, asTarget(viewer), "manager").allowed).toBe(true);
  });

  it("admin não pode mudar role de outro admin (canEditUser falha antes)", () => {
    expect(canChangeRole(admin, asTarget(otherAdmin), "manager").allowed).toBe(
      false,
    );
  });

  it("manager/viewer não mudam role de ninguém", () => {
    expect(canChangeRole(manager, asTarget(viewer), "viewer").allowed).toBe(
      false,
    );
    expect(canChangeRole(viewer, asTarget(manager), "viewer").allowed).toBe(
      false,
    );
  });
});

describe("canGrantAccounts", () => {
  it("super_admin pode liberar qualquer account", () => {
    expect(canGrantAccounts(superAdmin, [1, 2, 3, 999])).toBe(true);
  });

  it("admin só libera accounts que tem (subset)", () => {
    expect(canGrantAccounts(admin, [9])).toBe(true);
    expect(canGrantAccounts(admin, [9, 2])).toBe(false);
  });

  it("manager idem", () => {
    expect(canGrantAccounts(manager, [9])).toBe(true);
    expect(canGrantAccounts(manager, [9, 2])).toBe(false);
  });

  it("array vazio sempre passa", () => {
    expect(canGrantAccounts(viewer, [])).toBe(true);
  });
});

describe("canGrantTeams", () => {
  it("super_admin libera qualquer team", () => {
    expect(canGrantTeams(superAdmin, [1, 2, 3, 999])).toBe(true);
  });

  it("admin libera qualquer team também", () => {
    expect(canGrantTeams(admin, [22, 23, 26, 999])).toBe(true);
  });

  it("manager só libera teams que possui (subset)", () => {
    expect(canGrantTeams(manager, [26])).toBe(true);
    expect(canGrantTeams(manager, [26, 31])).toBe(false);
  });

  it("viewer também precisa subset", () => {
    expect(canGrantTeams(viewer, [26])).toBe(true);
    expect(canGrantTeams(viewer, [26, 22])).toBe(false);
  });
});

describe("canSeeMatrixIA", () => {
  it("respeita feature flag matrixIaSuperAdminOnly=true", () => {
    expect(canSeeMatrixIA(superAdmin, { matrixIaSuperAdminOnly: true })).toBe(
      true,
    );
    expect(canSeeMatrixIA(admin, { matrixIaSuperAdminOnly: true })).toBe(false);
    expect(canSeeMatrixIA(manager, { matrixIaSuperAdminOnly: true })).toBe(
      false,
    );
    expect(canSeeMatrixIA(viewer, { matrixIaSuperAdminOnly: true })).toBe(false);
  });

  it("flag falsa libera para todos", () => {
    expect(canSeeMatrixIA(superAdmin, { matrixIaSuperAdminOnly: false })).toBe(
      true,
    );
    expect(canSeeMatrixIA(admin, { matrixIaSuperAdminOnly: false })).toBe(true);
    expect(canSeeMatrixIA(manager, { matrixIaSuperAdminOnly: false })).toBe(
      true,
    );
    expect(canSeeMatrixIA(viewer, { matrixIaSuperAdminOnly: false })).toBe(true);
  });
});
