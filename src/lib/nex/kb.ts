import "server-only";
import { pgPool } from "@/lib/pg-pool";
import { ensureNexTables } from "./ensure-tables";
import type { NexKbKind } from "@/generated/prisma/client";

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
  /** Tipo do documento. Default `PDF` (back-compat com upload PDF/TXT). */
  kind?: NexKbKind;
  /** URL pública de origem (apenas quando `kind="URL"`). */
  sourceUrl?: string | null;
  mimeType: string;
  fileSize: number;
  extractedText: string;
  uploadedById?: string | null;
}

/** Detalhes completos de um KB doc do tipo URL (usados em refresh). */
export interface KbUrlDocument {
  id: string;
  name: string;
  kind: NexKbKind;
  sourceUrl: string | null;
  extractedText: string;
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
 *
 * `kind` (default `PDF`) e `sourceUrl` (default `null`) suportam o tipo
 * URL adicionado em v0.16.0. `sourceUrl` só é persistido quando
 * `kind === "URL"`.
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
  const kind = (input.kind ?? "PDF") as NexKbKind;
  const sourceUrl = kind === "URL" ? (input.sourceUrl ?? null) : null;

  const r = await pgPool.query<{ id: string }>(
    `INSERT INTO nex_kb_documents
       (name, kind, source_url, mime_type, file_size, char_count, extracted_text, uploaded_by_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.name,
      kind,
      sourceUrl,
      input.mimeType,
      input.fileSize,
      charCount,
      truncated,
      input.uploadedById ?? null,
    ],
  );
  return r.rows[0].id;
}

interface KbUrlRow {
  id: string;
  name: string;
  kind: NexKbKind;
  source_url: string | null;
  extracted_text: string;
}

/**
 * Lê um doc por id, devolvendo apenas os campos necessários para o
 * fluxo de refresh (kind/sourceUrl/extractedText). Retorna null se
 * não existir.
 */
export async function getKbDocumentById(
  id: string,
): Promise<KbUrlDocument | null> {
  await ensureNexTables();
  const r = await pgPool.query<KbUrlRow>(
    `SELECT id, name, kind, source_url, extracted_text
     FROM nex_kb_documents
     WHERE id = $1`,
    [id],
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    sourceUrl: row.source_url,
    extractedText: row.extracted_text,
  };
}

/**
 * Atualiza apenas o conteúdo extraído (refresh de URL). Sanitiza
 * NUL e trunca em MAX_DOC_CHARS. Atualiza `char_count` + `file_size`
 * (bytes UTF-8) + `updated_at`. Não toca em `kind`/`source_url`/`name`.
 */
export async function updateKbDocumentContent(
  id: string,
  rawText: string,
): Promise<{ charCount: number }> {
  await ensureNexTables();
  const sanitized = sanitizeForPostgres(rawText ?? "");
  const truncated =
    sanitized.length > MAX_DOC_CHARS ? sanitized.slice(0, MAX_DOC_CHARS) : sanitized;
  const charCount = truncated.length;
  const fileSize = Buffer.byteLength(truncated, "utf8");
  await pgPool.query(
    `UPDATE nex_kb_documents
     SET extracted_text = $2,
         char_count     = $3,
         file_size      = $4,
         updated_at     = NOW()
     WHERE id = $1`,
    [id, truncated, charCount, fileSize],
  );
  return { charCount };
}

/** Remove um KB doc por id. */
export async function deleteKbDocument(id: string): Promise<void> {
  await ensureNexTables();
  await pgPool.query(`DELETE FROM nex_kb_documents WHERE id = $1`, [id]);
}
