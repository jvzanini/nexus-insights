"use client";

import { useEffect, useState } from "react";

/**
 * Hook que migra um Set persistido de uma key antiga para uma nova versão,
 * aplicando uma função de transformação. Idempotente: roda só na primeira
 * leitura quando a key nova está vazia. Limpa a key antiga após a migração.
 *
 * Uso:
 *   const [cols, setCols] = useMigratedLocalStorageSet(
 *     "conversas-table-cols-v2",
 *     "conversas-table-cols",
 *     (oldSet) => new Set([...oldSet].filter(k => !MIGRATED.has(k))),
 *     DEFAULT_VISIBLE_KEYS,
 *   );
 */
export function useMigratedLocalStorageSet(
  newKey: string,
  oldKey: string,
  migrate: (oldSet: Set<string>) => Set<string>,
  defaultValue: Set<string>,
): [Set<string>, (next: Set<string>) => void] {
  const [value, setValue] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const newRaw = window.localStorage.getItem(newKey);
      if (newRaw) {
        const parsed = JSON.parse(newRaw);
        if (Array.isArray(parsed)) {
          // Limpa v1 se ainda existir, mesmo quando v2 já está populado.
          if (window.localStorage.getItem(oldKey) !== null) {
            window.localStorage.removeItem(oldKey);
          }
          return new Set(parsed.map(String));
        }
      }
      const oldRaw = window.localStorage.getItem(oldKey);
      if (oldRaw) {
        const parsed = JSON.parse(oldRaw);
        if (Array.isArray(parsed)) {
          const oldSet = new Set<string>(parsed.map(String));
          const migrated = migrate(oldSet);
          const result = migrated.size > 0 ? migrated : defaultValue;
          window.localStorage.setItem(
            newKey,
            JSON.stringify([...result]),
          );
          window.localStorage.removeItem(oldKey);
          return result;
        }
      }
      return defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(newKey, JSON.stringify([...value]));
    } catch {
      // ignore quota exceeded etc.
    }
  }, [newKey, value]);

  return [value, setValue];
}
