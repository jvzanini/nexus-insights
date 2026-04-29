/**
 * Detecção e formatação de documentos brasileiros (CPF / CNPJ).
 *
 * Estratégia de fallback (para contatos vindos do Chatwoot):
 *  1. `identifier` do contato — se contiver 11 (CPF) ou 14 (CNPJ) dígitos.
 *  2. `additional_attributes.cpf` / `additional_attributes.cnpj` — chaves diretas.
 *  3. Regex `/(?:CPF|CNPJ)[: ]+([\d.\-/]+)/i` em `additional_attributes.description`.
 *
 * Retorna `{ type, raw, formatted }` ou `null` se nada for encontrado.
 *
 * Formatos:
 *  - CPF:  000.000.000-00
 *  - CNPJ: 00.000.000/0000-00
 */
export interface DetectedDocument {
  type: "cpf" | "cnpj";
  raw: string;
  formatted: string;
}

interface DetectInput {
  identifier?: string | null;
  additional_attributes?: Record<string, unknown> | null;
}

function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

function formatCpf(digits: string): string {
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatCnpj(digits: string): string {
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function buildResult(rawCandidate: string): DetectedDocument | null {
  const digits = digitsOnly(rawCandidate);
  if (digits.length === 11) {
    return { type: "cpf", raw: digits, formatted: formatCpf(digits) };
  }
  if (digits.length === 14) {
    return { type: "cnpj", raw: digits, formatted: formatCnpj(digits) };
  }
  return null;
}

function readAttr(
  attrs: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!attrs) return null;
  const v = attrs[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

export function detectDocument(input: DetectInput): DetectedDocument | null {
  // 1. identifier
  if (input.identifier && input.identifier.trim()) {
    const r = buildResult(input.identifier);
    if (r) return r;
  }

  const attrs = input.additional_attributes ?? null;

  // 2. chaves diretas (cpf/CPF/cnpj/CNPJ)
  const directKeys = ["cpf", "CPF", "cnpj", "CNPJ", "document", "documento"];
  for (const k of directKeys) {
    const candidate = readAttr(attrs, k);
    if (candidate) {
      const r = buildResult(candidate);
      if (r) return r;
    }
  }

  // 3. regex em description
  const description = readAttr(attrs, "description");
  if (description) {
    const match = description.match(/(?:CPF|CNPJ)[: ]+([\d.\-/]+)/i);
    if (match && match[1]) {
      const r = buildResult(match[1]);
      if (r) return r;
    }
  }

  return null;
}
