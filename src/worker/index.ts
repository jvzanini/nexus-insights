import { Worker, Queue } from "bullmq";
import { configureWebhookRouting } from "@nexusai360/webhook-routing";
import { redis } from "../lib/redis";
import { webhookAdapter } from "../lib/webhook/adapter";
import { createDeliveryWorker } from "./delivery";

// Configurar adapter do @nexusai360/webhook-routing no singleton do pacote
// (chamadas a listRoutes/markDelivery vindas de dentro do pacote usam este adapter).
configureWebhookRouting(webhookAdapter);
import {
  startOrphanRecoveryScheduler,
  stopOrphanRecoveryScheduler,
} from "./orphan-recovery";
import {
  startDlqCleanupScheduler,
  stopDlqCleanupScheduler,
} from "./dlq-cleanup";
import { runLogCleanup } from "./log-cleanup";
import { runNotificationCleanup } from "./notification-cleanup";
import { runMetaDriftCheck } from "./jobs/meta-drift-check";

console.log("[worker] Starting Nexus webhook worker...");
console.log(`[worker] Node.js ${process.version}`);
console.log(`[worker] PID: ${process.pid}`);

// ─── Inicializar Workers ────────────────────────────────────────

const deliveryWorker = createDeliveryWorker();

// ─── Inicializar Orphan Recovery ────────────────────────────────

const orphanRecoveryIntervalMs = process.env.ORPHAN_RECOVERY_INTERVAL_MS
  ? parseInt(process.env.ORPHAN_RECOVERY_INTERVAL_MS, 10)
  : 5 * 60 * 1000; // 5 min default

startOrphanRecoveryScheduler({
  intervalMs: orphanRecoveryIntervalMs,
});

// ─── Inicializar DLQ Cleanup ────────────────────────────────────

startDlqCleanupScheduler();

// ─── Cleanup Queue (BullMQ repeat) ─────────────────────────────

const cleanupQueue = new Queue("cleanup", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

async function scheduleCleanupJobs() {
  // Remove jobs repetidos antigos para evitar duplicatas no restart
  const repeatableJobs = await cleanupQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await cleanupQueue.removeRepeatableByKey(job.key);
  }

  await cleanupQueue.add(
    "log-cleanup",
    {},
    {
      repeat: {
        pattern: "0 0 * * *", // Todo dia a meia-noite
      },
    }
  );

  await cleanupQueue.add(
    "notification-cleanup",
    {},
    {
      repeat: {
        pattern: "0 0 * * *", // Todo dia a meia-noite
      },
    }
  );

  const metaDriftPattern = process.env.META_DRIFT_CHECK_CRON ?? "0 3 * * *";
  await cleanupQueue.add(
    "meta-drift-check",
    {},
    {
      repeat: {
        pattern: metaDriftPattern,
      },
    }
  );

  console.log(
    `[worker] Cleanup jobs agendados (cleanup diario 00:00, meta-drift '${metaDriftPattern}')`
  );
}

const cleanupWorker = new Worker(
  "cleanup",
  async (job) => {
    switch (job.name) {
      case "log-cleanup":
        await runLogCleanup();
        break;
      case "notification-cleanup":
        await runNotificationCleanup();
        break;
      case "meta-drift-check":
        await runMetaDriftCheck();
        break;
      default:
        console.warn(`[worker] Unknown cleanup job: ${job.name}`);
    }
  },
  { connection: redis, concurrency: 1 }
);

cleanupWorker.on("completed", (job) => {
  console.log(`[worker] Cleanup job ${job.name} completed`);
});

cleanupWorker.on("failed", (job, err) => {
  console.error(`[worker] Cleanup job ${job?.name} failed:`, err.message);
});

scheduleCleanupJobs().catch((err) => {
  console.error("[worker] Falha ao agendar cleanup jobs:", err);
});

console.log("[worker] All workers initialized");

// ─── Graceful Shutdown ──────────────────────────────────────────

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[worker] Received ${signal}. Starting graceful shutdown...`);

  // Timeout de segurança: força exit após 30s
  const forceExitTimeout = setTimeout(() => {
    console.error("[worker] Graceful shutdown timeout exceeded. Forcing exit.");
    process.exit(1);
  }, 30_000);
  forceExitTimeout.unref();

  try {
    // 1. Parar de aceitar novos jobs
    console.log("[worker] Closing delivery worker...");
    await deliveryWorker.close();

    // 2. Parar orphan-recovery
    console.log("[worker] Stopping orphan-recovery scheduler...");
    stopOrphanRecoveryScheduler();

    // 3. Parar DLQ cleanup
    console.log("[worker] Stopping DLQ cleanup scheduler...");
    stopDlqCleanupScheduler();

    // 4. Parar cleanup worker e queue
    console.log("[worker] Closing cleanup worker and queue...");
    await cleanupWorker.close();
    await cleanupQueue.close();

    console.log("[worker] Graceful shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("[worker] Error during shutdown:", (err as Error).message);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ─── Uncaught Errors ────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  console.error("[worker] Uncaught exception:", err);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("[worker] Unhandled rejection:", reason);
  // Não shutdown — apenas log. BullMQ gerencia jobs individuais.
});
