import { describe, it, expect } from "@jest/globals";
import {
  encodeConditionGroup,
  decodeConditionGroup,
} from "@/lib/reports/condition-group-codec";
import type { ConditionGroup } from "@/lib/utils/apply-conditions";

function base64urlEncodeRaw(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("condition-group-codec v2", () => {
  it("encode + decode round-trip schema v2", () => {
    const cg: ConditionGroup = {
      items: [
        { node: { field: "a", operator: "eq", value: 1 } },
        { connector: "OR", node: { field: "b", operator: "eq", value: 2 } },
      ],
    };
    const encoded = encodeConditionGroup(cg);
    expect(encoded).not.toBeNull();
    const decoded = decodeConditionGroup(encoded!);
    expect(decoded).toEqual(cg);
  });

  it("decode auto-migra schema v1 (combinator + conditions) → v2 (items)", () => {
    const v1 = {
      combinator: "OR",
      conditions: [
        { field: "a", operator: "eq", value: 1 },
        { field: "b", operator: "eq", value: 2 },
      ],
    };
    const v1Encoded = base64urlEncodeRaw(JSON.stringify(v1));

    const decoded = decodeConditionGroup(v1Encoded);
    expect(decoded).toEqual({
      items: [
        { node: { field: "a", operator: "eq", value: 1 } },
        { connector: "OR", node: { field: "b", operator: "eq", value: 2 } },
      ],
    });
  });

  it("decode v1 com sub-grupo aninhado migra recursivo", () => {
    const v1 = {
      combinator: "AND",
      conditions: [
        { field: "a", operator: "eq", value: 1 },
        {
          combinator: "OR",
          conditions: [
            { field: "b", operator: "eq", value: 2 },
            { field: "c", operator: "eq", value: 3 },
          ],
        },
      ],
    };
    const encoded = base64urlEncodeRaw(JSON.stringify(v1));
    const decoded = decodeConditionGroup(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.items).toHaveLength(2);
    expect(decoded?.items[0].connector).toBeUndefined();
    expect(decoded?.items[1].connector).toBe("AND");
    const subGroup = decoded?.items[1].node as ConditionGroup;
    expect(subGroup.items).toHaveLength(2);
    expect(subGroup.items[0].connector).toBeUndefined();
    expect(subGroup.items[1].connector).toBe("OR");
  });

  it("decode v1 com 1 condition → 1 item sem connector", () => {
    const v1 = {
      combinator: "AND",
      conditions: [{ field: "x", operator: "eq", value: 5 }],
    };
    const encoded = base64urlEncodeRaw(JSON.stringify(v1));
    const decoded = decodeConditionGroup(encoded);
    expect(decoded).toEqual({
      items: [{ node: { field: "x", operator: "eq", value: 5 } }],
    });
  });

  it("decode string inválida retorna null", () => {
    expect(decodeConditionGroup("!!!not-base64!!!")).toBeNull();
  });

  it("decode JSON sem schema reconhecível retorna null", () => {
    const garbage = base64urlEncodeRaw(JSON.stringify({ foo: "bar" }));
    expect(decodeConditionGroup(garbage)).toBeNull();
  });

  it("encode retorna null se ultrapassa cap 4kB", () => {
    const huge: ConditionGroup = {
      items: Array.from({ length: 1000 }, (_, i) => ({
        connector: i === 0 ? undefined : ("AND" as const),
        node: {
          field: "very_long_field_name_to_blow_up_size",
          operator: "eq" as const,
          value: `value_payload_${i}_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
        },
      })),
    };
    expect(encodeConditionGroup(huge)).toBeNull();
  });
});
