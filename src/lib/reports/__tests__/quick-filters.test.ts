import {
  mergeConditionGroups,
  quickFiltersToConditionGroup,
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
    const g = {
      combinator: "AND" as const,
      conditions: [{ field: "x", operator: "eq" as const, value: 1 }],
    };
    expect(mergeConditionGroups(null, g)).toBe(g);
  });

  test("dois groups → AND aninhado", () => {
    const a = {
      combinator: "AND" as const,
      conditions: [{ field: "x", operator: "eq" as const, value: 1 }],
    };
    const b = {
      combinator: "OR" as const,
      conditions: [{ field: "y", operator: "eq" as const, value: 2 }],
    };
    const merged = mergeConditionGroups(a, b);
    expect(merged).toEqual({ combinator: "AND", conditions: [a, b] });
  });
});
