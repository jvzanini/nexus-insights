/**
 * Tabela de preços por modelo (USD por milhão de tokens) e cálculo de custo.
 *
 * Valores oficiais (abril/2026), atualizados manualmente. Modelos não mapeados
 * retornam custo zero — comportamento intencional para evitar quebra
 * em modelos novos / personalizados, mas o relatório de Consumo passa a
 * exibir "—" para esses modelos (o cálculo de BRL respeita 0).
 */

import type { LlmProvider } from "./types";

export interface ModelPricing {
  /** Custo de tokens de input em USD por 1.000.000 de tokens. */
  inputPerMillion: number;
  /** Custo de tokens de output em USD por 1.000.000 de tokens. */
  outputPerMillion: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ---------------------------------------------------------------------
  // OpenAI — preços oficiais abril/2026 (USD por 1M tokens)
  // ---------------------------------------------------------------------
  // GPT-5.x (reasoning, max_completion_tokens)
  "gpt-5": { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  "gpt-5-mini": { inputPerMillion: 0.25, outputPerMillion: 2.0 },
  "gpt-5-nano": { inputPerMillion: 0.05, outputPerMillion: 0.4 },
  "gpt-5.1": { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  "gpt-5.1-mini": { inputPerMillion: 0.25, outputPerMillion: 2.0 },
  "gpt-5.1-nano": { inputPerMillion: 0.05, outputPerMillion: 0.4 },
  "gpt-5.2": { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  "gpt-5.2-mini": { inputPerMillion: 0.25, outputPerMillion: 2.0 },
  "gpt-5.4": { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  "gpt-5.5": { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  // GPT-4.1.x
  "gpt-4.1": { inputPerMillion: 2.0, outputPerMillion: 8.0 },
  "gpt-4.1-mini": { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  "gpt-4.1-nano": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  // GPT-4o (legado, ainda em uso)
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4-turbo": { inputPerMillion: 10.0, outputPerMillion: 30.0 },
  // o-series (reasoning)
  o1: { inputPerMillion: 15.0, outputPerMillion: 60.0 },
  "o1-mini": { inputPerMillion: 3.0, outputPerMillion: 12.0 },
  o3: { inputPerMillion: 2.0, outputPerMillion: 8.0 },
  "o3-mini": { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  "o4-mini": { inputPerMillion: 1.1, outputPerMillion: 4.4 },

  // ---------------------------------------------------------------------
  // Anthropic — Claude 4.x family (abril/2026)
  // ---------------------------------------------------------------------
  "claude-sonnet-4-5": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-sonnet-4-7-20250624": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
  },
  "claude-sonnet-4.7": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-sonnet-4.7-20250624": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
  },
  "claude-opus-4-5": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  "claude-opus-4-7-20250624": {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
  },
  "claude-haiku-4-5": { inputPerMillion: 1.0, outputPerMillion: 5.0 },
  // Claude 3.x (legado, mantidos para Configurações antigas)
  "claude-3-5-sonnet-20241022": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
  },
  "claude-3-5-haiku-20241022": { inputPerMillion: 1.0, outputPerMillion: 5.0 },
  "claude-3-opus-20240229": { inputPerMillion: 15.0, outputPerMillion: 75.0 },

  // ---------------------------------------------------------------------
  // Google Gemini — 2.5 family (abril/2026)
  // ---------------------------------------------------------------------
  "gemini-2.5-pro": { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  "gemini-2.5-flash": { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  "gemini-2.5-flash-lite": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  "gemini-2.0-pro": { inputPerMillion: 1.25, outputPerMillion: 5.0 },
  // Legado
  "gemini-2.0-flash": { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  "gemini-1.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5.0 },
  "gemini-1.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.3 },

  // ---------------------------------------------------------------------
  // OpenRouter — espelha o custo do modelo direto. Inclui aliases comuns.
  // ---------------------------------------------------------------------
  "openrouter/openai/gpt-5.1-mini": {
    inputPerMillion: 0.25,
    outputPerMillion: 2.0,
  },
  "openrouter/openai/gpt-4.1-mini": {
    inputPerMillion: 0.4,
    outputPerMillion: 1.6,
  },
  "openrouter/anthropic/claude-sonnet-4.7": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
  },
  "openrouter/google/gemini-2.5-flash": {
    inputPerMillion: 0.3,
    outputPerMillion: 2.5,
  },
  "openrouter/anthropic/claude-3.5-sonnet": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
  },
  "openrouter/openai/gpt-4o": {
    inputPerMillion: 2.5,
    outputPerMillion: 10.0,
  },
};

export function calculateCost(
  model: string,
  tokensInput: number,
  tokensOutput: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  const cost =
    (tokensInput * pricing.inputPerMillion +
      tokensOutput * pricing.outputPerMillion) /
    1_000_000;
  // Arredonda em 6 casas para evitar artefatos de ponto flutuante.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export const PROVIDER_MODELS: Record<LlmProvider, string[]> = {
  openai: [
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5.1",
    "gpt-5.1-mini",
    "gpt-5.1-nano",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "o3",
    "o3-mini",
    "o4-mini",
    "o1",
    "o1-mini",
  ],
  anthropic: [
    "claude-sonnet-4-7-20250624",
    "claude-sonnet-4-5",
    "claude-opus-4-7-20250624",
    "claude-opus-4-5",
    "claude-haiku-4-5",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
  gemini: [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-pro",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],
  openrouter: [
    "openrouter/openai/gpt-5.1-mini",
    "openrouter/openai/gpt-4.1-mini",
    "openrouter/anthropic/claude-sonnet-4.7",
    "openrouter/google/gemini-2.5-flash",
    "openrouter/anthropic/claude-3.5-sonnet",
    "openrouter/openai/gpt-4o",
  ],
};

export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
};
