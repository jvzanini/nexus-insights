import { mockDeep, mockReset } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const queryNexusChatMock = jest.fn();
jest.mock("@/lib/nexus-chat/pool", () => ({
  queryNexusChat: queryNexusChatMock,
}));

import { prisma } from "@/lib/prisma";
import { runFullSweep } from "../run-full-sweep";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => {
  mockReset(prismaMock);
  queryNexusChatMock.mockReset();
});

describe("runFullSweep", () => {
  it("para cada (account × tabela): lista IDs no Chatwoot e detecta IDs órfãos", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([
      { chatwootAccountId: 9 },
    ] as never);

    queryNexusChatMock.mockResolvedValue({
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });

    const summary = await runFullSweep("conn-1");

    // 5 tabelas (conversations/messages/inboxes/teams/contacts) × 1 account.
    expect(queryNexusChatMock).toHaveBeenCalledTimes(5);
    // Pelo menos uma chamada precisa ler `conversations` filtrando por account 9.
    const conversationsCall = queryNexusChatMock.mock.calls.find((c) =>
      String(c[1]).includes("FROM conversations"),
    );
    expect(conversationsCall).toBeDefined();
    expect(conversationsCall?.[2]).toEqual([9]);

    expect(summary.connectionId).toBe("conn-1");
    expect(summary.perTable).toHaveLength(5);
    expect(summary.perTable.find((t) => t.tableName === "conversations")).toBeTruthy();
    expect(summary.perTable.find((t) => t.tableName === "messages")).toBeTruthy();
    expect(summary.perTable.find((t) => t.tableName === "inboxes")).toBeTruthy();
    expect(summary.perTable.find((t) => t.tableName === "teams")).toBeTruthy();
    expect(summary.perTable.find((t) => t.tableName === "contacts")).toBeTruthy();
    // v1 só DETECTA — não deleta. rowsAffected sempre 0.
    expect(summary.perTable.every((t) => t.rowsAffected === 0)).toBe(true);
    expect(summary.hadChanges).toBe(false);
    expect(summary.errors).toEqual([]);
  });

  it("retorna early se 0 bindings (sem queries)", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([] as never);

    const summary = await runFullSweep("conn-1");

    expect(summary.perTable).toEqual([]);
    expect(summary.errors).toEqual([]);
    expect(summary.hadChanges).toBe(false);
    expect(queryNexusChatMock).not.toHaveBeenCalled();
  });

  it("erro em 1 tabela não aborta o sweep das demais", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([
      { chatwootAccountId: 9 },
    ] as never);

    // 1ª tabela falha; demais retornam normalmente.
    queryNexusChatMock
      .mockRejectedValueOnce(new Error("timeout reading conversations"))
      .mockResolvedValue({ rows: [{ id: 100 }] });

    const summary = await runFullSweep("conn-1");

    // 5 tentativas — 1 falha + 4 sucessos.
    expect(queryNexusChatMock).toHaveBeenCalledTimes(5);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toEqual({
      tableName: "conversations",
      accountId: 9,
      error: "timeout reading conversations",
    });
    // 4 tabelas sobreviveram.
    expect(summary.perTable).toHaveLength(4);
    expect(summary.hadChanges).toBe(false);
  });
});
