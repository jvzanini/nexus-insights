/**
 * updateUser — edição de e-mail por quem tem permissão.
 *
 * Cobre o novo comportamento: e-mail editável (normalizado), unicidade
 * (excluindo o próprio usuário) e preservação da senha quando só o e-mail muda.
 */

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    userAccountAccess: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    userTeamAccess: { deleteMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn() }));
jest.mock("@/lib/email", () => ({ sendWelcomeEmail: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/utils/generate-temp-password", () => ({
  generateTempPassword: () => "TempPass123!",
}));
jest.mock("@/lib/tenant", () => ({ getKnownAccounts: jest.fn() }));
jest.mock("@/lib/chatwoot/queries/meta-cache", () => ({ getTeams: jest.fn() }));

import { updateUser } from "../users";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;
const mockFindUnique = prisma.user.findUnique as unknown as jest.Mock;
const mockTransaction = prisma.$transaction as unknown as jest.Mock;

const TARGET_ID = "11111111-1111-4111-8111-111111111111";
const ME = { id: "99999999-9999-4999-8999-999999999999", platformRole: "super_admin" };

type TxMock = {
  user: { update: jest.Mock };
  userAccountAccess: { deleteMany: jest.Mock; findMany: jest.Mock; create: jest.Mock };
  userTeamAccess: { deleteMany: jest.Mock; create: jest.Mock };
};
let tx: TxMock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(ME as never);
  tx = {
    user: { update: jest.fn() },
    userAccountAccess: {
      deleteMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
    userTeamAccess: { deleteMany: jest.fn(), create: jest.fn() },
  };
  mockTransaction.mockImplementation(async (cb: (t: TxMock) => unknown) => cb(tx));
});

describe("updateUser — edição de e-mail", () => {
  it("atualiza o e-mail (normalizado) sem tocar na senha", async () => {
    mockFindUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) => {
      if (where.id === TARGET_ID) {
        return { id: TARGET_ID, platformRole: "viewer", isOwner: false, email: "antigo@email.com" };
      }
      return null; // sem duplicado para o novo e-mail
    });

    const result = await updateUser({ id: TARGET_ID, email: "  NOVO@Email.com " });

    expect(result.success).toBe(true);
    const updateArg = tx.user.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: TARGET_ID });
    expect(updateArg.data.email).toBe("novo@email.com");
    expect(updateArg.data).not.toHaveProperty("password");
  });

  it("rejeita e-mail já usado por outro usuário", async () => {
    mockFindUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) => {
      if (where.id === TARGET_ID) {
        return { id: TARGET_ID, platformRole: "viewer", isOwner: false, email: "antigo@email.com" };
      }
      if (where.email === "ocupado@email.com") {
        return { id: "outro-id-diferente", email: "ocupado@email.com" };
      }
      return null;
    });

    const result = await updateUser({ id: TARGET_ID, email: "ocupado@email.com" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/já cadastrado/i);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("permite manter o próprio e-mail (não trata como duplicado)", async () => {
    mockFindUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) => {
      if (where.id === TARGET_ID) {
        return { id: TARGET_ID, platformRole: "viewer", isOwner: false, email: "meu@email.com" };
      }
      if (where.email === "meu@email.com") {
        return { id: TARGET_ID, email: "meu@email.com" }; // o próprio usuário
      }
      return null;
    });

    const result = await updateUser({ id: TARGET_ID, name: "Novo Nome", email: "meu@email.com" });

    expect(result.success).toBe(true);
    const updateArg = tx.user.update.mock.calls[0][0];
    expect(updateArg.data.email).toBe("meu@email.com");
    expect(updateArg.data.name).toBe("Novo Nome");
    expect(updateArg.data).not.toHaveProperty("password");
  });
});
