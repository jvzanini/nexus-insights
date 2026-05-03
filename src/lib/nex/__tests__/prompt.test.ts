jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));
jest.mock("../ensure-tables", () => ({
  ensureNexTables: jest.fn(async () => {}),
}));

import { pgPool } from "@/lib/pg-pool";
import {
  getNexPromptConfig,
  saveNexPromptConfig,
  composeSystemPrompt,
  type NexPromptConfig,
  MAX_PROMPT_LEN,
  MAX_KB_TOTAL_CHARS,
  IDENTITY_BASE,
} from "../prompt";

const q = pgPool.query as jest.MockedFunction<typeof pgPool.query>;
beforeEach(() => q.mockReset());

describe("IDENTITY_BASE", () => {
  it("menciona Nexus Insights como plataforma", () => {
    expect(IDENTITY_BASE).toContain("Nexus Insights");
  });

  it("menciona Nexus Chat como origem dos dados", () => {
    expect(IDENTITY_BASE).toContain("Nexus Chat");
  });

  it("NÃO usa ChatGPT/GPT/Claude/Gemini como identidade", () => {
    // não pode aparecer como auto-identificação. Texto canônico cita esses
    // nomes apenas dentro da regra de blindagem — então procuramos pela
    // instrução de não-mencionar (regex flexível).
    expect(IDENTITY_BASE).toMatch(/Não mencione.*"ChatGPT"/i);
    expect(IDENTITY_BASE).toContain("ChatGPT");
    expect(IDENTITY_BASE).toContain("GPT");
    expect(IDENTITY_BASE).toContain("Claude");
    expect(IDENTITY_BASE).toContain("Gemini");
    expect(IDENTITY_BASE).toContain("OpenAI");
    expect(IDENTITY_BASE).toContain("Anthropic");
    expect(IDENTITY_BASE).toContain("Google");
  });

  it("orienta uso do mapeamento de URL pública para deep-links", () => {
    expect(IDENTITY_BASE.toLowerCase()).toContain("deep-link");
    expect(IDENTITY_BASE.toLowerCase()).toContain("url pública");
  });

  it("é enxuta (anti-prolixidade)", () => {
    expect(IDENTITY_BASE.length).toBeLessThan(1500);
  });

  it("menciona 'dashboard summary' apenas como jargão proibido (não como instrução de uso)", () => {
    // O texto pode citar "dashboard summary" dentro da regra anti-jargão,
    // mas NÃO pode instruir o agente a usar/citar esse termo.
    expect(IDENTITY_BASE.toLowerCase()).toMatch(
      /sem citar nomes técnicos internos[^.]*"dashboard summary"/i,
    );
  });
});

describe("composeSystemPrompt", () => {
  it("usa apenas IDENTITY_BASE com tudo vazio + KB off + sem accountUrls", () => {
    const cfg: NexPromptConfig = {
      identityBase: null,
      personality: "",
      tone: "",
      guardrails: [],
      advancedOverride: null,
      audioInputEnabled: false,
      kbEnabled: false,
    };
    expect(composeSystemPrompt(cfg, [])).toBe(IDENTITY_BASE);
    expect(composeSystemPrompt(cfg, [], [])).toBe(IDENTITY_BASE);
  });

  it("compõe personality + tone + guardrails", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "amigável",
        tone: "informal",
        guardrails: ["não fale finanças", "não invente"],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
      },
      [],
    );
    expect(out).toContain(IDENTITY_BASE);
    expect(out).toContain("Personalidade: amigável");
    expect(out).toContain("Tom: informal");
    expect(out).toContain("- não fale finanças");
    expect(out).toContain("- não invente");
  });

  it("advancedOverride substitui tudo (mesmo se KB on)", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "x",
        tone: "y",
        guardrails: ["z"],
        advancedOverride: "PROMPT CRU",
        audioInputEnabled: false,
        kbEnabled: true,
      },
      [{ name: "doc", extractedText: "conteudo" }],
    );
    expect(out).toBe("PROMPT CRU");
  });

  it("KB desabilitada não injeta", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
      },
      [{ name: "doc", extractedText: "importante" }],
    );
    expect(out).not.toContain("importante");
  });

  it("KB habilitada injeta com header", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: true,
      },
      [
        { name: "manual.pdf", extractedText: "passo 1" },
        { name: "faq.txt", extractedText: "Q: oi" },
      ],
    );
    expect(out).toContain("[BASE DE CONHECIMENTO]");
    expect(out).toContain("=== manual.pdf ===");
    expect(out).toContain("passo 1");
    expect(out).toContain("=== faq.txt ===");
  });

  it("KB cap MAX_KB_TOTAL_CHARS trunca último doc", () => {
    const big = "x".repeat(MAX_KB_TOTAL_CHARS);
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: true,
      },
      [
        { name: "a", extractedText: big },
        { name: "b", extractedText: "depois" },
      ],
    );
    expect(out).not.toContain("depois");
    expect(out).toContain("[...truncado...]");
  });

  it("injeta seção '## URLs públicas das contas' quando accountUrls > 0", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
      },
      [],
      [{ accountId: 1, publicUrl: "https://chat.matrix.com.br" }],
    );
    expect(out).toContain("## URLs públicas das contas");
    expect(out).toContain("- Conta 1 (sem rótulo): https://chat.matrix.com.br");
  });

  it("usa label quando fornecido no accountUrl", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
      },
      [],
      [
        { accountId: 1, publicUrl: "https://chat.a.com", label: "Matriz" },
        { accountId: 2, publicUrl: "https://chat.b.com", label: null },
      ],
    );
    expect(out).toContain("- Conta 1 (Matriz): https://chat.a.com");
    expect(out).toContain("- Conta 2 (sem rótulo): https://chat.b.com");
  });

  it("override ativo NÃO injeta accountUrls", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: "PROMPT CRU",
        audioInputEnabled: false,
        kbEnabled: false,
      },
      [],
      [{ accountId: 1, publicUrl: "https://chat.matrix.com.br" }],
    );
    expect(out).toBe("PROMPT CRU");
    expect(out).not.toContain("URLs públicas");
  });

  it("accountUrls vazio NÃO injeta seção", () => {
    const out = composeSystemPrompt(
      {
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: false,
      },
      [],
      [],
    );
    expect(out).not.toContain("URLs públicas");
  });
});

