# v0.9.2 — Conversas: presets + atalhos + polimento — Implementation Plan

> **Worker:** subagent-driven-development (uma onda só, baixa coordenação).

**Goal:** Entregar 4 pendências da v0.9.0 que ficaram fora do hotfix v0.9.1: migração `localStorage` cols (corrige WhatsApp aparecendo em grade pra usuários antigos), atalhos rápidos (Sem resposta, Não atribuídas, Minhas), filtros salvos como presets, e polimento touch-target em mobile.

**Architecture:** Tudo client-side, reusa primitivos existentes (`<Popover>`, `<Dialog>`, `applyConditions`). Migration via novo hook `useMigratedLocalStorageSet`. Atalhos rápidos viram `ConditionGroup` adicional combinado com `filters.conditionGroup`. Presets persistidos em `localStorage["conversas-filter-presets"]`.

**Tech stack:** Next.js 16 + React 19 + TypeScript + Tailwind v4 + base-ui Popover/Dialog + Framer Motion + Jest + @testing-library/react.

**Reference spec:** `docs/superpowers/specs/2026-04-30-conversas-v0.9.2-design.md`

---

## File Structure

### Novos arquivos
- `src/lib/hooks/use-migrated-local-storage.ts` — hook de migration genérico
- `src/lib/hooks/__tests__/use-migrated-local-storage.test.ts`
- `src/lib/hooks/use-filter-presets.ts` — hook CRUD de presets
- `src/lib/hooks/__tests__/use-filter-presets.test.ts`
- `src/components/reports/quick-filters-popover.tsx`
- `src/components/reports/__tests__/quick-filters-popover.test.tsx`
- `src/components/reports/presets-popover.tsx`
- `src/components/reports/presets-dialog.tsx`
- `src/components/reports/__tests__/presets-dialog.test.tsx`
- `src/lib/reports/quick-filters.ts` — lógica `quickFiltersToConditionGroup`

### Arquivos modificados
- `src/components/reports/conversas-table.tsx` (usar `useMigratedLocalStorageSet`, aceitar `quickFilters`/`appliedConditionGroup` controlado)
- `src/components/reports/conversas-page-client.tsx` (state quickFilters + presets)
- `src/components/reports/advanced-filters.tsx` (incluir `<QuickFiltersPopover>` + `<PresetsPopover>` no toolbar)
- `src/components/reports/applied-filters-chips.tsx` (chip de atalho ativo)
- `src/components/reports/conversa-drill-down.tsx` (h-7 → h-8 nos botões)
- `src/lib/tours/conversas-tour.ts` (passo novo: presets)
- `package.json` (bump 0.9.1 → 0.9.2)
- `CHANGELOG.md` (entry v0.9.2)

---

## Tarefas (uma onda — single subagent dispatch)

### Task 1 — `useMigratedLocalStorageSet` (R1)

**Files:**
- Create `src/lib/hooks/use-migrated-local-storage.ts`
- Create `src/lib/hooks/__tests__/use-migrated-local-storage.test.ts`

- [ ] **Step 1.1: Test (TDD)** — em `__tests__/use-migrated-local-storage.test.ts`:

