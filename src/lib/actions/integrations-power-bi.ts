"use server";

/**
 * Server Actions de gestão de perfis de integração Power BI.
 *
 * Apenas super_admin (RBAC duro). Padrão `ActionResult<T>` espelha
 * `llm-credentials.ts` — `safeAction` envelopa qualquer throw em
 * `{ ok:false, error }` para evitar quebrar o RSC. Operações internas
 * (provisioner, encryption) podem throw livremente; o envelope captura.
 *
 * Trilha de auditoria dupla:
 * - `integration_audit_logs` (rica, vinculada ao perfil) via prisma.
 * - `audit_logs` global via `logAudit` (compatível com timeline geral).
 *
 * Contratos sensíveis:
 * - `createProfileAction` retorna `plainPassword` UMA ÚNICA VEZ; depois só
 *   reveal/rotate.
 * - `updateProfileAction` usa `expectedUpdatedAt` (ISO) para detecção de
 *   modificação concorrente.
 * - `revealPasswordAction` rate-limit 5/dia/perfil; `rotatePasswordAction`
 *   rate-limit 10/dia/perfil — Redis incr+expire 86400s.
 * - `deleteProfileAction` registra audit ANTES do drop (preserva trilha
 *   mesmo se o deprovision falhar parcialmente).
 */

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { encrypt, decrypt } from "@/lib/encryption";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { z } from "zod";

import {
  getCatalogEntry,
  validateAllowedTables,
} from "@/lib/integrations/power-bi/catalog";
import {
  generateIntegrationPassword,
  getPasswordLast4,
} from "@/lib/integrations/power-bi/password-generator";
import {
  provisionProfile,
  disableProfile,
  reactivateProfile,
  deprovisionProfile,
} from "@/lib/integrations/power-bi/provisioner";
import { buildAlterUserPasswordSql } from "@/lib/integrations/power-bi/sql-builders";
import { getIntegrationAdminPool } from "@/lib/integrations/power-bi/admin-pool";
import { integrationsRefreshDimQueue } from "@/lib/integrations/queue";

