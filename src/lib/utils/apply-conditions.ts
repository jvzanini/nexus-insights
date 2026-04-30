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
  | "not_in";

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
      return target.some((t) => t === fieldValue || String(t) === String(fieldValue));
    }
    case "not_in": {
      if (!Array.isArray(target)) return true;
      return !target.some((t) => t === fieldValue || String(t) === String(fieldValue));
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
