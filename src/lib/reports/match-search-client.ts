import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
} from "@/lib/chatwoot/conversas-translations";
import { formatPhone } from "@/lib/utils/format-phone";
import { detectDocument } from "@/lib/utils/format-document";

/** Lowercase + remove acentos via NFD + descarte de combining marks. */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
}

function phoneVariants(phone: string | null): string[] {
  if (!phone) return [];
  const formatted = formatPhone(phone) || "";
  const digits = phone.replace(/\D/g, "");
  return Array.from(new Set([phone, formatted, digits])).filter(Boolean);
}

function documentVariants(contact: ConversaRow["contact"]): string[] {
  const detected = detectDocument({
    identifier: contact.identifier,
    additional_attributes: contact.additional_attributes,
  });
  return Array.from(
    new Set([
      contact.identifier ?? "",
      detected?.formatted ?? "",
      detected?.raw ?? "",
    ]),
  ).filter(Boolean);
}

function customAttrsToText(ca: Record<string, unknown> | null): string {
  if (!ca) return "";
  return Object.entries(ca)
    .filter(([k]) => !k.startsWith("_"))
    .map(
      ([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
    )
    .join(" | ");
}

export function buildHaystack(row: ConversaRow): string {
  const parts: string[] = [
    String(row.display_id),
    `#${row.display_id}`,
    row.contact.name ?? "",
    ...phoneVariants(row.contact.phone_number),
    ...documentVariants(row.contact),
    row.inbox.name ?? "",
    row.team.name ?? "",
    row.assignee.name ?? "",
    STATUS_LABELS[row.status] ?? "",
    row.priority != null ? (PRIORITY_LABELS[row.priority] ?? "") : "",
    ...row.labels.map((l) => l.name),
    customAttrsToText(row.custom_attributes),
  ];
  return normalize(parts.join(" || "));
}

/**
 * Detecta se o needle parece um telefone/documento mascarado: composto
 * exclusivamente por dígitos, espaços e pontuação típica (`-`, `.`, `(`,
 * `)`, `/`, `+`). Quando sim, ativa o match digits-only (cobre máscaras
 * arbitrárias como "11 98765-4321" vs "+55 (11) 98765-4321").
 */
function isPhoneOrDocLike(s: string): boolean {
  if (!/\d/.test(s)) return false;
  return /^[\d\s\-.()\/+]+$/.test(s);
}

/**
 * Match OR sobre haystack normalizado.
 *
 * Estratégia dupla:
 *  1. Match textual direto sobre o haystack normalizado (cobre nomes, status,
 *     prioridade, labels, custom_attributes, identifier formatado etc).
 *  2. Match digits-only APENAS quando o needle é phone/doc-like (só dígitos
 *     + pontuação típica). Compara needle-digits vs haystack-digits para
 *     capturar máscaras arbitrárias.
 */
export function matchSearchClient(
  rows: ConversaRow[],
  search: string | null | undefined,
): ConversaRow[] {
  const trimmed = (search ?? "").trim();
  if (!trimmed) return rows;
  const needle = normalize(trimmed);
  const useDigitsMatch = isPhoneOrDocLike(trimmed);
  const needleDigits = useDigitsMatch ? trimmed.replace(/\D/g, "") : "";
  return rows.filter((row) => {
    const hay = buildHaystack(row);
    if (hay.includes(needle)) return true;
    if (useDigitsMatch && needleDigits.length > 0) {
      const hayDigits = hay.replace(/\D/g, "");
      if (hayDigits.includes(needleDigits)) return true;
    }
    return false;
  });
}
