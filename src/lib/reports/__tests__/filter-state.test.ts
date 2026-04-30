import {
  EMPTY_FILTER_STATE,
  type FilterState,
  deserializeFilterState,
  diffFilterStates,
  isFilterStateEqual,
  serializeFilterState,
} from "@/lib/reports/filter-state";
import {
  encodeConditionGroup,
  decodeConditionGroup,
} from "@/lib/reports/condition-group-codec";
import type { ConditionGroup } from "@/lib/utils/apply-conditions";

function makeState(overrides: Partial<FilterState> = {}): FilterState {
  return {
    period: "hoje",
    inboxIds: [],
    teamIds: [],
    assigneeIds: [],
    statuses: [],
    priorities: [],
    labelIds: [],
    mode: "simple",
    ...overrides,
  };
}

describe("serializeFilterState", () => {
  it("EMPTY_FILTER_STATE serializa apenas period=hoje", () => {
    const sp = serializeFilterState(EMPTY_FILTER_STATE);
    expect(sp.toString()).toBe("period=hoje");
  });

  it("serializa custom range quando period=custom", () => {
    const sp = serializeFilterState(
      makeState({
        period: "custom",
        customRange: { start: "2026-04-01", end: "2026-04-30" },
      }),
    );
    expect(sp.get("period")).toBe("custom");
    expect(sp.get("custom_start")).toBe("2026-04-01");
    expect(sp.get("custom_end")).toBe("2026-04-30");
  });

  it("não serializa custom_* quando period != custom", () => {
    const sp = serializeFilterState(
      makeState({
        period: "hoje",
        customRange: { start: "2026-04-01", end: "2026-04-30" },
      }),
    );
    expect(sp.get("custom_start")).toBeNull();
    expect(sp.get("custom_end")).toBeNull();
  });

  it("serializa listas separadas por vírgula", () => {
    const sp = serializeFilterState(
      makeState({
        period: "mes_atual",
        inboxIds: [1, 2],
        teamIds: [10],
        assigneeIds: [3, 4, 5],
        statuses: [0, 1],
        priorities: [0, 2],
        labelIds: [11, 12],
      }),
    );
    expect(sp.get("inbox")).toBe("1,2");
    expect(sp.get("team")).toBe("10");
    expect(sp.get("assignee")).toBe("3,4,5");
    expect(sp.get("status")).toBe("0,1");
    expect(sp.get("priority")).toBe("0,2");
    expect(sp.get("label")).toBe("11,12");
  });

  it("aplica trim na busca e ignora string vazia", () => {
    const a = serializeFilterState(makeState({ search: "  hello  " }));
    expect(a.get("q")).toBe("hello");

    const b = serializeFilterState(makeState({ search: "   " }));
    expect(b.get("q")).toBeNull();
  });

  it("não serializa mode/cg em modo simple", () => {
    const sp = serializeFilterState(EMPTY_FILTER_STATE);
    expect(sp.get("mode")).toBeNull();
    expect(sp.get("cg")).toBeNull();
  });

  it("serializa mode=advanced + cg quando conditionGroup presente", () => {
    const cg: ConditionGroup = {
      combinator: "AND",
      conditions: [{ field: "status", operator: "eq", value: 1 }],
    };
    const sp = serializeFilterState(
      makeState({ mode: "advanced", conditionGroup: cg }),
    );
    expect(sp.get("mode")).toBe("advanced");
    expect(sp.get("cg")).toBeTruthy();
  });

  it("mode=advanced sem conditionGroup serializa só mode", () => {
    const sp = serializeFilterState(makeState({ mode: "advanced" }));
    expect(sp.get("mode")).toBe("advanced");
    expect(sp.get("cg")).toBeNull();
  });
});

