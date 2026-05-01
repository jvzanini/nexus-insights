// Server-side helper que lê 3 chaves de `app_settings` para configuração
// do dashboard (week_starts_on / week_mode / month_mode).
//
// NOTA (v0.13.8): removido `import "server-only"` por suspeita de causar
// erro de Server Components render quando importado de Server Actions.
// A função continua server-only de fato — `pgPool` import é server-only.

import { pgPool } from "@/lib/pg-pool";

export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type DashboardMode = "current" | "rolling";

export interface DashboardSettings {
  weekStartsOn: WeekStartsOn;
  weekMode: DashboardMode;
  monthMode: DashboardMode;
}

export const DASHBOARD_DEFAULTS: DashboardSettings = {
  weekStartsOn: 1,
  weekMode: "current",
  monthMode: "current",
};

const KEYS = [
  "dashboard.week_starts_on",
  "dashboard.week_mode",
  "dashboard.month_mode",
];

/**
 * Lê settings do banco. SEMPRE retorna objeto válido — em caso de erro,
 * retorna defaults. Nunca joga.
 */
export async function getDashboardSettings(): Promise<DashboardSettings> {
  let weekStartsOn: WeekStartsOn = DASHBOARD_DEFAULTS.weekStartsOn;
  let weekMode: DashboardMode = DASHBOARD_DEFAULTS.weekMode;
  let monthMode: DashboardMode = DASHBOARD_DEFAULTS.monthMode;

  try {
    const res = await pgPool.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM app_settings WHERE key IN ('dashboard.week_starts_on', 'dashboard.week_mode', 'dashboard.month_mode')`,
    );
    for (const row of res.rows ?? []) {
      const raw =
        typeof row.value === "string"
          ? row.value
          : row.value &&
              typeof row.value === "object" &&
              "value" in (row.value as Record<string, unknown>)
            ? String((row.value as Record<string, unknown>).value ?? "")
            : "";
      if (row.key === "dashboard.week_starts_on") {
        const n = parseInt(raw, 10);
        if (Number.isInteger(n) && n >= 0 && n <= 6) {
          weekStartsOn = n as WeekStartsOn;
        }
      } else if (row.key === "dashboard.week_mode") {
        if (raw === "current" || raw === "rolling") weekMode = raw;
      } else if (row.key === "dashboard.month_mode") {
        if (raw === "current" || raw === "rolling") monthMode = raw;
      }
    }
  } catch (err) {
    console.warn(
      "[dashboard-settings] erro ao ler — usando defaults:",
      (err as Error).message,
    );
  }

  return { weekStartsOn, weekMode, monthMode };
}

/** Mantido para compat — agora no-op porque não há cache. */
export function invalidateDashboardSettings(): void {
  // no-op
}
