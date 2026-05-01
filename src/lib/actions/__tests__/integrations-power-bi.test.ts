jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn(async () => {}) }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    integrationProfile: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    integrationAuditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));
jest.mock("@/lib/redis", () => ({
  redis: {
    incr: jest.fn(),
    expire: jest.fn(),
  },
}));
jest.mock("@/lib/encryption", () => ({
  encrypt: jest.fn((s: string) => `enc:${s}`),
  decrypt: jest.fn((s: string) =>
    s.startsWith("enc:") ? s.slice(4) : "DECRYPTED",
  ),
}));
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));
jest.mock("@/lib/integrations/power-bi/provisioner", () => ({
  provisionProfile: jest.fn(async () => {}),
  disableProfile: jest.fn(async () => {}),
  reactivateProfile: jest.fn(async () => {}),
  deprovisionProfile: jest.fn(async () => {}),
}));
jest.mock("@/lib/integrations/power-bi/admin-pool", () => ({
  getIntegrationAdminPool: jest.fn(() => ({
    connect: jest.fn(async () => ({
      query: jest.fn(async () => ({ rows: [] })),
      release: jest.fn(),
    })),
  })),
}));
jest.mock("@/lib/integrations/queue", () => ({
  integrationsRefreshDimQueue: { add: jest.fn(async () => {}) },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logAudit } from "@/lib/audit";
import {
  provisionProfile,
  disableProfile,
  reactivateProfile,
  deprovisionProfile,
} from "@/lib/integrations/power-bi/provisioner";
import { integrationsRefreshDimQueue } from "@/lib/integrations/queue";

import {
  listProfilesAction,
  getProfileByIdAction,
  createProfileAction,
  updateProfileAction,
  revealPasswordAction,
  rotatePasswordAction,
  disableProfileAction,
  reactivateProfileAction,
  deleteProfileAction,
  triggerDimSyncAction,
} from "../integrations-power-bi";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockPrisma = prisma as unknown as {
  integrationProfile: {
    count: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  integrationAuditLog: {
    create: jest.Mock;
    findMany: jest.Mock;
  };
};
const mockRedis = redis as unknown as {
  incr: jest.Mock;
  expire: jest.Mock;
};
const mockProvisionProfile = provisionProfile as jest.MockedFunction<
  typeof provisionProfile
>;
const mockDisableProfile = disableProfile as jest.MockedFunction<
  typeof disableProfile
>;
const mockReactivateProfile = reactivateProfile as jest.MockedFunction<
  typeof reactivateProfile
>;
const mockDeprovisionProfile = deprovisionProfile as jest.MockedFunction<
  typeof deprovisionProfile
>;
const mockQueueAdd = (
  integrationsRefreshDimQueue as unknown as { add: jest.Mock }
).add;

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({
    user: { id: "u-1", platformRole: "super_admin" },
  } as never);
});

const validInput = {
  name: "Marketing BI",
  description: "Dashboard marketing",
  allowedTables: ["chatwoot_facts_daily_by_account"],
  allowedColumns: {
    chatwoot_facts_daily_by_account: [
      "account_id",
      "bucket_date",
      "received",
      "resolved",
    ],
  },
  accountIdFilter: [1],
  teamIdFilter: null,
};

// -------------------- Guard super_admin parametrizado --------------------

describe("guard super_admin", () => {
  const cases: Array<[string, () => Promise<{ ok: boolean }>]> = [
    ["listProfilesAction", () => listProfilesAction()],
    ["getProfileByIdAction", () => getProfileByIdAction("id")],
    ["createProfileAction", () => createProfileAction(validInput)],
    [
      "updateProfileAction",
      () => updateProfileAction("id", validInput, new Date().toISOString()),
    ],
    ["revealPasswordAction", () => revealPasswordAction("id")],
    ["rotatePasswordAction", () => rotatePasswordAction("id")],
    ["disableProfileAction", () => disableProfileAction("id")],
    ["reactivateProfileAction", () => reactivateProfileAction("id")],
    ["deleteProfileAction", () => deleteProfileAction("id")],
    ["triggerDimSyncAction", () => triggerDimSyncAction()],
  ];

  it.each(cases)("%s rejeita não-super_admin", async (_name, fn) => {
    mockAuth.mockResolvedValueOnce({
      user: { platformRole: "viewer" },
    } as never);
    const r = await fn();
    expect(r.ok).toBe(false);
  });
});

// -------------------- listProfilesAction --------------------

describe("listProfilesAction", () => {
  it("lista perfis ativos+disabled (deletedAt=null) ordenado desc", async () => {
    mockPrisma.integrationProfile.findMany.mockResolvedValueOnce([
      {
        id: "p1",
        name: "BI A",
        description: null,
        status: "active",
        pgUsername: "pbi_a_aaaa",
        passwordLast4: "abcd",
        allowedTables: ["chatwoot_facts_daily_by_account"],
        allowedColumns: {},
        accountIdFilter: [1, 2],
        teamIdFilter: null,
        lastProvisionedAt: new Date(),
        lastProvisionError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        disabledAt: null,
        createdBy: { id: "u1", name: "Admin", email: "a@x.com" },
      },
    ]);
    const r = await listProfilesAction();
    expect(r.ok).toBe(true);
    expect(r.data).toHaveLength(1);
    expect(mockPrisma.integrationProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kind: "power_bi", deletedAt: null },
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});

// -------------------- getProfileByIdAction --------------------

describe("getProfileByIdAction", () => {
  it("retorna null quando perfil não existe", async () => {
    mockPrisma.integrationProfile.findFirst.mockResolvedValueOnce(null);
    const r = await getProfileByIdAction("missing");
    expect(r.ok).toBe(true);
    expect(r.data).toBeNull();
  });

  it("retorna detail + auditEvents (até 50, desc)", async () => {
    mockPrisma.integrationProfile.findFirst.mockResolvedValueOnce({
      id: "p1",
      name: "BI A",
      description: null,
      status: "active",
      pgUsername: "pbi_a_aaaa",
      passwordLast4: "abcd",
      allowedTables: ["chatwoot_facts_daily_by_account"],
      allowedColumns: { chatwoot_facts_daily_by_account: ["account_id"] },
      accountIdFilter: null,
      teamIdFilter: null,
      lastProvisionedAt: null,
      lastProvisionError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      disabledAt: null,
      createdBy: null,
    });
    mockPrisma.integrationAuditLog.findMany.mockResolvedValueOnce([
      {
        id: "a1",
        event: "profile_created",
        userId: "u1",
        details: {},
        createdAt: new Date(),
      },
    ]);
    const r = await getProfileByIdAction("p1");
    expect(r.ok).toBe(true);
    expect(r.data?.auditEvents).toHaveLength(1);
    expect(mockPrisma.integrationAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { profileId: "p1" },
        take: 50,
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});

// -------------------- createProfileAction --------------------

describe("createProfileAction", () => {
  const fakeCreatedRow = {
    id: "new-1",
    name: "Marketing BI",
    description: "Dashboard marketing",
    status: "active",
    pgUsername: "pbi_marketing_bi_abcdef",
    passwordLast4: "abcd",
    allowedTables: validInput.allowedTables,
    allowedColumns: validInput.allowedColumns,
    accountIdFilter: validInput.accountIdFilter,
    teamIdFilter: null,
    lastProvisionedAt: new Date(),
    lastProvisionError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    disabledAt: null,
    createdBy: { id: "u-1", name: "Admin", email: "a@x.com" },
  };

  it("happy path: provision + audit + retorna plainPassword", async () => {
    mockPrisma.integrationProfile.count.mockResolvedValueOnce(3);
    mockPrisma.integrationProfile.create.mockResolvedValueOnce({ id: "new-1" });
    mockPrisma.integrationProfile.update.mockResolvedValueOnce(fakeCreatedRow);

    const r = await createProfileAction(validInput);

    expect(r.ok).toBe(true);
    expect(r.data?.plainPassword).toEqual(expect.any(String));
    expect(r.data?.plainPassword.length).toBeGreaterThan(20);
    expect(mockProvisionProfile).toHaveBeenCalledTimes(1);
    expect(mockPrisma.integrationAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: "profile_created" }),
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "integration_profile_created" }),
    );
  });

  it("trata P2002 com mensagem amigável", async () => {
    mockPrisma.integrationProfile.count.mockResolvedValueOnce(0);
    mockPrisma.integrationProfile.create.mockRejectedValueOnce({ code: "P2002" });
    const r = await createProfileAction(validInput);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/já existe/i);
  });

  it("rejeita quando soft cap atingido", async () => {
    mockPrisma.integrationProfile.count.mockResolvedValueOnce(50);
    const r = await createProfileAction(validInput);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Limite de 50/i);
    expect(mockPrisma.integrationProfile.create).not.toHaveBeenCalled();
  });

  it("marca status=error e propaga falha quando provision falha", async () => {
    mockPrisma.integrationProfile.count.mockResolvedValueOnce(0);
    mockPrisma.integrationProfile.create.mockResolvedValueOnce({ id: "new-1" });
    mockProvisionProfile.mockRejectedValueOnce(new Error("DDL failed"));
    mockPrisma.integrationProfile.update.mockResolvedValue(fakeCreatedRow);

    const r = await createProfileAction(validInput);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/DDL failed/);
    expect(mockPrisma.integrationProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "error" }),
      }),
    );
    expect(mockPrisma.integrationAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: "provisioning_failed" }),
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "integration_provisioning_failed" }),
    );
  });

  it("rejeita input com coluna fora do catálogo", async () => {
    const r = await createProfileAction({
      ...validInput,
      allowedColumns: {
        chatwoot_facts_daily_by_account: ["coluna_que_nao_existe"],
      },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/inválida|inválido|coluna/i);
  });
});

