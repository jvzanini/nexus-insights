import { Queue } from "bullmq";
import { redis } from "@/lib/redis";

/**
 * Lazy-instantiated queues para BullMQ. Singletons ao processo:
 * a primeira chamada constrói, as seguintes reusam.
 *
 * Por que lazy? Evita conectar ao Redis no import time, o que quebraria
 * tests que mockam o módulo inteiro com `jest.mock("../queues", ...)`.
 *
 * - chatwoot-sync-delta: jobs de polling delta (alto volume, retry com
 *   backoff exponencial).
 * - chatwoot-sync-sweep: jobs de full sweep (baixo volume, sem retry —
 *   roda novamente no próximo cron diário).
 */

let _deltaSyncQueue: Queue | undefined;
let _fullSweepQueue: Queue | undefined;

export function getDeltaSyncQueue(): Queue {
  if (!_deltaSyncQueue) {
    _deltaSyncQueue = new Queue("chatwoot-sync-delta", {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return _deltaSyncQueue;
}

export function getFullSweepQueue(): Queue {
  if (!_fullSweepQueue) {
    _fullSweepQueue = new Queue("chatwoot-sync-sweep", {
      connection: redis,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 30 },
        removeOnFail: { count: 30 },
      },
    });
  }
  return _fullSweepQueue;
}
