"use server";

/**
 * Server Actions de jobs de pré-agregação (T8).
 *
 * Disponíveis apenas para `platformRole=super_admin`. Usadas pela página
 * `/configuracoes/jobs` para:
 *   1. Ler o status de freshness de cada (account × dimension).
 *   2. Disparar manualmente um refresh "rodar agora".
 *   3. Disparar um backfill multi-dia (default 90).
 *
 * Cada disparo registra um audit log (`setting_updated`).
 *
 * TODO(T8.1): `triggerBackfill` enfileira `{ days }` em `job.data` mas as
 * funções `processRefreshByX` ainda ignoram esse campo — a janela rolling
 * fixa segue valendo. A extensão de `processRefreshByX` para honrar
 * `job.data?.days` será feita em release seguinte.
 */

import { z } from "zod";
import type { Queue } from "bullmq";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  refreshByAccountQueue,
  refreshByInboxQueue,
  refreshByAgentQueue,
  refreshByTeamQueue,
} from "@/lib/queue";
import { readFactsMeta, type FactsMeta } from "@/lib/chatwoot/facts";
import { logAudit } from "@/lib/audit";
import { getAccountsToRefresh } from "@/worker/jobs/pre-agregacao/shared";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

const DIMENSIONS = [
  "by_account",
  "by_inbox",
  "by_agent",
  "by_team",
  "hourly_by_account",
] as const;

const DimensionSchema = z.enum(DIMENSIONS);

export type JobsDimension = z.infer<typeof DimensionSchema>;

const TriggerSchema = z.object({
  dimension: DimensionSchema,
  /** Filtro opcional por connectionId — atualmente só é registrado em audit. */
  connectionId: z.string().optional(),
});

const BackfillSchema = z.object({
  dimension: DimensionSchema,
  days: z.number().int().min(1).max(365).default(90),
  /** Filtro opcional por connectionId — atualmente só é registrado em audit. */
  connectionId: z.string().optional(),
});

/**
 * Resolve os Chatwoot account IDs de uma connection específica via
 * `companyChatBinding`. Usado por `getJobsStatus({ connectionId })` pra
 * filtrar a lista de rows ao mostrar o painel embutido na page detalhe
 * `/bancos-de-dados/[id]`.
 */
async function getAccountIdsByConnection(
  connectionId: string,
): Promise<number[]> {
  const bindings = await prisma.companyChatBinding.findMany({
    where: {
      connectionId,
      enabled: true,
      deletedAt: null,
    },
    select: { chatwootAccountId: true },
  });
  return Array.from(
    new Set(bindings.map((b) => b.chatwootAccountId)),
  ).sort((a, b) => a - b);
}

export interface JobsStatusRow {
  accountId: number;
  dimension: string;
  lastRefreshAt: string | null;
  lastAttemptAt: string | null;
  lagSeconds: number | null;
  status: FactsMeta["status"];
  lastError: string | null;
  oldestBucketDate: string | null;
  newestBucketDate: string | null;
}

/**
 * Mapeia uma `dimension` da UI para a Queue BullMQ correspondente.
 *
 * `hourly_by_account` é processada pelo mesmo job que escreve `by_account`
 * (ambos rodam dentro de `processRefreshByAccount`), por isso aponta para
 * `refreshByAccountQueue`.
 */
function queueForDimension(dimension: JobsDimension): Queue {
  switch (dimension) {
    case "by_account":
    case "hourly_by_account":
      return refreshByAccountQueue;
    case "by_inbox":
      return refreshByInboxQueue;
    case "by_agent":
      return refreshByAgentQueue;
    case "by_team":
      return refreshByTeamQueue;
  }
}

async function ensureSuperAdmin(): Promise<
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  if (user.platformRole !== "super_admin") {
    return {
      ok: false,
      error: "Apenas super admin pode operar jobs de pré-agregação",
    };
  }
  return { ok: true, user };
}

/**
 * Lê o status de freshness de cada (account × dimension) para as accounts
 * ativas (com pelo menos um usuário com acesso não revogado).
 *
 * Quando `args.connectionId` é fornecido, filtra os rows pelas accounts
 * vinculadas àquela connection via `company_chat_bindings`. Sem o filtro
 * (chamada padrão), retorna todas as accounts ativas (compat com page
 * `/configuracoes/jobs`).
 */
