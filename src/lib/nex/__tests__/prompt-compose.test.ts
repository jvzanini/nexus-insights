import { IDENTITY_BASE, composeSystemPrompt } from "../prompt-compose";

describe("IDENTITY_BASE — anti-Chatwoot e concisão (v0.26)", () => {
  it("não menciona 'Chatwoot' como referência casual (apenas dentro da regra anti-Chatwoot)", () => {
    // Plan v0.26 exige tanto a remoção de "Nexus Chat / Chatwoot" do header
    // quanto a inclusão literal da regra "Nunca use 'Chatwoot'". Logo, o
    // único lugar onde a palavra pode aparecer é dentro dessa regra.
    const matches = IDENTITY_BASE.match(/Chatwoot/g) ?? [];
    expect(matches.length).toBe(1);
    expect(IDENTITY_BASE).toMatch(/Nexus Chat/);
    expect(IDENTITY_BASE).not.toMatch(/Nexus Chat \/ Chatwoot/);
  });

  it("inclui regra explícita anti-Chatwoot", () => {
    expect(IDENTITY_BASE).toMatch(/Nunca use 'Chatwoot'/);
  });

  it("limita resposta a 3 frases por padrão", () => {
    expect(IDENTITY_BASE).toMatch(/Máximo 3 frases por resposta/i);
  });
});

describe("composeSystemPrompt — accountUrls (v0.26)", () => {
  it("seção de accountUrls usa 'Nexus Chat' (não 'Chatwoot')", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
        terminology: {},
        suggestionsEnabled: false,
      },
      [],
      [{ accountId: 9, publicUrl: "https://chat.example.com", label: "Matrix" }],
    );
    expect(out).toMatch(/Mapeamento das contas Nexus Chat/);
    expect(out).not.toMatch(/Mapeamento das contas Chatwoot/);
  });
});

describe("composeSystemPrompt — identityBase override (v0.28)", () => {
  it("usa cfg.identityBase quando setado (não hardcoded)", () => {
    const out = composeSystemPrompt(
      {
        identityBase: "Você é um agente custom.",
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
        terminology: {},
        suggestionsEnabled: false,
      },
      [],
      [],
    );
    expect(out).toMatch(/Você é um agente custom\./);
    expect(out).not.toMatch(/Você é o Agente Nex —/);
  });

  it("usa IDENTITY_BASE default quando identityBase é null", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
        terminology: {},
        suggestionsEnabled: false,
      },
      [],
      [],
    );
    expect(out).toMatch(/Você é o Agente Nex —/);
  });

  it("advancedOverride precede identityBase (modo manual)", () => {
    const out = composeSystemPrompt(
      {
        identityBase: "custom base",
        personality: "p",
        tone: "t",
        guardrails: ["g"],
        advancedOverride: "RAW PROMPT",
        audioInputEnabled: false,
        kbEnabled: false,
        terminology: {},
        suggestionsEnabled: false,
      },
      [],
      [],
    );
    expect(out).toBe("RAW PROMPT");
    expect(out).not.toMatch(/custom base/);
    expect(out).not.toMatch(/Você é o Agente Nex —/);
  });
});

describe("composeSystemPrompt — terminology (v0.31)", () => {
  it("injeta seção '## Terminologia' quando cfg.terminology não-vazio", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
        terminology: { estados: "inboxes", "minha equipe": "agentes" },
        suggestionsEnabled: false,
      },
      [],
      [],
    );
    expect(out).toMatch(/## Terminologia/);
    expect(out).toMatch(/"estados".*→.*inboxes/);
    expect(out).toMatch(/"minha equipe".*→.*agentes/);
  });

  it("NÃO injeta seção quando terminology está vazio", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
        terminology: {},
        suggestionsEnabled: false,
      },
      [],
      [],
    );
    expect(out).not.toMatch(/## Terminologia/);
  });
});

describe("composeSystemPrompt — suggestions_enabled (v0.31)", () => {
  it("injeta instrução [[suggestions]] quando suggestionsEnabled=true", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
        terminology: {},
        suggestionsEnabled: true,
      },
      [],
      [],
    );
    expect(out).toMatch(/## Sugestões clicáveis/);
    expect(out).toMatch(/\[\[suggestions\]\]:/);
    expect(out).toMatch(/máximo 4 sugestões/i);
  });

  it("NÃO injeta instrução quando suggestionsEnabled=false", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
        terminology: {},
        suggestionsEnabled: false,
      },
      [],
      [],
    );
    expect(out).not.toMatch(/## Sugestões clicáveis/);
  });
});
