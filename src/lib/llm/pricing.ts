/**
 * Tabela de preços por modelo (USD por milhão de tokens) e cálculo de custo.
 *
 * Valores aproximados, atualizados manualmente. Modelos não mapeados
 * retornam custo zero — comportamento intencional para evitar quebra
 * em modelos novos / personalizados.
 */

import type { LlmProvider } from "./types";

export interface ModelPricing {
  /** Custo de tokens de input em USD por 1.000.000 de tokens. */
  inputPerMillion: number;
  /** Custo de tokens de output em USD por 1.000.000 de tokens. */
  outputPerMillion: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4-turbo": { inputPerMillion: 10.0, outputPerMillion: 30.0 },
  o1: { inputPerMillion: 15.0, outputPerMillion: 60.0 },
  "o1-mini": { inputPerMillion: 3.0, outputPerMillion: 12.0 },
  // Anthropic
  "claude-3-5-sonnet-20241022": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
  },
  "claude-3-5-haiku-20241022": { inputPerMillion: 1.0, outputPerMillion: 5.0 },
  "claude-3-opus-20240229": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  // Gemini
  "gemini-2.0-flash": { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  "gemini-1.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5.0 },
  "gemini-1.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  // OpenRouter (aproximado, varia por modelo)
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
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o1-mini"],
  anthropic: [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
  gemini: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  openrouter: [
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
