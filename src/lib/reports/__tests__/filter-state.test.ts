import {
  EMPTY_FILTER_STATE,
  type FilterState,
  deserializeFilterState,
  diffFilterStates,
  isFilterStateEqual,
  serializeFilterState,
} from "@/lib/reports/filter-state";

function makeState(overrides: Partial<FilterState> = {}): FilterState {
  return {
    period: "hoje",
    inboxIds: [],
    teamIds: [],
    assigneeIds: [],
    statuses: [],
    priorities: [],
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
      }),
    );
    expect(sp.get("inbox")).toBe("1,2");
    expect(sp.get("team")).toBe("10");
    expect(sp.get("assignee")).toBe("3,4,5");
    expect(sp.get("status")).toBe("0,1");
    expect(sp.get("priority")).toBe("0,2");
  });

  it("aplica trim na busca e ignora string vazia", () => {
    const a = serializeFilterState(makeState({ search: "  hello  " }));
    expect(a.get("q")).toBe("hello");

    const b = serializeFilterState(makeState({ search: "   " }));
    expect(b.get("q")).toBeNull();
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
  });

  it("detecta mudança em search", () => {
    const a = makeState({ search: "" });
    const b = makeState({ search: "matrix" });
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