// -------------------- updateProfileAction --------------------

describe("updateProfileAction", () => {
  it("rejeita stale updatedAt (optimistic concurrency)", async () => {
    const dbUpdatedAt = new Date("2026-05-01T10:00:00Z");
    mockPrisma.integrationProfile.findUnique.mockResolvedValueOnce({
      updatedAt: dbUpdatedAt,
      pgUsername: "pbi_x",
      encryptedPgPassword: "enc:secret",
      deletedAt: null,
    });
    const stale = new Date("2026-05-01T09:00:00Z").toISOString();
    const r = await updateProfileAction("id", validInput, stale);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/modificado/i);
    expect(mockPrisma.integrationProfile.update).not.toHaveBeenCalled();
  });

  it("rejeita perfil deletado", async () => {
    mockPrisma.integrationProfile.findUnique.mockResolvedValueOnce({
      updatedAt: new Date(),
      pgUsername: "pbi_x",
      encryptedPgPassword: "enc:secret",
      deletedAt: new Date(),
    });
    const r = await updateProfileAction(
      "id",
      validInput,
      new Date().toISOString(),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/não encontrado/i);
  });

  it("re-provisiona com mesma senha decifrada", async () => {
    const ts = new Date("2026-05-01T10:00:00Z");
    mockPrisma.integrationProfile.findUnique.mockResolvedValueOnce({
      updatedAt: ts,
      pgUsername: "pbi_x",
      encryptedPgPassword: "enc:topsecret",
      deletedAt: null,
    });
    mockPrisma.integrationProfile.update.mockResolvedValue({
      id: "id",
      name: validInput.name,
      description: validInput.description,
      status: "active",
      pgUsername: "pbi_x",
      passwordLast4: "abcd",
      allowedTables: validInput.allowedTables,
      allowedColumns: validInput.allowedColumns,
      accountIdFilter: validInput.accountIdFilter,
      teamIdFilter: null,
      lastProvisionedAt: new Date(),
      lastProvisionError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      disabledAt: null,
      createdBy: null,
    });

    const r = await updateProfileAction("id", validInput, ts.toISOString());
    expect(r.ok).toBe(true);
    expect(mockProvisionProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        pgUsername: "pbi_x",
        password: "topsecret",
      }),
    );
    expect(mockPrisma.integrationAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: "whitelist_changed" }),
      }),
    );
  });
});

