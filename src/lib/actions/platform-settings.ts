"use server";

// Server Action: atualização das settings de plataforma (timezone/locale).
// Persiste em `app_settings` via raw pgPool (Prisma adapter está broken),
// invalida o cache em memória e tenta limpar caches de relatório no Redis.

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import { pgPool } from "@/lib/pg-pool";
import { invalidatePlatformSettings } from "@/lib/datetime";

interface UpdatePlatformSettingsInput {
  timezone?: string;
  locale?: string;
}

interface UpdatePlatformSettingsResult {
  ok: true;
}

const LOCALE_REGEX = /^[a-z]{2,3}(-[A-Z]{2,4})?$/;

function isValidTimezone(tz: string): boolean {
  try {
    // Se a engine do JS rejeitar o tz, lança RangeError.
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

async function upsertSetting(
  key: string,
  value: string,
  category: string,
  userId: string | null,
): Promise<void> {
  await pgPool.query(
    `INSERT INTO app_settings (key, value, category, updated_at, updated_by_id)
     VALUES ($1, $2::jsonb, $3, NOW(), $4)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           category = EXCLUDED.category,
           updated_at = NOW(),
           updated_by_id = EXCLUDED.updated_by_id`,
    [key, JSON.stringify(value), category, userId],
  );
}

async function tryInvalidateReportCaches(): Promise<void> {
  // Best-effort: se o Redis estiver indisponível, ignoramos.
  try {
    const { redis } = await import("@/lib/redis");
    const keys = await redis.keys("report:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.warn("[platform-settings] Falha ao invalidar caches do Redis:", err);
  }
}

/**
 * Atualiza configurações globais da plataforma (timezone e/ou locale).
 *
 * Apenas usuários com `platformRole === "super_admin"` podem chamar.
 * Valida tz com `Intl.DateTimeFormat` e locale via regex BCP-47 simplificada.
 * Após persistir, invalida o cache em memória e tenta limpar caches de
 * relatório no Redis.
 */
export async function updatePlatformSettings(
  input: UpdatePlatformSettingsInput,
): Promise<UpdatePlatformSettingsResult> {
  const session = await auth();
  const sessionUser = session?.user as
    | (typeof session extends { user: infer U } ? U : never)
    | undefined;

  // Cast tipado pra ler campos custom da sessão sem depender do tipo gerado.
  const userRecord = (sessionUser ?? {}) as Record<string, unknown>;
  const platformRole = userRecord.platformRole as string | undefined;
  const userId = (userRecord.id as string | undefined) ?? null;

  if (platformRole !== "super_admin") {
    throw new Error("Apenas super admin pode alterar configurações da plataforma");
  }

  if (input.timezone === undefined && input.locale === undefined) {
    throw new Error("Nenhum campo informado para atualização");
  }

  if (input.timezone !== undefined) {
    if (typeof input.timezone !== "string" || !isValidTimezone(input.timezone)) {
      throw new Error(`Timezone inválido: "${String(input.timezone)}"`);
    }
  }

  if (input.locale !== undefined) {
    if (typeof input.locale !== "string" || !LOCALE_REGEX.test(input.locale)) {
      throw new Error(`Locale inválido: "${String(input.locale)}"`);
    }
  }

  // UPSERT em app_settings via raw pg.Pool.
  if (input.timezone !== undefined) {
    await upsertSetting("platform.timezone", input.timezone, "platform", userId);
  }
  if (input.locale !== undefined) {
    await upsertSetting("platform.locale", input.locale, "platform", userId);
  }

  // Invalida cache em memória e tenta limpar Redis (engole erros).
  invalidatePlatformSettings();
  await tryInvalidateReportCaches();

  // Auditoria — fire-and-forget interno (logAudit já engole erros).
  await logAudit({
    userId,
    action: "setting_updated",
    targetType: "platform_settings",
    details: {
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
    },
  });

  return { ok: true };
}
