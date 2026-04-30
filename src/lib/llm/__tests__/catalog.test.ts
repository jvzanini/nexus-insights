import { PROVIDER_CATALOG, type CostTier } from "../catalog";
import type { LlmProvider } from "../types";

describe("PROVIDER_CATALOG", () => {
  const providers: LlmProvider[] = [
    "openai",
    "anthropic",
    "gemini",
    "openrouter",
  ];

  it.each(providers)(
    "%s tem catálogo válido (label, apiKeyUrl https, models > 2)",
    (provider) => {
      const c = PROVIDER_CATALOG[provider];
      expect(c.provider).toBe(provider);
      expect(c.label).toBeTruthy();
      expect(c.apiKeyUrl).toMatch(/^https:\/\//);
      expect(c.allowCustomModel).toBe(true);
      expect(c.models.length).toBeGreaterThan(2);
    },
  );

  it.each(providers)(
    "%s todos os modelos têm id, label e tier válido",
    (provider) => {
      const validTiers: CostTier[] = ["free", "low", "medium", "high"];
      const c = PROVIDER_CATALOG[provider];
      for (const m of c.models) {
        expect(typeof m.id).toBe("string");
        expect(m.id.length).toBeGreaterThan(0);
        expect(typeof m.label).toBe("string");
        expect(m.label.length).toBeGreaterThan(0);
        expect(validTiers).toContain(m.tier);
      }
    },
  );

  it("não inclui pseudo-opção '__custom__' / 'Outro' no catálogo (adicionada em runtime)", () => {
    for (const provider of [
      "openai",
      "anthropic",
      "gemini",
      "openrouter",
    ] as LlmProvider[]) {
      const ids = PROVIDER_CATALOG[provider].models.map((m) => m.id);
      expect(ids).not.toContain("__custom__");
      const labels = PROVIDER_CATALOG[provider].models.map((m) => m.label);
      expect(
        labels.some((l) => l.toLowerCase().includes("outro")),
      ).toBe(false);
    }
  });

  it("topUpUrl, quando presente, é uma URL https válida", () => {
    for (const provider of [
      "openai",
      "anthropic",
      "gemini",
      "openrouter",
    ] as LlmProvider[]) {
      const c = PROVIDER_CATALOG[provider];
      if (c.topUpUrl) {
        expect(c.topUpUrl).toMatch(/^https:\/\//);
      }
    }
  });

  it("OpenAI inclui modelos chave: gpt-4o, gpt-4o-mini, o1, o3", () => {
    const ids = PROVIDER_CATALOG.openai.models.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["gpt-4o", "gpt-4o-mini", "o1", "o3"]));
  });

  it("Anthropic inclui modelos novos (sonnet 4.5, opus 4.7)", () => {
    const ids = PROVIDER_CATALOG.anthropic.models.map((m) => m.id);
    expect(ids).toEqual(
      expect.arrayContaining(["claude-sonnet-4-5", "claude-opus-4-7"]),
    );
  });

  it("Gemini inclui família 1.5, 2.0 e 2.5", () => {
    const ids = PROVIDER_CATALOG.gemini.models.map((m) => m.id);
    expect(
      ids.some((id) => id.startsWith("gemini-1.5")),
    ).toBe(true);
    expect(
      ids.some((id) => id.startsWith("gemini-2.0")),
    ).toBe(true);
    expect(
      ids.some((id) => id.startsWith("gemini-2.5")),
    ).toBe(true);
  });

  it("OpenRouter inclui modelos free, low, medium e high", () => {
    const tiers = PROVIDER_CATALOG.openrouter.models.map((m) => m.tier);
    expect(tiers).toEqual(expect.arrayContaining(["free", "low", "medium", "high"]));
  });
});