// -------------------- revealPasswordAction --------------------

describe("revealPasswordAction", () => {
  it("rate-limit: 5° passa, 6° rejeita", async () => {
    mockPrisma.integrationProfile.findFirst.mockResolvedValue({
      encryptedPgPassword: "enc:secret",
    });

    for (let i = 1; i <= 5; i++) {
      mockRedis.incr.mockResolvedValueOnce(i);
      const r = await revealPasswordAction("id");
      expect(r.ok).toBe(true);
      expect(r.data?.password).toBe("secret");
    }
    mockRedis.incr.mockResolvedValueOnce(6);
    const r6 = await revealPasswordAction("id");
    expect(r6.ok).toBe(false);
    expect(r6.error).toMatch(/Limite/i);
  });

  it("aplica EXPIRE só na primeira call do dia", async () => {
    mockPrisma.integrationProfile.findFirst.mockResolvedValue({
      encryptedPgPassword: "enc:secret",
    });
    mockRedis.incr.mockResolvedValueOnce(1);
    await revealPasswordAction("id");
    expect(mockRedis.expire).toHaveBeenCalledWith(expect.any(String), 86400);

    mockRedis.expire.mockClear();
    mockRedis.incr.mockResolvedValueOnce(2);
    await revealPasswordAction("id");
    expect(mockRedis.expire).not.toHaveBeenCalled();
  });
});

// -------------------- rotatePasswordAction --------------------

