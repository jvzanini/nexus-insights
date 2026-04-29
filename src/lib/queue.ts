import { Queue } from "bullmq";
import { redis } from "./redis";

const defaultJobOptions = {
  removeOnComplete: 1000,
  removeOnFail: 1000,
};

export const auditWriteQueue = new Queue("audit-write", {
  connection: redis,
  defaultJobOptions,
});

export const prewarmLiveQueue = new Queue("prewarm-live", {
  connection: redis,
  defaultJobOptions,
});

export const prewarmHistoricalQueue = new Queue("prewarm-historical", {
  connection: redis,
  defaultJobOptions,
});

export const housekeepingQueue = new Queue("housekeeping", {
  connection: redis,
  defaultJobOptions,
});