export async function getJobsStatus(
  args: { connectionId?: string } = {},
): Promise<ActionResult<{ rows: JobsStatusRow[] }>> {
  try {
    const guard = await ensureSuperAdmin();
    if (!guard.ok) return { success: false, error: guard.error };

    const accountIds = args.connectionId
      ? await getAccountIdsByConnection(args.connectionId)
      : await getAccountsToRefresh();

    const perAccount = await Promise.all(
      accountIds.map(async (accountId) => {
        const metaRows = await readFactsMeta({ accountId });
        return metaRows.map<JobsStatusRow>((m) => ({
          accountId: m.accountId,
          dimension: m.dimension,
          lastRefreshAt: m.lastRefreshAt
            ? m.lastRefreshAt.toISOString()
            : null,
          lastAttemptAt: m.lastAttemptAt
            ? m.lastAttemptAt.toISOString()
            : null,
          lagSeconds: m.lagSeconds,
          status: m.status,
          lastError: m.lastError,
          oldestBucketDate: m.oldestBucketDate,
          newestBucketDate: m.newestBucketDate,
        }));
      }),
    );

    const rows = perAccount.flat().sort((a, b) => {
      if (a.accountId !== b.accountId) return a.accountId - b.accountId;
      return a.dimension.localeCompare(b.dimension);
    });

    return { success: true, data: { rows } };
  } catch (err) {
    // Schema-not-ready: tabela/coluna ausente vira empty state silencioso
    // em vez de banner de erro. Postgres SQLSTATE:
    //   - 42P01 undefined_table
    //   - 42703 undefined_column (incluindo cenário onde algum subagent
    //     antigo invocou coluna que não existe ainda)
    const code = (err as { code?: string })?.code;
    const message = (err as { message?: string })?.message ?? "";
    const isSchemaNotReady =
      code === "42P01" ||
      code === "42703" ||
      /relation .* does not exist|column .* does not exist|chatwoot_facts/i.test(
        message,
      );
    if (isSchemaNotReady) {
      console.warn(
        "[jobs.getJobsStatus] schema do banco interno ainda incompleto — " +
          "retornando empty state. Detalhe:",
        message,
      );
      return { success: true, data: { rows: [] } };
    }
    console.error("[jobs.getJobsStatus]", err);
    return { success: false, error: "Erro ao carregar status dos jobs" };
  }
}

/**
 * Enfileira um job one-shot de refresh para a dimensão informada. Usa um
 * `jobId` único com timestamp para que repetições rápidas apareçam como
 * entradas distintas no Bull dashboard.
 */
export async function triggerRefresh(
  input: unknown,
): Promise<ActionResult<{ jobId?: string }>> {
  try {
    const guard = await ensureSuperAdmin();
    if (!guard.ok) return { success: false, error: guard.error };

    const parsed = TriggerSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Dados inválidos",
      };
    }

    const { dimension } = parsed.data;
    const queue = queueForDimension(dimension);
    const jobId = `manual-${dimension}-${Date.now()}`;

    const job = await queue.add(
      `manual-refresh-${dimension}`,
      {},
      { jobId },
    );

    await logAudit({
      userId: guard.user.id,
      action: "setting_updated",
      targetType: "facts_job",
      targetId: dimension,
      details: { action: "manual_refresh", dimension, jobId },
    });

    return { success: true, data: { jobId: job?.id ?? jobId } };
  } catch (err) {
    console.error("[jobs.triggerRefresh]", err);
    return { success: false, error: "Erro ao enfileirar refresh" };
  }
}

/**
 * Enfileira um job de backfill (job único com `data.days`). O processador
 * ainda ignora `data.days` — ver TODO(T8.1) no topo do arquivo.
 */
export async function triggerBackfill(
  input: unknown,
): Promise<ActionResult<{ jobId?: string; days: number }>> {
  try {
    const guard = await ensureSuperAdmin();
    if (!guard.ok) return { success: false, error: guard.error };

    const parsed = BackfillSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Dados inválidos",
      };
    }

    const { dimension, days } = parsed.data;
    const queue = queueForDimension(dimension);
    const jobId = `backfill-${dimension}-${Date.now()}`;

    const job = await queue.add(
      `backfill-${dimension}`,
      { days },
      { jobId },
    );

    await logAudit({
      userId: guard.user.id,
      action: "setting_updated",
      targetType: "facts_job",
      targetId: dimension,
      details: { action: "manual_backfill", dimension, days, jobId },
    });

    return { success: true, data: { jobId: job?.id ?? jobId, days } };
  } catch (err) {
    console.error("[jobs.triggerBackfill]", err);
    return { success: false, error: "Erro ao enfileirar backfill" };
  }
}
