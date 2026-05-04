// TZ explícito ANTES dos imports — garante que JobScheduler com `tz` use o
// fuso correto e que `Date` instanciado por bibliotecas respeite BRT por
// padrão. Em containers, TZ pode vir do compose; respeitamos se já setado.
process.env.TZ = process.env.TZ ?? "America/Sao_Paulo";

import { Worker, Queue, type Job } from "bullmq";
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
import { processDeltaSyncJob } from "./jobs/chatwoot-sync/delta-sync";
import { processFullSweepJob } from "./jobs/chatwoot-sync/full-sweep";
import { tickDeltaSyncScheduler } from "./jobs/chatwoot-sync/scheduler";
import { getFullSweepQueue } from "./jobs/chatwoot-sync/queues";
import { runConnectionsSeedIfNeeded } from "../lib/nexus-chat/seed";
import { invalidateNexusChatPool } from "../lib/nexus-chat/pool";
import { prisma } from "../lib/prisma";
import { CHANNEL as REALTIME_CHANNEL } from "../lib/realtime";

console.log("[worker] Starting Nexus Insights worker…");
console.log(`[worker] Node.js ${process.version}, PID: ${process.pid}, TZ=${process.env.TZ}`);

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

// ─── Chatwoot polling delta (v0.41) ───────────────────────────────────────
//
// Arquitetura:
//   1. Worker `chatwoot-sync-delta` (concurrency 4) executa runDeltaSync
//      por connection. Idempotência via jobId determinístico do scheduler.
//   2. Queue separada `chatwoot-sync-delta-tick` recebe um repeat-job a
//      cada 5s; um Worker concurrency 1 chama tickDeltaSyncScheduler() →
//      enfileira jobs delta-sync para conns devidas.
//   3. Queue separada `chatwoot-sync-sweep-cron` recebe cron diário
//      03:00 BRT; Worker concurrency 1 dispatcha 1 job filho por
//      connection ativa pra queue `chatwoot-sync-sweep`.
//   4. Worker `chatwoot-sync-sweep` (concurrency 1) executa runFullSweep
//      no job filho.
//
// Por que 2 queues separadas (tick + sweep-cron) em vez de schedulers nas
// próprias queues delta/sweep? JobScheduler precisa enfileirar jobs com
// `data` fixo, mas precisamos de dispatch dinâmico (1 job por connection).
// Separar a queue do scheduler da queue dos workers resolve isso de forma
// limpa e mantém metrics granulares por queue.

const deltaSyncWorker = new Worker(
  "chatwoot-sync-delta",
  processDeltaSyncJob,
  { connection: redis, concurrency: 4 },
);
deltaSyncWorker.on("failed", (job, err) =>
  console.error("[worker.chatwoot-sync-delta] failed:", job?.id, err.message),
);

const deltaTickQueue = new Queue("chatwoot-sync-delta-tick", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});

const deltaTickWorker = new Worker(
  "chatwoot-sync-delta-tick",
  async () => {
    await tickDeltaSyncScheduler();
  },
  { connection: redis, concurrency: 1 },
);
deltaTickWorker.on("failed", (job, err) =>
  console.error("[worker.chatwoot-sync-delta-tick] failed:", job?.id, err.message),
);

const sweepCronQueue = new Queue("chatwoot-sync-sweep-cron", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 30 },
  },
});

const sweepCronWorker = new Worker(
  "chatwoot-sync-sweep-cron",
  async () => {
    // Dispatcher: enfileira 1 sweep job por connection ativa.
    const conns = await prisma.nexusChatConnection.findMany({
      where: { deletedAt: null, status: "active" },
      select: { id: true },
    });
    const sweepQueue = getFullSweepQueue();
    for (const c of conns) {
      await sweepQueue.add("sweep-conn", { connectionId: c.id }).catch((err) =>
        console.warn(
          "[worker.chatwoot-sync-sweep-cron] failed to enqueue:",
          c.id,
          err.message,
        ),
      );
    }
    console.log(
      `[worker.chatwoot-sync-sweep-cron] dispatched ${conns.length} sweep jobs`,
    );
  },
  { connection: redis, concurrency: 1 },
);
sweepCronWorker.on("failed", (job, err) =>
  console.error("[worker.chatwoot-sync-sweep-cron] failed:", job?.id, err.message),
);

