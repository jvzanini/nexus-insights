jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    nexusChatConnection: {
      findUnique: jest.fn(),
    },
    auditLog: {
      count: jest.fn(),
    },
    chatwootFactsMeta: {
      count: jest.fn(),
    },
  },
}));

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConnectionHealthSnapshot } from "../health-metrics";

const userMock = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const findUniqueMock = (
  prisma as unknown as { nexusChatConnection: { findUnique: jest.Mock } }
).nexusChatConnection.findUnique;
const auditCountMock = (
  prisma as unknown as { auditLog: { count: jest.Mock } }
).auditLog.count;
const factsMetaCountMock = (
  prisma as unknown as { chatwootFactsMeta: { count: jest.Mock } }
).chatwootFactsMeta.count;

beforeEach(() => {
  userMock.mockReset();
  findUniqueMock.mockReset();
  auditCountMock.mockReset();
  factsMetaCountMock.mockReset();
});

describe("getConnectionHealthSnapshot", () => {
  it("super_admin: retorna snapshot completo com lag em minutos", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);

    // Mock now via fixed Date
    const fixedNow = new Date("2026-05-04T12:00:00Z");
    jest.useFakeTimers().setSystemTime(fixedNow);

    // last webhook 30 min atrás
    const lastWebhookAt = new Date("2026-05-04T11:30:00Z");
    findUniqueMock.mockResolvedValue({
      id: "conn-1",
      lastWebhookAt,
    });
    auditCountMock
      .mockResolvedValueOnce(120) // webhooks24h
      .mockResolvedValueOnce(3); // errors24h
    factsMetaCountMock.mockResolvedValue(1);

    const result = await getConnectionHealthSnapshot("conn-1");

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      connectionId: "conn-1",
      lastWebhookAt: lastWebhookAt.toISOString(),
      lastWebhookLagMinutes: 30,
      webhooksLast24h: 120,
      errorsLast24h: 3,
      jobErrorsLast24h: 1,
    });

    jest.useRealTimers();
  });

  it("admin (não super_admin) é rejeitado", async () => {
    userMock.mockResolvedValue({ id: "u1", platformRole: "admin" } as never);

    const result = await getConnectionHealthSnapshot("conn-1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/super_admin/i);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("usuário não autenticado é rejeitado", async () => {
    userMock.mockResolvedValue(null);

    const result = await getConnectionHealthSnapshot("conn-1");

    expect(result.success).toBe(false);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("conexão não encontrada (deletada ou inexistente) retorna error", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findUniqueMock.mockResolvedValue(null);

    const result = await getConnectionHealthSnapshot("conn-x");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/não encontrada/i);
  });

  it("lastWebhookAt null → lag null (heartbeat indisponível)", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findUniqueMock.mockResolvedValue({
      id: "conn-1",
      lastWebhookAt: null,
    });
    auditCountMock.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    factsMetaCountMock.mockResolvedValue(0);

    const result = await getConnectionHealthSnapshot("conn-1");

    expect(result.success).toBe(true);
    expect(result.data?.lastWebhookAt).toBeNull();
    expect(result.data?.lastWebhookLagMinutes).toBeNull();
  });

  it("conta correta de erros 24h (HMAC + rate limit)", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findUniqueMock.mockResolvedValue({
      id: "conn-1",
      lastWebhookAt: new Date(),
    });
    auditCountMock.mockResolvedValueOnce(50).mockResolvedValueOnce(7);
    factsMetaCountMock.mockResolvedValue(0);

    const result = await getConnectionHealthSnapshot("conn-1");

    expect(result.data?.errorsLast24h).toBe(7);

    // Verifica que a query de erros usa "in" com os 2 actions corretos.
    const errorsCall = auditCountMock.mock.calls[1]?.[0] as {
      where: { action: { in: string[] } };
    };
    expect(errorsCall.where.action.in).toEqual(
      expect.arrayContaining([
        "webhook_rejected_hmac",
        "webhook_rejected_rate_limit",
      ]),
    );
  });
});