// -------------------- Envelope + guard --------------------

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function safeAction<T>(
  fn: () => Promise<ActionResult<T>>,
  context: string,
): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[integrations-power-bi:${context}] erro inesperado:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Erro inesperado: ${msg.slice(0, 200)}`,
    };
  }
}

interface SessionUserShape {
  id?: string;
  platformRole?: string;
}

async function requireSuperAdmin(): Promise<
  { ok: true; userId: string | null } | { ok: false; error: string }
> {
  const session = await auth();
  const user = (session?.user ?? {}) as SessionUserShape;
  if (user.platformRole !== "super_admin") {
    return {
      ok: false,
      error: "Apenas super_admin pode gerenciar perfis Power BI.",
    };
  }
  return { ok: true, userId: user.id ?? null };
}

// -------------------- Helpers --------------------

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function deriveSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  if (slug.length === 0) {
    throw new Error("Nome do perfil precisa conter ao menos uma letra ou número.");
  }
  return slug;
}

function getSoftCap(): number {
  const raw = process.env.INTEGRATION_PROFILE_SOFT_CAP ?? "50";
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
}

const profileInputSchema = z
  .object({
    name: z
      .string()
      .min(3, "Nome deve ter ao menos 3 caracteres.")
      .max(60, "Nome deve ter no máximo 60 caracteres.")
      .regex(/^[A-Za-z0-9 _\-]+$/, "Caracteres inválidos no nome (use letras, números, espaço, _ ou -)."),
    description: z.string().max(280).nullish(),
    allowedTables: z.array(z.string()).min(1, "Selecione ao menos uma tabela."),
    allowedColumns: z.record(z.string(), z.array(z.string()).min(1)),
    accountIdFilter: z.array(z.number().int().positive()).nullable(),
    teamIdFilter: z.array(z.number().int().positive()).nullable(),
  })
  .refine(
    (data) => {
      for (const [table, cols] of Object.entries(data.allowedColumns)) {
        const entry = getCatalogEntry(table);
        if (!entry) return false;
        for (const c of cols) if (!entry.allColumns.includes(c)) return false;
      }
      return true;
    },
    { message: "Coluna inválida em allowedColumns." },
  );

type ProfileInput = z.infer<typeof profileInputSchema>;

function parseProfileInput(raw: unknown): ProfileInput {
  const parsed = profileInputSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(first?.message ?? "Entrada inválida do perfil.");
  }
  return parsed.data;
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: string }).code;
  return code === "P2002";
}

// -------------------- Tipos retornados --------------------

export interface ProfileListItem {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "disabled" | "error";
  pgUsername: string;
  passwordLast4: string;
  allowedTables: string[];
  accountIdFilter: number[] | null;
  teamIdFilter: number[] | null;
  lastProvisionedAt: Date | null;
  lastProvisionError: string | null;
  createdAt: Date;
  updatedAt: Date;
  disabledAt: Date | null;
  createdBy: { id: string; name: string; email: string } | null;
}

export interface ProfileDetail extends ProfileListItem {
  allowedColumns: Record<string, string[]>;
  auditEvents: Array<{
    id: string;
    event: string;
    userId: string | null;
    details: unknown;
    createdAt: Date;
  }>;
}

interface PrismaProfileRow {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "disabled" | "error";
  pgUsername: string;
  passwordLast4: string;
  allowedTables: unknown;
  allowedColumns: unknown;
  accountIdFilter: unknown;
  teamIdFilter: unknown;
  lastProvisionedAt: Date | null;
  lastProvisionError: string | null;
  createdAt: Date;
  updatedAt: Date;
  disabledAt: Date | null;
  createdBy: { id: string; name: string; email: string } | null;
}

function toListItem(row: PrismaProfileRow): ProfileListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    pgUsername: row.pgUsername,
    passwordLast4: row.passwordLast4,
    allowedTables: Array.isArray(row.allowedTables)
      ? (row.allowedTables as string[])
      : [],
    accountIdFilter: Array.isArray(row.accountIdFilter)
      ? (row.accountIdFilter as number[])
      : null,
    teamIdFilter: Array.isArray(row.teamIdFilter)
      ? (row.teamIdFilter as number[])
      : null,
    lastProvisionedAt: row.lastProvisionedAt,
    lastProvisionError: row.lastProvisionError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    disabledAt: row.disabledAt,
    createdBy: row.createdBy,
  };
}

// -------------------- 1. listProfilesAction --------------------

export async function listProfilesAction(): Promise<
  ActionResult<ProfileListItem[]>
> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    const rows = await prisma.integrationProfile.findMany({
      where: { kind: "power_bi", deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        pgUsername: true,
        passwordLast4: true,
        allowedTables: true,
        allowedColumns: true,
        accountIdFilter: true,
        teamIdFilter: true,
        lastProvisionedAt: true,
        lastProvisionError: true,
        createdAt: true,
        updatedAt: true,
        disabledAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return { ok: true, data: rows.map(toListItem) };
  }, "list");
}

// -------------------- 2. getProfileByIdAction --------------------

export async function getProfileByIdAction(
  id: string,
): Promise<ActionResult<ProfileDetail | null>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    const row = await prisma.integrationProfile.findFirst({
      where: { id, kind: "power_bi", deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        pgUsername: true,
        passwordLast4: true,
        allowedTables: true,
        allowedColumns: true,
        accountIdFilter: true,
        teamIdFilter: true,
        lastProvisionedAt: true,
        lastProvisionError: true,
        createdAt: true,
        updatedAt: true,
        disabledAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!row) return { ok: true, data: null };

    const auditEvents = await prisma.integrationAuditLog.findMany({
      where: { profileId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        event: true,
        userId: true,
        details: true,
        createdAt: true,
      },
    });

    const list = toListItem(row);
    const detail: ProfileDetail = {
      ...list,
      allowedColumns:
        row.allowedColumns && typeof row.allowedColumns === "object"
          ? (row.allowedColumns as Record<string, string[]>)
          : {},
      auditEvents: auditEvents.map((e) => ({
        id: e.id,
        event: e.event as string,
        userId: e.userId,
        details: e.details,
        createdAt: e.createdAt,
      })),
    };

    return { ok: true, data: detail };
  }, "get");
}

// -------------------- 3. createProfileAction --------------------

export interface CreatedProfileResult {
  profile: ProfileListItem;
  plainPassword: string;
}

export async function createProfileAction(
  rawInput: unknown,
): Promise<ActionResult<CreatedProfileResult>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    const input = parseProfileInput(rawInput);
    validateAllowedTables(input.allowedTables);

    // Soft cap pra evitar runaway na criação de perfis.
    const cap = getSoftCap();
    const activeCount = await prisma.integrationProfile.count({
      where: { kind: "power_bi", status: "active", deletedAt: null },
    });
    if (activeCount >= cap) {
      throw new Error(`Limite de ${cap} perfis ativos atingido.`);
    }

    const slug = deriveSlug(input.name);
    const random = randomBytes(3).toString("hex"); // 6 hex chars
    const pgUsername = `pbi_${slug}_${random}`;

    const plainPassword = generateIntegrationPassword(32);
    const encryptedPgPassword = encrypt(plainPassword);
    const passwordLast4 = getPasswordLast4(plainPassword);

    let created;
    try {
      created = await prisma.integrationProfile.create({
        data: {
          kind: "power_bi",
          name: input.name,
          description: input.description ?? null,
          status: "active",
          pgUsername,
          encryptedPgPassword,
          passwordLast4,
          allowedTables: input.allowedTables,
          allowedColumns: input.allowedColumns,
          accountIdFilter: input.accountIdFilter ?? undefined,
          teamIdFilter: input.teamIdFilter ?? undefined,
          createdById: guard.userId,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new Error("Nome já existe — escolha outro.");
      }
      throw err;
    }

    try {
      await provisionProfile({
        id: created.id,
        pgUsername,
        password: plainPassword,
        allowedTables: input.allowedTables,
        allowedColumns: input.allowedColumns,
        accountIdFilter: input.accountIdFilter,
        teamIdFilter: input.teamIdFilter,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.integrationProfile.update({
        where: { id: created.id },
        data: {
          status: "error",
          lastProvisionError: msg.slice(0, 1000),
        },
      });
      await prisma.integrationAuditLog.create({
        data: {
          profileId: created.id,
          event: "provisioning_failed",
          userId: guard.userId,
          details: { error: msg.slice(0, 500) } as object,
        },
      });
      await logAudit({
        userId: guard.userId,
        action: "integration_provisioning_failed",
        targetType: "integration_profile",
        targetId: created.id,
        details: { error: msg.slice(0, 500), name: input.name },
      });
      throw new Error(`Falha ao provisionar perfil: ${msg.slice(0, 200)}`);
    }

    const updated = await prisma.integrationProfile.update({
      where: { id: created.id },
      data: {
        lastProvisionedAt: new Date(),
        status: "active",
        lastProvisionError: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        pgUsername: true,
        passwordLast4: true,
        allowedTables: true,
        allowedColumns: true,
        accountIdFilter: true,
        teamIdFilter: true,
        lastProvisionedAt: true,
        lastProvisionError: true,
        createdAt: true,
        updatedAt: true,
        disabledAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.integrationAuditLog.create({
      data: {
        profileId: created.id,
        event: "profile_created",
        userId: guard.userId,
        details: {
          name: input.name,
          allowedTables: input.allowedTables,
          accountIdFilter: input.accountIdFilter,
          teamIdFilter: input.teamIdFilter,
        } as object,
      },
    });
    await logAudit({
      userId: guard.userId,
      action: "integration_profile_created",
      targetType: "integration_profile",
      targetId: created.id,
      details: {
        name: input.name,
        allowedTables: input.allowedTables,
        pgUsername,
      },
    });

    revalidatePath("/integracoes/power-bi");

    return {
      ok: true,
      data: {
        profile: toListItem(updated),
        plainPassword,
      },
    };
  }, "create");
}

// -------------------- 4. updateProfileAction --------------------

export async function updateProfileAction(
  id: string,
  rawInput: unknown,
  expectedUpdatedAt: string,
): Promise<ActionResult<{ profile: ProfileListItem }>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    const current = await prisma.integrationProfile.findUnique({
      where: { id },
      select: {
        updatedAt: true,
        pgUsername: true,
        encryptedPgPassword: true,
        deletedAt: true,
      },
    });
    if (!current || current.deletedAt) {
      throw new Error("Perfil não encontrado.");
    }
    if (current.updatedAt.getTime() !== Date.parse(expectedUpdatedAt)) {
      throw new Error(
        "Perfil modificado por outro super_admin. Recarregue a página.",
      );
    }

    const input = parseProfileInput(rawInput);
    validateAllowedTables(input.allowedTables);

    const updatedRow = await prisma.integrationProfile.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description ?? null,
        allowedTables: input.allowedTables,
        allowedColumns: input.allowedColumns,
        accountIdFilter: input.accountIdFilter ?? undefined,
        teamIdFilter: input.teamIdFilter ?? undefined,
      },
    });

    const password = decrypt(current.encryptedPgPassword);

    try {
      await provisionProfile({
        id,
        pgUsername: current.pgUsername,
        password,
        allowedTables: input.allowedTables,
        allowedColumns: input.allowedColumns,
        accountIdFilter: input.accountIdFilter,
        teamIdFilter: input.teamIdFilter,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.integrationProfile.update({
        where: { id },
        data: {
          status: "error",
          lastProvisionError: msg.slice(0, 1000),
        },
      });
      await prisma.integrationAuditLog.create({
        data: {
          profileId: id,
          event: "provisioning_failed",
          userId: guard.userId,
          details: { error: msg.slice(0, 500) } as object,
        },
      });
      await logAudit({
        userId: guard.userId,
        action: "integration_provisioning_failed",
        targetType: "integration_profile",
        targetId: id,
        details: { error: msg.slice(0, 500) },
      });
      throw new Error(`Falha ao re-provisionar perfil: ${msg.slice(0, 200)}`);
    }

    const finalRow = await prisma.integrationProfile.update({
      where: { id },
      data: {
        lastProvisionedAt: new Date(),
        status: "active",
        lastProvisionError: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        pgUsername: true,
        passwordLast4: true,
        allowedTables: true,
        allowedColumns: true,
        accountIdFilter: true,
        teamIdFilter: true,
        lastProvisionedAt: true,
        lastProvisionError: true,
        createdAt: true,
        updatedAt: true,
        disabledAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.integrationAuditLog.create({
      data: {
        profileId: id,
        event: "whitelist_changed",
        userId: guard.userId,
        details: {
          name: input.name,
          allowedTables: input.allowedTables,
          accountIdFilter: input.accountIdFilter,
          teamIdFilter: input.teamIdFilter,
        } as object,
      },
    });
    await logAudit({
      userId: guard.userId,
      action: "integration_profile_updated",
      targetType: "integration_profile",
      targetId: id,
      details: {
        name: input.name,
        allowedTables: input.allowedTables,
      },
    });

    revalidatePath("/integracoes/power-bi");

    // Suppress unused warning — we mutate in two passes for status/lastProvisionedAt.
    void updatedRow;

    return { ok: true, data: { profile: toListItem(finalRow) } };
  }, "update");
}

// -------------------- 5. revealPasswordAction --------------------

const REVEAL_LIMIT_PER_DAY = 5;

export async function revealPasswordAction(
  id: string,
): Promise<ActionResult<{ password: string }>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    const key = `integ:reveal:${id}:${dayKey()}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 86400);
    }
    if (count > REVEAL_LIMIT_PER_DAY) {
      throw new Error(
        `Limite de ${REVEAL_LIMIT_PER_DAY} revelações por dia atingido.`,
      );
    }

    const profile = await prisma.integrationProfile.findFirst({
      where: { id, deletedAt: null },
      select: { encryptedPgPassword: true },
    });
    if (!profile) throw new Error("Perfil não encontrado.");

    const password = decrypt(profile.encryptedPgPassword);

    await prisma.integrationAuditLog.create({
      data: {
        profileId: id,
        event: "password_revealed",
        userId: guard.userId,
        details: { count } as object,
      },
    });
    await logAudit({
      userId: guard.userId,
      action: "integration_password_revealed",
      targetType: "integration_profile",
      targetId: id,
      details: { count },
    });

    return { ok: true, data: { password } };
  }, "reveal");
}

