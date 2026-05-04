/**
 * B16 — processDeltaSyncJob
 *
 * Processor BullMQ que delega pra `runDeltaSync(connectionId)` da camada lib.
 * Audit:
 *   - polling_sync_failed: 100% (raro)
 *   - polling_sync_completed: sample 1/100 (Math.random() < 1/100), com
 *     details enxutos (versão Apêndice C — topTables top 3 por rowsAffected).
 *
 * Erros do `runDeltaSync` (recuperáveis: probe falhou, table-sync falhou) NÃO
 * propagam — `runDeltaSync` já registra erros nos cursors. Apenas erro
 * não-recuperável (throw fora de runDeltaSync) propaga pra retry BullMQ.
 */

const runDeltaSyncMock = jest.fn();
jest.mock("@/lib/chatwoot/sync/run-delta-sync", () => ({
  runDeltaSync: runDeltaSyncMock,
}));

const logAuditMock = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));

import { processDeltaSyncJob } from "../delta-sync";

beforeEach(() => {
  jest.clearAllMocks();
  // Forçar amostragem audit success previsível.
  jest.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("processDeltaSyncJob", () => {
  it("delega pra runDeltaSync e NÃO audita success quando sample não acerta (1/100)", async () => {
    runDeltaSyncMock.mockResolvedValue({
      connectionId: "conn-1",
      startedAt: new Date(),
      finishedAt: new Date(),
      totalDurationMs: 100,
      perTable: [],
      errors: [],
      hadChanges: false,
    });

    const job = { id: "delta:conn-1:123", data: { connectionId: "conn-1" } };
    await processDeltaSyncJob(job as never);

    expect(runDeltaSyncMock).toHaveBeenCalledWith("conn-1");
    // Math.random() = 0.5 ≥ 1/100 → não loga success.
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("audita polling_sync_completed (sample 1/100) com details enxutos topTables", async () => {
    runDeltaSyncMock.mockResolvedValue({
      connectionId: "conn-1",
      startedAt: new Date(),
      finishedAt: new Date(),
      totalDurationMs: 250,
      perTable: [
        {
          tableName: "messages",
          rowsRead: 100,
          rowsAffected: 50,
          nextCursor: { kind: "timestamp", value: new Date() },
          durationMs: 80,
        },
        {
          tableName: "conversations",
          rowsRead: 30,
          rowsAffected: 20,
          nextCursor: { kind: "timestamp", value: new Date() },
          durationMs: 40,
        },
        {
          tableName: "users",
          rowsRead: 10,
          rowsAffected: 5,
          nextCursor: { kind: "timestamp", value: new Date() },
          durationMs: 20,
        },
        {
          tableName: "teams",
          rowsRead: 2,
          rowsAffected: 1,
          nextCursor: { kind: "timestamp", value: new Date() },
          durationMs: 10,
        },
      ],
      errors: [],
      hadChanges: true,
    });
    // Forçar sample acertar.
    (Math.random as jest.Mock).mockReturnValue(0.001);

    const job = { id: "delta:conn-1:123", data: { connectionId: "conn-1" } };
    await processDeltaSyncJob(job as never);

    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "polling_sync_completed",
        targetType: "nexus_chat_connection",
        targetId: "conn-1",
        details: expect.objectContaining({
          durationMs: 250,
          totalRows: 76,
          hadChanges: true,
          topTables: [
            { table: "messages", rows: 50 },
            { table: "conversations", rows: 20 },
            { table: "users", rows: 5 },
          ],
        }),
      }),
    );
  });

  it("audita polling_sync_failed quando há erros (100% logging)", async () => {
    runDeltaSyncMock.mockResolvedValue({
      connectionId: "conn-1",
      startedAt: new Date(),
      finishedAt: new Date(),
      totalDurationMs: 100,
      perTable: [],
      errors: [{ tableName: "messages", accountId: 9, error: "boom" }],
      hadChanges: false,
    });

    const job = { id: "delta:conn-1:123", data: { connectionId: "conn-1" } };
    await processDeltaSyncJob(job as never);

    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "polling_sync_failed",
        targetType: "nexus_chat_connection",
        targetId: "conn-1",
        details: expect.objectContaining({
          errorCount: 1,
        }),
      }),
    );
  });

  it("propaga erro pra BullMQ retry quando runDeltaSync rejeita (não-recuperável)", async () => {
    runDeltaSyncMock.mockRejectedValue(new Error("infra down"));
    const job = { id: "delta:conn-1:123", data: { connectionId: "conn-1" } };

    await expect(processDeltaSyncJob(job as never)).rejects.toThrow(
      "infra down",
    );
  });
});
