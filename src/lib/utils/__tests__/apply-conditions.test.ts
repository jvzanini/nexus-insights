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

describe("applyConditions v2 (operador per-par, left-associative)", () => {
  it("grupo vazio retorna data inalterada (mesma referência)", () => {
    const empty: ConditionGroup = { items: [] };
    const out = applyConditions(ROWS, empty);
    expect(out).toBe(ROWS);
  });

  it("1 item sem connector — só avalia o nó", () => {
    const cg: ConditionGroup = {
      items: [{ node: { field: "role", operator: "eq", value: "viewer" } }],
    };
    expect(applyConditions(ROWS, cg).map((r) => r.id).sort()).toEqual([2, 4]);
  });

  it("2 items com AND default (role=viewer AND age>30)", () => {
    const cg: ConditionGroup = {
      items: [
        { node: { field: "role", operator: "eq", value: "viewer" } },
        { connector: "AND", node: { field: "age", operator: "gt", value: 30 } },
      ],
    };
    expect(applyConditions(ROWS, cg).map((r) => r.id)).toEqual([2]);
  });

  it("2 items com OR (role=admin OR age<25)", () => {
    const cg: ConditionGroup = {
      items: [
        { node: { field: "role", operator: "eq", value: "admin" } },
        { connector: "OR", node: { field: "age", operator: "lt", value: 25 } },
      ],
    };
    expect(applyConditions(ROWS, cg).map((r) => r.id).sort()).toEqual([1, 4]);
  });

  it("3 items left-associative: A AND B OR C → (A AND B) OR C", () => {
    // (role=admin AND age=28) OR (role=manager) → row1 + row3
    const cg: ConditionGroup = {
      items: [
        { node: { field: "role", operator: "eq", value: "admin" } },
        { connector: "AND", node: { field: "age", operator: "eq", value: 28 } },
        { connector: "OR", node: { field: "role", operator: "eq", value: "manager" } },
      ],
    };
    expect(applyConditions(ROWS, cg).map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it("3 items: A OR B AND C → (A OR B) AND C — left-associative", () => {
    // (role=admin OR role=viewer) AND age>=30 → só row 2 (Bruno viewer 35)
    const cg: ConditionGroup = {
      items: [
        { node: { field: "role", operator: "eq", value: "admin" } },
        { connector: "OR", node: { field: "role", operator: "eq", value: "viewer" } },
        { connector: "AND", node: { field: "age", operator: "gte", value: 30 } },
      ],
    };
    expect(applyConditions(ROWS, cg).map((r) => r.id)).toEqual([2]);
  });

  it("sub-grupo aninhado: age>=25 AND (role=admin OR role=manager)", () => {
    const cg: ConditionGroup = {
      items: [
        { node: { field: "age", operator: "gte", value: 25 } },
        {
          connector: "AND",
          node: {
            items: [
              { node: { field: "role", operator: "eq", value: "admin" } },
              { connector: "OR", node: { field: "role", operator: "eq", value: "manager" } },
            ],
          },
        },
      ],
    };
    expect(applyConditions(ROWS, cg).map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it("grupo aninhado vazio é considerado true (passa — no-op)", () => {
    const cg: ConditionGroup = {
      items: [
        { node: { field: "age", operator: "gte", value: 30 } },
        { connector: "AND", node: { items: [] } },
      ],
    };
    expect(applyConditions(ROWS, cg).map((r) => r.id).sort()).toEqual([2, 3]);
  });
});

describe("evaluateCondition operadores (via 1-item groups)", () => {
  const wrap = (cond: {
    field: string;
    operator:
      | "eq"
      | "neq"
      | "gt"
      | "gte"
      | "lt"
      | "lte"
      | "contains"
      | "starts_with"
      | "in"
      | "not_in"
      | "contains_all";
    value: unknown;
  }): ConditionGroup => ({
    items: [{ node: cond }],
  });

  it("operador eq", () => {
    expect(
      applyConditions(ROWS, wrap({ field: "name", operator: "eq", value: "Ana Silva" })).map(
        (r) => r.id,
      ),
    ).toEqual([1]);
  });

  it("operador neq", () => {
    expect(
      applyConditions(ROWS, wrap({ field: "role", operator: "neq", value: "viewer" }))
        .map((r) => r.id)
        .sort(),
    ).toEqual([1, 3]);
  });

  it("operador gt e lt em number", () => {
    expect(
      applyConditions(ROWS, wrap({ field: "age", operator: "gt", value: 30 }))
        .map((r) => r.id)
        .sort(),
    ).toEqual([2, 3]);

    expect(
      applyConditions(ROWS, wrap({ field: "age", operator: "lt", value: 30 }))
        .map((r) => r.id)
        .sort(),
    ).toEqual([1, 4]);
  });

  it("operador gte e lte em date", () => {
    expect(
      applyConditions(
        ROWS,
        wrap({ field: "createdAt", operator: "gte", value: new Date("2026-03-01") }),
      )
        .map((r) => r.id)
        .sort(),
    ).toEqual([3, 4]);

    expect(
      applyConditions(
        ROWS,
        wrap({ field: "createdAt", operator: "lte", value: new Date("2026-02-15") }),
      )
        .map((r) => r.id)
        .sort(),
    ).toEqual([1, 2]);
  });

  it("operador contains (case-insensitive) em string", () => {
    expect(
      applyConditions(ROWS, wrap({ field: "name", operator: "contains", value: "silva" })).map(
        (r) => r.id,
      ),
    ).toEqual([1]);
  });

  it("operador starts_with", () => {
    expect(
      applyConditions(ROWS, wrap({ field: "name", operator: "starts_with", value: "Ca" })).map(
        (r) => r.id,
      ),
    ).toEqual([3]);
  });

  it("operador in com array de valores", () => {
    expect(
      applyConditions(
        ROWS,
        wrap({ field: "role", operator: "in", value: ["admin", "manager"] }),
      )
        .map((r) => r.id)
        .sort(),
    ).toEqual([1, 3]);
  });

  it("operador not_in com array de valores", () => {
    expect(
      applyConditions(ROWS, wrap({ field: "role", operator: "not_in", value: ["viewer"] }))
        .map((r) => r.id)
        .sort(),
    ).toEqual([1, 3]);
  });

  it("operador in com value não-array retorna false", () => {
    expect(applyConditions(ROWS, wrap({ field: "role", operator: "in", value: "admin" }))).toEqual(
      [],
    );
  });

  it("operador in com fieldValue array de objetos (labels) matcha por id", () => {
    interface RowWithLabels {
      id: number;
      labels: { id: number; name: string; color?: string }[];
    }
    const rows: RowWithLabels[] = [{ id: 1, labels: [{ id: 5, name: "VIP", color: "" }] }];
    expect(
      applyConditions(rows, wrap({ field: "labels", operator: "in", value: [5] })).map(
        (r) => r.id,
      ),
    ).toEqual([1]);
  });

  it("operador in com fieldValue array de objetos (labels) não matcha id ausente", () => {
    interface RowWithLabels {
      id: number;
      labels: { id: number; name: string }[];
    }
    const rows: RowWithLabels[] = [{ id: 1, labels: [{ id: 99, name: "X" }] }];
    expect(applyConditions(rows, wrap({ field: "labels", operator: "in", value: [5] }))).toEqual(
      [],
    );
  });

  it("operador not_in com fieldValue array de objetos (labels) exclui quando match", () => {
    interface RowWithLabels {
      id: number;
      labels: { id: number; name: string }[];
    }
    const rows: RowWithLabels[] = [{ id: 1, labels: [{ id: 5, name: "VIP" }] }];
    expect(
      applyConditions(rows, wrap({ field: "labels", operator: "not_in", value: [5] })),
    ).toEqual([]);
  });

  it("operador contains_all com array de objetos no fieldValue", () => {
    interface RowWithLabels {
      id: number;
      labels: { id: number; name: string }[];
    }
    const rows: RowWithLabels[] = [
      { id: 1, labels: [{ id: 5, name: "VIP" }, { id: 7, name: "Urgente" }] },
      { id: 2, labels: [{ id: 5, name: "VIP" }] },
      { id: 3, labels: [] },
    ];
    expect(
      applyConditions(
        rows,
        wrap({ field: "labels", operator: "contains_all", value: [5, 7] }),
      ).map((r) => r.id),
    ).toEqual([1]);
  });
});