const fullSweepWorker = new Worker(
  "chatwoot-sync-sweep",
  processFullSweepJob,
  { connection: redis, concurrency: 1 },
);
fullSweepWorker.on("failed", (job, err) =>
  console.error("[worker.chatwoot-sync-sweep] failed:", job?.id, err.message),
);

// ─── Schedules (repeatable jobs) ──────────────────────────────────────────

async function scheduleRepeatables() {
  // Limpa schedulers antigos da Fase 1 (cron de 5 min) — substituídos por
  // webhook event-driven da Fase 2 + cron fallback 30 min. Idempotente:
  // se o scheduler antigo não existe (cluster novo), o catch silencia.
  const oldSchedulerIds = [
    "facts-refresh-by-account",
    "facts-refresh-by-inbox",
    "facts-refresh-by-agent",
    "facts-refresh-by-team",
  ];
  for (const id of oldSchedulerIds) {
    await refreshByAccountQueue.removeJobScheduler(id).catch(() => {});
    await refreshByInboxQueue.removeJobScheduler(id).catch(() => {});
    await refreshByAgentQueue.removeJobScheduler(id).catch(() => {});
    await refreshByTeamQueue.removeJobScheduler(id).catch(() => {});
  }

  // FALLBACK: pré-agregação roda a cada 30 min como rede de segurança.
  // O gatilho real é runDeltaSync (que enfileira refresh-by-* on-demand).
  // Reduzido de 5min → 30min em v0.41 para evitar overhead duplicado com polling delta.
  await refreshByAccountQueue.upsertJobScheduler(
    "facts-refresh-by-account-fallback",
    { pattern: "*/30 * * * *" },
    { name: "facts-refresh-by-account" },
  );
  await refreshByInboxQueue.upsertJobScheduler(
    "facts-refresh-by-inbox-fallback",
    { pattern: "*/30 * * * *" },
    { name: "facts-refresh-by-inbox" },
  );
  await refreshByAgentQueue.upsertJobScheduler(
    "facts-refresh-by-agent-fallback",
    { pattern: "*/30 * * * *" },
    { name: "facts-refresh-by-agent" },
  );
  await refreshByTeamQueue.upsertJobScheduler(
    "facts-refresh-by-team-fallback",
    { pattern: "*/30 * * * *" },
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

  // Chatwoot polling delta — tick 5s (idempotente via jobId determinístico
  // no próprio tickDeltaSyncScheduler).
  await deltaTickQueue.upsertJobScheduler(
    "chatwoot-sync-delta-tick",
    { every: 5_000 },
    { name: "tick" },
  );

  // Chatwoot full sweep — cron diário 03:00 BRT. tz explícito garante que
  // o crontab é interpretado em America/Sao_Paulo independente do TZ do
  // container.
  await sweepCronQueue.upsertJobScheduler(
    "chatwoot-sync-sweep-cron-daily",
    { pattern: "0 3 * * *", tz: "America/Sao_Paulo" },
    { name: "dispatch" },
  );

  console.log(
    "[worker] Schedules registered: refresh-by-* every 30min (fallback; gatilho real é runDeltaSync), housekeeping daily 03:00, integrations.refresh-dim every 30min, integrations.reconcile every 6h, chatwoot-sync-delta-tick every 5s, chatwoot-sync-sweep-cron daily 03:00 BRT",
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
  deltaSyncWorker.name,
  deltaTickWorker.name,
  sweepCronWorker.name,
  fullSweepWorker.name,
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
    deltaSyncWorker.close(),
    deltaTickWorker.close(),
    sweepCronWorker.close(),
    fullSweepWorker.close(),
  ]);
  await redis.quit();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
