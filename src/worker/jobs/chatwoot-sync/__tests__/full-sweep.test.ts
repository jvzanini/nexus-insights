/**
 * B17 — processFullSweepJob
 *
 * Processor que loga `polling_full_sweep_started` antes + `polling_full_sweep_completed`
 * depois (100% audit, raros — disparados pelo cron diário 03:00 BRT).
 * Delega pra `runFullSweep(connectionId)`.
 */

const runFullSweepMock = jest.fn();
jest.mock("@/lib/chatwoot/sync/run-full-sweep", () => ({
  runFullSweep: runFullSweepMock,
}));

const logAuditMock = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));

import { processFullSweepJob } from "../full-sweep";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("processFullSweepJob", () => {
  it("audita started antes e completed depois (100% logging)", async () => {
    runFullSweepMock.mockResolvedValue({
      connectionId: "conn-1",
      startedAt: new Date(),
      finishedAt: new Date(),
      totalDurationMs: 1500,
      perTable: [
        {
          tableName: "conversations",
          rowsRead: 1000,
          rowsAffected: 0,
          nextCursor: { kind: "none" },
          durationMs: 800,
        },
      ],
      errors: [],
      hadChanges: false,
    });

    const job = {
      id: "sweep:conn-1",
      name: "sweep-conn",
      data: { connectionId: "conn-1" },
    };
    await processFullSweepJob(job as never);

    expect(runFullSweepMock).toHaveBeenCalledWith("conn-1");

    const calls = logAuditMock.mock.calls.map((c) => c[0]);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        action: "polling_full_sweep_started",
        targetType: "nexus_chat_connection",
        targetId: "conn-1",
      }),
    );
    expect(calls[1]).toEqual(
      expect.objectContaining({
        action: "polling_full_sweep_completed",
        targetType: "nexus_chat_connection",
        targetId: "conn-1",
        details: expect.objectContaining({
          durationMs: 1500,
          tables: 1,
          errors: 0,
        }),
      }),
    );
  });

  it("audita completed mesmo quando há erros parciais (não propaga)", async () => {
    runFullSweepMock.mockResolvedValue({
      connectionId: "conn-2",
      startedAt: new Date(),
      finishedAt: new Date(),
      totalDurationMs: 2000,
      perTable: [],
      errors: [{ tableName: "messages", accountId: 9, error: "timeout" }],
      hadChanges: false,
    });

    const job = {
      id: "sweep:conn-2",
      name: "sweep-conn",
      data: { connectionId: "conn-2" },
    };
    await processFullSweepJob(job as never);

    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "polling_full_sweep_completed",
        details: expect.objectContaining({ errors: 1 }),
      }),
    );
  });
});
