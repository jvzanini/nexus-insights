import { matchDuration, deriveStalledSeconds, UNIT_SECONDS } from "../match-duration";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const NOW = 1_700_000_000_000; // epoch ms fixo
function row(p: Partial<ConversaRow>): ConversaRow {
  return {
    id: 1, display_id: 1,
    contact: { id: 1, name: null, phone_number: null, identifier: null, additional_attributes: null, country: null, estado: null },
    inbox: { id: 1, name: null }, team: { id: null, name: null }, assignee: { id: null, name: null },
    status: 0, priority: null, created_at: null, last_activity_at: null,
    last_message_type: null, last_message_at: null, last_incoming_at: null, last_outgoing_at: null,
    custom_attributes: null, waiting_seconds: null, open_seconds: null, labels: [],
    ...p,
  };
}

describe("UNIT_SECONDS", () => {
  it("mês=30d, ano=365d", () => {
    expect(UNIT_SECONDS.month).toBe(2_592_000);
    expect(UNIT_SECONDS.year).toBe(31_536_000);
  });
});

describe("deriveStalledSeconds", () => {
  it("parseia ISO e calcula contra serverNow", () => {
    const r = row({ last_activity_at: new Date(NOW - 3600_000).toISOString() });
    expect(deriveStalledSeconds(r, NOW)).toBe(3600);
  });
  it("null/inválido → null", () => {
    expect(deriveStalledSeconds(row({ last_activity_at: null }), NOW)).toBeNull();
    expect(deriveStalledSeconds(row({ last_activity_at: "xx" }), NOW)).toBeNull();
  });
});

describe("matchDuration", () => {
  const rows = [
    row({ id: 1, waiting_seconds: 300 }),
    row({ id: 2, waiting_seconds: 1800 }),
    row({ id: 3, waiting_seconds: null }),
    row({ id: 4, open_seconds: 7200 }),
  ];
  it("filtro undefined → rows inalteradas", () => {
    expect(matchDuration(rows, undefined, NOW)).toBe(rows);
  });
  it("waiting gte 10 min → só id 2", () => {
    const r = matchDuration(rows, { indicator: "waiting", mode: "gte", value: 10, unit: "minute" }, NOW);
    expect(r.map((x) => x.id)).toEqual([2]);
  });
  it("waiting lte 10 min → só id 1 (null não passa)", () => {
    const r = matchDuration(rows, { indicator: "waiting", mode: "lte", value: 10, unit: "minute" }, NOW);
    expect(r.map((x) => x.id)).toEqual([1]);
  });
  it("waiting between 5min e 1h (unitEnd) → id 1 e 2", () => {
    const r = matchDuration(rows, { indicator: "waiting", mode: "between", value: 5, unit: "minute", valueEnd: 1, unitEnd: "hour" }, NOW);
    expect(r.map((x) => x.id)).toEqual([1, 2]);
  });
  it("open gte 1h → só id 4", () => {
    const r = matchDuration(rows, { indicator: "open", mode: "gte", value: 1, unit: "hour" }, NOW);
    expect(r.map((x) => x.id)).toEqual([4]);
  });
  it("stalled usa last_activity_at e serverNow", () => {
    const r = [row({ id: 9, last_activity_at: new Date(NOW - 2 * 86400_000).toISOString() })];
    expect(matchDuration(r, { indicator: "stalled", mode: "gte", value: 1, unit: "day" }, NOW).map((x) => x.id)).toEqual([9]);
    expect(matchDuration(r, { indicator: "stalled", mode: "gte", value: 3, unit: "day" }, NOW)).toEqual([]);
  });
  it("value inválido → rows inalteradas", () => {
    expect(matchDuration(rows, { indicator: "waiting", mode: "gte", value: 0, unit: "minute" }, NOW)).toBe(rows);
  });
});
