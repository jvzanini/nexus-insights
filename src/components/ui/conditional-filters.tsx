"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { Plus, Trash2, FolderPlus, Filter, FolderOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelectCheckbox } from "@/components/ui/multi-select-checkbox";
import {
  isGroup as isConditionGroup,
  type Condition,
  type ConditionGroup,
  type ConditionGroupItem,
  type ConditionOperator,
} from "@/lib/utils/apply-conditions";

export type { Condition, ConditionGroup, ConditionGroupItem, ConditionOperator };

export interface ConditionFieldDef {
  key: string;
  label: string;
  type: "string" | "number" | "select" | "multi_select" | "date";
  options?: { value: string | number; label: string }[];
}

export interface ConditionalFiltersProps {
  fields: ConditionFieldDef[];
  initial?: ConditionGroup;
  onChange?: (group: ConditionGroup) => void;
  onApply?: (group: ConditionGroup) => void;
  className?: string;
  /**
   * v0.32: oculta o rodapé interno com Aplicar/Limpar.
   *
   * Use quando o caller controla o ciclo apply/cancel externamente
   * (ex.: FiltersDialog tem um único botão "Aplicar" no footer global —
   * dois "Aplicar" empilhados confundem). O caller passa
   * `onChange` pra refletir mudanças no draft externo.
   */
  hideActions?: boolean;
}

interface OperatorOption {
  value: ConditionOperator;
  label: string;
}

const OPERATORS_BY_TYPE: Record<ConditionFieldDef["type"], OperatorOption[]> = {
  string: [
    { value: "eq", label: "igual a" },
    { value: "neq", label: "diferente de" },
    { value: "contains", label: "contém" },
    { value: "starts_with", label: "começa com" },
    { value: "in", label: "em" },
    { value: "not_in", label: "fora de" },
  ],
  number: [
    { value: "eq", label: "igual a" },
    { value: "neq", label: "diferente de" },
    { value: "gt", label: "maior que" },
    { value: "gte", label: "maior ou igual" },
    { value: "lt", label: "menor que" },
    { value: "lte", label: "menor ou igual" },
  ],
  select: [
    { value: "eq", label: "igual a" },
    { value: "neq", label: "diferente de" },
  ],
  multi_select: [
    { value: "in", label: "em" },
    { value: "not_in", label: "fora de" },
    { value: "contains_all", label: "contém todos" },
  ],
  date: [
    { value: "eq", label: "em" },
    { value: "gt", label: "depois de" },
    { value: "gte", label: "a partir de" },
    { value: "lt", label: "antes de" },
    { value: "lte", label: "até" },
  ],
};

function emptyGroup(): ConditionGroup {
  return { items: [] };
}

// Re-export do helper canônico — schema v2 (connector per-par no item).
const isGroup = isConditionGroup;

/**
 * Where Clause Builder visual (v0.32 redesign).
 *
 * Topo: <ConditionalFilters> top-level com state controlado + rodapé opcional
 * Aplicar/Limpar (escondido via `hideActions` quando caller é Dialog).
 *
 * Recursivo: <ConditionalFiltersInner> stateless via prop. Cada item do grupo
 * pode ser uma Condição (`Condition`) ou um Sub-grupo (`ConditionGroup`).
 *
 * UX:
 * - Item de Condição: card cinza com ícone Filter, hover violet, botão delete
 *   aparece em group-hover.
 * - Item de Grupo: card violet com ícone FolderOpen + label "Grupo" uppercase,
 *   conteúdo recursivo indentado com border-l violet + bg-muted/20.
 * - Conector entre items (idx > 0): chip clicável w-9 h-5 com "E"/"OU" uppercase,
 *   linhas tracejadas conectando items (continuidade visual).
 * - Animations sutis (motion-safe:animate-in fade-in slide-in-from-top-1) ao
 *   adicionar/remover items.
 * - Empty state: placeholder italic.
 */
export function ConditionalFilters({
  fields,
  initial,
  onChange,
  onApply,
  className,
  hideActions = false,
}: ConditionalFiltersProps) {
  const initialGroup = useMemo<ConditionGroup>(
    () => (initial && initial.items?.length ? initial : emptyGroup()),
    [initial],
  );
  const [group, setGroup] = useState<ConditionGroup>(initialGroup);

  // Sync com prop `initial` quando muda externamente.
  useEffect(() => {
    setGroup(initialGroup);
  }, [initialGroup]);

  const updateGroup = useCallback(
    (next: ConditionGroup) => {
      setGroup(next);
      onChange?.(next);
    },
    [onChange],
  );

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card/30 p-4",
        className,
      )}
    >
      <ConditionalFiltersInner
        fields={fields}
        group={group}
        onChange={updateGroup}
        depth={0}
      />
      {hideActions ? null : (
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-border/40 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => updateGroup(emptyGroup())}
            className="cursor-pointer"
          >
            Limpar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => onApply?.(group)}
            className="cursor-pointer"
          >
            Aplicar
          </Button>
        </div>
      )}
    </div>
  );
}

