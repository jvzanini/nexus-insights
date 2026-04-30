"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook SSR-safe que persiste estado em `localStorage`.
 *
 * - No primeiro render (SSR e client) usa `defaultValue`, evitando hydration mismatch.
 * - Após mount, lê o valor existente em `localStorage` (se houver) e atualiza estado.
 * - Mudanças subsequentes são persistidas com debounce de microtask.
 *
 * O setter aceita valor ou função updater (mesmo contrato de `useState`).
 *
 * Falhas de leitura/escrita (modo privado, quota) são silenciadas e logadas
 * em `console.warn`.
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
  options?: {
    /** Custom serializer (default: JSON.stringify). */
    serialize?: (value: T) => string;
    /** Custom deserializer (default: JSON.parse). */
    deserialize?: (raw: string) => T;
  },
): [T, (value: T | ((prev: T) => T)) => void] {
  const serialize = options?.serialize ?? JSON.stringify;
  const deserialize = options?.deserialize ?? (JSON.parse as (raw: string) => T);

  const [value, setValue] = useState<T>(defaultValue);
  const hydratedRef = useRef(false);

  // Carrega valor armazenado após mount (client-only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValue(deserialize(raw));
      }
    } catch (err) {
      console.warn(`[useLocalStorageState] read ${key} failed`, err);
    } finally {
      hydratedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persiste após hidratar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hydratedRef.current) return;
    try {
      window.localStorage.setItem(key, serialize(value));
    } catch (err) {
      console.warn(`[useLocalStorageState] write ${key} failed`, err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  const update = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) =>
      typeof next === "function" ? (next as (p: T) => T)(prev) : next,
    );
  }, []);

  return [value, update];
}

/**
 * Variante para `Set<string>`. Serializa como array.
 */
export function useLocalStorageSet(
  key: string,
  defaultValue: Set<string>,
): [Set<string>, (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void] {
  const [arr, setArr] = useLocalStorageState<string[]>(
    key,
    Array.from(defaultValue),
  );

  const set = new Set(arr);

  const update = useCallback(
    (next: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      setArr((prevArr) => {
        const prev = new Set(prevArr);
        const resolved =
          typeof next === "function" ? (next as (p: Set<string>) => Set<string>)(prev) : next;
        return Array.from(resolved);
      });
    },
    [setArr],
  );

  return [set, update];
}
