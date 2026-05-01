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

export async function getNexPromptConfig(): Promise<NexPromptConfig> {
  await ensureNexTables();
  const r = await pgPool.query<{
    personality: string;
    tone: string;
    guardrails: unknown;
    advanced_override: string | null;
    audio_input_enabled: boolean;
    kb_enabled: boolean;
  }>(
    `SELECT personality, tone, guardrails, advanced_override, audio_input_enabled, kb_enabled
     FROM nex_settings WHERE id = 'global' LIMIT 1`,
  );
  if (r.rowCount === 0) {
    return {
      personality: "",
      tone: "",
      guardrails: [],
      advancedOverride: null,
      audioInputEnabled: false,
      kbEnabled: true,
    };
  }
  const row = r.rows[0];
  return {
    personality: row.personality ?? "",
    tone: row.tone ?? "",
    guardrails: asStrArray(row.guardrails),
    advancedOverride: row.advanced_override,
    audioInputEnabled: !!row.audio_input_enabled,
    kbEnabled: !!row.kb_enabled,
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
    `INSERT INTO nex_settings (id, personality, tone, guardrails, advanced_override, audio_input_enabled, kb_enabled, updated_at, updated_by_id)
     VALUES ('global', $1, $2, $3::jsonb, $4, $5, $6, NOW(), $7)
     ON CONFLICT (id) DO UPDATE SET
       personality = EXCLUDED.personality,
       tone = EXCLUDED.tone,
       guardrails = EXCLUDED.guardrails,
       advanced_override = EXCLUDED.advanced_override,
       audio_input_enabled = EXCLUDED.audio_input_enabled,
       kb_enabled = EXCLUDED.kb_enabled,
       updated_at = NOW(),
       updated_by_id = EXCLUDED.updated_by_id`,
    [
      cfg.personality,
      cfg.tone,
      JSON.stringify(cfg.guardrails),
      cfg.advancedOverride ?? null,
      cfg.audioInputEnabled,
      cfg.kbEnabled,
      updatedById ?? null,
    ],
  );
}