interface InnerProps {
  fields: ConditionFieldDef[];
  group: ConditionGroup;
  onChange: (next: ConditionGroup) => void;
  depth: number;
}

function ConditionalFiltersInner({
  fields,
  group,
  onChange,
  depth,
}: InnerProps) {
  const items = group.items ?? [];

  const updateItem = (idx: number, patch: Partial<ConditionGroupItem>) => {
    const next = items.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange({ items: next });
  };

  const updateNodeAt = (idx: number, nextNode: Condition | ConditionGroup) => {
    updateItem(idx, { node: nextNode });
  };

  const removeAt = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    // Item 0 nunca tem connector — corrige caso o item removido fosse o primeiro.
    if (next[0]) next[0] = { ...next[0], connector: undefined };
    onChange({ items: next });
  };

  const addCondition = () => {
    const first = fields[0];
    if (!first) return;
    const ops = OPERATORS_BY_TYPE[first.type];
    const newCond: Condition = {
      field: first.key,
      operator: ops[0].value,
      value: defaultValueFor(first),
    };
    const newItem: ConditionGroupItem = {
      connector: items.length === 0 ? undefined : "AND",
      node: newCond,
    };
    onChange({ items: [...items, newItem] });
  };

  const addGroup = () => {
    const newItem: ConditionGroupItem = {
      connector: items.length === 0 ? undefined : "AND",
      node: emptyGroup(),
    };
    onChange({ items: [...items, newItem] });
  };

  const toggleConnector = (idx: number) => {
    if (idx === 0) return; // primeiro nunca tem connector
    const current = items[idx]?.connector ?? "AND";
    updateItem(idx, { connector: current === "AND" ? "OR" : "AND" });
  };

  return (
    <div className="flex flex-col gap-1">
      {items.length === 0 ? (
        <p className="px-2 py-3 text-xs italic text-muted-foreground">
          Nenhuma condição. Adicione uma condição ou um grupo para começar.
        </p>
      ) : (
        items.map((item, idx) => {
          const connector = item.connector ?? "AND";
          const nextLabel = connector === "AND" ? "OU" : "E";
          return (
            <div key={idx} className="flex flex-col gap-0">
              {idx > 0 ? (
                <div className="my-1.5 ml-2 flex items-center gap-2 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
                  <div
                    className="h-3 w-px bg-border"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    onClick={() => toggleConnector(idx)}
                    aria-label={`Mudar operador para ${nextLabel}`}
                    className={cn(
                      "inline-flex h-5 w-9 cursor-pointer items-center justify-center rounded-md border text-[10px] font-semibold uppercase tracking-wide transition-colors outline-none",
                      "focus-visible:ring-2 focus-visible:ring-ring/50",
                      connector === "OR"
                        ? "border-violet-500/40 bg-violet-500/10 text-violet-500 hover:bg-violet-500/15"
                        : "border-border bg-card text-foreground hover:border-violet-500/40 hover:bg-muted hover:text-violet-500",
                    )}
                  >
                    {connector === "OR" ? "OU" : "E"}
                  </button>
                  <div
                    className="h-px flex-1 bg-border"
                    aria-hidden="true"
                  />
                </div>
              ) : null}

              {isGroup(item.node) ? (
                <GroupCard
                  group={item.node}
                  fields={fields}
                  depth={depth + 1}
                  onChange={(next) => updateNodeAt(idx, next)}
                  onRemove={() => removeAt(idx)}
                />
              ) : (
                <ConditionRow
                  condition={item.node}
                  fields={fields}
                  onChange={(next) => updateNodeAt(idx, next)}
                  onRemove={() => removeAt(idx)}
                />
              )}
            </div>
          );
        })
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCondition}
          className="h-8 cursor-pointer text-xs"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Adicionar condição
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addGroup}
          className="h-8 cursor-pointer text-xs"
        >
          <FolderPlus className="size-3.5" aria-hidden="true" />
          Adicionar grupo
        </Button>
      </div>
    </div>
  );
}

interface GroupCardProps {
  group: ConditionGroup;
  fields: ConditionFieldDef[];
  depth: number;
  onChange: (next: ConditionGroup) => void;
  onRemove: () => void;
}

function GroupCard({
  group,
  fields,
  depth,
  onChange,
  onRemove,
}: GroupCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-violet-500/30 bg-muted/20 p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <FolderOpen
          className="size-3.5 shrink-0 text-violet-500"
          aria-hidden="true"
        />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">
          Grupo
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label="Remover grupo"
          className="ml-auto h-6 w-6 cursor-pointer opacity-50 transition-opacity hover:opacity-100 hover:text-destructive"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      <div className="border-l-2 border-violet-500/30 pl-3">
        <ConditionalFiltersInner
          fields={fields}
          group={group}
          onChange={onChange}
          depth={depth}
        />
      </div>
    </div>
  );
}

interface ConditionRowProps {
  condition: Condition;
  fields: ConditionFieldDef[];
  onChange: (next: Condition) => void;
  onRemove: () => void;
}

