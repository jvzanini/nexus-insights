/**
 * Formatação de telefones para exibição em pt-BR.
 *
 * Aceita números no formato internacional E.164 (ex: +5511987654321)
 * ou apenas dígitos. Devolve uma string formatada human-readable.
 *
 * Exemplos:
 *   "+5511987654321" -> "+55 (11) 98765-4321"
 *   "5511987654321"  -> "+55 (11) 98765-4321"
 *   "11987654321"    -> "(11) 98765-4321"
 *   "11234567"       -> "1123-4567" (fallback genérico)
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";

  // Brasil com DDI 55 + DDD (2) + número (8 ou 9 dígitos).
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddi = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) {
      return `+${ddi} (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+${ddi} (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }

  // Brasil sem DDI: DDD (2) + número (8 ou 9).
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  // Fallback: retorna o original com '+' se for internacional.
  return raw.startsWith("+") ? raw : digits;
}