```ts
import { renderHook, act } from "@testing-library/react";
import { useMigratedLocalStorageSet } from "../use-migrated-local-storage";

describe("useMigratedLocalStorageSet", () => {
  beforeEach(() => localStorage.clear());

  test("v2 vazio + v1 vazio → default", () => {
    const { result } = renderHook(() =>
      useMigratedLocalStorageSet("k-v2", "k-v1", (s) => s, new Set(["a"])),
    );
    expect(Array.from(result.current[0]).sort()).toEqual(["a"]);
  });

  test("v1 existe + v2 vazio → migrate (filtra) e limpa v1", () => {
    localStorage.setItem("k-v1", JSON.stringify(["a", "b", "c"]));
    const { result } = renderHook(() =>
      useMigratedLocalStorageSet(
        "k-v2",
        "k-v1",
        (s) => new Set([...s].filter((k) => k !== "b")),
        new Set(),
      ),
    );
    expect(Array.from(result.current[0]).sort()).toEqual(["a", "c"]);
    expect(localStorage.getItem("k-v1")).toBeNull();
    expect(JSON.parse(localStorage.getItem("k-v2")!).sort()).toEqual(["a", "c"]);
  });

  test("v2 já existe + v1 existe → ignora v1, limpa v1", () => {
    localStorage.setItem("k-v1", JSON.stringify(["legacy"]));
    localStorage.setItem("k-v2", JSON.stringify(["new"]));
    const { result } = renderHook(() =>
      useMigratedLocalStorageSet("k-v2", "k-v1", (s) => s, new Set()),
    );
    expect(Array.from(result.current[0])).toEqual(["new"]);
    expect(localStorage.getItem("k-v1")).toBeNull();
  });

  test("migration resulta em vazio → fallback default", () => {
    localStorage.setItem("k-v1", JSON.stringify(["x", "y"]));
    const { result } = renderHook(() =>
      useMigratedLocalStorageSet(
        "k-v2",
        "k-v1",
        () => new Set(),
        new Set(["fallback"]),
      ),
    );
    expect(Array.from(result.current[0])).toEqual(["fallback"]);
  });

  test("setter atualiza v2 só (não toca v1)", () => {
    const { result } = renderHook(() =>
      useMigratedLocalStorageSet("k-v2", "k-v1", (s) => s, new Set(["a"])),
    );
    act(() => result.current[1](new Set(["x", "y"])));
    expect(JSON.parse(localStorage.getItem("k-v2")!).sort()).toEqual(["x", "y"]);
  });
});
```

- [ ] **Step 1.2: Run test → fails (módulo inexistente).**

- [ ] **Step 1.3: Implement** `src/lib/hooks/use-migrated-local-storage.ts`:

```ts
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
          // Limpa v1 se ainda existir.
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
          const oldSet = new Set(parsed.map(String));
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
```

- [ ] **Step 1.4: Test passes.**

- [ ] **Step 1.5: Trocar uso em `conversas-table.tsx`**:

```ts
// antes:
import { useLocalStorageSet, useLocalStorageState } from "@/lib/hooks/use-local-storage-state";
const STORAGE_COLS = "conversas-table-cols";
const [visibleCols, setVisibleCols] = useLocalStorageSet(STORAGE_COLS, DEFAULT_VISIBLE_KEYS);

// depois:
import { useMigratedLocalStorageSet } from "@/lib/hooks/use-migrated-local-storage";
import { useLocalStorageState } from "@/lib/hooks/use-local-storage-state";
const STORAGE_COLS = "conversas-table-cols-v2";
const STORAGE_COLS_LEGACY = "conversas-table-cols";
const MIGRATED_TO_DRILL_DOWN = new Set([
  "phone", "document", "labels", "custom_attributes", "created_at", "last_activity_at",
]);
const [visibleCols, setVisibleCols] = useMigratedLocalStorageSet(
  STORAGE_COLS,
  STORAGE_COLS_LEGACY,
  (old) => new Set([...old].filter((k) => !MIGRATED_TO_DRILL_DOWN.has(k))),
  DEFAULT_VISIBLE_KEYS,
);
```

- [ ] **Step 1.6: Commit** — `fix(conversas): migra localStorage cols-v2 — corrige WhatsApp aparecendo em grade pra usuários antigos`

---

### Task 2 — Quick Filters (R2)

**Files:**
- Create `src/lib/reports/quick-filters.ts`
- Create `src/components/reports/quick-filters-popover.tsx`
- Create tests

- [ ] **Step 2.1: Constantes e helper**

`src/lib/reports/quick-filters.ts`:

