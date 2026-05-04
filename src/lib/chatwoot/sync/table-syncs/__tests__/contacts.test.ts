import { mockDeep } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const queryNexusChatMock = jest.fn();
jest.mock("@/lib/nexus-chat/pool", () => ({
  queryNexusChat: queryNexusChatMock,
}));

const cursorMock = { getOrCreateCursor: jest.fn() };
jest.mock("../../cursor", () => cursorMock);

import { contactsSync } from "../contacts";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("contactsSync", () => {
  it("usa cursor null = ISO 1970 e busca primeiro batch", async () => {
    cursorMock.getOrCreateCursor.mockResolvedValue({
      lastSyncedAt: null,
      lastSyncedId: null,
    });
    queryNexusChatMock.mockResolvedValue({
      rows: [
        {
          id: 1,
          account_id: 9,
          name: "Joao",
          email: "joao@ex.com",
          phone_number: "+5511999999999",
          created_at: new Date("2026-05-04T01:00:00Z"),
          updated_at: new Date("2026-05-04T01:00:00Z"),
        },
      ],
    });

    const result = await contactsSync.run({ connectionId: "conn-1", accountId: 9 });

    expect(queryNexusChatMock).toHaveBeenCalledWith(
      "conn-1",
      expect.stringContaining("FROM contacts"),
      expect.arrayContaining([9, expect.any(Date)]),
    );
    expect(result.tableName).toBe("contacts");
    expect(result.rowsRead).toBe(1);
    expect(result.nextCursor).toEqual({
      kind: "timestamp",
      value: new Date("2026-05-04T01:00:00Z"),
    });
  });

  it("retorna nextCursor.kind=none quando 0 rows", async () => {
    cursorMock.getOrCreateCursor.mockResolvedValue({
      lastSyncedAt: new Date("2026-05-04T00:00:00Z"),
      lastSyncedId: null,
    });
    queryNexusChatMock.mockResolvedValue({ rows: [] });

    const result = await contactsSync.run({ connectionId: "conn-1", accountId: 9 });

    expect(result.rowsRead).toBe(0);
    expect(result.rowsAffected).toBe(0);
    expect(result.nextCursor).toEqual({ kind: "none" });
  });

  it("respeita batchLimit", async () => {
    cursorMock.getOrCreateCursor.mockResolvedValue({
      lastSyncedAt: new Date("2026-05-04T00:00:00Z"),
      lastSyncedId: null,
    });
    queryNexusChatMock.mockResolvedValue({ rows: [] });

    await contactsSync.run({
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
