/**
 * Filtragem de conversas por tipo de documento detectado.
 *
 * Multi-select OR: passar `["cpf", "none"]` retorna rows com CPF detectado
 * OU sem documento. Lista vazia/undefined = sem filtro (retorna todas).
 *
 * Usa `detectDocument()` de `@/lib/utils/format-document` (server-safe puro).
 */
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import { detectDocument } from "@/lib/utils/format-document";

export type DocumentTypeFilter = "cpf" | "cnpj" | "none";

export function matchDocumentTypes(
  rows: ConversaRow[],
  types: DocumentTypeFilter[] | undefined,
): ConversaRow[] {
  if (!types || types.length === 0) return rows;
  return rows.filter((row) => {
    const detected = detectDocument({
      identifier: row.contact.identifier,
      additional_attributes: row.contact.additional_attributes,
    });
    if (detected?.type === "cpf" && types.includes("cpf")) return true;
    if (detected?.type === "cnpj" && types.includes("cnpj")) return true;
    if (!detected && types.includes("none")) return true;
    return false;
  });
}