describe("getNexPromptConfig", () => {
  it("retorna shape do row existente", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
          identity_base: null,
          personality: "p",
          tone: "t",
          guardrails: ["g"],
          advanced_override: null,
          audio_input_enabled: false,
          kb_enabled: true,
        },
      ],
      rowCount: 1,
    } as never);
    const cfg = await getNexPromptConfig();
    expect(cfg).toMatchObject({
      identityBase: null,
      personality: "p",
      tone: "t",
      guardrails: ["g"],
      advancedOverride: null,
      audioInputEnabled: false,
      kbEnabled: true,
    });
  });

  it("retorna identityBase quando setado no row (v0.28)", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
          identity_base: "Você é um assistente customizado.",
          personality: "",
          tone: "",
          guardrails: [],
          advanced_override: null,
          audio_input_enabled: false,
          kb_enabled: true,
        },
      ],
      rowCount: 1,
    } as never);
    const cfg = await getNexPromptConfig();
    expect(cfg.identityBase).toBe("Você é um assistente customizado.");
  });

  it("retorna defaults quando não há row", async () => {
    q.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    const cfg = await getNexPromptConfig();
    expect(cfg).toEqual({
      identityBase: null,
      personality: "",
      tone: "",
      guardrails: [],
      advancedOverride: null,
      audioInputEnabled: false,
      kbEnabled: true,
    });
  });
});

describe("saveNexPromptConfig", () => {
  it("rejeita personality > 500", async () => {
    await expect(
      saveNexPromptConfig({
        identityBase: null,
        personality: "x".repeat(501),
        tone: "",
        guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: true,
      }),
    ).rejects.toThrow(/500/);
  });

  it("rejeita > 20 guardrails", async () => {
    await expect(
      saveNexPromptConfig({
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: Array(21).fill("x"),
        advancedOverride: null,
        audioInputEnabled: false,
        kbEnabled: true,
      }),
    ).rejects.toThrow(/20/);
  });

  it("rejeita override > MAX_PROMPT_LEN", async () => {
    await expect(
      saveNexPromptConfig({
        identityBase: null,
        personality: "",
        tone: "",
        guardrails: [],
        advancedOverride: "x".repeat(MAX_PROMPT_LEN + 1),
        audioInputEnabled: false,
        kbEnabled: true,
      }),
    ).rejects.toThrow();
  });

  it("UPSERT singleton", async () => {
    q.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    await saveNexPromptConfig({
      identityBase: null,
      personality: "ok",
      tone: "ok",
      guardrails: ["uma"],
      advancedOverride: null,
      audioInputEnabled: true,
      kbEnabled: false,
    });
    const sql = String(q.mock.calls[0][0]);
    expect(sql).toContain("INSERT INTO nex_settings");
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
  });
});
