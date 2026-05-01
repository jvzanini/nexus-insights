/**
 * Catálogo rico de provedores e modelos LLM.
 *
 * Substitui a estrutura plana `PROVIDER_MODELS` (em `pricing.ts`) na UI/Server,
 * adicionando metadados:
 *  - tier de custo (low/medium/high/premium) para sinalização visual ($/$$/$$$/$$$$).
 *  - notas curtas (ex.: "raciocínio") exibidas no select.
 *  - URLs para criação de API key e top-up de crédito (atalhos no card).
 *
 * `allowCustomModel: true` para todos — a UI adiciona em runtime a pseudo-opção
 * "Outro (digitar manualmente)" no topo do select para permitir IDs novos
 * (ex.: snapshots `-2024-08-06`, modelos preview).
 *
 * Atualizado em maio/2026 (cutoff). Cobre modelos lançados de 2024 em diante,
 * incluindo família GPT-5.x, Claude 4.7, Gemini 3.x e 118 modelos OpenRouter.
 *
 * Faixas de tier (v0.16.0+):
 *  - low    → < $1 / 1M tokens (e modelos `:free` com nota "free")
 *  - medium → $1 a $10 / 1M tokens
 *  - high   → $10 a $30 / 1M tokens
 *  - premium→ > $30 / 1M tokens
 */

import type { CostTier, LlmProvider } from "./types";

