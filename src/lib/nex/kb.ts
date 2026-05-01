import "server-only";
import { pgPool } from "@/lib/pg-pool";
import { ensureNexTables } from "./ensure-tables";

/** Cap de caracteres por documento individual após sanitize. */
export const MAX_DOC_CHARS = 100_000;

/** Cap de bytes do arquivo enviado (5 MB). */
export const MAX_DOC_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Postgres TEXT NÃO aceita NUL bytes (\x00). Caracteres NUL geram
 * `invalid byte sequence for encoding "UTF8": 0x00`. Removemos antes do INSERT.
 */
export function sanitizeForPostgres(s: string): string {
  return s.replace(/\x00/g, "");
}

/** Resumo de KB doc (lista) — NÃO inclui extracted_text para não inflar payload. */
export interface KbSummary {
  id: string;
  name: string;
  mimeType: string;
  fileSize: number;
  charCount: number;
  createdAt: Date;
  updatedAt: Date;
  uploadedById: string | null;
}

export interface KbCreateInput {
  name: string;
  mimeType: string;
  fileSize: number;
  extractedText: string;
  uploadedById?: string | null;
}

interface KbRowSummary {
  id: string;
  name: string;
  mime_type: string;
  file_size: number;
  char_count: number;
  created_at: Date;
  updated_at: Date;
  uploaded_by_id: string | null;
}

interface KbRowForPrompt {
  name: string;
  extracted_text: string;
}

/** Lista todos os docs (sem extracted_text), mais recentes primeiro. */
export async function listKbDocuments(): Promise<KbSummary[]> {
  await ensureNexTables();
  const r = await pgPool.query<KbRowSummary>(
    `SELECT id, name, mime_type, file_size, char_count, created_at, updated_at, uploaded_by_id
     FROM nex_kb_documents
     ORDER BY created_at DESC`,
  );
  return r.rows.map((row) => ({
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    charCount: row.char_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    uploadedById: row.uploaded_by_id,
  }));
}

/** Retorna docs em ordem ASC (cronológica) para composição do system prompt. */
export async function getKbDocsForPrompt(): Promise<
  { name: string; extractedText: string }[]
> {
  await ensureNexTables();
  const r = await pgPool.query<KbRowForPrompt>(
    `SELECT name, extracted_text
     FROM nex_kb_documents
     ORDER BY created_at ASC`,
  );
  return r.rows.map((row) => ({
    name: row.name,
    extractedText: row.extracted_text,
  }));
}

/**
 * Cria um KB doc. Rejeita arquivos > 5 MB. Sanitiza NUL bytes e trunca
 * o texto extraído em MAX_DOC_CHARS antes do INSERT.
 */
export async function createKbDocument(input: KbCreateInput): Promise<string> {
  if (input.fileSize > MAX_DOC_FILE_BYTES) {
    throw new Error(
      `arquivo excede o tamanho máximo de 5 MB (${MAX_DOC_FILE_BYTES} bytes)`,
    );
  }
  await ensureNexTables();

  const sanitized = sanitizeForPostgres(input.extractedText ?? "");
  const truncated =
    sanitized.length > MAX_DOC_CHARS ? sanitized.slice(0, MAX_DOC_CHARS) : sanitized;
  const charCount = truncated.length;

  const r = await pgPool.query<{ id: string }>(
    `INSERT INTO nex_kb_documents
       (name, mime_type, file_size, char_count, extracted_text, uploaded_by_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.name,
      input.mimeType,
      input.fileSize,
      charCount,
      truncated,
      input.uploadedById ?? null,
    ],
  );
  return r.rows[0].id;
}

/** Remove um KB doc por id. */
export async function deleteKbDocument(id: string): Promise<void> {
  await ensureNexTables();
  await pgPool.query(`DELETE FROM nex_kb_documents WHERE id = $1`, [id]);
}
