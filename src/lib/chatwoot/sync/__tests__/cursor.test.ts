import { mockDeep, mockReset } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "@/lib/prisma";
import { getOrCreateCursor, advanceCursor, recordCursorError } from "../cursor";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => mockReset(prismaMock));

describe("getOrCreateCursor", () => {
  it("retorna cursor existente quando encontrado", async () => {
    prismaMock.chatwootSyncCursor.findUnique.mockResolvedValue({
      id: "uuid-1",
      connectionId: "conn-1",
      accountId: 9,
      tableName: "conversations",
      lastSyncedAt: new Date("2026-05-04T00:00:00Z"),
      lastSyncedId: null,
      rowsSynced: BigInt(1234),
      lastRunMs: 50,
      lastError: null,
      lastErrorAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const c = await getOrCreateCursor("conn-1", 9, "conversations");
    expect(c.lastSyncedAt).toEqual(new Date("2026-05-04T00:00:00Z"));
    expect(prismaMock.chatwootSyncCursor.create).not.toHaveBeenCalled();
  });

  it("cria cursor zero quando não existe", async () => {
    prismaMock.chatwootSyncCursor.findUnique.mockResolvedValue(null);
    prismaMock.chatwootSyncCursor.create.mockResolvedValue({
      id: "new-uuid",
      connectionId: "conn-1",
      accountId: 9,
      tableName: "conversations",
      lastSyncedAt: null,
      lastSyncedId: null,
      rowsSynced: BigInt(0),
      lastRunMs: null,
      lastError: null,
      lastErrorAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const c = await getOrCreateCursor("conn-1", 9, "conversations");
    expect(c.lastSyncedAt).toBeNull();
    expect(c.rowsSynced).toBe(BigInt(0));
    expect(prismaMock.chatwootSyncCursor.create).toHaveBeenCalledWith({
      data: {
        connectionId: "conn-1",
        accountId: 9,
        tableName: "conversations",
      },
    });
  });
});

describe("advanceCursor", () => {
  it("atualiza lastSyncedAt + rowsSynced + lastRunMs", async () => {
    prismaMock.chatwootSyncCursor.update.mockResolvedValue({} as never);

    await advanceCursor("conn-1", 9, "conversations", {
      lastSyncedAt: new Date("2026-05-04T01:00:00Z"),
      rowsAffected: 42,
      runMs: 120,
    });

    expect(prismaMock.chatwootSyncCursor.update).toHaveBeenCalledWith({
      where: {
        connectionId_accountId_tableName: {
          connectionId: "conn-1",
          accountId: 9,
          tableName: "conversations",
        },
      },
      data: {
        lastSyncedAt: new Date("2026-05-04T01:00:00Z"),
        rowsSynced: { increment: BigInt(42) },
        lastRunMs: 120,
        lastError: null,
        lastErrorAt: null,
      },
    });
  });

  it("também aceita lastSyncedId pra cursor id-based", async () => {
    prismaMock.chatwootSyncCursor.update.mockResolvedValue({} as never);

    await advanceCursor("conn-1", 9, "taggings", {
      lastSyncedId: BigInt(99999),
      rowsAffected: 5,
      runMs: 30,
    });

    expect(prismaMock.chatwootSyncCursor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastSyncedId: BigInt(99999),
          rowsSynced: { increment: BigInt(5) },
        }),
      }),
    );
  });
});

describe("recordCursorError", () => {
  it("grava lastError + lastErrorAt sem perder lastSyncedAt", async () => {
    prismaMock.chatwootSyncCursor.update.mockResolvedValue({} as never);

    const err = new Error("connection refused");
    await recordCursorError("conn-1", 9, "conversations", err, 250);

    expect(prismaMock.chatwootSyncCursor.update).toHaveBeenCalledWith({
      where: {
        connectionId_accountId_tableName: {
          connectionId: "conn-1",
          accountId: 9,
          tableName: "conversations",
        },
      },
      data: {
        lastError: "connection refused",
        lastErrorAt: expect.any(Date),
        lastRunMs: 250,
      },
    });
  });

  it("trunca lastError em 1000 chars (defesa contra blob enormes)", async () => {
    prismaMock.chatwootSyncCursor.update.mockResolvedValue({} as never);

    const longMsg = "x".repeat(5000);
    await recordCursorError("conn-1", 9, "conversations", new Error(longMsg), 250);

    const call = prismaMock.chatwootSyncCursor.update.mock.calls[0]?.[0];
    expect(typeof (call?.data as { lastError?: unknown }).lastError).toBe("string");
    expect(((call?.data as { lastError: string }).lastError).length).toBeLessThanOrEqual(1000);
  });
});
