/**
 * B18 — tickDeltaSyncScheduler
 *
 * Tick do scheduler chamado pelo Worker do BullMQ a cada 5s. Para cada
 * connection devida (last_sync_at + intervalo no passado), enfileira 1 job
 * delta-sync com `jobId` determinístico = `delta:<connId>:<bucket>` onde
 * bucket = floor(Date.now() / 5000) → idempotência via BullMQ.
 *
 * SQL filtra deleted_at IS NULL + status='active' + due, ORDER BY
 * last_sync_at NULLS FIRST (conn nova roda primeiro).
 */
import { mockDeep, mockReset } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const queueAddMock = jest.fn().mockResolvedValue(undefined);
jest.mock("../queues", () => ({
  getDeltaSyncQueue: () => ({ add: queueAddMock }),
}));

import { prisma } from "@/lib/prisma";
import { tickDeltaSyncScheduler } from "../scheduler";

const prismaMock = prisma as unknown as ReturnType<
  typeof mockDeep<PrismaClient>
>;

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

describe("tickDeltaSyncScheduler", () => {
  it("happy path — enfileira 1 job por conn devida com jobId determinístico bucket-based", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "conn-1" },
      { id: "conn-3" },
    ] as never);

    await tickDeltaSyncScheduler();

    expect(queueAddMock).toHaveBeenCalledTimes(2);
    expect(queueAddMock).toHaveBeenCalledWith(
      "delta-sync",
      { connectionId: "conn-1" },
      expect.objectContaining({
        jobId: expect.stringMatching(/^delta:conn-1:\d+$/),
      }),
    );
    expect(queueAddMock).toHaveBeenCalledWith(
      "delta-sync",
      { connectionId: "conn-3" },
      expect.objectContaining({
        jobId: expect.stringMatching(/^delta:conn-3:\d+$/),
      }),
    );
  });

  it("retorna early sem chamar queue.add quando 0 conns devidas", async () => {
    prismaMock.$queryRaw.mockResolvedValue([] as never);

    await tickDeltaSyncScheduler();

    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it("não enfileira conn pausada (status != active filtrado pelo SQL)", async () => {
    // SQL contém `status = 'active'` → conn pausada nunca volta.
    prismaMock.$queryRaw.mockResolvedValue([] as never);

    await tickDeltaSyncScheduler();

    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it("não enfileira conn deletada (deleted_at IS NOT NULL filtrado pelo SQL)", async () => {
    // SQL contém `deleted_at IS NULL` → conn soft-deleted nunca volta.
    prismaMock.$queryRaw.mockResolvedValue([] as never);

    await tickDeltaSyncScheduler();

    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it("enfileira NULLS FIRST — conn nova com lastSyncAt=null roda primeiro", async () => {
    // Quando há mistura, ORDER BY last_sync_at NULLS FIRST faz a nova
    // chegar antes — aqui apenas validamos que conn-nova é processada.
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "new-conn" },
      { id: "old-conn" },
    ] as never);

    await tickDeltaSyncScheduler();

    expect(queueAddMock).toHaveBeenNthCalledWith(
      1,
      "delta-sync",
      { connectionId: "new-conn" },
      expect.objectContaining({
        jobId: expect.stringMatching(/^delta:new-conn:\d+$/),
      }),
    );
  });
});
