import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { redis } from "../lib/redis";
import {
  auditWriteQueue,
  housekeepingQueue,
  refreshByAccountQueue,
  refreshByAgentQueue,
  refreshByInboxQueue,
  refreshByTeamQueue,
} from "../lib/queue";
import {
  integrationsRefreshDimQueue,
  integrationsReconcileQueue,
} from "../lib/integrations/queue";
import { processRefreshByAccount } from "./jobs/pre-agregacao/refresh-by-account";
import { processRefreshByInbox } from "./jobs/pre-agregacao/refresh-by-inbox";
import { processRefreshByAgent } from "./jobs/pre-agregacao/refresh-by-agent";
import { processRefreshByTeam } from "./jobs/pre-agregacao/refresh-by-team";
import { processHousekeeping } from "./jobs/pre-agregacao/housekeeping";
import { processRefreshDimSnapshots } from "./jobs/integrations/refresh-dim-snapshots";
import { processReconcileIntegrations } from "./jobs/integrations/reconcile-integrations";
import { runConnectionsSeedIfNeeded } from "../lib/nexus-chat/seed";
import { invalidateNexusChatPool } from "../lib/nexus-chat/pool";
import { CHANNEL as REALTIME_CHANNEL } from "../lib/realtime";

console.log("[worker] Starting Nexus Insights worker…");
console.log(`[worker] Node.js ${process.version}, PID: ${process.pid}`);

// ─── Multi-tenant: seed inicial + listener Pub/Sub ────────────────────────

runConnectionsSeedIfNeeded()
  .then((result) => {
    if (result.seeded) {
      console.log(
        `[worker.seed] connection ${result.connectionId} criada com ${result.bindingsCreated} bindings`,
      );
    } else {
      console.log("[worker.seed] já rodou ou outro processo segura o lock");
    }
  })
  .catch((err) => {
    console.error("[worker.seed] falhou:", err);
  });

// Listener Pub/Sub para invalidar pool dinâmico ao receber connection:updated
// ou connection:deleted (publicado pelas Server Actions de edit/delete).
if (process.env.REDIS_URL) {
  const subscriber = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  subscriber
    .subscribe(REALTIME_CHANNEL)
    .then(() => {
      subscriber.on("message", (_channel, message) => {
        try {
          const ev = JSON.parse(message) as { type?: string; connectionId?: string };
          if (
            (ev.type === "connection:updated" ||
              ev.type === "connection:deleted") &&
            ev.connectionId
          ) {
            invalidateNexusChatPool(ev.connectionId).catch((err) =>
              console.warn(
                "[worker.pubsub] invalidateNexusChatPool falhou (ignorado):",
                err.message,
              ),
            );
          }
        } catch {
          // payload malformado — ignorar silenciosamente.
        }
      });
      console.log(
        `[worker.pubsub] inscrito em ${REALTIME_CHANNEL} para invalidação de pools`,
      );
    })
    .catch((err) => {
      console.error("[worker.pubsub] subscribe falhou:", err);
    });
}

// ─── Workers ──────────────────────────────────────────────────────────────

const auditWriteWorker = new Worker(
  "audit-write",
  async (job: Job) => {
    console.log("[worker.audit-write]", job.id);
    // Placeholder: implementação em release futura.
  },
  { connection: redis, concurrency: 5 },
);

const refreshByAccountWorker = new Worker(
  "refresh-by-account",
  async (job: Job) => {
    const result = await processRefreshByAccount(job);
    console.log("[worker.refresh-by-account] done", job.id, result);
    return result;
  },
  { connection: redis, concurrency: 1 },
);

const refreshByInboxWorker = new Worker(
  "refresh-by-inbox",
  async (job: Job) => {
    const result = await processRefreshByInbox(job);
    console.log("[worker.refresh-by-inbox] done", job.id, result);
    return result;
  },
  { connection: redis, concurrency: 1 },
);

const refreshByAgentWorker = new Worker(
  "refresh-by-agent",
  async (job: Job) => {
    const result = await processRefreshByAgent(job);
    console.log("[worker.refresh-by-agent] done", job.id, result);
    return result;
  },
  { connection: redis, concurrency: 1 },
);

