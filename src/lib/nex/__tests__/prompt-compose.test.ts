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
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
      },
      [],
      [{ accountId: 9, publicUrl: "https://chat.example.com", label: "Matrix" }],
    );
    expect(out).toMatch(/Mapeamento das contas Nexus Chat/);
    expect(out).not.toMatch(/Mapeamento das contas Chatwoot/);
  });
});