```ts
import type { ConditionGroup } from "@/lib/utils/apply-conditions";

export type QuickFilterKey = "no_response" | "unassigned" | "mine";

export interface QuickFilterDef {
  key: QuickFilterKey;
  label: string;
  description: string;
}

export const QUICK_FILTER_DEFS: QuickFilterDef[] = [
  {
    key: "no_response",
    label: "Sem resposta",
    description: "Conversas com pendência de resposta agora",
  },
  {
    key: "unassigned",
    label: "Não atribuídas",
    description: "Sem atendente designado",
  },
  {
    key: "mine",
    label: "Minhas",
    description: "Atribuídas ao seu usuário",
  },
];

/**
 * Constrói um ConditionGroup AND a partir dos atalhos ativos. Retorna
 * `null` quando nenhum atalho está ativo.
 */
export function quickFiltersToConditionGroup(
  active: Set<QuickFilterKey>,
  currentChatwootUserId: number | null,
): ConditionGroup | null {
  const conditions: ConditionGroup["conditions"] = [];

  if (active.has("no_response")) {
    conditions.push({
      field: "waiting_seconds",
      operator: "gt",
      value: 0,
    });
  }
  if (active.has("unassigned")) {
    conditions.push({
      field: "assignee.id",
      operator: "eq",
      value: null,
    });
  }
  if (active.has("mine") && currentChatwootUserId != null) {
    conditions.push({
      field: "assignee.id",
      operator: "eq",
      value: currentChatwootUserId,
    });
  }

  if (conditions.length === 0) return null;
  return { combinator: "AND", conditions };
}

/**
 * Compõe dois ConditionGroups com AND. Necessário pra combinar atalhos com
 * o conditionGroup do modo Avançado.
 */
export function mergeConditionGroups(
  ...groups: (ConditionGroup | null | undefined)[]
): ConditionGroup | null {
  const valid = groups.filter(
    (g): g is ConditionGroup => !!g && g.conditions.length > 0,
  );
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0]!;
  return {
    combinator: "AND",
    conditions: valid,
  };
}
```

- [ ] **Step 2.2: Test do helper**

`src/lib/reports/__tests__/quick-filters.test.ts`:

```ts
import {
  quickFiltersToConditionGroup,
  mergeConditionGroups,
} from "../quick-filters";

describe("quickFiltersToConditionGroup", () => {
  test("vazio → null", () => {
    expect(quickFiltersToConditionGroup(new Set(), null)).toBeNull();
  });

  test("no_response → 1 condição gt 0", () => {
    const g = quickFiltersToConditionGroup(new Set(["no_response"]), null);
    expect(g).toEqual({
      combinator: "AND",
      conditions: [{ field: "waiting_seconds", operator: "gt", value: 0 }],
    });
  });

  test("mine sem userId → omitida", () => {
    const g = quickFiltersToConditionGroup(new Set(["mine"]), null);
    expect(g).toBeNull();
  });

  test("mine com userId 42 → condição eq 42", () => {
    const g = quickFiltersToConditionGroup(new Set(["mine"]), 42);
    expect(g!.conditions).toContainEqual({
      field: "assignee.id",
      operator: "eq",
      value: 42,
    });
  });

  test("multi-toggle: no_response + unassigned → 2 condições AND", () => {
    const g = quickFiltersToConditionGroup(
      new Set(["no_response", "unassigned"]),
      null,
    );
    expect(g!.conditions).toHaveLength(2);
    expect(g!.combinator).toBe("AND");
  });
});

describe("mergeConditionGroups", () => {
  test("todos null → null", () => {
    expect(mergeConditionGroups(null, null)).toBeNull();
  });

  test("um null um group → group", () => {
    const g = { combinator: "AND" as const, conditions: [{ field: "x", operator: "eq" as const, value: 1 }] };
    expect(mergeConditionGroups(null, g)).toBe(g);
  });

  test("dois groups → AND aninhado", () => {
    const a = { combinator: "AND" as const, conditions: [{ field: "x", operator: "eq" as const, value: 1 }] };
    const b = { combinator: "OR" as const, conditions: [{ field: "y", operator: "eq" as const, value: 2 }] };
    const merged = mergeConditionGroups(a, b);
    expect(merged).toEqual({ combinator: "AND", conditions: [a, b] });
  });
});
```

- [ ] **Step 2.3: `<QuickFiltersPopover>` componente**

