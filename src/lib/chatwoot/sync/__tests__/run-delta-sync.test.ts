import { mockDeep, mockReset } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const advanceCursorMock = jest.fn();
const recordCursorErrorMock = jest.fn();
jest.mock("../cursor", () => ({
  advanceCursor: advanceCursorMock,
  recordCursorError: recordCursorErrorMock,
  getOrCreateCursor: jest.fn(),
}));

const queryNexusChatMock = jest.fn();
jest.mock("@/lib/nexus-chat/pool", () => ({
  queryNexusChat: queryNexusChatMock,
}));

// 4 queues existentes da pré-agregação (não há queue separada hourly —
// `refreshByAccountQueue` cobre by_account E hourly_by_account no mesmo job).
const refreshByAccountAddMock = jest.fn();
const refreshByInboxAddMock = jest.fn();
const refreshByAgentAddMock = jest.fn();
const refreshByTeamAddMock = jest.fn();
jest.mock("@/lib/queue", () => ({
  refreshByAccountQueue: { add: refreshByAccountAddMock },
  refreshByInboxQueue: { add: refreshByInboxAddMock },
  refreshByAgentQueue: { add: refreshByAgentAddMock },
  refreshByTeamQueue: { add: refreshByTeamAddMock },
}));

const tableSync1 = {
  tableName: "conversations",
  cursorStrategy: "updated_at" as const,
  run: jest.fn(),
};
const tableSync2 = {
  tableName: "messages",
  cursorStrategy: "updated_at" as const,
  run: jest.fn(),
};
jest.mock("../table-syncs", () => ({
  TABLE_SYNCS: [tableSync1, tableSync2],
}));

import { prisma } from "@/lib/prisma";
import { runDeltaSync } from "../run-delta-sync";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => {
  mockReset(prismaMock);
  // Reset apenas os call records — preserva implementations.
  queryNexusChatMock.mockReset();
  advanceCursorMock.mockReset();
  recordCursorErrorMock.mockReset();
  refreshByAccountAddMock.mockReset();
  refreshByInboxAddMock.mockReset();
  refreshByAgentAddMock.mockReset();
  refreshByTeamAddMock.mockReset();
  tableSync1.run.mockReset();
  tableSync2.run.mockReset();
  // Defaults: probe OK + connection ativa + queue.add resolve + cursor mocks resolvem.
  queryNexusChatMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  advanceCursorMock.mockResolvedValue(undefined);
  recordCursorErrorMock.mockResolvedValue(undefined);
  prismaMock.nexusChatConnection.findFirst.mockResolvedValue({
    id: "conn-1",
    pollingIntervalSeconds: 30,
    lastSyncAt: null,
  } as never);
  prismaMock.nexusChatConnection.update.mockResolvedValue({} as never);
  prismaMock.companyChatBinding.findMany.mockResolvedValue([] as never);
  refreshByAccountAddMock.mockResolvedValue(undefined);
  refreshByInboxAddMock.mockResolvedValue(undefined);
  refreshByAgentAddMock.mockResolvedValue(undefined);
  refreshByTeamAddMock.mockResolvedValue(undefined);
});

