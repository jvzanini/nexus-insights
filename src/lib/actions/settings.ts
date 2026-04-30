"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { updateSetting as updateSettingDirect } from "@/lib/settings/update";
import { getAllSettings as getAllSettingsCached } from "@/lib/settings/get";
import { invalidateDashboardSettings } from "@/lib/dashboard-settings";
import { logAudit } from "@/lib/audit";

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
