import type { AuthUser } from "@/lib/auth-helpers";
import {
  canCreateRole,
  canDeactivateUser,
  canDeleteUser,
  canEditUser,
  canGrantAccounts,
  canGrantTeams,
  canSeeMatrixIA,
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

const admin: AuthUser = {
  ...baseUser,
  platformRole: "admin",
  isOwner: false,
  id: "admin-uuid",
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

describe("canEditUser", () => {
  it("owner é imutável por qualquer outro usuário", () => {
    const result = canEditUser(superAdmin, asTarget(owner));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Owner/i);
  });

  it("owner pode editar a si mesmo", () => {
    const result = canEditUser(owner, asTarget(owner));
    expect(result.allowed).toBe(true);
  });

  it("não pode editar quem tem role maior", () => {
    const result = canEditUser(admin, asTarget(superAdmin));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Hierarquia/i);
  });

  it("viewer não edita ninguém (mesmo de role igual ou inferior)", () => {
    const otherViewer: MinimalTargetUser = {
      id: "other-v",
      platformRole: "viewer",
      isOwner: false,
    };
    const result = canEditUser(viewer, otherViewer);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Viewer/i);
  });

  it("admin edita manager", () => {
    const result = canEditUser(admin, asTarget(manager));
    expect(result.allowed).toBe(true);
  });

  it("super_admin edita admin", () => {
    const result = canEditUser(superAdmin, asTarget(admin));
    expect(result.allowed).toBe(true);
  });
});

describe("canDeleteUser", () => {
  it("owner é indeletável por qualquer um", () => {
    expect(canDeleteUser(superAdmin, asTarget(owner)).allowed).toBe(false);
    expect(canDeleteUser(owner, asTarget(owner)).allowed).toBe(false);
  });

  it("não pode excluir a si mesmo", () => {
    const selfTarget: MinimalTargetUser = {
      id: superAdmin.id,
      platformRole: superAdmin.platformRole,
      isOwner: false,
    };
    const result = canDeleteUser(superAdmin, selfTarget);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/si mesmo/i);
  });

  it("não pode excluir um usuário de role igual ou maior", () => {
    const otherAdmin: MinimalTargetUser = {
      id: "other-admin",
      platformRole: "admin",
      isOwner: false,
    };
    const result = canDeleteUser(admin, otherAdmin);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Hierarquia/i);
  });

  it("viewer não exclui ninguém", () => {
    const target: MinimalTargetUser = {
      id: "alguem",
      platformRole: "viewer",
      isOwner: false,
    };
    const result = canDeleteUser(viewer, target);
    expect(result.allowed).toBe(false);
  });

  it("admin exclui manager", () => {
    expect(canDeleteUser(admin, asTarget(manager)).allowed).toBe(true);
  });
});

describe("canDeactivateUser", () => {
  it("owner sempre ativo", () => {
    const r = canDeactivateUser(superAdmin, asTarget(owner));
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/Owner/i);
  });

  it("não pode desativar a si mesmo", () => {
    const selfTarget: MinimalTargetUser = {
      id: admin.id,
      platformRole: admin.platformRole,
      isOwner: false,
    };
    const r = canDeactivateUser(admin, selfTarget);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/si mesmo/i);
  });

  it("não desativa role igual ou maior", () => {
    const t: MinimalTargetUser = {
      id: "x",
      platformRole: "admin",
      isOwner: false,
    };
    expect(canDeactivateUser(admin, t).allowed).toBe(false);
  });

  it("viewer não desativa", () => {
    const t: MinimalTargetUser = {
      id: "x",
      platformRole: "viewer",
      isOwner: false,
    };
    expect(canDeactivateUser(viewer, t).allowed).toBe(false);
  });

  it("admin desativa manager", () => {
    expect(canDeactivateUser(admin, asTarget(manager)).allowed).toBe(true);
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
