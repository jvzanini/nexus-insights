"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getCurrentUser } from "@/lib/auth";
import { updateSetting as updateSettingDirect } from "@/lib/settings/update";
import { getAllSettings as getAllSettingsCached } from "@/lib/settings/get";
import { invalidateDashboardSettings } from "@/lib/dashboard-settings";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const UpdateInputSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  category: z.string().min(1).optional(),
});

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export async function getAllSettings(): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Não autenticado" };
    const settings = await getAllSettingsCached();
    return { success: true, data: settings };
  } catch (err) {
    console.error("[settings.getAll]", err);
    return { success: false, error: "Erro ao carregar configurações" };
  }
}

export async function updateSetting(
  input: unknown,
): Promise<ActionResult<{ key: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Não autenticado" };
    if (user.platformRole !== "super_admin") {
      return { success: false, error: "Apenas super admin pode alterar configurações" };
    }

    const parsed = UpdateInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    }

    await updateSettingDirect({
      key: parsed.data.key,
      value: parsed.data.value,
      category: parsed.data.category,
      userId: user.id,
    });
    return { success: true, data: { key: parsed.data.key } };
  } catch (err) {
    console.error("[settings.update]", err);
    return { success: false, error: "Erro ao atualizar configuração" };
  }
}

export async function saveDashboardSettings(args: {
  weekStartsOn: number;
  weekMode: "current" | "rolling";
  monthMode: "current" | "rolling";
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Não autenticado" };
    if (user.platformRole !== "super_admin") {
      return {
        success: false,
        error: "Apenas super admin pode alterar configurações",
      };
    }

    const ws =
      Number.isInteger(args.weekStartsOn) &&
      args.weekStartsOn >= 0 &&
      args.weekStartsOn <= 6
        ? args.weekStartsOn
        : 1;
    const wm = args.weekMode === "rolling" ? "rolling" : "current";
    const mm = args.monthMode === "rolling" ? "rolling" : "current";

    await Promise.all([
      updateSettingDirect({
        key: "dashboard.week_starts_on",
        value: String(ws),
        category: "dashboard",
        userId: user.id,
      }),
      updateSettingDirect({
        key: "dashboard.week_mode",
        value: wm,
        category: "dashboard",
        userId: user.id,
      }),
      updateSettingDirect({
        key: "dashboard.month_mode",
        value: mm,
        category: "dashboard",
        userId: user.id,
      }),
    ]);

    invalidateDashboardSettings();

    await logAudit({
      userId: user.id,
      action: "setting_updated",
      targetType: "AppSetting",
      targetId: "dashboard",
      details: {
        section: "dashboard",
        weekStartsOn: ws,
        weekMode: wm,
        monthMode: mm,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/configuracoes");
    return { success: true };
  } catch (err) {
    console.error("[saveDashboardSettings]", err);
    return { success: false, error: "Erro ao salvar configurações" };
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * URLs Públicas Chatwoot (T4b plan v0.16.0)
 *
 * Apenas super_admin. UPSERT em ChatwootAccountUrl (PK = accountId). Se
 * publicUrl vier vazia/só whitespace → DELETE da row. Audit log
 * `setting_updated` com `targetType="ChatwootAccountUrl"` e details
 * { previous, next } onde previous/next são `{ publicUrl, label } | null`.
 *
 * Validação de URL: HTTPS obrigatório, ≤ 512 chars, label ≤ 100 chars,
 * trailing slash removido.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ChatwootAccountUrl {
  accountId: number;
  publicUrl: string;
  label: string | null;
}

export interface ChatwootUrlsActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

const MAX_PUBLIC_URL = 512;
const MAX_LABEL = 100;

interface SessionUserShape {
  id?: string;
  platformRole?: string;
}

async function requireSuperAdminForChatwootUrls(): Promise<
  | { ok: true; userId: string | null }
  | { ok: false; error: string }
> {
  const session = await auth();
  const user = (session?.user ?? {}) as SessionUserShape;
  if (user.platformRole !== "super_admin") {
    return {
      ok: false,
      error: "Apenas super_admin pode editar URLs públicas Chatwoot",
    };
  }
  return { ok: true, userId: user.id ?? null };
}

async function safeChatwootUrlsAction<T>(
  fn: () => Promise<ChatwootUrlsActionResult<T>>,
  context: string,
): Promise<ChatwootUrlsActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[settings:${context}] erro inesperado:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Erro inesperado: ${msg.slice(0, 200)}`,
    };
  }
}

export async function setChatwootAccountUrlAction(input: {
  accountId: number;
  publicUrl: string;
  label?: string | null;
}): Promise<ChatwootUrlsActionResult<{ accountId: number }>> {
  return safeChatwootUrlsAction(async () => {
    const guard = await requireSuperAdminForChatwootUrls();
    if (!guard.ok) return { ok: false, error: guard.error };

    const accountId = Number(input.accountId);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return { ok: false, error: "accountId inválido." };
    }

    const rawUrl = (input.publicUrl ?? "").trim().replace(/\/+$/, "");
    const labelRaw = input.label?.trim();
    const label = labelRaw && labelRaw.length > 0 ? labelRaw : null;
    if (label && label.length > MAX_LABEL) {
      return { ok: false, error: "Label muito longa (máx. 100 caracteres)." };
    }

    const previous = await prisma.chatwootAccountUrl.findUnique({
      where: { accountId },
    });

    // URL vazia → DELETE (ou no-op se previous é null)
    if (rawUrl.length === 0) {
      if (previous) {
        await prisma.chatwootAccountUrl.delete({ where: { accountId } });
        await logAudit({
          userId: guard.userId,
          action: "setting_updated",
          targetType: "ChatwootAccountUrl",
          targetId: String(accountId),
          details: {
            previous: {
              publicUrl: previous.publicUrl,
              label: previous.label,
            },
            next: null,
          },
        });
      }
      return { ok: true, data: { accountId } };
    }

    // Validação HTTPS
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { ok: false, error: "URL inválida — use HTTPS." };
    }
    if (parsed.protocol !== "https:") {
      return { ok: false, error: "URL inválida — use HTTPS." };
    }
    if (rawUrl.length > MAX_PUBLIC_URL) {
      return {
        ok: false,
        error: "URL muito longa (máx. 512 caracteres).",
      };
    }

    await prisma.chatwootAccountUrl.upsert({
      where: { accountId },
      create: {
        accountId,
        publicUrl: rawUrl,
        label,
        updatedById: guard.userId,
      },
      update: {
        publicUrl: rawUrl,
        label,
        updatedById: guard.userId,
      },
    });

    await logAudit({
      userId: guard.userId,
      action: "setting_updated",
      targetType: "ChatwootAccountUrl",
      targetId: String(accountId),
      details: {
        previous: previous
          ? { publicUrl: previous.publicUrl, label: previous.label }
          : null,
        next: { publicUrl: rawUrl, label },
      },
    });

    return { ok: true, data: { accountId } };
  }, "setChatwootAccountUrl");
}

export async function listChatwootAccountUrlsAction(): Promise<
  ChatwootUrlsActionResult<ChatwootAccountUrl[]>
> {
  return safeChatwootUrlsAction(async () => {
    const guard = await requireSuperAdminForChatwootUrls();
    if (!guard.ok) return { ok: false, error: guard.error };

    const rows = await prisma.chatwootAccountUrl.findMany({
      orderBy: { accountId: "asc" },
      select: { accountId: true, publicUrl: true, label: true },
    });
    return { ok: true, data: rows };
  }, "listChatwootAccountUrls");
}
