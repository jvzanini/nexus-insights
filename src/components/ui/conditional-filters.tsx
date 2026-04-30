"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { Plus, Trash2, FolderPlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelectCheckbox } from "@/components/ui/multi-select-checkbox";
import {
  type Condition,
  type ConditionGroup,
  type ConditionOperator,
} from "@/lib/utils/apply-conditions";

export type { Condition, ConditionGroup, ConditionOperator };

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
  return { combinator: "AND", conditions: [] };
}

function isGroup(node: Condition | ConditionGroup): node is ConditionGroup {
  return (
    typeof node === "object" &&
    node !== null &&
    "combinator" in node &&
    Array.isArray((node as ConditionGroup).conditions)
  );
}

/**
 * Where Clause Builder visual.
 * - Combinator pill (AND/OR) no topo de cada grupo.
 * - Lista de condições: campo, operador, valor, remover.
 * - Botões "+ Adicionar condição" e "+ Adicionar grupo" (cria sub-grupo).
 * - Rodapé com "Aplicar" e "Limpar".
 *
 * Sempre que possível, evita derivar estado pesado em render.
 */
export function ConditionalFilters({
  fields,
  initial,
  onChange,
  onApply,
  className,
}: ConditionalFiltersProps) {
  const initialGroup = useMemo<ConditionGroup>(
    () => initial ?? emptyGroup(),
    [initial],
  );
  const [group, setGroup] = useState<ConditionGroup>(initialGroup);

  // Notifica mudanças.
  useEffect(() => {
    if (onChange) onChange(group);
    // queremos disparar SOMENTE quando group muda; onChange é estável via parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  const update = useCallback((next: ConditionGroup) => setGroup(next), []);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card/30 p-4",
        className,
      )}
    >
      <GroupEditor group={group} onChange={update} fields={fields} depth={0} />
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-border/40 pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => update(emptyGroup())}
        >
          Limpar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onApply?.(group)}
        >
          Aplicar
        </Button>
      </div>
    </div>
  );
}

interface GroupEditorProps {
  group: ConditionGroup;
  onChange: (next: ConditionGroup) => void;
  fields: ConditionFieldDef[];
  depth: number;
  onRemove?: () => void;
}

function GroupEditor({
  group,
  onChange,
  fields,
  depth,
  onRemove,
}: GroupEditorProps) {
  const addCondition = () => {
    const first = fields[0];
    if (!first) return;
    const ops = OPERATORS_BY_TYPE[first.type];
    const newCond: Condition = {
      field: first.key,
      operator: ops[0].value,
      value: defaultValueFor(first),
    };
    onChange({
      ...group,
      conditions: [...group.conditions, newCond],
    });
  };

  const addGroup = () => {
    onChange({
      ...group,
      conditions: [...group.conditions, emptyGroup()],
    });
  };

  const updateAt = (idx: number, next: Condition | ConditionGroup) => {
    const arr = group.conditions.slice();
    arr[idx] = next;
    onChange({ ...group, conditions: arr });
  };

  const removeAt = (idx: number) => {
    const arr = group.conditions.slice();
    arr.splice(idx, 1);
    onChange({ ...group, conditions: arr });
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        depth > 0 &&
          "rounded-xl border-l-2 border-violet-500/40 bg-violet-500/[0.02] py-3 pl-3 pr-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <CombinatorToggle
          value={group.combinator}
          onChange={(v) => onChange({ ...group, combinator: v })}
        />
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label="Remover grupo"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {group.conditions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma condição. Adicione uma condição ou um grupo.
          </p>
        ) : (
          group.conditions.map((node, idx) =>
            isGroup(node) ? (
              <GroupEditor
                key={idx}
                group={node}
                onChange={(next) => updateAt(idx, next)}
                fields={fields}
                depth={depth + 1}
                onRemove={() => removeAt(idx)}
              />
            ) : (
              <ConditionRow
                key={idx}
                condition={node}
                fields={fields}
                onChange={(next) => updateAt(idx, next)}
                onRemove={() => removeAt(idx)}
              />
            ),
          )
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addCondition}>
          <Plus className="size-3.5" aria-hidden="true" />
          Adicionar condição
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={addGroup}>
          <FolderPlus className="size-3.5" aria-hidden="true" />
          Adicionar grupo
        </Button>
      </div>
    </div>
  );
}

interface CombinatorToggleProps {
  value: "AND" | "OR";
  onChange: (v: "AND" | "OR") => void;
}

function CombinatorToggle({ value, onChange }: CombinatorToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Combinador lógico"
      className="inline-flex items-center gap-0 rounded-full border border-border/60 bg-background/50 p-0.5"
    >
      {(["AND", "OR"] as const).map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt === "AND" ? "E" : "OU"}
          </button>
        );
      })}
    </div>
  );
}

interface ConditionRowProps {
  condition: Condition;
  fields: ConditionFieldDef[];
  onChange: (next: Condition) => void;
  onRemove: () => void;
}

function ConditionRow({ condition, fields, onChange, onRemove }: ConditionRowProps) {
  const fieldDef =
    fields.find((f) => f.key === condition.field) ?? fields[0];
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
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card p-2.5">
      <select
        value={condition.field}
        onChange={(e) => handleFieldChange(e.target.value)}
        aria-label="Campo"
        className="h-9 min-w-[160px] rounded-md border border-input bg-card px-2.5 text-sm font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
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
          onChange({ ...condition, operator: e.target.value as ConditionOperator })
        }
        aria-label="Operador"
        className="h-9 min-w-[120px] rounded-md border border-input bg-card px-2.5 text-sm text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
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
        className="ml-auto h-9 w-9 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" aria-hidden="true" />
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
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        aria-label="Valor"
        className="h-8 min-w-32 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
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
      // Label do MultiSelectCheckbox vira "Valor" pois o campo já está
      // identificado pelo <select> à esquerda — evita duplicação visual
      // (ex.: "Caixa de entrada" no select + "Caixa de entrada" no popover).
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

    // Fallback para options string: mantém os chips, mas com altura limitada
    // e scroll interno para não estourar o Dialog quando há muitas opções.
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
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
