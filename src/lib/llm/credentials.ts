import "server-only";

import { pgPool } from "@/lib/pg-pool";
import { encrypt, decrypt } from "@/lib/encryption";

import { ensureLlmTables } from "./ensure-tables";
import type { LlmProvider } from "./types";

export const CREDENTIAL_IN_USE = "CREDENTIAL_IN_USE";

const MAX_LABEL_LEN = 60;
const MIN_API_KEY_LEN = 10;

export interface CredentialSummary {
  id: string;
  provider: LlmProvider;
  label: string;
  last4: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCredentialInput {
  provider: LlmProvider;
  label?: string;
  apiKey: string;
}

export interface UpdateCredentialInput {
  label?: string;
  apiKey?: string;
}

function assertValidLabel(label: string): void {
  if (label.length === 0 || label.length > MAX_LABEL_LEN) {
    throw new Error(`Label inválida (1 a ${MAX_LABEL_LEN} caracteres)`);
  }
}

function assertValidApiKey(apiKey: string): void {
  if (typeof apiKey !== "string" || apiKey.trim().length < MIN_API_KEY_LEN) {
    throw new Error("API key inválida (muito curta)");
  }
}

async function isLabelTaken(
  provider: LlmProvider,
  label: string,
  excludeId?: string,
): Promise<boolean> {
  const params: unknown[] = [provider, label];
  let sql = `SELECT COUNT(*) AS count FROM llm_credentials WHERE provider = $1 AND label = $2`;
  if (excludeId) {
    sql += ` AND id <> $3`;
    params.push(excludeId);
  }
  const r = await pgPool.query<{ count: string | number }>(sql, params);
  return Number(r.rows[0]?.count ?? 0) > 0;
}

async function autogenerateLabel(provider: LlmProvider): Promise<string> {
  let n = 1;
  while (true) {
    const candidate = `Chave ${n}`;
    if (!(await isLabelTaken(provider, candidate))) return candidate;
    n += 1;
    if (n > 999) throw new Error("Não foi possível autogerar label");
  }
}

export async function listCredentials(
  provider?: LlmProvider,
): Promise<CredentialSummary[]> {
  await ensureLlmTables();
  const params: unknown[] = [];
  let sql = `SELECT id, provider, label, last4, created_at, updated_at
               FROM llm_credentials`;
  if (provider) {
    sql += ` WHERE provider = $1`;
    params.push(provider);
  }
  sql += ` ORDER BY provider ASC, updated_at DESC`;
  const r = await pgPool.query<{
    id: string;
    provider: string;
    label: string;
    last4: string;
    created_at: Date | string;
    updated_at: Date | string;
  }>(sql, params);
  return r.rows.map((row) => ({
    id: row.id,
    provider: row.provider as LlmProvider,
    label: row.label,
    last4: row.last4,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString(),
  }));
}

export async function createCredential(
  input: CreateCredentialInput,
  createdById?: string | null,
): Promise<{ id: string; label: string; last4: string }> {
  const trimmed = input.apiKey?.trim() ?? "";
  assertValidApiKey(trimmed);

  await ensureLlmTables();

  const label = (input.label ?? "").trim() || (await autogenerateLabel(input.provider));
  assertValidLabel(label);

  if (await isLabelTaken(input.provider, label)) {
    throw new Error(`Label "${label}" já existe para este provider`);
  }

  const last4 = trimmed.slice(-4);
  const enc = encrypt(trimmed);

  const r = await pgPool.query<{ id: string; label: string; last4: string }>(
    `INSERT INTO llm_credentials (id, provider, label, encrypted_api_key, last4, created_at, updated_at, created_by_id)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW(), $5)
     RETURNING id, label, last4`,
    [input.provider, label, enc, last4, createdById ?? null],
  );

  return r.rows[0];
}

export async function updateCredential(
  id: string,
  input: UpdateCredentialInput,
): Promise<{ provider: LlmProvider; label: string; last4: string }> {
  await ensureLlmTables();

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (input.label !== undefined) {
    const label = input.label.trim();
    assertValidLabel(label);
    const cur = await pgPool.query<{ provider: string }>(
      `SELECT provider FROM llm_credentials WHERE id = $1`,
      [id],
    );
    const provider = cur.rows[0]?.provider as LlmProvider | undefined;
    if (!provider) throw new Error("Credencial não encontrada");
    if (await isLabelTaken(provider, label, id)) {
      throw new Error(`Label "${label}" já existe para este provider`);
    }
    setClauses.push(`label = $${paramIdx++}`);
    params.push(label);
  }

  if (input.apiKey !== undefined) {
    const trimmed = input.apiKey.trim();
    assertValidApiKey(trimmed);
    setClauses.push(`encrypted_api_key = $${paramIdx++}`);
    params.push(encrypt(trimmed));
    setClauses.push(`last4 = $${paramIdx++}`);
    params.push(trimmed.slice(-4));
  }

  if (setClauses.length === 0) {
    throw new Error("Nada a atualizar");
  }

  setClauses.push(`updated_at = NOW()`);
  params.push(id);

  const sql = `UPDATE llm_credentials
                  SET ${setClauses.join(", ")}
                WHERE id = $${paramIdx}
            RETURNING provider, label, last4`;

  const r = await pgPool.query<{
    provider: string;
    label: string;
    last4: string;
  }>(sql, params);

  if (r.rowCount === 0) throw new Error("Credencial não encontrada");
  const row = r.rows[0];
  return {
    provider: row.provider as LlmProvider,
    label: row.label,
    last4: row.last4,
  };
}

export async function deleteCredential(id: string): Promise<void> {
  await ensureLlmTables();
  const usage = await pgPool.query<{ count: string | number }>(
    `SELECT COUNT(*) AS count
       FROM llm_configs
      WHERE credential_id = $1 AND is_active = true`,
    [id],
  );
  if (Number(usage.rows[0]?.count ?? 0) > 0) {
    throw new Error(CREDENTIAL_IN_USE);
  }
  await pgPool.query(`DELETE FROM llm_credentials WHERE id = $1`, [id]);
}

export async function getCredentialApiKey(id: string): Promise<string | null> {
  await ensureLlmTables();
  const r = await pgPool.query<{ encrypted_api_key: string }>(
    `SELECT encrypted_api_key FROM llm_credentials WHERE id = $1`,
    [id],
  );
  if (r.rowCount === 0) return null;
  try {
    return decrypt(r.rows[0].encrypted_api_key);
  } catch {
    return null;
  }
}
