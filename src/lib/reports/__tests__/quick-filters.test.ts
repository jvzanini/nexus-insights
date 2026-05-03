import {
  mergeConditionGroups,
  quickFiltersToConditionGroup,
} from "../quick-filters";

describe("quickFiltersToConditionGroup (schema v2)", () => {
  test("vazio → null", () => {
    expect(quickFiltersToConditionGroup(new Set(), null)).toBeNull();
  });

  test("no_response → 1 item gt 0 sem connector", () => {
    const g = quickFiltersToConditionGroup(new Set(["no_response"]), null);
    expect(g).toEqual({
      items: [
        {
          connector: undefined,
          node: { field: "waiting_seconds", operator: "gt", value: 0 },
        },
      ],
    });
  });

  test("mine sem userId → omitida", () => {
    const g = quickFiltersToConditionGroup(new Set(["mine"]), null);
    expect(g).toBeNull();
  });

  test("mine com userId 42 → item eq 42", () => {
    const g = quickFiltersToConditionGroup(new Set(["mine"]), 42);
    expect(g!.items.map((i) => i.node)).toContainEqual({
      field: "assignee.id",
      operator: "eq",
      value: 42,
    });
  });

  test("multi-toggle: no_response + unassigned → 2 items, primeiro sem connector, segundo AND", () => {
    const g = quickFiltersToConditionGroup(
      new Set(["no_response", "unassigned"]),
      null,
    );
    expect(g!.items).toHaveLength(2);
    expect(g!.items[0].connector).toBeUndefined();
    expect(g!.items[1].connector).toBe("AND");
  });
});

describe("mergeConditionGroups (schema v2)", () => {
  test("todos null → null", () => {
    expect(mergeConditionGroups(null, null)).toBeNull();
  });

  test("um null um group → group", () => {
    const g = {
      items: [
        {
          connector: undefined,
          node: { field: "x", operator: "eq" as const, value: 1 },
        },
      ],
    };
    expect(mergeConditionGroups(null, g)).toBe(g);
  });

  test("dois groups → wrapper items[] com AND no segundo", () => {
    const a = {
      items: [
        {
          connector: undefined,
          node: { field: "x", operator: "eq" as const, value: 1 },
        },
      ],
    };
    const b = {
      items: [
        {
          connector: undefined,
          node: { field: "y", operator: "eq" as const, value: 2 },
        },
      ],
    };
    const merged = mergeConditionGroups(a, b);
    expect(merged).toEqual({
      items: [
        { connector: undefined, node: a },
        { connector: "AND", node: b },
      ],
    });
  });
});
