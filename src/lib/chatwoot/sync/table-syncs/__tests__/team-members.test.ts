import { mockDeep } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const queryNexusChatMock = jest.fn();
jest.mock("@/lib/nexus-chat/pool", () => ({
  queryNexusChat: queryNexusChatMock,
}));

const cursorMock = { getOrCreateCursor: jest.fn() };
jest.mock("../../cursor", () => cursorMock);

import { teamMembersSync } from "../team-members";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("teamMembersSync", () => {
  it("usa cursor null = id 0 e busca primeiro batch", async () => {
    cursorMock.getOrCreateCursor.mockResolvedValue({
      lastSyncedAt: null,
      lastSyncedId: null,
    });
    queryNexusChatMock.mockResolvedValue({
      rows: [
        {
          id: 1n,
          user_id: 5,
          team_id: 2,
          account_id: 9,
        },
      ],
    });

    const result = await teamMembersSync.run({ connectionId: "conn-1", accountId: 9 });

    expect(queryNexusChatMock).toHaveBeenCalledWith(
      "conn-1",
      expect.stringContaining("FROM team_members"),
      expect.arrayContaining([9, expect.anything()]),
    );
    expect(result.tableName).toBe("team_members");
    expect(result.rowsRead).toBe(1);
    expect(result.nextCursor).toEqual({ kind: "id", value: 1n });
  });

  it("retorna nextCursor.kind=none quando 0 rows", async () => {
    cursorMock.getOrCreateCursor.mockResolvedValue({
      lastSyncedAt: null,
      lastSyncedId: 100n,
    });
    queryNexusChatMock.mockResolvedValue({ rows: [] });

    const result = await teamMembersSync.run({ connectionId: "conn-1", accountId: 9 });

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

    await teamMembersSync.run({
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
