import "server-only";

import { pgPool } from "@/lib/pg-pool";
import { ALL_REPORT_KEYS } from "./catalog";

export type Visibility = "all" | "super_admin_only" | "none";

export const ALL_VISIBILITIES: Visibility[] = ["all", "super_admin_only", "none"];

export function isVisibility(v: unknown): v is Visibility {
  return v === "all" || v === "super_admin_only" || v === "none";
}

export function resolveVisibility(
  setting: Visibility | undefined | null,
  userRole: string | null | undefined,
  fallback: Visibility = "all",
): boolean {
  const v = setting ?? fallback;
  if (v === "none") return false;
  if (v === "super_admin_only") return userRole === "super_admin";
  return true;
}

const cache = new Map<string, { value: unknown; expiresAt: number }>();
const TTL_MS = 30_000;

export function invalidateVisibilityCache(): void {
  cache.clear();
}

async function readSettingRaw(key: string): Promise<unknown> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let value: unknown = undefined;
  try {
    const r = await pgPool.query<{ value: unknown }>(
      "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
      [key],
    );
    if (r.rowCount && r.rows[0]) {
      value = r.rows[0].value;
    }
  } catch (err) {
    console.warn(`[visibility] falha lendo ${key}:`, (err as Error).message);
  }
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export async function getReportVisibility(
  reportKey: string,
): Promise<Visibility> {
  // 1) chave nova
  const newKey = `reports.visibility.${reportKey}`;
  const raw = await readSettingRaw(newKey);
  if (isVisibility(raw)) return raw;
  // 2) backward-compat: array enabled_reports
  const legacy = await readSettingRaw("platform.enabled_reports");
  if (Array.isArray(legacy)) {
    const arr = legacy as unknown[];
    return arr.includes(reportKey) ? "all" : "none";
  }
  // 3) default
  return "all";
}

export async function getMatrixIAVisibility(): Promise<Visibility> {
  const raw = await readSettingRaw("reports.matrix_ia_visibility");
  if (isVisibility(raw)) return raw;
  // backward-compat
  const include = await readSettingRaw("reports.include_matrix_ia");
  if (include === false) return "none";
  const onlySuperAdmin = await readSettingRaw(
    "feature_flags.matrix_ia_visible_to_super_admin_only",
  );
  if (onlySuperAdmin === true || include === undefined) {
    return "super_admin_only";
  }
  return "all";
}

export async function isReportVisibleForUser(
  reportKey: string,
  userRole: string | null | undefined,
): Promise<boolean> {
  const v = await getReportVisibility(reportKey);
  return resolveVisibility(v, userRole);
}

export async function isMatrixIAVisibleForUser(
  userRole: string | null | undefined,
): Promise<boolean> {
  const v = await getMatrixIAVisibility();
  return resolveVisibility(v, userRole, "super_admin_only");
}

export async function getVisibleReportKeys(
  userRole: string | null | undefined,
): Promise<Set<string>> {
  const entries = await Promise.all(
    ALL_REPORT_KEYS.map(async (key) => {
      const v = await getReportVisibility(key);
      return [key, resolveVisibility(v, userRole)] as const;
    }),
  );
  return new Set(entries.filter(([, ok]) => ok).map(([k]) => k));
}