function ConditionRow({
  condition,
  fields,
  onChange,
  onRemove,
}: ConditionRowProps) {
  const fieldDef = fields.find((f) => f.key === condition.field) ?? fields[0];
  const operators = OPERATORS_BY_TYPE[fieldDef.type];

  const handleFieldChange = (key: string) => {
    const nextField = fields.find((f) => f.key === key);
    if (!nextField) return;
    const nextOps = OPERATORS_BY_TYPE[nextField.type];
    const opStillValid = nextOps.some((o) => o.value === condition.operator);
    onChange({
      field: key,
      operator: opStillValid ? condition.operator : nextOps[0].value,
      value: defaultValueFor(nextField),
    });
  };

  return (
    <div
      className={cn(
        "group flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-card/50 p-3 transition-colors",
        "hover:border-violet-500/30",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200",
      )}
    >
      <Filter
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <select
        value={condition.field}
        onChange={(e) => handleFieldChange(e.target.value)}
        aria-label="Campo"
        className="h-9 min-w-[160px] cursor-pointer rounded-md border border-input bg-card px-2.5 text-sm font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        value={condition.operator}
        onChange={(e) =>
          onChange({
            ...condition,
            operator: e.target.value as ConditionOperator,
          })
        }
        aria-label="Operador"
        className="h-9 min-w-[120px] cursor-pointer rounded-md border border-input bg-card px-2.5 text-sm text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      <ValueInput
        field={fieldDef}
        operator={condition.operator}
        value={condition.value}
        onChange={(v) => onChange({ ...condition, value: v })}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        aria-label="Remover condição"
        className="ml-auto h-8 w-8 cursor-pointer text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

interface ValueInputProps {
  field: ConditionFieldDef;
  operator: ConditionOperator;
  value: unknown;
  onChange: (v: unknown) => void;
}

function ValueInput({ field, operator, value, onChange }: ValueInputProps) {
  const isMultiOp = operator === "in" || operator === "not_in";

  if (field.type === "select" && !isMultiOp) {
    return (
      <select
        value={(value as string | number | undefined) ?? ""}
        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
          onChange(e.target.value)
        }
        aria-label="Valor"
        className="h-8 min-w-32 cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        <option value="">—</option>
        {field.options?.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "multi_select" || isMultiOp) {
    const arr = Array.isArray(value) ? (value as (string | number)[]) : [];
    const opts = field.options ?? [];

    if (opts.length === 0) {
      // Free-form multi: usa input separado por vírgula.
      return (
        <Input
          type="text"
          value={arr.join(", ")}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          placeholder="valor1, valor2"
          aria-label="Valores"
          className="h-8 min-w-40"
        />
      );
    }

    // Quando todas as opções têm value numérico (caso comum: inboxes, teams,
    // labels, status), reusa o MultiSelectCheckbox compacto — popover com
    // busca interna + Selecionar todos / Limpar + scroll. Substitui o
    // "tapete de chips" que estourava o Dialog.
    const allNumeric = opts.every((o) => typeof o.value === "number");
    if (allNumeric) {
      return (
        <div className="min-w-[220px] max-w-[320px] flex-1">
          <MultiSelectCheckbox
            label="Valor"
            options={opts.map((o) => ({
              id: o.value as number,
              name: o.label,
            }))}
            value={arr.map((v) => Number(v)).filter((n) => Number.isFinite(n))}
            onChange={(next) => onChange(next)}
          />
        </div>
      );
    }

    // Fallback para options string: chips, mas com altura limitada e scroll
    // interno para não estourar o Dialog quando há muitas opções.
    const toggle = (optValue: string | number) => {
      const exists = arr.some((v) => String(v) === String(optValue));
      const next = exists
        ? arr.filter((v) => String(v) !== String(optValue))
        : [...arr, optValue];
      onChange(next);
    };
    return (
      <div className="flex max-h-32 max-w-[280px] flex-wrap gap-1 overflow-y-auto rounded-md border border-border/40 bg-background/40 p-1.5">
        {opts.map((opt) => {
          const active = arr.some((v) => String(v) === String(opt.value));
          return (
            <button
              key={String(opt.value)}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => toggle(opt.value)}
              className={cn(
                "cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <Input
        type="number"
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Number(v));
        }}
        aria-label="Valor"
        className="h-8 min-w-32"
      />
    );
  }

  if (field.type === "date") {
    return (
      <Input
        type="date"
        value={
          value instanceof Date
            ? value.toISOString().slice(0, 10)
            : typeof value === "string"
              ? value
              : ""
        }
        onChange={(e) => onChange(e.target.value)}
        aria-label="Data"
        className="h-8 min-w-36"
      />
    );
  }

  // string default
  return (
    <Input
      type="text"
      value={(value as string | undefined) ?? ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Valor"
      className="h-8 min-w-40"
    />
  );
}

function defaultValueFor(field: ConditionFieldDef): unknown {
  switch (field.type) {
    case "number":
      return null;
    case "multi_select":
      return [];
    case "select":
      return field.options?.[0]?.value ?? "";
    case "date":
      return "";
    default:
      return "";
  }
}
