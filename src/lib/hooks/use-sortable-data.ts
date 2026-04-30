"use client";

import { useMemo, useState, useCallback } from "react";

/**
 * Configuração de ordenação aplicada a uma coleção genérica.
 *
 * - `key` identifica o critério de ordenação (geralmente o nome da coluna).
 * - `direction` indica ascendente ou descendente.
 * - `compareFn` opcional permite comparação customizada entre dois itens.
 *   Se ausente, fazemos um fallback baseado em `row[key]` (somente quando
 *   `key` for de fato uma propriedade de `T`).
 */
export interface SortConfig<T> {
  key: keyof T | string;
  direction: "asc" | "desc";
  compareFn?: (a: T, b: T) => number;
}

interface UseSortableDataReturn<T> {
  sortedData: T[];
  sortConfig: SortConfig<T> | null;
  toggleSort: (key: string, compareFn?: (a: T, b: T) => number) => void;
}

function defaultCompare<T>(a: T, b: T, key: string): number {
  const av = (a as Record<string, unknown>)[key];
  const bv = (b as Record<string, unknown>)[key];

  if (av === bv) return 0;
  if (av == null) return -1;
  if (bv == null) return 1;

  if (typeof av === "number" && typeof bv === "number") {
    return av - bv;
  }
  if (av instanceof Date && bv instanceof Date) {
    return av.getTime() - bv.getTime();
  }
  // Fallback: string compare (locale-aware, numeric-aware).
  return String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
}

/**
 * Hook stateful de ordenação. Mantém referência estável de `sortedData`
 * quando nem `data` nem `sortConfig` mudaram (via useMemo).
 *
 * Cycle de toggle por key:
 *   null → asc → desc → null
 *
 * Quando `toggleSort` recebe uma key DIFERENTE da atual, sempre inicia em "asc".
 */
export function useSortableData<T>(
  data: T[],
  initial?: SortConfig<T>,
): UseSortableDataReturn<T> {
  const [sortConfig, setSortConfig] = useState<SortConfig<T> | null>(
    initial ?? null,
  );

  const toggleSort = useCallback(
    (key: string, compareFn?: (a: T, b: T) => number) => {
      setSortConfig((current) => {
        if (!current || current.key !== key) {
          return { key, direction: "asc", compareFn };
        }
        if (current.direction === "asc") {
          return { key, direction: "desc", compareFn: compareFn ?? current.compareFn };
        }
        // Era desc: zera ordenação.
        return null;
      });
    },
    [],
  );

  const sortedData = useMemo<T[]>(() => {
    if (!sortConfig) return data;
    const { key, direction, compareFn } = sortConfig;
    const factor = direction === "asc" ? 1 : -1;
    const cmp =
      compareFn ?? ((a: T, b: T) => defaultCompare(a, b, String(key)));

    // Cópia para não mutar o array original.
    return [...data].sort((a, b) => cmp(a, b) * factor);
  }, [data, sortConfig]);

  return { sortedData, sortConfig, toggleSort };
}
