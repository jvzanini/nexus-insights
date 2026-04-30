import "server-only";

import { pgPool } from "@/lib/pg-pool";
import type { DashboardMode, WeekStartsOn } from "@/lib/dashboard-period";

export interface DashboardSettings {
  weekStartsOn: WeekStartsOn;
  weekMode: DashboardMode;
  monthMode: DashboardMode;
}

const DEFAULTS: DashboardSettings = {
  weekStartsOn: 1,
  weekMode: "current",
  monthMode: "current",
};

const KEYS = [
  "dashboard.week_starts_on",
  "dashboard.week_mode",
  "dashboard.month_mode",
] as const;

const CACHE_TTL_MS = 60_000;
let cache: { value: DashboardSettings; expiresAt: number } | null = null;

export function invalidateDashboardSettings(): void {
  cache = null;
}

export async function getDashboardSettings(): Promise<DashboardSettings> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  let weekStartsOn: WeekStartsOn = DEFAULTS.weekStartsOn;
  let weekMode: DashboardMode = DEFAULTS.weekMode;
  let monthMode: DashboardMode = DEFAULTS.monthMode;

  try {
    const res = await pgPool.query<{ key: string; value: unknown }>(
      "SELECT key, value FROM app_settings WHERE key = ANY($1::text[])",
      [KEYS as unknown as string[]],
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
    console.warn("[dashboard-settings] falha ao ler:", (err as Error).message);
  }

  const value: DashboardSettings = { weekStartsOn, weekMode, monthMode };
  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}
