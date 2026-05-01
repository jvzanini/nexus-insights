/**
 * Queues BullMQ para integrações (Power BI dim sync + reconcile).
 *
 * Definidas separadas das queues de pré-agregação (`src/lib/queue.ts`)
 * por isolamento de domínio. Mesma instância Redis.
 */

import { Queue } from "bullmq";
import { redis } from "@/lib/redis";

const defaultJobOptions = {
  removeOnComplete: 100,
  removeOnFail: 100,
};

export const integrationsRefreshDimQueue = new Queue(
  "integrations.refresh-dim-snapshots",
  {
    connection: redis,
    defaultJobOptions,
  },
);

export const integrationsReconcileQueue = new Queue("integrations.reconcile", {
  connection: redis,
  defaultJobOptions,
});
