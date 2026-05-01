import "server-only";
import { pgPool } from "@/lib/pg-pool";
import { ensureNexTables } from "./ensure-tables";

export const MAX_PERSONALITY_LEN = 500;
export const MAX_TONE_LEN = 500;
export const MAX_GUARDRAIL_LEN = 300;
export const MAX_GUARDRAILS = 20;
export const MAX_PROMPT_LEN = 50_000;
export const MAX_KB_TOTAL_CHARS = 30_000;

export const IDENTITY_BASE = `Você é o Agente Nex, assistente da plataforma Nexus Insights que analisa dados de atendimento do Chatwoot.

CAPACIDADES:
- Consultar conversas, mensagens, contatos e atendentes via tools.
- Agregar e cruzar dados (contagens, médias, top N).
- Responder em português brasileiro de forma direta e útil.

DIRETRIZES:
- Sempre use tools para obter dados — nunca invente números.
- Se o período for ambíguo, pergunte (ex.: "Você quer dados de hoje ou de outro período?").
- Apresente números formatados em pt-BR (ex.: 1.234, 12,5%).
- Para listas longas, mostre os 5-10 primeiros e ofereça expandir.
- Se a tool retornar erro, explique brevemente e sugira reformular.
- Use markdown para listas, **negrito** para destacar, tabelas quando útil.

TIMEZONE PADRÃO: America/Sao_Paulo (BRT). "Hoje" = das 00:00 às 23:59:59 BRT.`;

export interface NexPromptConfig {
  personality: string;
  tone: string;
  guardrails: string[];
  advancedOverride: string | null;
  audioInputEnabled: boolean;
  kbEnabled: boolean;
}

export interface KbDocSnippet {
  name: string;
  extractedText: string;
}

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

export function composeSystemPrompt(
  cfg: NexPromptConfig,
  kbDocs: KbDocSnippet[],
): string {
  if (cfg.advancedOverride && cfg.advancedOverride.trim().length > 0) {
    return cfg.advancedOverride;
  }
  const parts: string[] = [IDENTITY_BASE];
  if (cfg.personality.trim()) {
    parts.push(`\n\n[PERSONALIDADE]\nPersonalidade: ${cfg.personality.trim()}`);
  }
  if (cfg.tone.trim()) {
    parts.push(`\n\n[TOM]\nTom: ${cfg.tone.trim()}`);
  }
  if (cfg.guardrails.length > 0) {
    parts.push(
      `\n\n[GUARDRAILS]\nRegras importantes:\n${cfg.guardrails
        .map((g) => `- ${g.trim()}`)
        .join("\n")}`,
    );
  }
  if (cfg.kbEnabled && kbDocs.length > 0) {
    let budget = MAX_KB_TOTAL_CHARS;
    const chunks: string[] = [
      "\n\n[BASE DE CONHECIMENTO]\nConhecimento adicional fornecido pelo administrador:",
    ];
    let truncated = false;
    for (const d of kbDocs) {
      if (budget <= 0) {
        truncated = true;
        break;
      }
      const head = `\n\n=== ${d.name} ===\n`;
      const remaining = budget - head.length;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const body =
        d.extractedText.length <= remaining
          ? d.extractedText
          : `${d.extractedText.slice(0, remaining)}\n[...truncado...]`;
      chunks.push(`${head}${body}`);
      budget -= head.length + body.length;
      if (d.extractedText.length > remaining) {
        truncated = true;
        break;
      }
    }
    if (truncated && !chunks.join("").includes("[...truncado...]")) {
      chunks.push("\n[...truncado...]");
    }
    parts.push(chunks.join(""));
  }
  return parts.join("");
}
