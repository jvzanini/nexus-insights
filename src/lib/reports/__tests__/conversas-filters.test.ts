import {
  DEFAULT_PERIOD,
  deserializeFilters,
  serializeFilters,
} from "@/lib/reports/conversas-filters";

describe("deserializeFilters", () => {
  it("URL vazia retorna defaults", () => {
    const sp = new URLSearchParams();
    const result = deserializeFilters(sp);
    expect(result).toEqual({
      period: DEFAULT_PERIOD,
      inboxIds: [],
      teamIds: [],
      statuses: [],
      customRange: undefined,
    });
  });

  it("parseia ?period=hoje&inboxes=1,2,3&teams=10&statuses=0,1", () => {
    const sp = new URLSearchParams(
      "period=hoje&inboxes=1,2,3&teams=10&statuses=0,1",
    );
    const result = deserializeFilters(sp);
    expect(result).toEqual({
      period: "hoje",
      inboxIds: [1, 2, 3],
      teamIds: [10],
      statuses: [0, 1],
      customRange: undefined,
    });
  });

  it("ignora period inválido (cai no default)", () => {
    const sp = new URLSearchParams("period=xpto");
    expect(deserializeFilters(sp).period).toBe(DEFAULT_PERIOD);
  });

  it("ignora valores não numéricos em listas", () => {
    const sp = new URLSearchParams("inboxes=1,abc,2&teams=,&statuses=NaN,3");
    const result = deserializeFilters(sp);
    expect(result.inboxIds).toEqual([1, 2]);
    expect(result.teamIds).toEqual([]);
    expect(result.statuses).toEqual([3]);
  });

  it("parseia custom range quando period=custom e datas ISO válidas", () => {
    const sp = new URLSearchParams(
      "period=custom&custom_start=2026-04-01&custom_end=2026-04-30",
    );
    const result = deserializeFilters(sp);
    expect(result.period).toBe("custom");
    expect(result.customRange).toEqual({
      start: "2026-04-01",
      end: "2026-04-30",
    });
  });

  it("ignora custom range quando period != custom", () => {
    const sp = new URLSearchParams(
      "period=hoje&custom_start=2026-04-01&custom_end=2026-04-30",
    );
    const result = deserializeFilters(sp);
    expect(result.customRange).toBeUndefined();
  });

  it("ignora custom range com datas inválidas", () => {
    const sp = new URLSearchParams(
      "period=custom&custom_start=foo&custom_end=2026-04-30",
    );
    const result = deserializeFilters(sp);
    expect(result.customRange).toBeUndefined();
  });
});

describe("serializeFilters", () => {
  it("não inclui period quando é o default", () => {
    const sp = serializeFilters({
      period: DEFAULT_PERIOD,
      inboxIds: [],
      teamIds: [],
      statuses: [],
    });
    expect(sp.toString()).toBe("");
  });

  it("inclui period quando diferente do default", () => {
    const sp = serializeFilters({
      period: "hoje",
      inboxIds: [],
      teamIds: [],
      statuses: [],
    });
    expect(sp.get("period")).toBe("hoje");
  });

  it("serializa listas separadas por vírgula", () => {
    const sp = serializeFilters({
      period: "7d",
      inboxIds: [1, 2],
      teamIds: [10],
      statuses: [0, 2],
    });
    expect(sp.get("period")).toBe("7d");
    expect(sp.get("inboxes")).toBe("1,2");
    expect(sp.get("teams")).toBe("10");
    expect(sp.get("statuses")).toBe("0,2");
  });

  it("serializa custom range quando period=custom", () => {
    const sp = serializeFilters({
      period: "custom",
      inboxIds: [],
      teamIds: [],
      statuses: [],
      customRange: { start: "2026-04-01", end: "2026-04-30" },
    });
    expect(sp.get("period")).toBe("custom");
    expect(sp.get("custom_start")).toBe("2026-04-01");
    expect(sp.get("custom_end")).toBe("2026-04-30");
  });

  it("não serializa custom_* quando period != custom", () => {
    const sp = serializeFilters({
      period: "hoje",
      inboxIds: [],
      teamIds: [],
      statuses: [],
      customRange: { start: "2026-04-01", end: "2026-04-30" },
    });
    expect(sp.get("custom_start")).toBeNull();
    expect(sp.get("custom_end")).toBeNull();
  });

  it("round-trip preserva o valor", () => {
    const original = {
      period: "mes_atual" as const,
      inboxIds: [5, 7, 9],
      teamIds: [22, 26],
      statuses: [0, 1, 2],
      customRange: undefined,
    };
    const sp = serializeFilters(original);
    const parsed = deserializeFilters(sp);
    expect(parsed).toEqual(original);
  });

  it("round-trip com defaults", () => {
    const original = {
      period: DEFAULT_PERIOD,
      inboxIds: [],
      teamIds: [],
      statuses: [],
      customRange: undefined,
    };
    const sp = serializeFilters(original);
    const parsed = deserializeFilters(sp);
    expect(parsed).toEqual(original);
  });

  it("round-trip com custom range", () => {
    const original = {
      period: "custom" as const,
      inboxIds: [1],
      teamIds: [],
      statuses: [],
      customRange: { start: "2026-04-01", end: "2026-04-30" },
    };
    const sp = serializeFilters(original);
    const parsed = deserializeFilters(sp);
    expect(parsed).toEqual(original);
  });
});
