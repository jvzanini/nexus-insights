jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/encryption", () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, "")),
}));
jest.mock("@/lib/realtime", () => ({
  publishRealtimeEvent: jest.fn().mockResolvedValue(undefined),
  CHANNEL: "nexus-insights:realtime",
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    nexusChatConnection: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    companyChatBinding: {
      count: jest.fn(),
    },
  },
}));
jest.mock("@/lib/nexus-chat/pool", () => ({
  invalidateNexusChatPool: jest.fn().mockResolvedValue(undefined),
  queryNexusChat: jest.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { invalidateNexusChatPool, queryNexusChat } from "@/lib/nexus-chat/pool";
import { publishRealtimeEvent } from "@/lib/realtime";
import {
  createNexusChatConnection,
  updateNexusChatConnection,
  softDeleteNexusChatConnection,
  testNexusChatConnection,
  updateConnectionPollingInterval,
} from "../connections";

const userMock = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const createMock = (
  prisma as unknown as { nexusChatConnection: { create: jest.Mock } }
).nexusChatConnection.create;
const findUniqueMock = (
  prisma as unknown as { nexusChatConnection: { findUnique: jest.Mock } }
).nexusChatConnection.findUnique;
const updateMock = (
  prisma as unknown as { nexusChatConnection: { update: jest.Mock } }
).nexusChatConnection.update;
const countBindingMock = (
  prisma as unknown as { companyChatBinding: { count: jest.Mock } }
).companyChatBinding.count;
const queryMock = queryNexusChat as jest.MockedFunction<typeof queryNexusChat>;
const auditMock = logAudit as jest.MockedFunction<typeof logAudit>;
const publishMock = publishRealtimeEvent as jest.MockedFunction<
  typeof publishRealtimeEvent
>;

const validInput = {
  name: "Hostinger principal",
  host: "db.example.com",
  port: 5432,
  database: "chatwoot_prod",
  username: "chatwoot_leitura",
  password: "supersecret",
  sslMode: "prefer" as const,
};

beforeEach(() => {
  userMock.mockReset();
  createMock.mockReset();
  findUniqueMock.mockReset();
  updateMock.mockReset();
  countBindingMock.mockReset();
  queryMock.mockReset();
  auditMock.mockClear();
  publishMock.mockClear();
});

describe("createNexusChatConnection", () => {
  it("super_admin cria com sucesso (encripta password + audit log)", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    createMock.mockResolvedValue({ id: "conn-1", name: validInput.name });

    const result = await createNexusChatConnection(validInput);

    expect(result.success).toBe(true);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordEnc: "enc:supersecret",
          host: "db.example.com",
        }),
      }),
    );
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "nexus_chat_connection_created",
        targetType: "nexus_chat_connection",
        targetId: "conn-1",
      }),
    );
  });

  it("v0.41: NÃO gera webhookToken (webhook removido) + default pollingIntervalSeconds=30", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    createMock.mockResolvedValue({ id: "conn-1" });

    const result = await createNexusChatConnection(validInput);

    expect(result.success).toBe(true);
    const callArg = createMock.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(callArg.data.webhookToken).toBeUndefined();
    expect(callArg.data.webhookSecretEnc).toBeUndefined();
    expect(callArg.data.pollingIntervalSeconds).toBe(30);
  });

  it("v0.41: aceita pollingIntervalSeconds custom (45) e passa pro Prisma .create()", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    createMock.mockResolvedValue({ id: "conn-1" });

    const result = await createNexusChatConnection({
      ...validInput,
      pollingIntervalSeconds: 45,
    });

    expect(result.success).toBe(true);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pollingIntervalSeconds: 45,
        }),
      }),
    );
  });

  it("nao expoe password no audit details", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    createMock.mockResolvedValue({ id: "conn-1" });

    await createNexusChatConnection(validInput);

    const auditDetails = (auditMock.mock.calls[0]?.[0] as { details: unknown })
      .details as Record<string, unknown>;
    expect(JSON.stringify(auditDetails)).not.toContain("supersecret");
    expect(JSON.stringify(auditDetails)).not.toContain("enc:");
  });

  it("admin (não super_admin) é rejeitado", async () => {
    userMock.mockResolvedValue({ id: "u1", platformRole: "admin" } as never);

    const result = await createNexusChatConnection(validInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/super_admin/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("usuário não autenticado é rejeitado", async () => {
    userMock.mockResolvedValue(null);

    const result = await createNexusChatConnection(validInput);

    expect(result.success).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("validação Zod: rejeita nome vazio", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);

    const result = await createNexusChatConnection({
      ...validInput,
      name: "",
    });

    expect(result.success).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("updateNexusChatConnection", () => {
  it("password vazia mantém senha atual (passwordEnc não muda)", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findUniqueMock.mockResolvedValue({
      id: "c1",
      passwordEnc: "enc:original",
      name: "old",
      host: "old.host",
    });
    updateMock.mockResolvedValue({ id: "c1" });

    const result = await updateNexusChatConnection("c1", {
      ...validInput,
      password: "",
    });

    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ passwordEnc: expect.any(String) }),
      }),
    );
  });

  it("password preenchida sobrescreve passwordEnc", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findUniqueMock.mockResolvedValue({
      id: "c1",
      passwordEnc: "enc:original",
      name: "old",
    });
    updateMock.mockResolvedValue({ id: "c1" });

    await updateNexusChatConnection("c1", {
      ...validInput,
      password: "newsecret",
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordEnc: "enc:newsecret" }),
      }),
    );
  });

  it("v0.41: passa pollingIntervalSeconds no .update() data", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findUniqueMock.mockResolvedValue({
      id: "c1",
      passwordEnc: "enc:p",
      name: "x",
    });
    updateMock.mockResolvedValue({ id: "c1" });

    await updateNexusChatConnection("c1", {
      ...validInput,
      password: "",
      pollingIntervalSeconds: 60,
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pollingIntervalSeconds: 60 }),
      }),
    );
  });

  it("publica connection:updated no Pub/Sub e invalida pool", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findUniqueMock.mockResolvedValue({
      id: "c1",
      passwordEnc: "enc:p",
      name: "x",
    });
    updateMock.mockResolvedValue({ id: "c1" });

    await updateNexusChatConnection("c1", { ...validInput, password: "" });

    expect(publishMock).toHaveBeenCalledWith({
      type: "connection:updated",
      connectionId: "c1",
    });
    expect(invalidateNexusChatPool).toHaveBeenCalledWith("c1");
  });
});

