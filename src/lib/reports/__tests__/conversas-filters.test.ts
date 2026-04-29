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

  it("round-trip preserva o valor", () => {
    const original = {
      period: "mes_atual" as const,
      inboxIds: [5, 7, 9],
      teamIds: [22, 26],
      statuses: [0, 1, 2],
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
    };
    const sp = serializeFilters(original);
    const parsed = deserializeFilters(sp);
    expect(parsed).toEqual(original);
  });
});
