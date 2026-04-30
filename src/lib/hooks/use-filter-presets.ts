"use client";

// useFilterPresets — hook CRUD de "filtros salvos" (presets) persistidos em
// localStorage["conversas-filter-presets"]. Cada preset guarda o
// FilterState completo + sortStack. Cap de 50 presets, nome único, ≤60
// chars. Validação retorna mensagem em PT-BR ou null se ok.

import { useEffect, useState } from "react";
import type { FilterState } from "@/lib/reports/filter-state";
import type { SortRule } from "@/components/reports/sorting-dialog";

export interface FilterPreset {
  id: string;
  name: string;
  state: FilterState;
  sortStack: SortRule[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "conversas-filter-presets";
const MAX_PRESETS = 50;
const MAX_NAME_LEN = 60;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadPresets(): FilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FilterPreset[]) : [];
  } catch {
    return [];
  }
}

function persist(list: FilterPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // quota exceeded — ignora silenciosamente.
  }
}

export interface UseFilterPresets {
  presets: FilterPreset[];
  isAtCap: boolean;
  create: (
    name: string,
    state: FilterState,
    sortStack: SortRule[],
  ) => FilterPreset | null;
  rename: (id: string, name: string) => boolean;
  remove: (id: string) => void;
  validateName: (name: string, ignoreId?: string) => string | null;
}

export function useFilterPresets(): UseFilterPresets {
  const [presets, setPresets] = useState<FilterPreset[]>(() => loadPresets());

  useEffect(() => {
    persist(presets);
  }, [presets]);

  const validateName = (name: string, ignoreId?: string): string | null => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return "Nome é obrigatório.";
    if (trimmed.length > MAX_NAME_LEN)
      return `Máximo ${MAX_NAME_LEN} caracteres.`;
    const exists = presets.some(
      (p) =>
        p.name.toLowerCase() === trimmed.toLowerCase() && p.id !== ignoreId,
    );
    if (exists) return "Já existe um preset com este nome.";
    return null;
  };

  const create = (
    name: string,
    state: FilterState,
    sortStack: SortRule[],
  ): FilterPreset | null => {
    if (presets.length >= MAX_PRESETS) return null;
    if (validateName(name) !== null) return null;
    const now = new Date().toISOString();
    const preset: FilterPreset = {
      id: uuid(),
      name: name.trim(),
      state,
      sortStack,
      createdAt: now,
      updatedAt: now,
    };
    setPresets((p) => [...p, preset]);
    return preset;
  };

  const rename = (id: string, name: string): boolean => {
    if (validateName(name, id) !== null) return false;
    setPresets((p) =>
      p.map((preset) =>
        preset.id === id
          ? {
              ...preset,
              name: name.trim(),
              updatedAt: new Date().toISOString(),
            }
          : preset,
      ),
    );
    return true;
  };

  const remove = (id: string) => {
    setPresets((p) => p.filter((preset) => preset.id !== id));
  };

  return {
    presets,
    isAtCap: presets.length >= MAX_PRESETS,
    create,
    rename,
    remove,
    validateName,
  };
}