describe("softDeleteNexusChatConnection", () => {
  it("bloqueia se há binding enabled", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    countBindingMock.mockResolvedValue(2);

    const result = await softDeleteNexusChatConnection("c1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/2 empresas? vinculad/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("apaga se 0 bindings enabled + publica connection:deleted", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    countBindingMock.mockResolvedValue(0);
    findUniqueMock.mockResolvedValue({ id: "c1", name: "Padrão" });
    updateMock.mockResolvedValue({ id: "c1", deletedAt: new Date() });

    const result = await softDeleteNexusChatConnection("c1");

    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(publishMock).toHaveBeenCalledWith({
      type: "connection:deleted",
      connectionId: "c1",
    });
    expect(invalidateNexusChatPool).toHaveBeenCalledWith("c1");
  });
});

describe("testNexusChatConnection", () => {
  it("executa SELECT 1 com sucesso e atualiza last_test_at", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    queryMock.mockResolvedValue({
      rows: [{ ok: 1 }],
      rowCount: 1,
    } as never);
    updateMock.mockResolvedValue({ id: "c1" });

    const result = await testNexusChatConnection("c1");

    expect(result.success).toBe(true);
    expect(queryMock).toHaveBeenCalledWith("c1", "SELECT 1", []);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: expect.objectContaining({
          lastTestAt: expect.any(Date),
          lastTestError: null,
        }),
      }),
    );
  });

  it("captura erro de query e grava em last_test_error", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    queryMock.mockRejectedValue(new Error("connection refused"));
    updateMock.mockResolvedValue({ id: "c1" });

    const result = await testNexusChatConnection("c1");

    expect(result.success).toBe(false);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastTestError: expect.stringMatching(/connection refused/),
        }),
      }),
    );
  });
});

describe("updateConnectionPollingInterval", () => {
  it("rejeita valor < 20", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);

    const r = await updateConnectionPollingInterval("conn-1", 10);

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/mínimo de 20/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("aceita 30 e atualiza Prisma com pollingIntervalSeconds", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findUniqueMock.mockResolvedValue({
      id: "conn-1",
      name: "Padrão",
      pollingIntervalSeconds: 60,
    });
    updateMock.mockResolvedValue({} as never);

    const r = await updateConnectionPollingInterval("conn-1", 30);

    expect(r.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "conn-1" },
      data: { pollingIntervalSeconds: 30 },
    });
  });

  it("audita polling_interval_updated com before/after", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findUniqueMock.mockResolvedValue({
      id: "conn-1",
      name: "Padrão",
      pollingIntervalSeconds: 60,
    });
    updateMock.mockResolvedValue({} as never);

    await updateConnectionPollingInterval("conn-1", 25);

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "polling_interval_updated",
        targetType: "nexus_chat_connection",
        targetId: "conn-1",
        details: expect.objectContaining({
          name: "Padrão",
          before: 60,
          after: 25,
        }),
      }),
    );
  });

  it("rejeita user não super_admin", async () => {
    userMock.mockResolvedValue({ id: "u1", platformRole: "manager" } as never);

    const r = await updateConnectionPollingInterval("conn-1", 30);

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/super_admin/i);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