export type { CostTier };

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
    // IDs verificados em https://developers.openai.com/api/docs/models/all
    // (cutoff May/2026). NÃO inclui IDs inventados que retornam 404 (ex.:
    // gpt-5.1-mini, gpt-5.1-nano, gpt-5.2-mini, gpt-4.1-nano).
    // Reclassificação v0.16.0:
    //  - gpt-5.5-pro / gpt-5.4-pro / o1-pro / o3-pro → "premium" (> $30/1M output).
    //  - gpt-5.5 / gpt-5.4 mantêm "high" (output até $30/1M).
    models: [
      { id: "gpt-5.5", label: "GPT-5.5", tier: "high", notes: "atual mais novo · $5/$30", released: "2026-04" },
      { id: "gpt-5.5-pro", label: "GPT-5.5 Pro", tier: "premium", notes: "$30/$180", released: "2026-04" },
      { id: "gpt-5.4", label: "GPT-5.4", tier: "high", notes: "$2.5/$15", released: "2026-04" },
      { id: "gpt-5.4-pro", label: "GPT-5.4 Pro", tier: "premium", notes: "$30/$180", released: "2026-04" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini", tier: "low", released: "2026-04" },
      { id: "gpt-5.4-nano", label: "GPT-5.4 nano", tier: "low", released: "2026-04" },
      { id: "gpt-5.1", label: "GPT-5.1", tier: "high", released: "2026-02" },
      { id: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex mini", tier: "low", notes: "código", released: "2026-02" },
      { id: "gpt-5", label: "GPT-5", tier: "high", released: "2025-12" },
      { id: "gpt-5-mini", label: "GPT-5 mini", tier: "medium", released: "2025-12" },
      { id: "gpt-5-nano", label: "GPT-5 nano", tier: "low", released: "2025-12" },
      { id: "gpt-5-codex", label: "GPT-5 Codex", tier: "medium", notes: "código", released: "2025-12" },
      { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", tier: "high", notes: "código", released: "2026-03" },
      { id: "o3-pro", label: "o3-pro", tier: "premium", notes: "raciocínio profundo", released: "2025-04" },
      { id: "o3", label: "o3", tier: "high", notes: "raciocínio", released: "2025-04" },
      { id: "o1-pro", label: "o1-pro", tier: "premium", notes: "raciocínio profundo", released: "2025-03" },
      { id: "o1", label: "o1", tier: "high", notes: "raciocínio", released: "2024-12" },
      { id: "gpt-4.1", label: "GPT-4.1", tier: "medium", released: "2025-04" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", tier: "low", released: "2025-04" },
      { id: "gpt-4", label: "GPT-4", tier: "medium", released: "2023-03" },
    ],
  },
  anthropic: {
    provider: "anthropic",
    label: "Anthropic",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    topUpUrl: "https://console.anthropic.com/settings/billing",
    allowCustomModel: true,
    // Reclassificação v0.16.0:
    //  - claude-3-opus-20240229 (legado, $15 in / $75 out) → "premium".
    //  - claude-opus-4-7 mantém "high" (output ≤ $30/1M).
    models: [
      { id: "claude-opus-4-7", label: "Claude Opus 4.7", tier: "high", notes: "atual mais novo · $5/$25", released: "2026-04" },
      { id: "claude-sonnet-4-7", label: "Claude Sonnet 4.7", tier: "medium", released: "2026-04" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", tier: "medium", released: "2026-01" },
      { id: "claude-opus-4-5", label: "Claude Opus 4.5", tier: "high", released: "2025-09" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", tier: "medium", released: "2025-09" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", tier: "low", released: "2025-10" },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", tier: "medium", released: "2024-10" },
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", tier: "low", released: "2024-10" },
      { id: "claude-3-opus-20240229", label: "Claude 3 Opus", tier: "premium", notes: "legado · $15/$75", released: "2024-02" },
    ],
  },
  gemini: {
    provider: "gemini",
    label: "Google Gemini",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    topUpUrl: "https://console.cloud.google.com/billing",
    allowCustomModel: true,
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "high", notes: "atual mais novo", released: "2025-09" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "low", released: "2025-09" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", tier: "low", released: "2025-09" },
      { id: "gemini-2.0-pro", label: "Gemini 2.0 Pro", tier: "medium", released: "2025-02" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", tier: "low", released: "2024-12" },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", tier: "low", released: "2025-02" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", tier: "medium", released: "2024-05" },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", tier: "low", released: "2024-05" },
      { id: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash-8B", tier: "low", released: "2024-10" },
    ],
  },
  openrouter: {
    provider: "openrouter",
    label: "OpenRouter",
    apiKeyUrl: "https://openrouter.ai/keys",
    topUpUrl: "https://openrouter.ai/credits",
    allowCustomModel: true,
    // Catálogo expandido v0.16.0 — 118 modelos cobrindo OpenAI/Anthropic/Google/
    // DeepSeek/Qwen/Meta/Mistral/Cohere/xAI/Microsoft/Nous + outros via OpenRouter.
    // Modelos `:free` mantêm tier="low" + notes contendo "free".
    // IDs com `notes: "estimado"` foram inferidos de roadmap público — validar
    // antes de produção via `curl https://openrouter.ai/api/v1/models | jq`.
    models: [
      // FREE (tier="low" + nota "free")
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)", tier: "low", notes: "free", released: "2024-12" },
      { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash Exp (free)", tier: "low", notes: "free", released: "2024-12" },
      { id: "deepseek/deepseek-chat-v3:free", label: "DeepSeek V3 (free)", tier: "low", notes: "free", released: "2024-12" },
      { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1 (free)", tier: "low", notes: "free raciocínio", released: "2025-01" },
      { id: "deepseek/deepseek-r1-0528:free", label: "DeepSeek R1 0528 (free)", tier: "low", notes: "free", released: "2025-05" },
      { id: "qwen/qwen-2.5-7b-instruct:free", label: "Qwen 2.5 7B (free)", tier: "low", notes: "free", released: "2024-09" },
      { id: "qwen/qwq-32b:free", label: "Qwen QwQ 32B (free)", tier: "low", notes: "free raciocínio", released: "2025-03" },
      { id: "qwen/qwen3-235b-a22b:free", label: "Qwen3 235B (free)", tier: "low", notes: "free", released: "2025-04" },
      { id: "mistralai/mistral-7b-instruct:free", label: "Mistral 7B (free)", tier: "low", notes: "free", released: "2023-09" },
      { id: "mistralai/mistral-small-3.2-24b:free", label: "Mistral Small 3.2 (free)", tier: "low", notes: "free estimado", released: "2025-06" },
      { id: "meta-llama/llama-3.2-3b-instruct:free", label: "Llama 3.2 3B (free)", tier: "low", notes: "free", released: "2024-09" },
      { id: "meta-llama/llama-4-maverick:free", label: "Llama 4 Maverick (free)", tier: "low", notes: "free", released: "2025-04" },
      { id: "microsoft/phi-3-mini-128k-instruct:free", label: "Phi-3 Mini (free)", tier: "low", notes: "free", released: "2024-04" },
      { id: "microsoft/phi-4:free", label: "Phi-4 (free)", tier: "low", notes: "free estimado", released: "2025-01" },
      { id: "nousresearch/hermes-3-llama-3.1-405b:free", label: "Hermes 3 405B (free)", tier: "low", notes: "free estimado", released: "2024-08" },
      { id: "google/gemma-3-27b-it:free", label: "Gemma 3 27B (free)", tier: "low", notes: "free", released: "2025-03" },
      // OPENAI
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini", tier: "low", released: "2024-07" },
      { id: "openai/gpt-5-mini", label: "GPT-5 mini", tier: "low", released: "2025-08" },
      { id: "openai/gpt-5.4-mini", label: "GPT-5.4 mini", tier: "low", notes: "estimado", released: "2026-02" },
      { id: "openai/gpt-5.5-mini", label: "GPT-5.5 mini", tier: "low", notes: "estimado", released: "2026-04" },
      { id: "openai/gpt-4o", label: "GPT-4o", tier: "medium", released: "2024-05" },
      { id: "openai/gpt-4.1", label: "GPT-4.1", tier: "medium", released: "2025-04" },
      { id: "openai/gpt-5", label: "GPT-5", tier: "medium", released: "2025-08" },
      { id: "openai/gpt-5.4", label: "GPT-5.4", tier: "high", notes: "$2.5/$15", released: "2026-02" },
      { id: "openai/gpt-5.5", label: "GPT-5.5", tier: "high", notes: "$5/$30", released: "2026-04" },
      { id: "openai/o1", label: "o1", tier: "high", notes: "raciocínio", released: "2024-12" },
      { id: "openai/o3", label: "o3", tier: "high", notes: "raciocínio", released: "2025-04" },
      { id: "openai/o3-mini", label: "o3-mini", tier: "low", notes: "raciocínio", released: "2025-01" },
      { id: "openai/o4-mini", label: "o4-mini", tier: "medium", notes: "raciocínio", released: "2025-04" },
      { id: "openai/o1-pro", label: "o1-pro", tier: "premium", notes: "raciocínio", released: "2025-03" },
      { id: "openai/o3-pro", label: "o3-pro", tier: "premium", notes: "raciocínio profundo", released: "2025-06" },
      { id: "openai/gpt-5.4-pro", label: "GPT-5.4 Pro", tier: "premium", notes: "$30/$180", released: "2026-02" },
      { id: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro", tier: "premium", notes: "$30/$180", released: "2026-04" },
      // ANTHROPIC
      { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku", tier: "low", released: "2024-11" },
      { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", tier: "medium", notes: "estimado", released: "2025-10" },
      { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", tier: "medium", released: "2024-10" },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", tier: "medium", released: "2025-09" },
      { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", tier: "medium", notes: "$3/$15", released: "2025-12" },
      { id: "anthropic/claude-sonnet-4.7", label: "Claude Sonnet 4.7", tier: "medium", notes: "estimado", released: "2026-03" },
      { id: "anthropic/claude-opus-4.5", label: "Claude Opus 4.5", tier: "high", released: "2025-08" },
      { id: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7", tier: "high", notes: "$5/$25", released: "2026-03" },
      // GOOGLE
      { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", tier: "low", released: "2025-02" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "low", released: "2025-06" },
      { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", tier: "low", released: "2025-06" },
      { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)", tier: "medium", notes: "$2/$12", released: "2026-04" },
      { id: "google/gemini-2.0-pro", label: "Gemini 2.0 Pro", tier: "medium", released: "2025-02" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "medium", released: "2025-05" },
      { id: "google/gemma-3-27b-it", label: "Gemma 3 27B", tier: "low", released: "2025-03" },
      // DEEPSEEK
      { id: "deepseek/deepseek-chat", label: "DeepSeek V2 Chat", tier: "low", released: "2024-05" },
      { id: "deepseek/deepseek-chat-v3", label: "DeepSeek V3", tier: "low", notes: "$0.27/$1.10", released: "2024-12" },
      { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1", tier: "low", notes: "estimado", released: "2025-08" },
      { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", tier: "low", notes: "$0.14/$0.28", released: "2026-04" },
      { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro", tier: "low", notes: "$0.43/$0.87", released: "2026-04" },
      { id: "deepseek/deepseek-r1", label: "DeepSeek R1", tier: "low", notes: "raciocínio", released: "2025-01" },
      { id: "deepseek/deepseek-r1-0528", label: "DeepSeek R1 0528", tier: "low", notes: "raciocínio", released: "2025-05" },
      { id: "deepseek/deepseek-coder-v2", label: "DeepSeek Coder V2", tier: "low", notes: "código", released: "2024-07" },
      // QWEN
      { id: "qwen/qwen-2.5-7b-instruct", label: "Qwen 2.5 7B", tier: "low", released: "2024-09" },
      { id: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B", tier: "low", released: "2024-09" },
      { id: "qwen/qwen-2.5-coder-32b-instruct", label: "Qwen 2.5 Coder 32B", tier: "low", notes: "código", released: "2024-11" },
      { id: "qwen/qwq-32b", label: "Qwen QwQ 32B", tier: "low", notes: "raciocínio", released: "2025-03" },
      { id: "qwen/qwen3-32b", label: "Qwen3 32B", tier: "low", released: "2025-04" },
      { id: "qwen/qwen3-235b-a22b", label: "Qwen3 235B A22B", tier: "low", released: "2025-04" },
      { id: "qwen/qwen3.5-9b", label: "Qwen 3.5 9B", tier: "low", released: "2025-08" },
      { id: "qwen/qwen3.5-27b", label: "Qwen 3.5 27B", tier: "low", released: "2025-08" },
      { id: "qwen/qwen3.5-35b-a3b", label: "Qwen 3.5 35B A3B", tier: "low", released: "2025-08" },
      { id: "qwen/qwen3.5-122b-a10b", label: "Qwen 3.5 122B A10B", tier: "low", released: "2025-08" },
      { id: "qwen/qwen3.5-397b-a17b", label: "Qwen 3.5 397B A17B", tier: "low", released: "2025-12" },
      { id: "qwen/qwen3.5-flash-02-23", label: "Qwen 3.5 Flash", tier: "low", released: "2026-02" },
      { id: "qwen/qwen3.5-plus-02-15", label: "Qwen 3.5 Plus", tier: "low", released: "2026-02" },
      { id: "qwen/qwen3.5-plus-20260420", label: "Qwen 3.5 Plus 0420", tier: "low", released: "2026-04" },
      { id: "qwen/qwen3.6-27b", label: "Qwen 3.6 27B", tier: "low", released: "2026-04" },
      { id: "qwen/qwen3.6-35b-a3b", label: "Qwen 3.6 35B A3B", tier: "low", released: "2026-04" },
      { id: "qwen/qwen3.6-flash", label: "Qwen 3.6 Flash", tier: "low", released: "2026-04" },
      { id: "qwen/qwen3.6-plus", label: "Qwen 3.6 Plus", tier: "low", released: "2026-04" },
      { id: "qwen/qwen3.6-max-preview", label: "Qwen 3.6 Max", tier: "low", released: "2026-04" },
      // META
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", tier: "low", released: "2024-12" },
      { id: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B", tier: "low", released: "2024-07" },
      { id: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B", tier: "low", released: "2024-07" },
      { id: "meta-llama/llama-3.1-405b-instruct", label: "Llama 3.1 405B", tier: "high", released: "2024-07" },
      { id: "meta-llama/llama-4-scout", label: "Llama 4 Scout", tier: "low", notes: "estimado", released: "2025-04" },
      { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", tier: "low", notes: "estimado", released: "2025-04" },
      // MISTRAL
      { id: "mistralai/mistral-small-2409", label: "Mistral Small 2409", tier: "low", released: "2024-09" },
      { id: "mistralai/mistral-small-2603", label: "Mistral Small 2603", tier: "low", released: "2026-03" },
      { id: "mistralai/mistral-large-2411", label: "Mistral Large 2411", tier: "medium", released: "2024-11" },
      { id: "mistralai/codestral-2501", label: "Codestral 2501", tier: "low", notes: "código", released: "2025-01" },
      { id: "mistralai/pixtral-large-2411", label: "Pixtral Large", tier: "medium", notes: "vision", released: "2024-11" },
      { id: "mistralai/ministral-8b", label: "Ministral 8B", tier: "low", released: "2024-10" },
      { id: "mistralai/magistral-medium-2506", label: "Magistral Medium", tier: "medium", notes: "raciocínio est.", released: "2025-06" },
      // COHERE
      { id: "cohere/command-r-plus", label: "Command R+", tier: "medium", released: "2024-04" },
      { id: "cohere/command-r-plus-08-2024", label: "Command R+ 08-24", tier: "medium", released: "2024-08" },
      { id: "cohere/command-r", label: "Command R", tier: "low", released: "2024-03" },
      { id: "cohere/command-r-08-2024", label: "Command R 08-24", tier: "low", released: "2024-08" },
      { id: "cohere/command-r7b-12-2024", label: "Command R7B", tier: "low", released: "2024-12" },
      { id: "cohere/command-a-03-2025", label: "Command A", tier: "medium", notes: "estimado", released: "2025-03" },
      // xAI GROK
      { id: "x-ai/grok-2-1212", label: "Grok 2", tier: "medium", released: "2024-12" },
      { id: "x-ai/grok-3", label: "Grok 3", tier: "medium", notes: "estimado", released: "2025-02" },
      { id: "x-ai/grok-3-mini", label: "Grok 3 mini", tier: "low", notes: "estimado", released: "2025-02" },
      { id: "x-ai/grok-4", label: "Grok 4", tier: "medium", notes: "estimado", released: "2025-07" },
      { id: "x-ai/grok-4.20", label: "Grok 4.20", tier: "low", notes: "$1.25/$2.5", released: "2026-03" },
      { id: "x-ai/grok-4.20-multi-agent", label: "Grok 4.20 Multi-Agent", tier: "medium", notes: "$2/$6", released: "2026-03" },
      { id: "x-ai/grok-4.3", label: "Grok 4.3", tier: "low", notes: "$1.25/$2.5", released: "2026-04" },
      // MICROSOFT
      { id: "microsoft/phi-3.5-mini-128k-instruct", label: "Phi-3.5 Mini", tier: "low", released: "2024-08" },
      { id: "microsoft/phi-4", label: "Phi-4", tier: "low", released: "2024-12" },
      { id: "microsoft/phi-4-multimodal", label: "Phi-4 Multimodal", tier: "low", notes: "vision est.", released: "2025-02" },
      { id: "microsoft/wizardlm-2-8x22b", label: "WizardLM 2 8x22B", tier: "low", released: "2024-04" },
      // NOUS / OUTROS
      { id: "nousresearch/hermes-3-llama-3.1-70b", label: "Hermes 3 70B", tier: "low", notes: "estimado", released: "2024-08" },
      { id: "nousresearch/hermes-3-llama-3.1-405b", label: "Hermes 3 405B", tier: "medium", notes: "estimado", released: "2024-08" },
      { id: "nousresearch/deephermes-3-llama-3-8b-preview", label: "DeepHermes 3 8B", tier: "low", notes: "estimado", released: "2025-02" },
      { id: "gryphe/mythomax-l2-13b", label: "MythoMax L2 13B", tier: "low", notes: "RP", released: "2023-08" },
      { id: "alpindale/goliath-120b", label: "Goliath 120B", tier: "medium", notes: "estimado", released: "2023-11" },
      { id: "upstage/solar-pro", label: "Solar Pro", tier: "low", notes: "estimado", released: "2024-09" },
      { id: "01-ai/yi-large", label: "Yi Large", tier: "medium", notes: "estimado", released: "2024-05" },
      { id: "01-ai/yi-lightning", label: "Yi Lightning", tier: "low", notes: "estimado", released: "2024-10" },
      { id: "liquid/lfm-40b", label: "Liquid LFM 40B", tier: "low", released: "2024-10" },
      { id: "liquid/lfm-2-24b-a2b", label: "Liquid LFM 2 24B", tier: "low", notes: "$0.03/$0.12", released: "2026-03" },
      { id: "reka/reka-flash-3", label: "Reka Flash 3", tier: "low", notes: "estimado", released: "2025-03" },
      { id: "reka/reka-core", label: "Reka Core", tier: "medium", notes: "estimado", released: "2024-04" },
      { id: "perplexity/sonar", label: "Sonar", tier: "low", notes: "search", released: "2025-01" },
      { id: "perplexity/sonar-pro", label: "Sonar Pro", tier: "medium", notes: "search", released: "2025-01" },
      { id: "perplexity/sonar-reasoning", label: "Sonar Reasoning", tier: "low", notes: "search+R1", released: "2025-02" },
      { id: "perplexity/sonar-reasoning-pro", label: "Sonar Reasoning Pro", tier: "medium", notes: "search+R1", released: "2025-02" },
      { id: "perplexity/sonar-deep-research", label: "Sonar Deep Research", tier: "medium", notes: "deep", released: "2025-02" },
      { id: "inflection/inflection-3-pi", label: "Inflection 3 Pi", tier: "medium", notes: "estimado", released: "2024-10" },
      { id: "inflection/inflection-3-productivity", label: "Inflection 3 Prod", tier: "medium", notes: "estimado", released: "2024-10" },
      { id: "liuhaotian/llava-yi-34b", label: "LLaVA Yi 34B", tier: "low", notes: "vision est.", released: "2024-01" },
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