// -------------------- 6. rotatePasswordAction --------------------

const ROTATE_LIMIT_PER_DAY = 10;

export async function rotatePasswordAction(
  id: string,
): Promise<ActionResult<{ password: string }>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    const key = `integ:rotate:${id}:${dayKey()}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 86400);
    }
    if (count > ROTATE_LIMIT_PER_DAY) {
      throw new Error(
        `Limite de ${ROTATE_LIMIT_PER_DAY} rotações por dia atingido.`,
      );
    }

    const profile = await prisma.integrationProfile.findFirst({
      where: { id, deletedAt: null },
      select: { pgUsername: true },
    });
    if (!profile) throw new Error("Perfil não encontrado.");

    const newPassword = generateIntegrationPassword(32);
    const encryptedPgPassword = encrypt(newPassword);
    const passwordLast4 = getPasswordLast4(newPassword);

    const pool = getIntegrationAdminPool();
    const client = await pool.connect();
    try {
      await client.query(
        buildAlterUserPasswordSql(profile.pgUsername, newPassword),
      );
    } finally {
      client.release();
    }

    await prisma.integrationProfile.update({
      where: { id },
      data: { encryptedPgPassword, passwordLast4 },
    });

    await prisma.integrationAuditLog.create({
      data: {
        profileId: id,
        event: "password_rotated",
        userId: guard.userId,
        details: { count, last4: passwordLast4 } as object,
      },
    });
    await logAudit({
      userId: guard.userId,
      action: "integration_password_rotated",
      targetType: "integration_profile",
      targetId: id,
      details: { count, last4: passwordLast4 },
    });

    revalidatePath("/integracoes/power-bi");

    return { ok: true, data: { password: newPassword } };
  }, "rotate");
}

// -------------------- 7. disableProfileAction --------------------

export async function disableProfileAction(
  id: string,
): Promise<ActionResult<{ profile: ProfileListItem }>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    const current = await prisma.integrationProfile.findFirst({
      where: { id, deletedAt: null },
      select: { pgUsername: true },
    });
    if (!current) throw new Error("Perfil não encontrado.");

    await disableProfile({ pgUsername: current.pgUsername });

    const updated = await prisma.integrationProfile.update({
      where: { id },
      data: { status: "disabled", disabledAt: new Date() },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        pgUsername: true,
        passwordLast4: true,
        allowedTables: true,
        allowedColumns: true,
        accountIdFilter: true,
        teamIdFilter: true,
        lastProvisionedAt: true,
        lastProvisionError: true,
        createdAt: true,
        updatedAt: true,
        disabledAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.integrationAuditLog.create({
      data: {
        profileId: id,
        event: "profile_disabled",
        userId: guard.userId,
        details: {} as object,
      },
    });
    await logAudit({
      userId: guard.userId,
      action: "integration_profile_updated",
      targetType: "integration_profile",
      targetId: id,
      details: { transition: "disabled" },
    });

    revalidatePath("/integracoes/power-bi");

    return { ok: true, data: { profile: toListItem(updated) } };
  }, "disable");
}

// -------------------- 8. reactivateProfileAction --------------------

export async function reactivateProfileAction(
  id: string,
): Promise<ActionResult<{ profile: ProfileListItem }>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    const current = await prisma.integrationProfile.findFirst({
      where: { id, deletedAt: null },
      select: { pgUsername: true },
    });
    if (!current) throw new Error("Perfil não encontrado.");

    await reactivateProfile({ id, pgUsername: current.pgUsername });

    const updated = await prisma.integrationProfile.update({
      where: { id },
      data: { status: "active", disabledAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        pgUsername: true,
        passwordLast4: true,
        allowedTables: true,
        allowedColumns: true,
        accountIdFilter: true,
        teamIdFilter: true,
        lastProvisionedAt: true,
        lastProvisionError: true,
        createdAt: true,
        updatedAt: true,
        disabledAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.integrationAuditLog.create({
      data: {
        profileId: id,
        event: "profile_reactivated",
        userId: guard.userId,
        details: {} as object,
      },
    });
    await logAudit({
      userId: guard.userId,
      action: "integration_profile_updated",
      targetType: "integration_profile",
      targetId: id,
      details: { transition: "reactivated" },
    });

    revalidatePath("/integracoes/power-bi");

    return { ok: true, data: { profile: toListItem(updated) } };
  }, "reactivate");
}

// -------------------- 9. deleteProfileAction --------------------

export async function deleteProfileAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    const current = await prisma.integrationProfile.findFirst({
      where: { id, deletedAt: null },
      select: { pgUsername: true, name: true },
    });
    if (!current) throw new Error("Perfil não encontrado.");

    // Audit ANTES do drop — preservamos a trilha mesmo se deprovisionar
    // falhar parcialmente (o FK no audit é onDelete: NoAction, então o row
    // sobrevive ao soft-delete posterior).
    await prisma.integrationAuditLog.create({
      data: {
        profileId: id,
        event: "profile_deleted",
        userId: guard.userId,
        details: { name: current.name } as object,
      },
    });
    await logAudit({
      userId: guard.userId,
      action: "integration_profile_deleted",
      targetType: "integration_profile",
      targetId: id,
      details: { name: current.name },
    });

    await deprovisionProfile({ id, pgUsername: current.pgUsername });

    await prisma.integrationProfile.update({
      where: { id },
      data: { deletedAt: new Date(), status: "disabled" },
    });

    revalidatePath("/integracoes/power-bi");

    return { ok: true, data: { id } };
  }, "delete");
}

// -------------------- 10. triggerDimSyncAction --------------------

export async function triggerDimSyncAction(): Promise<
  ActionResult<{ enqueued: true }>
> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    await integrationsRefreshDimQueue.add("manual-trigger", { trigger: "ui" });

    await logAudit({
      userId: guard.userId,
      action: "setting_updated",
      targetType: "integration_dim_sync",
      details: { trigger: "manual" },
    });

    return { ok: true, data: { enqueued: true } };
  }, "trigger-dim-sync");
}
