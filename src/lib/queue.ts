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

export const refreshByAccountQueue = new Queue("refresh-by-account", {
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  },
});

export const refreshByInboxQueue = new Queue("refresh-by-inbox", {
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  },
});

export const refreshByAgentQueue = new Queue("refresh-by-agent", {
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  },
});

export const refreshByTeamQueue = new Queue("refresh-by-team", {
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  },
});
