/**
 * Codec base64url para serialização de ConditionGroup em URL.
 *
 * Cap de 4kB (limite seguro vs. URL de 8kB típico de proxies/CDN). Strings
 * maiores retornam null e o caller deve persistir somente em localStorage.
 *
 * O encoding é base64url (variante URL-safe sem padding) para evitar problemas
 * com caracteres '+', '/' e '=' em querystring.
 *
 * Schema v2 (v0.32+) — items com connector per-par. Decode auto-migra v1
 * (combinator + conditions) → v2 transparente para usuários com URLs/presets
 * antigos.
 */
import type {
  Condition,
  ConditionGroup,
  ConditionGroupItem,
} from "@/lib/utils/apply-conditions";

const MAX_BYTES = 4096;

function base64urlEncode(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(s: string): string {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

interface V1Group {
  combinator: "AND" | "OR";
  conditions: (Condition | V1Group)[];
}

function isV1Schema(parsed: unknown): parsed is V1Group {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    "combinator" in parsed &&
    Array.isArray((parsed as { conditions?: unknown }).conditions)
  );
}

function isV2Schema(parsed: unknown): parsed is ConditionGroup {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    "items" in parsed &&
    Array.isArray((parsed as ConditionGroup).items)
  );
}

function migrateV1ToV2(v1: V1Group): ConditionGroup {
  const items: ConditionGroupItem[] = v1.conditions.map((node, idx) => ({
    connector: idx === 0 ? undefined : v1.combinator,
    node: isV1Schema(node) ? migrateV1ToV2(node) : (node as Condition),
  }));
  return { items };
}

export function encodeConditionGroup(group: ConditionGroup): string | null {
  try {
    const json = JSON.stringify(group);
    if (Buffer.byteLength(json, "utf8") > MAX_BYTES) return null;
    return base64urlEncode(json);
  } catch {
    return null;
  }
}

export function decodeConditionGroup(s: string): ConditionGroup | null {
  try {
    const json = base64urlDecode(s);
    const parsed: unknown = JSON.parse(json);
    if (isV2Schema(parsed)) return parsed;
    if (isV1Schema(parsed)) return migrateV1ToV2(parsed);
    return null;
  } catch {
    return null;
  }
}