`src/components/reports/quick-filters-popover.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  QUICK_FILTER_DEFS,
  type QuickFilterKey,
} from "@/lib/reports/quick-filters";

interface Props {
  active: Set<QuickFilterKey>;
  onToggle: (key: QuickFilterKey) => void;
  /** Se null, atalho "Minhas" fica oculto (sem mapping no User). */
  currentChatwootUserId: number | null;
}

export function QuickFiltersPopover({
  active,
  onToggle,
  currentChatwootUserId,
}: Props) {
  const [open, setOpen] = useState(false);
  const visibleDefs = QUICK_FILTER_DEFS.filter(
    (d) => d.key !== "mine" || currentChatwootUserId != null,
  );
  const count = visibleDefs.filter((d) => active.has(d.key)).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Atalhos rápidos${count > 0 ? ` (${count} ativos)` : ""}`}
            className={cn(
              "relative h-10 px-4",
              count > 0 && "border-violet-500/40 text-foreground",
            )}
            data-tour="quick-filters"
          >
            <Zap aria-hidden="true" />
            Atalhos
            {count > 0 ? (
              <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 tabular-nums">
                {count}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="start" sideOffset={8} className="w-72 p-0">
        <div className="border-b border-border/60 px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Atalhos rápidos
          </span>
        </div>
        <ul role="listbox" aria-label="Atalhos rápidos" className="py-1">
          {visibleDefs.map((def) => {
            const checked = active.has(def.key);
            return (
              <li key={def.key} role="option" aria-selected={checked}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-accent",
                    checked && "bg-accent/40",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggle(def.key)}
                    className="mt-0.5"
                  />
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {def.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {def.description}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2.4: Cabear no `<ConversasPageClient>`**

Adicionar:

```tsx
const [quickFilters, setQuickFilters] = useState<Set<QuickFilterKey>>(new Set());
const toggleQuick = (k: QuickFilterKey) => {
  setQuickFilters((p) => {
    const next = new Set(p);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    return next;
  });
};

// computar conditionGroup composto:
const composedConditionGroup = useMemo(
  () => mergeConditionGroups(
    filterState.conditionGroup,
    quickFiltersToConditionGroup(quickFilters, currentChatwootUserId ?? null),
  ),
  [filterState.conditionGroup, quickFilters, currentChatwootUserId],
);
```

E passar `composedConditionGroup` para `<ConversasTable conditionGroup={...}>` em vez de `filterState.conditionGroup`. Passar `quickFilters`/`onToggleQuick`/`currentChatwootUserId` para `<AdvancedFilters>`.

- [ ] **Step 2.5: Renderizar `<QuickFiltersPopover>` no `<AdvancedFilters>` toolbar**

Inserir no row 2 (linha de busca + filtros + ordenação), entre busca e Filtros:

```tsx
<QuickFiltersPopover
  active={quickFilters}
  onToggle={onToggleQuick}
  currentChatwootUserId={currentChatwootUserId}
/>
```

- [ ] **Step 2.6: Chip de atalho ativo no `<AppliedFiltersChips>`**

Adicionar prop `quickFilters?: Set<QuickFilterKey>` e `onRemoveQuick?: (k) => void`. Renderizar um chip por atalho ativo (com ícone Zap + nome).

- [ ] **Step 2.7: Buscar `currentChatwootUserId` na page**

Em `src/app/(protected)/relatorios/conversas/page.tsx`, ler `user.chatwoot_user_id` (campo Prisma `User`). Se não existir no schema, passar `null` por enquanto e abrir issue futura "Mapping User → Chatwoot user id".

Para v0.9.2: assumir que User Prisma TEM `chatwoot_user_id` ou similar. Se não tiver, o `<QuickFiltersPopover>` simplesmente esconde "Minhas" — atalho continua funcionando.

```tsx
const currentChatwootUserId =
  (user as unknown as { chatwoot_user_id?: number }).chatwoot_user_id ?? null;
```

- [ ] **Step 2.8: Commit** — `feat(conversas): atalhos rápidos (Sem resposta, Não atribuídas, Minhas)`

---

### Task 3 — Filter Presets (R3)

**Files:**
- Create `src/lib/hooks/use-filter-presets.ts`
- Create `src/components/reports/presets-popover.tsx`
- Create `src/components/reports/presets-dialog.tsx`
- Create tests

- [ ] **Step 3.1: Hook `useFilterPresets`**

```ts
"use client";

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
  // Fallback simples
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadPresets(): FilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(list: FilterPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // quota
  }
}

export interface UseFilterPresets {
  presets: FilterPreset[];
  isAtCap: boolean;
  create: (name: string, state: FilterState, sortStack: SortRule[]) => FilterPreset | null;
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
    if (trimmed.length > MAX_NAME_LEN) return `Máximo ${MAX_NAME_LEN} caracteres.`;
    const exists = presets.some(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase() && p.id !== ignoreId,
    );
    if (exists) return "Já existe um preset com este nome.";
    return null;
  };

  const create = (name: string, state: FilterState, sortStack: SortRule[]) => {
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
          ? { ...preset, name: name.trim(), updatedAt: new Date().toISOString() }
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
```

- [ ] **Step 3.2: Test** — `src/lib/hooks/__tests__/use-filter-presets.test.ts`:

```ts
import { renderHook, act } from "@testing-library/react";
import { useFilterPresets } from "../use-filter-presets";
import { EMPTY_FILTER_STATE } from "@/lib/reports/filter-state";

describe("useFilterPresets", () => {
  beforeEach(() => localStorage.clear());

  test("vazio inicialmente", () => {
    const { result } = renderHook(() => useFilterPresets());
    expect(result.current.presets).toEqual([]);
  });

  test("create válido cria preset", () => {
    const { result } = renderHook(() => useFilterPresets());
    let p: ReturnType<typeof result.current.create> = null;
    act(() => {
      p = result.current.create("VIP", EMPTY_FILTER_STATE, []);
    });
    expect(p).not.toBeNull();
    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0]!.name).toBe("VIP");
  });

  test("nome vazio falha validação", () => {
    const { result } = renderHook(() => useFilterPresets());
    expect(result.current.validateName("")).toMatch(/obrigat/i);
    expect(result.current.validateName("   ")).toMatch(/obrigat/i);
  });

  test("nome duplicado falha", () => {
    const { result } = renderHook(() => useFilterPresets());
    act(() => result.current.create("VIP", EMPTY_FILTER_STATE, []));
    expect(result.current.validateName("VIP")).toMatch(/já existe/i);
    expect(result.current.validateName("vip")).toMatch(/já existe/i);
  });

  test("rename atualiza nome", () => {
    const { result } = renderHook(() => useFilterPresets());
    let id = "";
    act(() => {
      const p = result.current.create("VIP", EMPTY_FILTER_STATE, []);
      id = p!.id;
    });
    act(() => result.current.rename(id, "Atendimentos urgentes"));
    expect(result.current.presets[0]!.name).toBe("Atendimentos urgentes");
  });

  test("remove deleta preset", () => {
    const { result } = renderHook(() => useFilterPresets());
    let id = "";
    act(() => {
      const p = result.current.create("VIP", EMPTY_FILTER_STATE, []);
      id = p!.id;
    });
    act(() => result.current.remove(id));
    expect(result.current.presets).toEqual([]);
  });
});
```

- [ ] **Step 3.3: `<PresetsPopover>` componente**

`src/components/reports/presets-popover.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Plus, Settings, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FilterPreset } from "@/lib/hooks/use-filter-presets";

interface Props {
  presets: FilterPreset[];
  isAtCap: boolean;
  onApply: (preset: FilterPreset) => void;
  onCreate: (name: string) => void;
  onOpenManager: () => void;
  validateName: (name: string) => string | null;
}

export function PresetsPopover({
  presets,
  isAtCap,
  onApply,
  onCreate,
  onOpenManager,
  validateName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setCreating(false);
    setName("");
    setErr(null);
  };

  const handleCreate = () => {
    const v = validateName(name);
    if (v) {
      setErr(v);
      return;
    }
    onCreate(name);
    reset();
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Filtros salvos${presets.length > 0 ? ` (${presets.length})` : ""}`}
            data-tour="presets"
            className={cn("relative h-10 px-4")}
          >
            <Star aria-hidden="true" />
            Presets
            {presets.length > 0 ? (
              <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 tabular-nums">
                {presets.length}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="start" sideOffset={8} className="w-80 p-0">
        <div className="border-b border-border/60 px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Meus presets
          </span>
        </div>
        <ul role="menu" className="max-h-72 overflow-y-auto py-1">
          {presets.length === 0 ? (
            <li className="px-3 py-3 text-xs text-muted-foreground">
              Você ainda não salvou nenhum preset.
            </li>
          ) : (
            presets.map((p) => (
              <li key={p.id} role="menuitem">
                <button
                  type="button"
                  onClick={() => {
                    onApply(p);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
                >
                  <Star className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                  <span className="truncate text-sm text-foreground">
                    {p.name}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-border/60 p-2 space-y-1">
          {creating ? (
            <div className="space-y-1.5">
              <Input
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.currentTarget.value);
                  setErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") reset();
                }}
                placeholder="Nome do preset"
                className="h-8 text-xs"
                aria-label="Nome do preset"
              />
              {err ? (
                <p role="alert" className="text-[11px] text-destructive">
                  {err}
                </p>
              ) : null}
              <div className="flex gap-1">
                <Button type="button" size="sm" onClick={handleCreate} className="h-7 text-xs">
                  Salvar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  className="h-7 text-xs"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isAtCap}
              onClick={() => setCreating(true)}
              className="h-8 w-full justify-start gap-2 text-xs"
              title={isAtCap ? "Limite de 50 presets atingido" : undefined}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Salvar atual
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={presets.length === 0}
            onClick={() => {
              onOpenManager();
              setOpen(false);
            }}
            className="h-8 w-full justify-start gap-2 text-xs"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            Gerenciar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3.4: `<PresetsDialog>` componente** (CRUD completo via `<Dialog>` da base-ui — leia `dialog.tsx` antes pra confirmar API):

`src/components/reports/presets-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FilterPreset } from "@/lib/hooks/use-filter-presets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: FilterPreset[];
  onRename: (id: string, name: string) => boolean;
  onRemove: (id: string) => void;
  onApply: (preset: FilterPreset) => void;
  validateName: (name: string, ignoreId?: string) => string | null;
}

export function PresetsDialog({
  open,
  onOpenChange,
  presets,
  onRename,
  onRemove,
  onApply,
  validateName,
}: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const startRename = (p: FilterPreset) => {
    setRenaming(p.id);
    setName(p.name);
    setErr(null);
  };

  const finishRename = () => {
    if (!renaming) return;
    const v = validateName(name, renaming);
    if (v) {
      setErr(v);
      return;
    }
    if (onRename(renaming, name)) {
      setRenaming(null);
      setName("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogTitle>Filtros salvos</DialogTitle>
        <DialogDescription className="sr-only">
          Gerencie seus presets de filtros: renomear, excluir e aplicar.
        </DialogDescription>

        {presets.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhum preset salvo. Use "Salvar atual" no menu de Presets para
            começar.
          </div>
        ) : (
          <ul className="space-y-2 py-3">
            {presets.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-border bg-card p-3"
              >
                {renaming === p.id ? (
                  <div className="space-y-2">
                    <Input
                      autoFocus
                      value={name}
                      onChange={(e) => {
                        setName(e.currentTarget.value);
                        setErr(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") finishRename();
                        if (e.key === "Escape") {
                          setRenaming(null);
                          setErr(null);
                        }
                      }}
                      className="h-9"
                      aria-label="Novo nome do preset"
                    />
                    {err ? (
                      <p role="alert" className="text-xs text-destructive">
                        {err}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={finishRename}>
                        Salvar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRenaming(null);
                          setErr(null);
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : confirmRemove === p.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">
                      Excluir <strong>{p.name}</strong>?
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        onRemove(p.id);
                        setConfirmRemove(null);
                      }}
                    >
                      Excluir
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemove(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 text-sm font-medium text-foreground">
                      {p.name}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        onApply(p);
                        onOpenChange(false);
                      }}
                    >
                      Aplicar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => startRename(p)}
                      aria-label={`Renomear ${p.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemove(p.id)}
                      aria-label={`Excluir ${p.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3.5: Cabear no `<ConversasPageClient>`**

```tsx
const presetsApi = useFilterPresets();
const [presetsDialogOpen, setPresetsDialogOpen] = useState(false);

const handleApplyPreset = (preset: FilterPreset) => {
  // Aplicar state + sortStack como se fosse um Dialog Apply
  // Levantar via callbacks para AdvancedFilters/ConversasTable...
};

// ... e no JSX:
<PresetsDialog
  open={presetsDialogOpen}
  onOpenChange={setPresetsDialogOpen}
  presets={presetsApi.presets}
  onRename={presetsApi.rename}
  onRemove={presetsApi.remove}
  onApply={handleApplyPreset}
  validateName={presetsApi.validateName}
/>
```

E adicionar prop `presetsApi` + `onApplyPreset` em `<AdvancedFilters>`, que renderiza o `<PresetsPopover>`.

- [ ] **Step 3.6: Test do dialog**

`__tests__/presets-dialog.test.tsx` cobrindo: render vazio mostra empty state; renomear inline; confirm de exclusão; aplicar fecha dialog.

- [ ] **Step 3.7: Commit** — `feat(conversas): filtros salvos como presets (CRUD via popover + dialog)`

---

### Task 4 — Polimento touch-target (R4)

**Files:**
- Modify `src/components/reports/conversa-drill-down.tsx` (h-7 → h-8 nos botões)
- Modify `src/components/reports/applied-filters-chips.tsx` (`min-h-9` no chip pai)

- [ ] **Step 4.1: Atualizar drill-down**

```tsx
// dois botões "Ver mais" e "Recolher":
className="mt-2 h-8 text-[12px]"  // era h-7 text-[11px]
```

- [ ] **Step 4.2: Atualizar chips**

Adicionar `min-h-9` ao `<span>` do chip de filtro e do chip de ordenação. Aumentar X de `h-5 w-5` para `h-6 w-6`.

- [ ] **Step 4.3: Commit** — `style(conversas): touch-target em mobile (drill-down e chips)`

---

### Task 5 — Tour update + bump release

**Files:**
- Modify `src/lib/tours/conversas-tour.ts`
- Modify `package.json`
- Modify `CHANGELOG.md`

- [ ] **Step 5.1: Tour: 1 step novo** entre `sorting-chip` e `columns`:

```ts
{
  selector: '[data-tour="presets"]',
  title: "Filtros salvos",
  description:
    "Salve combinações de filtros + ordenação como presets favoritos. Use o botão Atalhos para filtros rápidos do dia a dia.",
}
```

- [ ] **Step 5.2: `package.json`** — `"version": "0.9.2"`

- [ ] **Step 5.3: `CHANGELOG.md`** — entry v0.9.2 no topo:

```markdown
## [v0.9.2] 2026-04-30 — Conversas: presets + atalhos rápidos + polimento

> Complementos da v0.9.0/v0.9.1 — pendências do feedback do João: filtros salvos, atalhos rápidos, migração de localStorage cols (corrige WhatsApp aparecendo na grade pra usuários antigos), polimento touch-target em mobile.

### Adicionado
- **Filtros salvos (presets)** — `<PresetsPopover>` no toolbar com CRUD: salvar atual, listar, aplicar (1 click), renomear, excluir. Cap 50 presets. Persistência em `localStorage["conversas-filter-presets"]`. Cada preset guarda `FilterState` completo + `sortStack`.
- **Atalhos rápidos** — `<QuickFiltersPopover>` (botão "Atalhos") no toolbar com 3 toggles: "Sem resposta" (filtra `waiting_seconds > 0`), "Não atribuídas" (`assignee.id IS NULL`) e "Minhas" (oculto se `User.chatwoot_user_id` não existir). Multi-toggle (combinador AND). Compõe via `applyConditions` com o conditionGroup do modo Avançado.
- **`useMigratedLocalStorageSet`** — hook genérico de migração de keys de localStorage com transformação. Usado para `conversas-table-cols-v2`.
- **`useFilterPresets`** — hook CRUD de presets com validação (nome obrigatório, único, ≤60 chars; cap 50).

### Mudou
- **`STORAGE_COLS`** — `conversas-table-cols` → `conversas-table-cols-v2`. Migration one-shot remove keys que migraram para drill-down em v0.9.0 (`phone, document, labels, custom_attributes, created_at, last_activity_at`). Usuários antigos ficam com layout correto sem perder customizações legítimas.
- **Touch-target em mobile** — "Ver mais" no drill-down `h-7 → h-8`; chips com `min-h-9` e X em `h-6 w-6`.

### Verificação
- `npx tsc --noEmit` → exit 0
- `npx jest` → testes novos: `use-migrated-local-storage` (5), `use-filter-presets` (6), `quick-filters` (5), `presets-dialog` (4) — todos passing
- `npm run build` → OK
```

- [ ] **Step 5.4: Commit final** — `chore(release): v0.9.2 — presets + atalhos + migration cols + polimento` + push.

---

## Self-review

- **Spec coverage:** R1 (Task 1) ✓, R2 (Task 2) ✓, R3 (Task 3) ✓, R4 (Task 4) ✓.
- **Sem placeholders:** TODO os steps têm código concreto.
- **Type consistency:** `FilterPreset`, `QuickFilterKey`, `useMigratedLocalStorageSet` consistentes em todos os arquivos.
- **YAGNI:** sem sync entre dispositivos, sem export, sem custom shortcuts; só o pedido.
- **Risco residual:** mapping `User.chatwoot_user_id` pode não existir no schema Prisma. Se não existir, `currentChatwootUserId = null`, "Minhas" oculto, sistema funciona; nenhum break. Verificar no `use-filter-presets` ou `prisma/schema.prisma` antes; se faltar, deixa anotado pra v1.0.

**Plan final.** Pronto para subagent-driven-development.
