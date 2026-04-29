/**
 * Formata CPF brasileiro (apenas exibição, sem validação de dígitos).
 * "12345678901" -> "123.456.789-01"
 * Strings sem 11 dígitos são devolvidas como vieram (sanitizadas para
 * conter apenas dígitos e separadores comuns).
 */
export function formatCpf(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length !== 11) return raw.trim();
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
