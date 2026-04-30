import {
  applyConditions,
  type ConditionGroup,
} from "@/lib/utils/apply-conditions";

interface Row {
  id: number;
  name: string;
  age: number;
  role: "admin" | "viewer" | "manager";
  createdAt: Date;
}

const ROWS: Row[] = [
  {
    id: 1,
    name: "Ana Silva",
    age: 28,
    role: "admin",
    createdAt: new Date("2026-01-10"),
  },
  {
    id: 2,
    name: "Bruno Costa",
    age: 35,
    role: "viewer",
    createdAt: new Date("2026-02-15"),
  },
  {
    id: 3,
    name: "Carla Dias",
    age: 41,
    role: "manager",
    createdAt: new Date("2026-03-22"),
  },
  {
    id: 4,
    name: "Diego Souza",
    age: 22,
    role: "viewer",
    createdAt: new Date("2026-04-05"),
  },
];

describe("applyConditions", () => {
  it("grupo vazio retorna data inalterada (mesma referência)", () => {
    const empty: ConditionGroup = { combinator: "AND", conditions: [] };
    const out = applyConditions(ROWS, empty);
    expect(out).toBe(ROWS);
  });

  it("AND com múltiplas condições", () => {
    const group: ConditionGroup = {
      combinator: "AND",
      conditions: [
        { field: "role", operator: "eq", value: "viewer" },
        { field: "age", operator: "gt", value: 30 },
      ],
    };
    const out = applyConditions(ROWS, group);
    expect(out.map((r) => r.id)).toEqual([2]);
  });

  it("OR com múltiplas condições", () => {
    const group: ConditionGroup = {
      combinator: "OR",
      conditions: [
        { field: "role", operator: "eq", value: "admin" },
        { field: "age", operator: "lt", value: 25 },
      ],
    };
    const out = applyConditions(ROWS, group);
    expect(out.map((r) => r.id).sort()).toEqual([1, 4]);
  });

  it("grupos aninhados (AND de OR)", () => {
    const group: ConditionGroup = {
      combinator: "AND",
      conditions: [
        { field: "age", operator: "gte", value: 25 },
        {
          combinator: "OR",
          conditions: [
            { field: "role", operator: "eq", value: "admin" },
            { field: "role", operator: "eq", value: "manager" },
          ],
        },
      ],
    };
    const out = applyConditions(ROWS, group);
    expect(out.map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it("operador eq", () => {
    const group: ConditionGroup = {
      combinator: "AND",
      conditions: [{ field: "name", operator: "eq", value: "Ana Silva" }],
    };
    expect(applyConditions(ROWS, group).map((r) => r.id)).toEqual([1]);
  });

  it("operador neq", () => {
    const group: ConditionGroup = {
      combinator: "AND",
      conditions: [{ field: "role", operator: "neq", value: "viewer" }],
    };
    expect(applyConditions(ROWS, group).map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it("operador gt e lt em number", () => {
    const gt: ConditionGroup = {
      combinator: "AND",
      conditions: [{ field: "age", operator: "gt", value: 30 }],
    };
    expect(applyConditions(ROWS, gt).map((r) => r.id).sort()).toEqual([2, 3]);

    const lt: ConditionGroup = {
      combinator: "AND",
      conditions: [{ field: "age", operator: "lt", value: 30 }],
    };
    expect(applyConditions(ROWS, lt).map((r) => r.id).sort()).toEqual([1, 4]);
  });

  it("operador gte e lte em date", () => {
    const gte: ConditionGroup = {
      combinator: "AND",
      conditions: [
        { field: "createdAt", operator: "gte", value: new Date("2026-03-01") },
      ],
    };
    expect(applyConditions(ROWS, gte).map((r) => r.id).sort()).toEqual([3, 4]);

    const lte: ConditionGroup = {
      combinator: "AND",
      conditions: [
        { field: "createdAt", operator: "lte", value: new Date("2026-02-15") },
      ],
    };
    expect(applyConditions(ROWS, lte).map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it("operador contains (case-insensitive) em string", () => {
    const group: ConditionGroup = {
      combinator: "AND",
      conditions: [{ field: "name", operator: "contains", value: "silva" }],
    };
    expect(applyConditions(ROWS, group).map((r) => r.id)).toEqual([1]);
  });

  it("operador starts_with", () => {
    const group: ConditionGroup = {
      combinator: "AND",
      conditions: [{ field: "name", operator: "starts_with", value: "Ca" }],
    };
    expect(applyConditions(ROWS, group).map((r) => r.id)).toEqual([3]);
  });

  it("operador in com array de valores", () => {
    const group: ConditionGroup = {
      combinator: "AND",
      conditions: [
        { field: "role", operator: "in", value: ["admin", "manager"] },
      ],
    };
    expect(applyConditions(ROWS, group).map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it("operador not_in com array de valores", () => {
    const group: ConditionGroup = {
      combinator: "AND",
      conditions: [
        { field: "role", operator: "not_in", value: ["viewer"] },
      ],
    };
    expect(applyConditions(ROWS, group).map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it("operador in com value não-array retorna false", () => {
    const group: ConditionGroup = {
      combinator: "AND",
      conditions: [{ field: "role", operator: "in", value: "admin" }],
    };
    expect(applyConditions(ROWS, group)).toEqual([]);
  });

  it("grupo aninhado vazio é considerado true (passa)", () => {
    const group: ConditionGroup = {
      combinator: "AND",
      conditions: [
        { field: "age", operator: "gte", value: 30 },
        { combinator: "OR", conditions: [] },
      ],
    };
    expect(applyConditions(ROWS, group).map((r) => r.id).sort()).toEqual([2, 3]);
  });
});
