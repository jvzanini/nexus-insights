"use server";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import {
  DEFAULT_CARD_SPREAD,
  getUsdBrlRate,
  setCardSpread,
} from "@/lib/llm/exchange-rate";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
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
    return { ok: false, error: "Apenas super_admin pode editar cotação" };
  }
  return { ok: true, userId: user.id ?? null };
}

export async function getCurrentRateAction(): Promise<
  ActionResult<{
    rate: number;
    commercial: number;
    spread: number;
    source: "live" | "cache" | "fallback";
    fetchedAt: string;
  }>
> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    const r = await getUsdBrlRate();
    return {
      ok: true,
      data: {
        rate: r.rate,
        commercial: r.commercial,
        spread: r.spread,
        source: r.source,
        fetchedAt: r.fetchedAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("[exchange-rate] action:", err);
    return { ok: false, error: "Erro ao obter cotação" };
  }
}

const SPREAD_MIN = 1.0;
const SPREAD_MAX = 1.3;

export async function setCardSpreadAction(
  spread: number,
): Promise<ActionResult> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (
    typeof spread !== "number" ||
    !Number.isFinite(spread) ||
    spread < SPREAD_MIN ||
    spread > SPREAD_MAX
  ) {
    return {
      ok: false,
      error: `Spread fora do range [${SPREAD_MIN}, ${SPREAD_MAX}]`,
    };
  }
  try {
    await setCardSpread(spread);
    await logAudit({
      userId: guard.userId,
      action: "setting_updated",
      targetType: "platform_settings",
      targetId: "llm.usd_brl.card_spread",
      details: { spread },
    });
    return { ok: true };
  } catch (err) {
    console.error("[exchange-rate] set:", err);
    return { ok: false, error: "Erro ao salvar spread" };
  }
}

export { DEFAULT_CARD_SPREAD };
