import "server-only";
import { pgPool } from "@/lib/pg-pool";
import { ensureNexTables } from "./ensure-tables";
import {
  MAX_PERSONALITY_LEN,
  MAX_TONE_LEN,
  MAX_GUARDRAIL_LEN,
  MAX_GUARDRAILS,
  MAX_PROMPT_LEN,
  type NexPromptConfig,
} from "./prompt-compose";

// Re-exporta o núcleo puro (isomórfico) para retrocompatibilidade dos imports
// existentes (`@/lib/nex/prompt`). As funções de DB abaixo permanecem
// server-only via `import "server-only"` no topo deste arquivo.
export {
  IDENTITY_BASE,
  MAX_PERSONALITY_LEN,
  MAX_TONE_LEN,
  MAX_GUARDRAIL_LEN,
  MAX_GUARDRAILS,
  MAX_PROMPT_LEN,
  MAX_KB_TOTAL_CHARS,
  composeSystemPrompt,
  type NexPromptConfig,
  type KbDocSnippet,
  type AccountUrlSnippet,
} from "./prompt-compose";

function asStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asStringMap(v: unknown): Record<string, string> {
  if (typeof v !== "object" || v === null) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof k === "string" && typeof val === "string") out[k] = val;
  }
  return out;
}

export async function getNexPromptConfig(): Promise<NexPromptConfig> {
  await ensureNexTables();
  const r = await pgPool.query<{
    identity_base: string | null;
    personality: string;
    tone: string;
    guardrails: unknown;
    advanced_override: string | null;
    audio_input_enabled: boolean;
    kb_enabled: boolean;
    terminology: unknown;
    suggestions_enabled: boolean;
  }>(
    `SELECT identity_base, personality, tone, guardrails, advanced_override, audio_input_enabled, kb_enabled, terminology, suggestions_enabled
     FROM nex_settings WHERE id = 'global' LIMIT 1`,
  );
  if (r.rowCount === 0) {
    return {
      identityBase: null,
      personality: "",
      tone: "",
      guardrails: [],
      advancedOverride: null,
      audioInputEnabled: false,
      kbEnabled: true,
      terminology: {},
      suggestionsEnabled: false,
    };
  }
  const row = r.rows[0];
  return {
    identityBase: row.identity_base,
    personality: row.personality ?? "",
    tone: row.tone ?? "",
    guardrails: asStrArray(row.guardrails),
    advancedOverride: row.advanced_override,
    audioInputEnabled: !!row.audio_input_enabled,
    kbEnabled: !!row.kb_enabled,
    terminology: asStringMap(row.terminology),
    suggestionsEnabled: !!row.suggestions_enabled,
  };
}

export async function saveNexPromptConfig(
  cfg: NexPromptConfig,
  updatedById?: string | null,
): Promise<void> {
  if (cfg.personality.length > MAX_PERSONALITY_LEN) {
    throw new Error(`personality > ${MAX_PERSONALITY_LEN}`);
  }
  if (cfg.tone.length > MAX_TONE_LEN) {
    throw new Error(`tone > ${MAX_TONE_LEN}`);
  }
  if (cfg.guardrails.length > MAX_GUARDRAILS) {
    throw new Error(`máximo ${MAX_GUARDRAILS} guardrails`);
  }
  for (const g of cfg.guardrails) {
    if (g.length > MAX_GUARDRAIL_LEN) {
      throw new Error(`guardrail > ${MAX_GUARDRAIL_LEN}`);
    }
  }
  if (cfg.advancedOverride && cfg.advancedOverride.length > MAX_PROMPT_LEN) {
    throw new Error(`override avançado > ${MAX_PROMPT_LEN}`);
  }
  await ensureNexTables();
  await pgPool.query(
    `INSERT INTO nex_settings (id, identity_base, personality, tone, guardrails, advanced_override, audio_input_enabled, kb_enabled, terminology, suggestions_enabled, updated_at, updated_by_id)
     VALUES ('global', $1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9, NOW(), $10)
     ON CONFLICT (id) DO UPDATE SET
       identity_base = EXCLUDED.identity_base,
       personality = EXCLUDED.personality,
       tone = EXCLUDED.tone,
       guardrails = EXCLUDED.guardrails,
       advanced_override = EXCLUDED.advanced_override,
       audio_input_enabled = EXCLUDED.audio_input_enabled,
       kb_enabled = EXCLUDED.kb_enabled,
       terminology = EXCLUDED.terminology,
       suggestions_enabled = EXCLUDED.suggestions_enabled,
       updated_at = NOW(),
       updated_by_id = EXCLUDED.updated_by_id`,
    [
      cfg.identityBase ?? null,
      cfg.personality,
      cfg.tone,
      JSON.stringify(cfg.guardrails),
      cfg.advancedOverride ?? null,
      cfg.audioInputEnabled,
      cfg.kbEnabled,
      JSON.stringify(cfg.terminology ?? {}),
      cfg.suggestionsEnabled,
      updatedById ?? null,
    ],
  );
}
