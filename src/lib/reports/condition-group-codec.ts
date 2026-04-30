/**
 * Codec base64url para serialização de ConditionGroup em URL.
 *
 * Cap de 4kB (limite seguro vs. URL de 8kB típico de proxies/CDN). Strings
 * maiores retornam null e o caller deve persistir somente em localStorage.
 *
 * O encoding é base64url (variante URL-safe sem padding) para evitar problemas
 * com caracteres '+', '/' e '=' em querystring.
 */
import type { ConditionGroup } from "@/lib/utils/apply-conditions";

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
    const parsed = JSON.parse(json) as ConditionGroup;
    if (
      parsed &&
      typeof parsed === "object" &&
      "combinator" in parsed &&
      Array.isArray((parsed as ConditionGroup).conditions)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
