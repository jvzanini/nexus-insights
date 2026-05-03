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
 * Match OR sobre haystack normalizado.
 *
 * Match é substring contígua (case + acentos insensíveis). Respeita a
 * ordem dos caracteres digitados pelo usuário — "3380" NÃO bate em
 * haystack que contém "3803" (mesmos dígitos, ordem diferente).
 *
 * Telefones e documentos são cobertos via formatos múltiplos no haystack
 * (phoneVariants: raw + formatPhone + digits-only; documentVariants:
 * identifier + formatted CPF/CNPJ). Máscaras arbitrárias só batem se
 * forem substring contígua de algum dos formatos.
 */
export function matchSearchClient(
  rows: ConversaRow[],
  search: string | null | undefined,
): ConversaRow[] {
  const trimmed = (search ?? "").trim();
  if (!trimmed) return rows;
  const needle = normalize(trimmed);
  return rows.filter((row) => buildHaystack(row).includes(needle));
}
