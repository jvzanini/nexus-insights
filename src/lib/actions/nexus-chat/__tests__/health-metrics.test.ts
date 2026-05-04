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
  it("super_admin: retorna snapshot completo com lag em minutos (sample-corrected)", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);

    // Mock now via fixed Date
    const fixedNow = new Date("2026-05-04T12:00:00Z");
    jest.useFakeTimers().setSystemTime(fixedNow);

    // último sync 30 min atrás
    const lastSyncAt = new Date("2026-05-04T11:30:00Z");
    findUniqueMock.mockResolvedValue({
      id: "conn-1",
      lastSyncAt,
    });
    auditCountMock
      .mockResolvedValueOnce(120) // polling_sync_completed (sample 1/100 → 12000)
      .mockResolvedValueOnce(3); // polling_sync_failed
    factsMetaCountMock.mockResolvedValue(1);

    const result = await getConnectionHealthSnapshot("conn-1");

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      connectionId: "conn-1",
      lastSyncAt: lastSyncAt.toISOString(),
      lastSyncLagMinutes: 30,
      syncRunsLast24h: 12000,
      syncErrorsLast24h: 3,
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

  it("lastSyncAt null → lag null (heartbeat indisponível)", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findUniqueMock.mockResolvedValue({
      id: "conn-1",
      lastSyncAt: null,
    });
    auditCountMock.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    factsMetaCountMock.mockResolvedValue(0);

    const result = await getConnectionHealthSnapshot("conn-1");

    expect(result.success).toBe(true);
    expect(result.data?.lastSyncAt).toBeNull();
    expect(result.data?.lastSyncLagMinutes).toBeNull();
    expect(result.data?.syncRunsLast24h).toBe(0);
  });

  it("conta correta de syncErrorsLast24h (polling_sync_failed)", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findUniqueMock.mockResolvedValue({
      id: "conn-1",
      lastSyncAt: new Date(),
    });
    // 1ª chamada = polling_sync_completed; 2ª = polling_sync_failed
    auditCountMock.mockResolvedValueOnce(50).mockResolvedValueOnce(7);
    factsMetaCountMock.mockResolvedValue(0);

    const result = await getConnectionHealthSnapshot("conn-1");

    expect(result.data?.syncErrorsLast24h).toBe(7);

    // Verifica filter da 2ª query (errors)
    const errorsCall = auditCountMock.mock.calls[1]?.[0] as {
      where: { action: string };
    };
    expect(errorsCall.where.action).toBe("polling_sync_failed");

    // Verifica filter da 1ª query (completed)
    const completedCall = auditCountMock.mock.calls[0]?.[0] as {
      where: { action: string };
    };
    expect(completedCall.where.action).toBe("polling_sync_completed");
  });
});
