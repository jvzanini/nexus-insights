"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { updateSetting as updateSettingDirect } from "@/lib/settings/update";
import { getAllSettings as getAllSettingsCached } from "@/lib/settings/get";

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