describe("deserializeFilterState", () => {
  it("URL vazia retorna defaults (period=hoje)", () => {
    const result = deserializeFilterState(new URLSearchParams());
    expect(result).toEqual(EMPTY_FILTER_STATE);
  });

  it("period inválido cai pra hoje", () => {
    const sp = new URLSearchParams("period=xpto");
    expect(deserializeFilterState(sp).period).toBe("hoje");
  });

  it("period=todos é aceito como canônico", () => {
    const sp = new URLSearchParams("period=todos");
    expect(deserializeFilterState(sp).period).toBe("todos");
  });

  it("custom range com formato inválido cai pra undefined (mas mantém period=custom)", () => {
    const sp = new URLSearchParams(
      "period=custom&custom_start=foo&custom_end=2026-04-30",
    );
    const result = deserializeFilterState(sp);
    expect(result.period).toBe("custom");
    expect(result.customRange).toBeUndefined();
  });

  it("ignora custom range quando period != custom", () => {
    const sp = new URLSearchParams(
      "period=hoje&custom_start=2026-04-01&custom_end=2026-04-30",
    );
    expect(deserializeFilterState(sp).customRange).toBeUndefined();
  });

  it("ignora valores não numéricos em listas", () => {
    const sp = new URLSearchParams(
      "period=hoje&inbox=1,abc,2&team=,&status=NaN,3&priority=0,foo,2&assignee=10",
    );
    const result = deserializeFilterState(sp);
    expect(result.inboxIds).toEqual([1, 2]);
    expect(result.teamIds).toEqual([]);
    expect(result.statuses).toEqual([3]);
    expect(result.priorities).toEqual([0, 2]);
    expect(result.assigneeIds).toEqual([10]);
  });

  it("deserializa label= em labelIds", () => {
    const sp = new URLSearchParams("period=hoje&label=1,2,3");
    const result = deserializeFilterState(sp);
    expect(result.labelIds).toEqual([1, 2, 3]);
  });

  it("default mode é 'simple' quando ausente", () => {
    const sp = new URLSearchParams("period=hoje");
    expect(deserializeFilterState(sp).mode).toBe("simple");
  });

  it("URL antiga sem mode/label continua válida (compat)", () => {
    const sp = new URLSearchParams("period=mes_atual&inbox=1,2&q=foo");
    const result = deserializeFilterState(sp);
    expect(result.mode).toBe("simple");
    expect(result.labelIds).toEqual([]);
    expect(result.conditionGroup).toBeUndefined();
  });

  it("mode=advanced + cg= deserializa conditionGroup", () => {
    const cg: ConditionGroup = {
      combinator: "AND",
      conditions: [],
    };
    const encoded = encodeConditionGroup(cg);
    expect(encoded).toBeTruthy();
    const sp = new URLSearchParams(
      `period=hoje&mode=advanced&cg=${encoded}`,
    );
    const state = deserializeFilterState(sp);
    expect(state.mode).toBe("advanced");
    expect(state.conditionGroup).toEqual(cg);
  });

  it("cg corrompido cai pra undefined sem quebrar", () => {
    const sp = new URLSearchParams("period=hoje&mode=advanced&cg=!!!corrupt");
    const state = deserializeFilterState(sp);
    expect(state.mode).toBe("advanced");
    expect(state.conditionGroup).toBeUndefined();
  });
});

describe("round-trip serialize/deserialize", () => {
  it("preserva todos os campos com period=mes_atual", () => {
    const original = makeState({
      period: "mes_atual",
      inboxIds: [5, 7, 9],
      teamIds: [22, 26],
      assigneeIds: [1, 2],
      statuses: [0, 1, 2],
      priorities: [1, 3],
      labelIds: [40, 41],
      search: "matrix",
    });
    const sp = serializeFilterState(original);
    const parsed = deserializeFilterState(sp);
    expect(parsed).toEqual(original);
  });

  it("preserva custom range em round-trip", () => {
    const original = makeState({
      period: "custom",
      customRange: { start: "2026-04-01", end: "2026-04-30" },
      inboxIds: [1],
    });
    const sp = serializeFilterState(original);
    const parsed = deserializeFilterState(sp);
    expect(parsed).toEqual(original);
  });

  it("EMPTY_FILTER_STATE faz round-trip", () => {
    const sp = serializeFilterState(EMPTY_FILTER_STATE);
    const parsed = deserializeFilterState(sp);
    expect(parsed).toEqual(EMPTY_FILTER_STATE);
  });

  it("mode=advanced + conditionGroup faz round-trip", () => {
    const cg: ConditionGroup = {
      combinator: "OR",
      conditions: [
        { field: "priority", operator: "gte", value: 2 },
        {
          combinator: "AND",
          conditions: [
            { field: "status", operator: "eq", value: 0 },
            { field: "team_id", operator: "in", value: [1, 2] },
          ],
        },
      ],
    };
    const original = makeState({ mode: "advanced", conditionGroup: cg });
    const sp = serializeFilterState(original);
    const parsed = deserializeFilterState(sp);
    expect(parsed.mode).toBe("advanced");
    expect(parsed.conditionGroup).toEqual(cg);
  });
});

