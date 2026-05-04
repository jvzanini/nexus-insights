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
import { listRecentSyncRuns } from "../sync-stream";

const userMock = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const findManyMock = (
  prisma as unknown as { auditLog: { findMany: jest.Mock } }
).auditLog.findMany;

beforeEach(() => {
  userMock.mockReset();
  findManyMock.mockReset();
});

describe("listRecentSyncRuns", () => {
  it("rejeita não-super_admin", async () => {
    userMock.mockResolvedValue({ id: "u1", platformRole: "manager" } as never);

    const r = await listRecentSyncRuns({ connectionId: "c1", limit: 50 });

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/super_admin/i);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("retorna events com filtro polling_* correto", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    const fixedDate = new Date("2026-05-04T12:00:00Z");
    findManyMock.mockResolvedValue([
      {
        id: "1",
        action: "polling_sync_completed",
        createdAt: fixedDate,
        details: { totalRows: 5 },
      },
      {
        id: "2",
        action: "polling_sync_failed",
        createdAt: fixedDate,
        details: { error: "boom" },
      },
    ]);

    const r = await listRecentSyncRuns({ connectionId: "c1", limit: 50 });

    expect(r.success).toBe(true);
    expect(r.data).toEqual([
      {
        id: "1",
        action: "polling_sync_completed",
        createdAt: fixedDate.toISOString(),
        details: { totalRows: 5 },
      },
      {
        id: "2",
        action: "polling_sync_failed",
        createdAt: fixedDate.toISOString(),
        details: { error: "boom" },
      },
    ]);

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetType: "nexus_chat_connection",
          targetId: "c1",
          action: {
            in: expect.arrayContaining([
              "polling_sync_completed",
              "polling_sync_failed",
              "polling_full_sweep_started",
              "polling_full_sweep_completed",
              "polling_interval_updated",
            ]),
          },
        }),
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    );
  });

  it("clamp limit em 500 max", async () => {
    userMock.mockResolvedValue({
      id: "u1",
      platformRole: "super_admin",
    } as never);
    findManyMock.mockResolvedValue([]);

    await listRecentSyncRuns({ connectionId: "c1", limit: 9999 });

    const args = findManyMock.mock.calls[0]?.[0] as { take: number };
    expect(args?.take).toBe(500);
  });
});
