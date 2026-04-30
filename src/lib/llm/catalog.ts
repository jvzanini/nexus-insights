/**
 * Catálogo rico de provedores e modelos LLM.
 *
 * Substitui a estrutura plana `PROVIDER_MODELS` (em `pricing.ts`) na UI/Server,
 * adicionando metadados:
 *  - tier de custo (free/low/medium/high) para sinalização visual ($/$$/$$$).
 *  - notas curtas (ex.: "raciocínio") exibidas no select.
 *  - URLs para criação de API key e top-up de crédito (atalhos no card).
 *
 * `allowCustomModel: true` para todos — a UI adiciona em runtime a pseudo-opção
 * "Outro (digitar manualmente)" no topo do select para permitir IDs novos
 * (ex.: snapshots `-2024-08-06`, modelos preview).
 *
 * Atualizado em abril/2026.
 */

import type { LlmProvider } from "./types";

export type CostTier = "free" | "low" | "medium" | "high";

export interface ModelInfo {
  /** ID exato a passar ao provider. */
  id: string;
  /** Nome amigável exibido na UI. */
  label: string;
  /** Sinalização de custo. */
  tier: CostTier;
  /** Nota curta (ex.: "raciocínio profundo"). */
  notes?: string;
  /** Mês/ano de release no formato YYYY-MM. */
  released?: string;
}

export interface ProviderCatalog {
  provider: LlmProvider;
  label: string;
  /** Atalho para criação de API key. */
  apiKeyUrl: string;
  /** Atalho para adicionar crédito (opcional). */
  topUpUrl?: string;
  /** Quando true, a UI permite digitar um ID livre via "Outro". */
  allowCustomModel: boolean;
  /** Lista canônica — não inclui "Outro" (adicionada em runtime). */
  models: ModelInfo[];
}

export const PROVIDER_CATALOG: Record<LlmProvider, ProviderCatalog> = {
  openai: {
    provider: "openai",
    label: "OpenAI",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    topUpUrl: "https://platform.openai.com/account/billing",
    allowCustomModel: true,
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini", tier: "low", released: "2024-07" },
      { id: "gpt-4o", label: "GPT-4o", tier: "medium", released: "2024-05" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", tier: "low", released: "2025-04" },
      { id: "gpt-4.1", label: "GPT-4.1", tier: "medium", released: "2025-04" },
      { id: "gpt-4.1-nano", label: "GPT-4.1 nano", tier: "low", released: "2025-04" },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo", tier: "high", released: "2024-04" },
      { id: "o1-mini", label: "o1-mini", tier: "medium", notes: "raciocínio", released: "2024-09" },
      { id: "o1", label: "o1", tier: "high", notes: "raciocínio", released: "2024-12" },
      { id: "o3-mini", label: "o3-mini", tier: "medium", notes: "raciocínio", released: "2025-01" },
      { id: "o3", label: "o3", tier: "high", notes: "raciocínio", released: "2025-04" },
      { id: "o4-mini", label: "o4-mini", tier: "medium", notes: "raciocínio", released: "2025-04" },
    ],
  },
  anthropic: {
    provider: "anthropic",
    label: "Anthropic",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    topUpUrl: "https://console.anthropic.com/settings/billing",
    allowCustomModel: true,
    models: [
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", tier: "low", released: "2024-10" },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", tier: "medium", released: "2024-10" },
      { id: "claude-3-opus-20240229", label: "Claude 3 Opus", tier: "high", released: "2024-02" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", tier: "low", released: "2025-10" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", tier: "medium", released: "2025-09" },
      { id: "claude-opus-4-5", label: "Claude Opus 4.5", tier: "high", released: "2025-09" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", tier: "medium", released: "2026-01" },
      { id: "claude-opus-4-7", label: "Claude Opus 4.7", tier: "high", notes: "atual mais novo", released: "2026-04" },
    ],
  },
  gemini: {
    provider: "gemini",
    label: "Google Gemini",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    topUpUrl: "https://console.cloud.google.com/billing",
    allowCustomModel: true,
    models: [
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", tier: "low", released: "2024-05" },
      { id: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash-8B", tier: "low", released: "2024-10" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", tier: "medium", released: "2024-05" },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", tier: "low", released: "2025-02" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", tier: "low", released: "2024-12" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", tier: "low", released: "2025-09" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "low", released: "2025-09" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "high", released: "2025-09" },
    ],
  },
  openrouter: {
    provider: "openrouter",
    label: "OpenRouter",
    apiKeyUrl: "https://openrouter.ai/keys",
    topUpUrl: "https://openrouter.ai/credits",
    allowCustomModel: true,
    models: [
      // Free
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)", tier: "free", released: "2024-12" },
      { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash exp (free)", tier: "free", released: "2024-12" },
      { id: "deepseek/deepseek-chat-v3:free", label: "DeepSeek Chat v3 (free)", tier: "free", released: "2025-01" },
      { id: "mistralai/mistral-7b-instruct:free", label: "Mistral 7B (free)", tier: "free", released: "2024-09" },
      // Low
      { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", tier: "low", released: "2024-12" },
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini", tier: "low", released: "2024-07" },
      { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku", tier: "low", released: "2024-10" },
      { id: "deepseek/deepseek-chat", label: "DeepSeek Chat", tier: "low", released: "2024-12" },
      { id: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B", tier: "low", released: "2024-09" },
      // Medium
      { id: "openai/gpt-4o", label: "GPT-4o", tier: "medium", released: "2024-05" },
      { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", tier: "medium", released: "2024-10" },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", tier: "medium", released: "2025-09" },
      // High
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "high", released: "2025-09" },
      { id: "meta-llama/llama-3.1-405b-instruct", label: "Llama 3.1 405B", tier: "high", released: "2024-07" },
      { id: "openai/o1", label: "o1", tier: "high", notes: "raciocínio", released: "2024-12" },
      { id: "openai/o3", label: "o3", tier: "high", notes: "raciocínio", released: "2025-04" },
      { id: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7", tier: "high", released: "2026-04" },
    ],
  },
};

/**
 * Helper utilitário usado em validações: retorna `true` se o modelo está
 * presente no catálogo do provider (não considera "Outro").
 */
export function isCatalogModel(provider: LlmProvider, model: string): boolean {
  return PROVIDER_CATALOG[provider].models.some((m) => m.id === model);
}