describe("rotatePasswordAction", () => {
  it("rate-limit: 10° passa, 11° rejeita", async () => {
    mockPrisma.integrationProfile.findFirst.mockResolvedValue({
      pgUsername: "pbi_x",
    });
    mockPrisma.integrationProfile.update.mockResolvedValue({});

    for (let i = 1; i <= 10; i++) {
      mockRedis.incr.mockResolvedValueOnce(i);
      const r = await rotatePasswordAction("id");
      expect(r.ok).toBe(true);
    }
    mockRedis.incr.mockResolvedValueOnce(11);
    const r11 = await rotatePasswordAction("id");
    expect(r11.ok).toBe(false);
    expect(r11.error).toMatch(/Limite/i);
  });

  it("audita rotação + atualiza encryptedPgPassword", async () => {
    mockPrisma.integrationProfile.findFirst.mockResolvedValueOnce({
      pgUsername: "pbi_x",
    });
    mockPrisma.integrationProfile.update.mockResolvedValueOnce({});
    mockRedis.incr.mockResolvedValueOnce(1);

    const r = await rotatePasswordAction("id");
    expect(r.ok).toBe(true);
    expect(mockPrisma.integrationProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          encryptedPgPassword: expect.stringMatching(/^enc:/),
        }),
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "integration_password_rotated" }),
    );
  });
});

// -------------------- disableProfileAction --------------------

describe("disableProfileAction", () => {
  it("chama disableProfile + status=disabled + audit", async () => {
    mockPrisma.integrationProfile.findFirst.mockResolvedValueOnce({
      pgUsername: "pbi_x",
    });
    mockPrisma.integrationProfile.update.mockResolvedValueOnce({
      id: "id",
      name: "x",
      description: null,
      status: "disabled",
      pgUsername: "pbi_x",
      passwordLast4: "abcd",
      allowedTables: [],
      allowedColumns: {},
      accountIdFilter: null,
      teamIdFilter: null,
      lastProvisionedAt: null,
      lastProvisionError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      disabledAt: new Date(),
      createdBy: null,
    });
    const r = await disableProfileAction("id");
    expect(r.ok).toBe(true);
    expect(mockDisableProfile).toHaveBeenCalledWith({ pgUsername: "pbi_x" });
    expect(mockPrisma.integrationAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: "profile_disabled" }),
      }),
    );
  });
});

// -------------------- reactivateProfileAction --------------------

describe("reactivateProfileAction", () => {
  it("chama reactivateProfile + status=active + audit", async () => {
    mockPrisma.integrationProfile.findFirst.mockResolvedValueOnce({
      pgUsername: "pbi_x",
    });
    mockPrisma.integrationProfile.update.mockResolvedValueOnce({
      id: "id",
      name: "x",
      description: null,
      status: "active",
      pgUsername: "pbi_x",
      passwordLast4: "abcd",
      allowedTables: [],
      allowedColumns: {},
      accountIdFilter: null,
      teamIdFilter: null,
      lastProvisionedAt: null,
      lastProvisionError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      disabledAt: null,
      createdBy: null,
    });
    const r = await reactivateProfileAction("id");
    expect(r.ok).toBe(true);
    expect(mockReactivateProfile).toHaveBeenCalledWith({
      id: "id",
      pgUsername: "pbi_x",
    });
  });
});

// -------------------- deleteProfileAction --------------------

describe("deleteProfileAction", () => {
  it("audit ANTES do deprovision (ordem)", async () => {
    mockPrisma.integrationProfile.findFirst.mockResolvedValueOnce({
      pgUsername: "pbi_x",
      name: "BI X",
    });
    mockPrisma.integrationProfile.update.mockResolvedValueOnce({});

    const order: string[] = [];
    mockPrisma.integrationAuditLog.create.mockImplementationOnce(async () => {
      order.push("audit");
      return undefined as never;
    });
    mockDeprovisionProfile.mockImplementationOnce(async () => {
      order.push("deprovision");
    });

    const r = await deleteProfileAction("id");
    expect(r.ok).toBe(true);
    expect(order).toEqual(["audit", "deprovision"]);
    expect(mockPrisma.integrationProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "disabled" }),
      }),
    );
  });

  it("rejeita perfil não encontrado", async () => {
    mockPrisma.integrationProfile.findFirst.mockResolvedValueOnce(null);
    const r = await deleteProfileAction("missing");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/não encontrado/i);
    expect(mockDeprovisionProfile).not.toHaveBeenCalled();
  });
});

// -------------------- triggerDimSyncAction --------------------

describe("triggerDimSyncAction", () => {
  it("enfileira manual-trigger + audit", async () => {
    const r = await triggerDimSyncAction();
    expect(r.ok).toBe(true);
    expect(r.data?.enqueued).toBe(true);
    expect(mockQueueAdd).toHaveBeenCalledWith("manual-trigger", {
      trigger: "ui",
    });
  });
});
