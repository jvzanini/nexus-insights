"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, FolderPlus, Filter, FolderOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
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
      <CustomSelect
        aria-label="Campo"
        value={condition.field}
        onChange={handleFieldChange}
        options={fields.map((f) => ({ value: f.key, label: f.label }))}
        className="w-auto"
        triggerClassName="h-9 min-w-[170px] font-medium"
      />

      <CustomSelect
        aria-label="Operador"
        value={condition.operator}
        onChange={(v) =>
          onChange({ ...condition, operator: v as ConditionOperator })
        }
        options={operators.map((op) => ({ value: op.value, label: op.label }))}
        className="w-auto"
        triggerClassName="h-9 min-w-[150px]"
      />

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
    const selected = value == null ? "" : String(value);
    return (
      <CustomSelect
        aria-label="Valor"
        value={selected}
        onChange={(v) => {
          const orig = field.options?.find((o) => String(o.value) === v);
          onChange(orig ? orig.value : v);
        }}
        options={(field.options ?? []).map((o) => ({
          value: String(o.value),
          label: o.label,
        }))}
        placeholder="Selecionar"
        className="w-auto"
        triggerClassName="h-9 min-w-[150px]"
      />
    );
  }

  if (field.type === "multi_select" || isMultiOp) {
    const arr = Array.isArray(value) ? (value as (string | number)[]) : [];
    const opts = field.options ?? [];

    if (opts.length === 0) {
      // Free-form multi (campo sem options, ex.: nome/WhatsApp com "em"):
      // input separado por vírgula.
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
          className="h-9 min-w-40"
        />
      );
    }

    // Padrão único para QUALQUER multi_select (numérico OU string): o
    // MultiSelectCheckbox do design system — popover com busca, Selecionar
    // todos / Limpar e scroll. Mapeia opção→índice e preserva o valor
    // original (number ou string) no onChange.
    const metaItems = opts.map((o, i) => ({ id: i, name: o.label }));
    const selectedIds = arr
      .map((v) => opts.findIndex((o) => String(o.value) === String(v)))
      .filter((i) => i >= 0);
    return (
      <div className="min-w-[220px] max-w-[320px] flex-1">
        <MultiSelectCheckbox
          label="Valor"
          options={metaItems}
          value={selectedIds}
          onChange={(ids) => onChange(ids.map((i) => opts[i]!.value))}
        />
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
