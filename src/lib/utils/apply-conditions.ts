/**
 * Aplicação de condições do "Where Clause Builder" sobre uma coleção.
 *
 * Um {@link ConditionGroup} é avaliado recursivamente:
 *   - `combinator: "AND"` → todas as conditions/sub-grupos devem ser true.
 *   - `combinator: "OR"`  → ao menos uma condition/sub-grupo deve ser true.
 *
 * Operadores suportados em string/number/date:
 *   eq, neq, gt, gte, lt, lte, contains, starts_with, in, not_in
 */

export type ConditionOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "starts_with"
  | "in"
  | "not_in"
  | "contains_all";

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface ConditionGroup {
  combinator: "AND" | "OR";
  conditions: (Condition | ConditionGroup)[];
}

function isGroup(node: Condition | ConditionGroup): node is ConditionGroup {
  return (
    typeof node === "object" &&
    node !== null &&
    "combinator" in node &&
    Array.isArray((node as ConditionGroup).conditions)
  );
}

function getFieldValue<T>(row: T, field: string): unknown {
  if (row == null) return undefined;
  // Suporte a path "a.b.c"
  if (field.includes(".")) {
    return field.split(".").reduce<unknown>((acc, key) => {
      if (acc == null) return undefined;
      return (acc as Record<string, unknown>)[key];
    }, row);
  }
  return (row as Record<string, unknown>)[field];
}

function toComparable(v: unknown): number | string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return String(v);
}

function compareOrder(a: unknown, b: unknown): number | null {
  const ca = toComparable(a);
  const cb = toComparable(b);
  if (ca === null || cb === null) return null;
  if (typeof ca === "number" && typeof cb === "number") {
    return ca === cb ? 0 : ca < cb ? -1 : 1;
  }
  const sa = String(ca);
  const sb = String(cb);
  return sa === sb ? 0 : sa < sb ? -1 : 1;
}

function evaluateCondition<T>(row: T, cond: Condition): boolean {
  const fieldValue = getFieldValue(row, cond.field);
  const target = cond.value;

  switch (cond.operator) {
    case "eq":
      // eslint-disable-next-line eqeqeq
      return fieldValue == target;
    case "neq":
      // eslint-disable-next-line eqeqeq
      return fieldValue != target;
    case "gt": {
      const c = compareOrder(fieldValue, target);
      return c !== null && c > 0;
    }
    case "gte": {
      const c = compareOrder(fieldValue, target);
      return c !== null && c >= 0;
    }
    case "lt": {
      const c = compareOrder(fieldValue, target);
      return c !== null && c < 0;
    }
    case "lte": {
      const c = compareOrder(fieldValue, target);
      return c !== null && c <= 0;
    }
    case "contains": {
      if (fieldValue == null) return false;
      return String(fieldValue)
        .toLowerCase()
        .includes(String(target ?? "").toLowerCase());
    }
    case "starts_with": {
      if (fieldValue == null) return false;
      return String(fieldValue)
        .toLowerCase()
        .startsWith(String(target ?? "").toLowerCase());
    }
    case "in": {
      if (!Array.isArray(target)) return false;
      // Se fieldValue é array (ex.: labels), faz match se algum item bater
      if (Array.isArray(fieldValue)) {
        return target.some((t) =>
          (fieldValue as unknown[]).some((item) => {
            if (item == null) return false;
            if (typeof item === "object") {
              const obj = item as Record<string, unknown>;
              return (
                obj.id === t ||
                obj.name === t ||
                String(obj.id) === String(t) ||
                String(obj.name) === String(t)
              );
            }
            return item === t || String(item) === String(t);
          }),
        );
      }
      return target.some((t) => t === fieldValue || String(t) === String(fieldValue));
    }
    case "not_in": {
      if (!Array.isArray(target)) return true;
      // Se fieldValue é array (ex.: labels), nega o match item-a-item
      if (Array.isArray(fieldValue)) {
        return !target.some((t) =>
          (fieldValue as unknown[]).some((item) => {
            if (item == null) return false;
            if (typeof item === "object") {
              const obj = item as Record<string, unknown>;
              return (
                obj.id === t ||
                obj.name === t ||
                String(obj.id) === String(t) ||
                String(obj.name) === String(t)
              );
            }
            return item === t || String(item) === String(t);
          }),
        );
      }
      return !target.some((t) => t === fieldValue || String(t) === String(fieldValue));
    }
    case "contains_all": {
      // Para campos que carregam arrays (ex.: labels[]). Cada item do target deve
      // estar presente no fieldValue. Itens objeto são reduzidos a id|name|self.
      if (!Array.isArray(target) || !Array.isArray(fieldValue)) return false;
      const values = (fieldValue as Array<{ id?: number | string; name?: string } | unknown>).map(
        (v) => {
          if (v && typeof v === "object") {
            const obj = v as { id?: number | string; name?: string };
            return obj.id ?? obj.name ?? v;
          }
          return v;
        },
      );
      return target.every((t) =>
        values.some((v) => v === t || String(v) === String(t)),
      );
    }
    default:
      return false;
  }
}

function evaluateGroup<T>(row: T, group: ConditionGroup): boolean {
  // Empty group → trata como "passa".
  if (!group.conditions || group.conditions.length === 0) return true;

  if (group.combinator === "AND") {
    return group.conditions.every((node) =>
      isGroup(node) ? evaluateGroup(row, node) : evaluateCondition(row, node),
    );
  }
  // OR
  return group.conditions.some((node) =>
    isGroup(node) ? evaluateGroup(row, node) : evaluateCondition(row, node),
  );
}

/**
 * Aplica recursivamente um {@link ConditionGroup} a uma coleção e retorna
 * apenas as rows que satisfazem o predicado composto. Grupos vazios não
 * filtram nada (retorna a coleção original sem cópia).
 */
export function applyConditions<T>(rows: T[], group: ConditionGroup): T[] {
  if (!group || !group.conditions || group.conditions.length === 0) {
    return rows;
  }
  return rows.filter((row) => evaluateGroup(row, group));
}
