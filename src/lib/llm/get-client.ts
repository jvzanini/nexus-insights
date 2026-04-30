import "server-only";

import { getActiveLlmConfig } from "./get-active-config";
import { AnthropicClient } from "./providers/anthropic";
import { GeminiClient } from "./providers/gemini";
import { OpenAIClient } from "./providers/openai";
import { OpenRouterClient } from "./providers/openrouter";
import type { LlmProvider, ProviderClient } from "./types";

export function buildLlmClient(
  provider: LlmProvider,
  apiKey: string,
  model: string,
): ProviderClient {
  switch (provider) {
    case "openai":
      return new OpenAIClient(apiKey, model);
    case "anthropic":
      return new AnthropicClient(apiKey, model);
    case "gemini":
      return new GeminiClient(apiKey, model);
    case "openrouter":
      return new OpenRouterClient(apiKey, model);
  }
}

export async function getActiveLlmClient(): Promise<ProviderClient | null> {
  const cfg = await getActiveLlmConfig();
  if (!cfg) return null;
  return buildLlmClient(cfg.provider, cfg.apiKey, cfg.model);
}
