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

describe("composeSystemPrompt", () => {
  it("usa apenas IDENTITY_BASE com tudo vazio + KB off", () => {
    const cfg: NexPromptConfig = {
      personality: "",
      tone: "",
      guardrails: [],
      advancedOverride: null,
      audioInputEnabled: false,
      kbEnabled: false,
    };
    expect(composeSystemPrompt(cfg, [])).toBe(IDENTITY_BASE);
  });

  it("compõe personality + tone + guardrails", () => {
    const out = composeSystemPrompt(
      {
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
});

describe("getNexPromptConfig", () => {
  it("retorna shape do row existente", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
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
      personality: "p",
      tone: "t",
      guardrails: ["g"],
      advancedOverride: null,
      audioInputEnabled: false,
      kbEnabled: true,
    });
  });

  it("retorna defaults quando não há row", async () => {
    q.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    const cfg = await getNexPromptConfig();
    expect(cfg).toEqual({
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
