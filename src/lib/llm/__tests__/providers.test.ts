import { AnthropicClient } from "@/lib/llm/providers/anthropic";
import { GeminiClient } from "@/lib/llm/providers/gemini";
import { OpenAIClient } from "@/lib/llm/providers/openai";
import { OpenRouterClient } from "@/lib/llm/providers/openrouter";
import { buildLlmClient } from "@/lib/llm/get-client";
import type { ChatRequest, ProviderClient } from "@/lib/llm/types";

const sampleRequest: ChatRequest = {
  messages: [{ role: "user", content: "Hello" }],
};

describe("ProviderClient adapters (modo mock)", () => {
  const cases: Array<{
    name: string;
    instance: ProviderClient;
    snippet: string;
  }> = [
    {
      name: "OpenAI",
      instance: new OpenAIClient("", "gpt-4o-mini"),
      snippet: "MOCK OpenAI",
    },
    {
      name: "Anthropic",
      instance: new AnthropicClient("", "claude-3-5-sonnet-20241022"),
      snippet: "MOCK Anthropic",
    },
    {
      name: "Gemini",
      instance: new GeminiClient("", "gemini-1.5-flash"),
      snippet: "MOCK Gemini",
    },
    {
      name: "OpenRouter",
      instance: new OpenRouterClient("", "openrouter/openai/gpt-4o"),
      snippet: "MOCK OpenRouter",
    },
  ];

  it.each(cases)(
    "$name retorna mensagem mock quando apiKey é vazia",
    async ({ instance, snippet }) => {
      const result = await instance.chat(sampleRequest);
      expect(result.message).toContain(snippet);
      expect(result.usage.tokensInput).toBeGreaterThan(0);
      expect(result.usage.tokensOutput).toBeGreaterThan(0);
      expect(typeof result.usage.costUsd).toBe("number");
    },
  );

  it.each(cases)(
    "$name retorna mensagem mock quando apiKey começa com MOCK",
    async ({ instance: _instance, snippet, name }) => {
      // Cria nova instância com chave MOCK explícita.
      let inst: ProviderClient;
      switch (name) {
        case "OpenAI":
          inst = new OpenAIClient("MOCK_KEY", "gpt-4o-mini");
          break;
        case "Anthropic":
          inst = new AnthropicClient("MOCK_KEY", "claude-3-5-sonnet-20241022");
          break;
        case "Gemini":
          inst = new GeminiClient("MOCK_KEY", "gemini-1.5-flash");
          break;
        default:
          inst = new OpenRouterClient(
            "MOCK_KEY",
            "openrouter/openai/gpt-4o",
          );
      }
      const result = await inst.chat(sampleRequest);
      expect(result.message).toContain(snippet);
    },
  );

  it.each(cases)("$name expõe provider e model", ({ instance }) => {
    expect(instance.provider).toBeTruthy();
    expect(instance.model).toBeTruthy();
  });
});

describe("buildLlmClient", () => {
  it("retorna OpenAIClient para provider=openai", () => {
    const c = buildLlmClient("openai", "MOCK", "gpt-4o-mini");
    expect(c).toBeInstanceOf(OpenAIClient);
    expect(c.provider).toBe("openai");
  });

  it("retorna AnthropicClient para provider=anthropic", () => {
    const c = buildLlmClient(
      "anthropic",
      "MOCK",
      "claude-3-5-sonnet-20241022",
    );
    expect(c).toBeInstanceOf(AnthropicClient);
    expect(c.provider).toBe("anthropic");
  });

  it("retorna GeminiClient para provider=gemini", () => {
    const c = buildLlmClient("gemini", "MOCK", "gemini-1.5-flash");
    expect(c).toBeInstanceOf(GeminiClient);
    expect(c.provider).toBe("gemini");
  });

  it("retorna OpenRouterClient para provider=openrouter", () => {
    const c = buildLlmClient(
      "openrouter",
      "MOCK",
      "openrouter/openai/gpt-4o",
    );
    expect(c).toBeInstanceOf(OpenRouterClient);
    expect(c.provider).toBe("openrouter");
  });
});
