"use server";

import { getCurrentUser } from "@/lib/auth";
import {
  __resetUsdBrlCache,
  getUsdBrlRate,
  type UsdBrlRate,
} from "@/lib/llm/exchange-rate";

export type GetUsdBrlActionResult =
  | { ok: true; data: UsdBrlRate }
  | { ok: false; error: string };

export async function getCurrentUsdBrlRateAction(): Promise<GetUsdBrlActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  if (user.platformRole !== "super_admin") {
    return { ok: false, error: "Sem permissão para consultar a cotação" };
  }
  __resetUsdBrlCache();
  const data = await getUsdBrlRate();
  return { ok: true, data };
}
