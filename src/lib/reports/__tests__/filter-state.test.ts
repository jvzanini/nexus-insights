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

const base: FilterState = { ...EMPTY_FILTER_STATE };

function makeState(overrides: Partial<FilterState> = {}): FilterState {
  return {
    period: "hoje",
    inboxIds: [],
    teamIds: [],
    assigneeIds: [],
    statuses: [],
    priorities: [],
    labelIds: [],
    documentTypes: [],
    countries: [],
    estados: [],
    mode: "simple",
    dateField: "updated",
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
      items: [{ node: { field: "status", operator: "eq", value: 1 } }],
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
      items: [],
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
      items: [
        { node: { field: "priority", operator: "gte", value: 2 } },
        {
          connector: "OR",
          node: {
            items: [
              { node: { field: "status", operator: "eq", value: 0 } },
              {
                connector: "AND",
                node: { field: "team_id", operator: "in", value: [1, 2] },
              },
            ],
          },
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
      conditionGroup: { items: [] },
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
  it("encode/decode round-trip preserva o objeto v2", () => {
    const cg: ConditionGroup = {
      items: [
        { node: { field: "status", operator: "eq", value: 1 } },
        {
          connector: "AND",
          node: { field: "name", operator: "contains", value: "matrix" },
        },
      ],
    };
    const encoded = encodeConditionGroup(cg);
    expect(encoded).toBeTruthy();
    const decoded = decodeConditionGroup(encoded as string);
    expect(decoded).toEqual(cg);
  });

  it("encode retorna null quando excede 4kB", () => {
    const huge: ConditionGroup = {
      items: Array.from({ length: 500 }, (_, i) => ({
        connector: i === 0 ? undefined : ("AND" as const),
        node: {
          field: `field_${i}`,
          operator: "eq" as const,
          value: "x".repeat(20),
        },
      })),
    };
    expect(encodeConditionGroup(huge)).toBeNull();
  });

  it("decode retorna null para input inválido", () => {
    expect(decodeConditionGroup("!!!not-base64!!!")).toBeNull();
  });

  it("decode retorna null para JSON sem schema reconhecível", () => {
    const bad = Buffer.from(JSON.stringify({ foo: "bar" }), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(decodeConditionGroup(bad)).toBeNull();
  });
});

describe("FilterState v0.32 — documentTypes", () => {
  it("EMPTY tem documentTypes []", () => {
    expect(EMPTY_FILTER_STATE.documentTypes).toEqual([]);
  });

  it("serialize/deserialize round-trip com documentTypes", () => {
    const state = makeState({ documentTypes: ["cpf", "none"] });
    const serialized = serializeFilterState(state);
    expect(serialized.get("docTypes")).toBe("cpf,none");
    const restored = deserializeFilterState(serialized);
    expect(restored.documentTypes).toEqual(["cpf", "none"]);
  });

  it("documentTypes vazio não emite param", () => {
    const state = makeState({ documentTypes: [] });
    const serialized = serializeFilterState(state);
    expect(serialized.has("docTypes")).toBe(false);
  });

  it("deserializa todos os 3 valores válidos", () => {
    const sp = new URLSearchParams("period=hoje&docTypes=cpf,cnpj,none");
    const state = deserializeFilterState(sp);
    expect(state.documentTypes).toEqual(["cpf", "cnpj", "none"]);
  });

  it("descarta valores inválidos em docTypes", () => {
    const sp = new URLSearchParams("period=hoje&docTypes=cpf,foo,bar,cnpj");
    const state = deserializeFilterState(sp);
    expect(state.documentTypes).toEqual(["cpf", "cnpj"]);
  });
});

describe("diffFilterStates v0.32 — DiffOptions", () => {
  it("ignoreMode pula mode change", () => {
    const a = makeState({ mode: "simple" });
    const b = makeState({ mode: "advanced" });
    expect(diffFilterStates(a, b)).toBe(1);
    expect(diffFilterStates(a, b, { ignoreMode: true })).toBe(0);
  });

  it("ignoreSearch pula search change", () => {
    const a = makeState({ search: "abc" });
    const b = makeState({ search: "def" });
    expect(diffFilterStates(a, b)).toBe(1);
    expect(diffFilterStates(a, b, { ignoreSearch: true })).toBe(0);
  });

  it("ignoreMode + ignoreSearch combinados", () => {
    const a = makeState({ mode: "simple", search: "abc" });
    const b = makeState({ mode: "advanced", search: "def" });
    expect(diffFilterStates(a, b)).toBe(2);
    expect(
      diffFilterStates(a, b, { ignoreMode: true, ignoreSearch: true }),
    ).toBe(0);
  });

  it("documentTypes change conta no diff", () => {
    const a = makeState({ documentTypes: ["cpf"] });
    const b = makeState({ documentTypes: ["cnpj"] });
    expect(diffFilterStates(a, b)).toBe(1);
  });

  it("documentTypes equal não conta", () => {
    const a = makeState({ documentTypes: ["cpf", "none"] });
    const b = makeState({ documentTypes: ["cpf", "none"] });
    expect(diffFilterStates(a, b)).toBe(0);
  });
});

describe("FilterState — countries/estados (localização)", () => {
  it("EMPTY tem countries [] e estados []", () => {
    expect(EMPTY_FILTER_STATE.countries).toEqual([]);
    expect(EMPTY_FILTER_STATE.estados).toEqual([]);
  });

  it("serializa countries e estados separados por vírgula", () => {
    const state = makeState({
      countries: ["Brasil"],
      estados: ["MG-Minas Gerais", "ZZ-Outros Estados"],
    });
    const sp = serializeFilterState(state);
    expect(sp.get("countries")).toBe("Brasil");
    expect(sp.get("estados")).toBe("MG-Minas Gerais,ZZ-Outros Estados");
  });

  it("deserializa countries e estados de volta para arrays exatos", () => {
    const sp = serializeFilterState(
      makeState({
        countries: ["Brasil"],
        estados: ["MG-Minas Gerais", "ZZ-Outros Estados"],
      }),
    );
    const restored = deserializeFilterState(sp);
    expect(restored.countries).toEqual(["Brasil"]);
    expect(restored.estados).toEqual(["MG-Minas Gerais", "ZZ-Outros Estados"]);
  });

  it("arrays vazios não emitem os params countries/estados", () => {
    const sp = serializeFilterState(
      makeState({ countries: [], estados: [] }),
    );
    expect(sp.has("countries")).toBe(false);
    expect(sp.has("estados")).toBe(false);
  });

  it("URL sem countries/estados deserializa para arrays vazios", () => {
    const sp = new URLSearchParams("period=hoje");
    const state = deserializeFilterState(sp);
    expect(state.countries).toEqual([]);
    expect(state.estados).toEqual([]);
  });

  it("trim em valores e descarta vazios", () => {
    const sp = new URLSearchParams(
      "period=hoje&countries= Brasil , &estados=MG-Minas Gerais, ,ZZ-Outros Estados",
    );
    const state = deserializeFilterState(sp);
    expect(state.countries).toEqual(["Brasil"]);
    expect(state.estados).toEqual(["MG-Minas Gerais", "ZZ-Outros Estados"]);
  });
});

describe("dateField", () => {
  it("default é 'created' e não serializa", () => {
    expect(EMPTY_FILTER_STATE.dateField).toBe("created");
    expect(serializeFilterState(base).get("date")).toBeNull();
  });
  it("serializa e deserializa 'updated'", () => {
    const p = serializeFilterState({ ...base, dateField: "updated" });
    expect(p.get("date")).toBe("updated");
    expect(deserializeFilterState(p).dateField).toBe("updated");
  });
  it("valor inválido cai em 'created'", () => {
    const p = new URLSearchParams({ date: "xpto" });
    expect(deserializeFilterState(p).dateField).toBe("created");
  });
});

describe("durationFilter", () => {
  it("round-trip gte", () => {
    const df = { indicator: "waiting", mode: "gte", value: 10, unit: "minute" } as const;
    const p = serializeFilterState({ ...base, durationFilter: df });
    expect(p.get("dur")).toBe("waiting:gte:10:minute");
    expect(deserializeFilterState(p).durationFilter).toEqual(df);
  });
  it("round-trip between com unitEnd", () => {
    const df = { indicator: "open", mode: "between", value: 5, unit: "minute", valueEnd: 1, unitEnd: "hour" } as const;
    const p = serializeFilterState({ ...base, durationFilter: df });
    expect(p.get("dur")).toBe("open:between:5:minute:1:hour");
    expect(deserializeFilterState(p).durationFilter).toEqual(df);
  });
  it("token inválido → undefined", () => {
    expect(deserializeFilterState(new URLSearchParams({ dur: "lixo:xx" })).durationFilter).toBeUndefined();
  });
  it("value <= 0 → undefined", () => {
    expect(deserializeFilterState(new URLSearchParams({ dur: "waiting:gte:0:minute" })).durationFilter).toBeUndefined();
  });
  it("between com fim <= início → ignorado (parse e serialize)", () => {
    // 1 hora (início) vs 5 minutos (fim): fim < início → inválido.
    expect(
      deserializeFilterState(new URLSearchParams({ dur: "waiting:between:1:hour:5:minute" }))
        .durationFilter,
    ).toBeUndefined();
    const invalid = {
      indicator: "waiting",
      mode: "between",
      value: 1,
      unit: "hour",
      valueEnd: 5,
      unitEnd: "minute",
    } as const;
    expect(serializeFilterState({ ...base, durationFilter: invalid }).get("dur")).toBeNull();
  });
  it("diffFilterStates conta dateField e durationFilter", () => {
    expect(diffFilterStates(base, { ...base, dateField: "updated" })).toBe(1);
    const df = { indicator: "stalled", mode: "lte", value: 2, unit: "day" } as const;
    expect(diffFilterStates(base, { ...base, durationFilter: df })).toBe(1);
  });
});

describe("filter-state — page", () => {
  it("serializeFilterState({ page: 1 }) NÃO inclui ?page=", () => {
    const s = { ...EMPTY_FILTER_STATE, page: 1 };
    expect(serializeFilterState(s).has("page")).toBe(false);
  });
  it("serializeFilterState({ page: 5 }) inclui ?page=5", () => {
    const s = { ...EMPTY_FILTER_STATE, page: 5 };
    expect(serializeFilterState(s).get("page")).toBe("5");
  });
  it("serializeFilterState({ page: undefined }) NÃO inclui ?page=", () => {
    const s = { ...EMPTY_FILTER_STATE, page: undefined };
    expect(serializeFilterState(s).has("page")).toBe(false);
  });
  it("deserializeFilterState(?page=3) → state.page === 3", () => {
    const r = deserializeFilterState(new URLSearchParams({ page: "3" }));
    expect(r.page).toBe(3);
  });
  it("deserializeFilterState(?page=abc) → undefined", () => {
    const r = deserializeFilterState(new URLSearchParams({ page: "abc" }));
    expect(r.page).toBeUndefined();
  });
  it("deserializeFilterState(?page=-5) → undefined", () => {
    const r = deserializeFilterState(new URLSearchParams({ page: "-5" }));
    expect(r.page).toBeUndefined();
  });
  it("deserializeFilterState(?page=0) → undefined", () => {
    const r = deserializeFilterState(new URLSearchParams({ page: "0" }));
    expect(r.page).toBeUndefined();
  });
});
