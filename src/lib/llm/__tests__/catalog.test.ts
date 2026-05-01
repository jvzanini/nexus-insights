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
    "%s todos os modelos têm id, label e tier válido (low|medium|high|premium)",
    (provider) => {
      const validTiers: CostTier[] = ["low", "medium", "high", "premium"];
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

  it("OpenAI inclui modelos chave reais (validados May/2026): gpt-5, gpt-5-mini, gpt-4.1, o3", () => {
    // Catálogo limpo em v0.13.5 — IDs verificados em
    // https://developers.openai.com/api/docs/models/all (cutoff May/2026).
    // Removidos os inventados (gpt-5.1-mini, gpt-4.1-nano, o4-mini, etc).
    const ids = PROVIDER_CATALOG.openai.models.map((m) => m.id);
    expect(ids).toEqual(
      expect.arrayContaining(["gpt-5", "gpt-5-mini", "gpt-4.1", "o3"]),
    );
    // Garante que IDs inventados (causavam 404 da OpenAI) NÃO estão no catálogo.
    expect(ids).not.toContain("gpt-5.1-mini");
    expect(ids).not.toContain("gpt-4.1-nano");
    expect(ids).not.toContain("o4-mini");
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

  it("OpenRouter inclui modelos low, medium e high (faixa expandida)", () => {
    const tiers = PROVIDER_CATALOG.openrouter.models.map((m) => m.tier);
    expect(tiers).toEqual(expect.arrayContaining(["low", "medium", "high"]));
  });

  it("OpenRouter foi expandido para >= 100 modelos (catálogo v0.16.0)", () => {
    expect(PROVIDER_CATALOG.openrouter.models.length).toBeGreaterThanOrEqual(
      100,
    );
  });

  it("OpenRouter modelos `:free` mantêm tier='low' + notes contendo 'free'", () => {
    const freeIds = PROVIDER_CATALOG.openrouter.models.filter((m) =>
      m.id.endsWith(":free"),
    );
    expect(freeIds.length).toBeGreaterThan(0);
    for (const m of freeIds) {
      expect(m.tier).toBe("low");
      expect(m.notes ?? "").toMatch(/free/i);
    }
  });

  it("OpenAI: gpt-5.5-pro, gpt-5.4-pro, o1-pro, o3-pro são tier='premium'", () => {
    const premiumIds = ["gpt-5.5-pro", "gpt-5.4-pro", "o1-pro", "o3-pro"];
    for (const id of premiumIds) {
      const m = PROVIDER_CATALOG.openai.models.find((x) => x.id === id);
      expect(m).toBeDefined();
      expect(m?.tier).toBe("premium");
    }
  });

  it("OpenAI: gpt-5.5 e gpt-5.4 permanecem tier='high'", () => {
    const highIds = ["gpt-5.5", "gpt-5.4"];
    for (const id of highIds) {
      const m = PROVIDER_CATALOG.openai.models.find((x) => x.id === id);
      expect(m).toBeDefined();
      expect(m?.tier).toBe("high");
    }
  });

  it("Anthropic: claude-3-opus-20240229 é tier='premium' (legado caro)", () => {
    const m = PROVIDER_CATALOG.anthropic.models.find(
      (x) => x.id === "claude-3-opus-20240229",
    );
    expect(m).toBeDefined();
    expect(m?.tier).toBe("premium");
  });

  it("Anthropic: claude-opus-4-7 mantém tier='high' (output ≤ $30)", () => {
    const m = PROVIDER_CATALOG.anthropic.models.find(
      (x) => x.id === "claude-opus-4-7",
    );
    expect(m).toBeDefined();
    expect(m?.tier).toBe("high");
  });

  it("OpenRouter inclui claude-haiku-4.5 com tier 'low' ou 'medium'", () => {
    const m = PROVIDER_CATALOG.openrouter.models.find(
      (x) => x.id === "anthropic/claude-haiku-4.5",
    );
    expect(m).toBeDefined();
    expect(["low", "medium"]).toContain(m?.tier);
  });
});
