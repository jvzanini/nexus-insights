import { mockDeep } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const queryNexusChatMock = jest.fn();
jest.mock("@/lib/nexus-chat/pool", () => ({
  queryNexusChat: queryNexusChatMock,
}));

const cursorMock = { getOrCreateCursor: jest.fn() };
jest.mock("../../cursor", () => cursorMock);

import { taggingsSync } from "../taggings";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("taggingsSync", () => {
  it("usa cursor null = id 0 e busca primeiro batch", async () => {
    cursorMock.getOrCreateCursor.mockResolvedValue({
      lastSyncedAt: null,
      lastSyncedId: null,
    });
    queryNexusChatMock.mockResolvedValue({
      rows: [
        {
          id: 1n,
          tag_id: 10,
          taggable_id: 100,
          taggable_type: "Conversation",
          account_id: 9,
        },
      ],
    });

    const result = await taggingsSync.run({ connectionId: "conn-1", accountId: 9 });

    expect(queryNexusChatMock).toHaveBeenCalledWith(
      "conn-1",
      expect.stringContaining("FROM taggings"),
      expect.arrayContaining([9, expect.anything()]),
    );
    expect(result.tableName).toBe("taggings");
    expect(result.rowsRead).toBe(1);
    expect(result.nextCursor).toEqual({ kind: "id", value: 1n });
  });

  it("retorna nextCursor.kind=none quando 0 rows", async () => {
    cursorMock.getOrCreateCursor.mockResolvedValue({
      lastSyncedAt: null,
      lastSyncedId: 100n,
    });
    queryNexusChatMock.mockResolvedValue({ rows: [] });

    const result = await taggingsSync.run({ connectionId: "conn-1", accountId: 9 });

    expect(result.rowsRead).toBe(0);
    expect(result.rowsAffected).toBe(0);
    expect(result.nextCursor).toEqual({ kind: "none" });
  });

  it("respeita batchLimit", async () => {
    cursorMock.getOrCreateCursor.mockResolvedValue({
      lastSyncedAt: null,
      lastSyncedId: 50n,
    });
    queryNexusChatMock.mockResolvedValue({ rows: [] });

    await taggingsSync.run({
      connectionId: "conn-1",
      accountId: 9,
      batchLimit: 100,
    });

    expect(queryNexusChatMock).toHaveBeenCalledWith(
      "conn-1",
      expect.stringContaining("LIMIT 100"),
      expect.any(Array),
    );
  });
});
