import { Worker } from "bullmq";
import { redis } from "../lib/redis";

console.log("[worker] Starting Nexus Insights worker…");
console.log(`[worker] Node.js ${process.version}, PID: ${process.pid}`);

const auditWriteWorker = new Worker(
  "audit-write",
  async (job) => {
    console.log("[worker.audit-write] processing", job.id);
    // Placeholder: persistência será implementada na fase de jobs reais.
  },
  { connection: redis, concurrency: 5 },
);

const housekeepingWorker = new Worker(
  "housekeeping",
  async (job) => {
    console.log("[worker.housekeeping] processing", job.id, job.name);
    // Placeholder.
  },
  { connection: redis, concurrency: 1 },
);

console.log("[worker] Workers iniciados:", [
  auditWriteWorker.name,
  housekeepingWorker.name,
]);

async function shutdown(signal: string) {
  console.log(`[worker] Recebido ${signal}, encerrando…`);
  await Promise.all([auditWriteWorker.close(), housekeepingWorker.close()]);
  await redis.quit();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