describe("runDeltaSync", () => {
  it("retorna early com 1 erro quando probe SELECT 1 falha", async () => {
    queryNexusChatMock.mockRejectedValueOnce(new Error("connection refused"));

    const summary = await runDeltaSync("conn-1");

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toEqual({
      tableName: "*probe*",
      accountId: 0,
      error: "connection refused",
    });
    expect(summary.perTable).toEqual([]);
    expect(summary.hadChanges).toBe(false);
    expect(tableSync1.run).not.toHaveBeenCalled();
    expect(prismaMock.companyChatBinding.findMany).not.toHaveBeenCalled();
  });

  it("retorna zero summary quando connection foi deletada", async () => {
    prismaMock.nexusChatConnection.findFirst.mockResolvedValue(null);

    const summary = await runDeltaSync("conn-1");

    expect(summary.connectionId).toBe("conn-1");
    expect(summary.perTable).toEqual([]);
    expect(summary.errors).toEqual([]);
    expect(summary.hadChanges).toBe(false);
    expect(tableSync1.run).not.toHaveBeenCalled();
    expect(prismaMock.companyChatBinding.findMany).not.toHaveBeenCalled();
  });

  it("itera 2 bindings × 2 tables, avança cursors e enfileira refresh-by-* por account com mudança", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([
      { chatwootAccountId: 9, displayName: "Matrix" },
      { chatwootAccountId: 2, displayName: "Invest" },
    ] as never);

    tableSync1.run.mockResolvedValue({
      tableName: "conversations",
      rowsRead: 5,
      rowsAffected: 5,
      nextCursor: { kind: "timestamp", value: new Date("2026-05-04T01:00:00Z") },
      durationMs: 120,
    });
    tableSync2.run.mockResolvedValue({
      tableName: "messages",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs: 30,
    });

    const summary = await runDeltaSync("conn-1");

    // 2 tables × 2 accounts = 4 chamadas de table-sync.run
    expect(tableSync1.run).toHaveBeenCalledTimes(2);
    expect(tableSync2.run).toHaveBeenCalledTimes(2);

    // advanceCursor chamado para cada (account × table) com nextCursor != none
    expect(advanceCursorMock).toHaveBeenCalledTimes(2); // só conversations, 2 accounts
    // (messages teve nextCursor.kind=none, então não avança)

    // 4 queues × 2 accounts = 8 enfileiramentos
    expect(refreshByAccountAddMock).toHaveBeenCalledTimes(2);
    expect(refreshByInboxAddMock).toHaveBeenCalledTimes(2);
    expect(refreshByAgentAddMock).toHaveBeenCalledTimes(2);
    expect(refreshByTeamAddMock).toHaveBeenCalledTimes(2);

    // Chamada deve incluir { connectionId, accountId } no payload
    expect(refreshByAccountAddMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ connectionId: "conn-1", accountId: 9 }),
      expect.any(Object),
    );

    expect(summary.hadChanges).toBe(true);
    expect(summary.errors).toEqual([]);
    expect(summary.perTable).toHaveLength(4);
  });

  it("não enfileira refresh-by-* quando 0 rows alterados em todas as tabelas", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([
      { chatwootAccountId: 9, displayName: "Matrix" },
    ] as never);

    tableSync1.run.mockResolvedValue({
      tableName: "conversations",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs: 5,
    });
    tableSync2.run.mockResolvedValue({
      tableName: "messages",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs: 4,
    });

    const summary = await runDeltaSync("conn-1");

    expect(refreshByAccountAddMock).not.toHaveBeenCalled();
    expect(refreshByInboxAddMock).not.toHaveBeenCalled();
    expect(refreshByAgentAddMock).not.toHaveBeenCalled();
    expect(refreshByTeamAddMock).not.toHaveBeenCalled();
    expect(summary.hadChanges).toBe(false);
  });

  it("captura erro por table-sync sem abortar o run inteiro", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([
      { chatwootAccountId: 9, displayName: "Matrix" },
    ] as never);

    tableSync1.run.mockRejectedValue(new Error("connection refused"));
    tableSync2.run.mockResolvedValue({
      tableName: "messages",
      rowsRead: 3,
      rowsAffected: 3,
      nextCursor: { kind: "timestamp", value: new Date() },
      durationMs: 10,
    });

    const summary = await runDeltaSync("conn-1");

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toEqual({
      tableName: "conversations",
      accountId: 9,
      error: "connection refused",
    });
    expect(recordCursorErrorMock).toHaveBeenCalledTimes(1);
    // messages continua processada e avança cursor
    expect(advanceCursorMock).toHaveBeenCalledTimes(1);
    // account 9 teve mudança em messages → enfileira refresh-by-*
    expect(refreshByAccountAddMock).toHaveBeenCalledTimes(1);
  });

  it("atualiza connection.lastSyncAt ao final mesmo sem mudanças", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([
      { chatwootAccountId: 9, displayName: "Matrix" },
    ] as never);
    tableSync1.run.mockResolvedValue({
      tableName: "conversations",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs: 5,
    });
    tableSync2.run.mockResolvedValue({
      tableName: "messages",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs: 5,
    });

    await runDeltaSync("conn-1");

    expect(prismaMock.nexusChatConnection.update).toHaveBeenCalledWith({
      where: { id: "conn-1" },
      data: { lastSyncAt: expect.any(Date) },
    });
  });
});
