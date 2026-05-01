/**
 * Tests do reconcile.
 *
 * Como o cliente Prisma ainda NÃO foi regenerado com os novos models
 * `IntegrationProfile` e `IntegrationAuditLog` (depende de T2 — migration),
 * a implementação atual entra no caminho skeleton (no-op) quando os
 * delegates não existem. Os testes cobrem:
 *
 * - skeleton no-op quando delegates ausentes (caminho atual em produção
 *   até T2 rodar).
 * - happy path quando delegates existem (mockados): perfil OK sem drift,
 *   missing_user, missing_views.
 * - drift detected → status update + audit log create.
 */

const profileFindMany = jest.fn();
const profileUpdate = jest.fn();
const auditCreate = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    integrationProfile: {
      findMany: (...args: unknown[]) => profileFindMany(...args),
      update: (...args: unknown[]) => profileUpdate(...args),
    },
    integrationAuditLog: {
      create: (...args: unknown[]) => auditCreate(...args),
    },
  },
}));

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};
const mockPool = {
  connect: jest.fn(() => Promise.resolve(mockClient)),
};

jest.mock("../admin-pool", () => ({
  getIntegrationAdminPool: () => mockPool,
}));

import { reconcileIntegrations } from "../reconcile";
import { buildDerivedViewName } from "../sql-builders";

describe("reconcileIntegrations", () => {
  beforeEach(() => {
    profileFindMany.mockReset();
    profileUpdate.mockReset();
    auditCreate.mockReset();
    mockClient.query.mockReset();
    mockClient.release.mockClear();
    mockPool.connect.mockClear();
  });

  it("happy path: 0 perfis → drifts vazios", async () => {
    profileFindMany.mockResolvedValue([]);
    const out = await reconcileIntegrations();
    expect(out.drifts).toEqual([]);
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("perfil OK (user existe + views existem) → sem drift", async () => {
    const profileId = "00000000-0000-0000-0000-0000000000aa";
    const allowedTables = ["dim_accounts"];
    const expectedView = buildDerivedViewName(profileId, "dim_accounts");

    profileFindMany.mockResolvedValue([
      {
        id: profileId,
        pgUsername: "pbi_alpha",
        allowedTables,
      },
    ]);
    mockClient.query.mockImplementation(async (sql: string) => {
      if (/pg_roles/i.test(sql)) return { rowCount: 1, rows: [{}] };
      if (/pg_views/i.test(sql))
        return { rowCount: 1, rows: [{ viewname: expectedView }] };
      return { rowCount: 0, rows: [] };
    });

    const out = await reconcileIntegrations();
    expect(out.drifts).toEqual([]);
  });

  it("user inexistente → drift missing_user + status=error + audit", async () => {
    const profileId = "00000000-0000-0000-0000-0000000000bb";
    profileFindMany.mockResolvedValue([
      { id: profileId, pgUsername: "pbi_gone", allowedTables: ["dim_inboxes"] },
    ]);
    mockClient.query.mockImplementation(async (sql: string) => {
      if (/pg_roles/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 0, rows: [] };
    });

    const out = await reconcileIntegrations();
    expect(out.drifts).toEqual([{ profileId, type: "missing_user" }]);
    expect(profileUpdate).toHaveBeenCalledWith({
      where: { id: profileId },
      data: { status: "error", lastProvisionError: "drift: missing_user" },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        profileId,
        event: "provisioning_failed",
        details: { drift: { profileId, type: "missing_user" } },
      },
    });
  });

  it("views faltando → drift missing_views", async () => {
    const profileId = "00000000-0000-0000-0000-0000000000cc";
    const allowedTables = ["dim_accounts", "dim_teams"];
    const viewAccounts = buildDerivedViewName(profileId, "dim_accounts");

    profileFindMany.mockResolvedValue([
      { id: profileId, pgUsername: "pbi_partial", allowedTables },
    ]);
    mockClient.query.mockImplementation(async (sql: string) => {
      if (/pg_roles/i.test(sql)) return { rowCount: 1, rows: [{}] };
      if (/pg_views/i.test(sql))
        return { rowCount: 1, rows: [{ viewname: viewAccounts }] };
      return { rowCount: 0, rows: [] };
    });

    const out = await reconcileIntegrations();
    expect(out.drifts).toHaveLength(1);
    expect(out.drifts[0].type).toBe("missing_views");
    if (out.drifts[0].type === "missing_views") {
      expect(out.drifts[0].missing).toEqual([
        buildDerivedViewName(profileId, "dim_teams"),
      ]);
    }
    expect(profileUpdate).toHaveBeenCalledWith({
      where: { id: profileId },
      data: { status: "error", lastProvisionError: "drift: missing_views" },
    });
    expect(auditCreate).toHaveBeenCalled();
  });
});

describe("reconcileIntegrations — skeleton no-op (Prisma sem models)", () => {
  it("retorna { drifts: [] } e não tenta query quando delegates ausentes", async () => {
    jest.resetModules();
    const localPool = {
      connect: jest.fn(),
    };
    jest.doMock("@/lib/prisma", () => ({ prisma: {} }));
    jest.doMock("../admin-pool", () => ({
      getIntegrationAdminPool: () => localPool,
    }));

    // re-import com novo mock
    const mod = await import("../reconcile");
    const out = await mod.reconcileIntegrations();
    expect(out.drifts).toEqual([]);
    // Nenhuma conexão deve ter sido aberta
    expect(localPool.connect).not.toHaveBeenCalled();
  });
});
