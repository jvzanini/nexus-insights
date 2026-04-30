import "server-only";

import { pgPool } from "@/lib/pg-pool";
import { ALL_REPORT_KEYS } from "./catalog";

const KEY = "platform.enabled_reports";
const cache = new Map<string, { value: Set<string>; expiresAt: number }>();
const TTL_MS = 30_000;

/**
 * Retorna o conjunto de keys de relatórios habilitados.
 * Lazy default: se a chave não existir no DB, retorna TODAS as keys do catálogo.
 */
export async function getEnabledReportKeys(): Promise<Set<string>> {
  const cached = cache.get(KEY);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let keys: Set<string>;
  try {
    const r = await pgPool.query<{ value: unknown }>(
      "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
      [KEY],
    );
    if (!r.rowCount) {
      keys = new Set(ALL_REPORT_KEYS);
    } else {
      const raw = r.rows[0].value;
      let arr: string[] = [];
      if (Array.isArray(raw)) {
        arr = raw as string[];
      } else if (
        raw &&
        typeof raw === "object" &&
        Array.isArray((raw as { value?: unknown }).value)
      ) {
        arr = (raw as { value: string[] }).value;
      } else if (
        raw &&
        typeof raw === "object" &&
        Array.isArray((raw as { reports?: unknown }).reports)
      ) {
        arr = (raw as { reports: string[] }).reports;
      }
      keys = new Set(arr.length > 0 ? arr : ALL_REPORT_KEYS);
    }
  } catch {
    keys = new Set(ALL_REPORT_KEYS);
  }

  cache.set(KEY, { value: keys, expiresAt: Date.now() + TTL_MS });
  return keys;
}

export function invalidateEnabledReports(): void {
  cache.clear();
}

import { getVisibleReportKeys } from "./visibility";

/**
 * @deprecated Use `getVisibleReportKeys(userRole)` em src/lib/reports/visibility.ts.
 * Mantido apenas para callers legados. Equivale a `getVisibleReportKeys("super_admin")`
 * (i.e., "todos os relatórios não marcados como `none`").
 */
export async function getVisibleReportKeysGlobal(): Promise<Set<string>> {
  return getVisibleReportKeys("super_admin");
}
