jest.mock("@/lib/prisma", () => ({
  prisma: {
    companyChatBinding: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/reports/active-account", () => ({
  getActiveAccountId: jest.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { getActiveConnectionId } from "../active-connection";
import {
  NoActiveBindingError,
  AmbiguousBindingError,
} from "@/lib/nexus-chat/errors";

const findManyMock = (
  prisma as unknown as { companyChatBinding: { findMany: jest.Mock } }
).companyChatBinding.findMany;
const accountMock = getActiveAccountId as jest.Mock;

const fakeUser = {
  id: "u1",
  platformRole: "admin",
  email: "x@y.z",
} as never;

beforeEach(() => {
  findManyMock.mockReset();
  accountMock.mockReset().mockResolvedValue(42);
});

describe("getActiveConnectionId", () => {
  it("retorna connectionId quando há exatamente 1 binding enabled para account ativo", async () => {
    findManyMock.mockResolvedValue([{ id: "b1", connectionId: "c1" }]);

    const id = await getActiveConnectionId(fakeUser);

    expect(id).toBe("c1");
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          chatwootAccountId: 42,
          enabled: true,
          deletedAt: null,
          connection: expect.objectContaining({
            deletedAt: null,
            status: "active",
          }),
        }),
      }),
    );
  });

  it("lança NoActiveBindingError se 0 bindings enabled", async () => {
    findManyMock.mockResolvedValue([]);

    await expect(getActiveConnectionId(fakeUser)).rejects.toBeInstanceOf(
      NoActiveBindingError,
    );
  });

  it("lança AmbiguousBindingError se 2+ bindings enabled (defesa em profundidade)", async () => {
    findManyMock.mockResolvedValue([
      { id: "b1", connectionId: "c1" },
      { id: "b2", connectionId: "c2" },
    ]);

    await expect(getActiveConnectionId(fakeUser)).rejects.toMatchObject({
      name: "AmbiguousBindingError",
      accountId: 42,
      connectionIds: ["c1", "c2"],
    });
  });

  it("propaga erro se getActiveAccountId falha (fail-closed)", async () => {
    accountMock.mockRejectedValue(new Error("NoAccessibleAccountError"));

    await expect(getActiveConnectionId(fakeUser)).rejects.toThrow(
      "NoAccessibleAccountError",
    );
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
