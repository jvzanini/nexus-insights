jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    companyChatBinding: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    nexusChatConnection: {
      findUnique: jest.fn(),
    },
  },
}));

import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  createCompanyChatBinding,
  updateCompanyChatBinding,
  softDeleteCompanyChatBinding,
} from "../bindings";

const userMock = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const createMock = (
  prisma as unknown as { companyChatBinding: { create: jest.Mock } }
).companyChatBinding.create;
const findUniqueMock = (
  prisma as unknown as { companyChatBinding: { findUnique: jest.Mock } }
).companyChatBinding.findUnique;
const findManyMock = (
  prisma as unknown as { companyChatBinding: { findMany: jest.Mock } }
).companyChatBinding.findMany;
const updateMock = (
  prisma as unknown as { companyChatBinding: { update: jest.Mock } }
).companyChatBinding.update;
const findConnMock = (
  prisma as unknown as { nexusChatConnection: { findUnique: jest.Mock } }
).nexusChatConnection.findUnique;

const CONN_UUID_1 = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";
const CONN_UUID_2 = "f1e2d3c4-b5a6-4789-9abc-def012345678";

const validInput = {
  connectionId: CONN_UUID_1,
  chatwootAccountId: 9,
  displayName: "Matrix Fitness Group",
  enabled: true,
};

beforeEach(() => {
  userMock.mockReset();
  createMock.mockReset();
  findUniqueMock.mockReset();
  findManyMock.mockReset();
  updateMock.mockReset();
  findConnMock.mockReset();
  (logAudit as jest.Mock).mockClear();
});

describe("createCompanyChatBinding", () => {
  it("super_admin cria com sucesso quando account_id é único entre connections", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findConnMock.mockResolvedValue({ id: CONN_UUID_1, deletedAt: null });
    findManyMock.mockResolvedValue([]); // nenhum outro binding
    createMock.mockResolvedValue({ id: "b1", ...validInput });

    const result = await createCompanyChatBinding(validInput);

    expect(result.success).toBe(true);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          connectionId: CONN_UUID_1,
          chatwootAccountId: 9,
          displayName: "Matrix Fitness Group",
          enabled: true,
        }),
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "company_chat_binding_created",
        targetType: "company_chat_binding",
      }),
    );
  });

  it("rejeita se account_id já existe em outra connection enabled (constraint operacional)", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findConnMock.mockResolvedValue({ id: CONN_UUID_1, deletedAt: null });
    findManyMock.mockResolvedValue([
      { id: "b-other", connectionId: CONN_UUID_2, chatwootAccountId: 9 },
    ]);

    const result = await createCompanyChatBinding(validInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/outra conexão|account_id|f1e2d3c4/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejeita se connection não existe ou foi deletada", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findConnMock.mockResolvedValue(null);

    const result = await createCompanyChatBinding(validInput);

    expect(result.success).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("admin é rejeitado (super_admin only)", async () => {
    userMock.mockResolvedValue({ id: "u1", platformRole: "admin" } as never);

    const result = await createCompanyChatBinding(validInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/super_admin/i);
  });
});

describe("updateCompanyChatBinding", () => {
  it("atualiza display_name e enabled", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findUniqueMock.mockResolvedValue({
      id: "b1",
      connectionId: CONN_UUID_1,
      chatwootAccountId: 9,
      displayName: "old",
      enabled: true,
    });
    updateMock.mockResolvedValue({ id: "b1" });

    const result = await updateCompanyChatBinding("b1", {
      displayName: "Matrix v2",
      enabled: false,
    });

    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "b1" },
        data: expect.objectContaining({
          displayName: "Matrix v2",
          enabled: false,
        }),
      }),
    );
  });
});

describe("softDeleteCompanyChatBinding", () => {
  it("aplica deletedAt + audit", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findUniqueMock.mockResolvedValue({
      id: "b1",
      connectionId: CONN_UUID_1,
      chatwootAccountId: 9,
      displayName: "Matrix",
    });
    updateMock.mockResolvedValue({ id: "b1" });

    const result = await softDeleteCompanyChatBinding("b1");

    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "b1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "company_chat_binding_deleted",
      }),
    );
  });
});
