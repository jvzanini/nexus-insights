jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: jest.fn(),
    },
  },
}));

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listRecentWebhookEvents } from "../realtime-stream";

const userMock = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const findManyMock = (
  prisma as unknown as { auditLog: { findMany: jest.Mock } }
).auditLog.findMany;

beforeEach(() => {
  userMock.mockReset();
  findManyMock.mockReset();
});

describe("listRecentWebhookEvents", () => {
  it("super_admin recebe lista (default limit 200, ordem desc)", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findManyMock.mockResolvedValue([
      {
        id: "a1",
        action: "webhook_received",
        createdAt: new Date("2026-05-04T10:00:00Z"),
        details: { event: "conversation_created" },
      },
    ]);

    const result = await listRecentWebhookEvents({ connectionId: "conn-1" });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.action).toBe("webhook_received");
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: { startsWith: "webhook_" },
          targetType: "nexus_chat_connection",
          targetId: "conn-1",
        }),
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    );
  });

  it("admin (não super_admin) é rejeitado", async () => {
    userMock.mockResolvedValue({ id: "u1", platformRole: "admin" } as never);

    const result = await listRecentWebhookEvents({ connectionId: "conn-1" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/super_admin/i);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("usuário não autenticado é rejeitado", async () => {
    userMock.mockResolvedValue(null);

    const result = await listRecentWebhookEvents({ connectionId: "conn-1" });

    expect(result.success).toBe(false);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("limit acima de 500 é capado em 500", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findManyMock.mockResolvedValue([]);

    await listRecentWebhookEvents({ connectionId: "conn-1", limit: 9999 });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
  });

  it("limit customizado dentro do range é respeitado", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findManyMock.mockResolvedValue([]);

    await listRecentWebhookEvents({ connectionId: "conn-1", limit: 50 });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it("details null é tratado como objeto vazio", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findManyMock.mockResolvedValue([
      {
        id: "a1",
        action: "webhook_received",
        createdAt: new Date(),
        details: null,
      },
    ]);

    const result = await listRecentWebhookEvents({ connectionId: "conn-1" });

    expect(result.data?.[0]?.details).toEqual({});
  });
});