describe("diffFilterStates", () => {
  it("estados iguais retornam 0", () => {
    const a = makeState({ inboxIds: [1, 2] });
    const b = makeState({ inboxIds: [1, 2] });
    expect(diffFilterStates(a, b)).toBe(0);
  });

  it("detecta mudança de period", () => {
    const a = makeState({ period: "hoje" });
    const b = makeState({ period: "semana_atual" });
    expect(diffFilterStates(a, b)).toBe(1);
  });

  it("detecta mudança de customRange", () => {
    const a = makeState({
      period: "custom",
      customRange: { start: "2026-04-01", end: "2026-04-30" },
    });
    const b = makeState({
      period: "custom",
      customRange: { start: "2026-04-01", end: "2026-04-29" },
    });
    expect(diffFilterStates(a, b)).toBe(1);
  });

  it("detecta mudança em cada uma das listas", () => {
    const base = makeState();
    expect(diffFilterStates(base, makeState({ inboxIds: [1] }))).toBe(1);
    expect(diffFilterStates(base, makeState({ teamIds: [1] }))).toBe(1);
    expect(diffFilterStates(base, makeState({ assigneeIds: [1] }))).toBe(1);
    expect(diffFilterStates(base, makeState({ statuses: [0] }))).toBe(1);
    expect(diffFilterStates(base, makeState({ priorities: [0] }))).toBe(1);
    expect(diffFilterStates(base, makeState({ labelIds: [10] }))).toBe(1);
  });

  it("detecta mudança em search", () => {
    const a = makeState({ search: "" });
    const b = makeState({ search: "matrix" });
    expect(diffFilterStates(a, b)).toBe(1);
  });

  it("detecta mudança de mode", () => {
    const a = makeState({ mode: "simple" });
    const b = makeState({ mode: "advanced" });
    expect(diffFilterStates(a, b)).toBe(1);
  });

  it("detecta mudança em conditionGroup", () => {
    const a = makeState({ mode: "advanced" });
    const b = makeState({
      mode: "advanced",
      conditionGroup: { combinator: "AND", conditions: [] },
    });
    expect(diffFilterStates(a, b)).toBe(1);
  });

  it("acumula múltiplas diferenças", () => {
    const a = makeState();
    const b = makeState({
      period: "mes_atual",
      inboxIds: [1],
      search: "x",
    });
    expect(diffFilterStates(a, b)).toBe(3);
  });

  it("undefined search e string vazia são equivalentes", () => {
    const a = makeState({ search: undefined });
    const b = makeState({ search: "" });
    expect(diffFilterStates(a, b)).toBe(0);
  });
});

describe("isFilterStateEqual", () => {
  it("retorna true para estados iguais", () => {
    expect(
      isFilterStateEqual(
        makeState({ inboxIds: [1, 2], statuses: [0] }),
        makeState({ inboxIds: [1, 2], statuses: [0] }),
      ),
    ).toBe(true);
  });

  it("retorna false ao menor diff", () => {
    expect(
      isFilterStateEqual(makeState(), makeState({ inboxIds: [1] })),
    ).toBe(false);
  });
});

describe("condition-group-codec", () => {
  it("encode/decode round-trip preserva o objeto", () => {
    const cg: ConditionGroup = {
      combinator: "AND",
      conditions: [
        { field: "status", operator: "eq", value: 1 },
        { field: "name", operator: "contains", value: "matrix" },
      ],
    };
    const encoded = encodeConditionGroup(cg);
    expect(encoded).toBeTruthy();
    const decoded = decodeConditionGroup(encoded as string);
    expect(decoded).toEqual(cg);
  });

  it("encode retorna null quando excede 4kB", () => {
    const huge: ConditionGroup = {
      combinator: "AND",
      conditions: Array.from({ length: 500 }, (_, i) => ({
        field: `field_${i}`,
        operator: "eq" as const,
        value: "x".repeat(20),
      })),
    };
    expect(encodeConditionGroup(huge)).toBeNull();
  });

  it("decode retorna null para input inválido", () => {
    expect(decodeConditionGroup("!!!not-base64!!!")).toBeNull();
  });

  it("decode retorna null para JSON sem combinator/conditions", () => {
    const bad = Buffer.from(JSON.stringify({ foo: "bar" }), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(decodeConditionGroup(bad)).toBeNull();
  });
});