const refreshByTeamWorker = new Worker(
  "refresh-by-team",
  async (job: Job) => {
    const result = await processRefreshByTeam(job);
    console.log("[worker.refresh-by-team] done", job.id, result);
    return result;
  },
  { connection: redis, concurrency: 1 },
);

const housekeepingWorker = new Worker(
  "housekeeping",
  async (job: Job) => {
    if (job.name === "facts-housekeeping") {
      const result = await processHousekeeping();
      console.log("[worker.housekeeping] done", job.id, result);
      return result;
    }
    console.log("[worker.housekeeping] no-op", job.id, job.name);
  },
  { connection: redis, concurrency: 1 },
);

const integrationsRefreshDimWorker = new Worker(
  "integrations.refresh-dim-snapshots",
  async (job: Job) => {
    const result = await processRefreshDimSnapshots(job);
    console.log("[worker.integrations.refresh-dim] done", job.id);
    return result;
  },
  { connection: redis, concurrency: 1 },
);

const integrationsReconcileWorker = new Worker(
  "integrations.reconcile",
  async (job: Job) => {
    const result = await processReconcileIntegrations(job);
    console.log("[worker.integrations.reconcile] done", job.id);
    return result;
  },
  { connection: redis, concurrency: 1 },
);

// ─── Schedules (repeatable jobs) ──────────────────────────────────────────

async function scheduleRepeatables() {
  await refreshByAccountQueue.upsertJobScheduler(
    "facts-refresh-by-account",
    { pattern: "*/5 * * * *" },
    { name: "facts-refresh-by-account" },
  );
  await refreshByInboxQueue.upsertJobScheduler(
    "facts-refresh-by-inbox",
    { pattern: "*/5 * * * *" },
    { name: "facts-refresh-by-inbox" },
  );
  await refreshByAgentQueue.upsertJobScheduler(
    "facts-refresh-by-agent",
    { pattern: "*/5 * * * *" },
    { name: "facts-refresh-by-agent" },
  );
  await refreshByTeamQueue.upsertJobScheduler(
    "facts-refresh-by-team",
    { pattern: "*/5 * * * *" },
    { name: "facts-refresh-by-team" },
  );
  await housekeepingQueue.upsertJobScheduler(
    "facts-housekeeping",
    { pattern: "0 3 * * *" },
    { name: "facts-housekeeping" },
  );
  await integrationsRefreshDimQueue.upsertJobScheduler(
    "integrations-refresh-dim",
    { pattern: "*/30 * * * *" },
    { name: "integrations.refresh-dim-snapshots" },
  );
  await integrationsReconcileQueue.upsertJobScheduler(
    "integrations-reconcile",
    { pattern: "0 */6 * * *" },
    { name: "integrations.reconcile" },
  );
  console.log(
    "[worker] Schedules registered: refresh-by-* every 5min, housekeeping daily 03:00, integrations.refresh-dim every 30min, integrations.reconcile every 6h",
  );
}

scheduleRepeatables().catch((err) => {
  console.error("[worker] Failed to register schedules:", err);
});

console.log("[worker] Workers iniciados:", [
  auditWriteWorker.name,
  refreshByAccountWorker.name,
  refreshByInboxWorker.name,
  refreshByAgentWorker.name,
  refreshByTeamWorker.name,
  housekeepingWorker.name,
  integrationsRefreshDimWorker.name,
  integrationsReconcileWorker.name,
]);

// ─── Graceful shutdown ────────────────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`[worker] Recebido ${signal}, encerrando…`);
  await Promise.all([
    auditWriteWorker.close(),
    refreshByAccountWorker.close(),
    refreshByInboxWorker.close(),
    refreshByAgentWorker.close(),
    refreshByTeamWorker.close(),
    housekeepingWorker.close(),
    integrationsRefreshDimWorker.close(),
    integrationsReconcileWorker.close(),
  ]);
  await redis.quit();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
