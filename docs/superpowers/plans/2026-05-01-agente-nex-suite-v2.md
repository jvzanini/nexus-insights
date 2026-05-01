# Plano — Suite Agente Nex (v0.15.0) — VERSÃO 2

> **Status:** v2 — após pente fino #1 (25 achados aplicados). Sujeito a pente fino #2 mais profundo → v3 final.
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.
> **REGRA:** todas as tasks de UI (T9, T11–T15, T17–T26) **DEVEM** invocar `ui-ux-pro-max:ui-ux-pro-max` antes de Edit.

**Goal:** Implementar a Suite Agente Nex conforme spec v3 final.

**Architecture:** Sidebar `/agente-nex` (4 sub-páginas), system prompt dinâmico via `nex_settings`, KB via `nex_kb_documents`, áudio via Whisper Route Handler, playground inline.

**Tech Stack:** Next.js 16, Postgres (raw SQL via `pgPool`), MediaRecorder, HTML5 Audio, Whisper API, `pdf-parse`, Jest+RTL.

**Spec referência:** `docs/superpowers/specs/2026-05-01-agente-nex-suite-design.md` (v3 final).

**Convenções:**
- TDD onde aplicável: red → green → commit.
- UI/UX Pro Max em UI tasks.
- Cada task fecha em commit próprio. Mensagens em Conventional Commits (`feat(escopo): descrição (T<n>)`).
- Antes de cada commit: `npm run typecheck` + tests da área tocada.
- Antes de PUSH: `npm test` completo + `npm run build`.
- Path alias: `@/...`.
- safeAction wrapper em todas as Server Actions.

**Dependências de tasks:** declaradas no header de cada task.

---

## Task 1 — Schema `nex_settings` + `nex_kb_documents` + ensureNexTables

**Dependências:** nenhuma.
**Estimativa:** 15–20 min.
**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/nex/ensure-tables.ts`
- Create: `src/lib/nex/__tests__/ensure-tables.test.ts`

- [ ] **Step 1: Atualizar `prisma/schema.prisma`**

Adicionar após o bloco `model LlmUsage`:

```prisma
model NexSettings {
  id                  String   @id @default("global")
  personality         String   @default("")
  tone                String   @default("")
  guardrails          Json     @default("[]")
  advancedOverride    String?  @map("advanced_override")
  audioInputEnabled   Boolean  @default(false) @map("audio_input_enabled")
  kbEnabled           Boolean  @default(true) @map("kb_enabled")
  updatedAt           DateTime @updatedAt @map("updated_at")
  updatedById         String?  @db.Uuid @map("updated_by_id")

  @@map("nex_settings")
}

model NexKbDocument {
  id            String   @id @default(uuid()) @db.Uuid
  name          String
  mimeType      String   @map("mime_type")
  fileSize      Int      @map("file_size")
  charCount     Int      @map("char_count")
  extractedText String   @map("extracted_text")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  uploadedById  String?  @db.Uuid @map("uploaded_by_id")

  @@index([createdAt(sort: Desc)])
  @@map("nex_kb_documents")
}
```

- [ ] **Step 2: Regenerar Prisma client**

```bash
npx prisma generate
```

Expected: client gerado em `src/generated/prisma/` sem erro.

- [ ] **Step 3: Escrever teste TDD**

Criar `src/lib/nex/__tests__/ensure-tables.test.ts`:

```ts
jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

import { pgPool } from "@/lib/pg-pool";
import {
  ensureNexTables,
  __resetEnsureNexTablesCache,
} from "../ensure-tables";

const q = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => {
  __resetEnsureNexTablesCache();
  q.mockReset();
  q.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

describe("ensureNexTables", () => {
  it("cria nex_settings com check singleton + nex_kb_documents + seed", async () => {
    await ensureNexTables();
    const sqls = q.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('CREATE TABLE IF NOT EXISTS "nex_settings"'))).toBe(true);
    expect(sqls.some((s) => s.includes(`CHECK (id = 'global')`))).toBe(true);
    expect(sqls.some((s) => s.includes('CREATE TABLE IF NOT EXISTS "nex_kb_documents"'))).toBe(true);
    expect(sqls.some((s) => s.includes('CREATE INDEX IF NOT EXISTS "nex_kb_documents_created_at_idx"'))).toBe(true);
    expect(
      sqls.some((s) =>
        s.includes("INSERT INTO nex_settings (id) VALUES ('global')") &&
        s.includes("ON CONFLICT (id) DO NOTHING"),
      ),
    ).toBe(true);
  });

  it("é idempotente (rodar 2x não duplica chamadas)", async () => {
    await ensureNexTables();
    const first = q.mock.calls.length;
    await ensureNexTables();
    expect(q.mock.calls.length).toBe(first);
  });
});
```

- [ ] **Step 4: Rodar — devem falhar (red)**

```bash
npm test -- src/lib/nex/__tests__/ensure-tables.test.ts
```

Expected: FAIL — módulo `../ensure-tables` não existe.

- [ ] **Step 5: Implementar `src/lib/nex/ensure-tables.ts`**

```ts
import "server-only";
import { pgPool } from "@/lib/pg-pool";

let ensured = false;
let inflight: Promise<void> | null = null;

async function createTables(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "nex_settings" (
      "id"                  TEXT NOT NULL DEFAULT 'global',
      "personality"         TEXT NOT NULL DEFAULT '',
      "tone"                TEXT NOT NULL DEFAULT '',
      "guardrails"          JSONB NOT NULL DEFAULT '[]'::jsonb,
      "advanced_override"   TEXT,
      "audio_input_enabled" BOOLEAN NOT NULL DEFAULT false,
      "kb_enabled"          BOOLEAN NOT NULL DEFAULT true,
      "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_by_id"       UUID,
      CONSTRAINT "nex_settings_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "nex_settings_singleton" CHECK (id = 'global')
    );
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "nex_kb_documents" (
      "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
      "name"           TEXT NOT NULL,
      "mime_type"      TEXT NOT NULL,
      "file_size"      INTEGER NOT NULL,
      "char_count"     INTEGER NOT NULL,
      "extracted_text" TEXT NOT NULL,
      "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "uploaded_by_id" UUID,
      CONSTRAINT "nex_kb_documents_pkey" PRIMARY KEY ("id")
    );
  `);
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS "nex_kb_documents_created_at_idx" ON "nex_kb_documents"("created_at" DESC);`,
  );
  await pgPool.query(
    `INSERT INTO nex_settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;`,
  );
}

export async function ensureNexTables(): Promise<void> {
  if (ensured) return;
  if (inflight) return inflight;
  inflight = createTables()
    .then(() => {
      ensured = true;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function __resetEnsureNexTablesCache(): void {
  ensured = false;
  inflight = null;
}
```

- [ ] **Step 6: Rodar — devem passar (green)**

```bash
npm test -- src/lib/nex/__tests__/ensure-tables.test.ts
```

Expected: PASS (2 testes).

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: 0 erros.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma src/lib/nex/ensure-tables.ts src/lib/nex/__tests__/ensure-tables.test.ts src/generated/prisma
git commit -m "feat(nex): tabelas nex_settings + nex_kb_documents (T1)"
```

---

## Task 2 — lib `nex/prompt.ts`

**Dependências:** T1.
**Estimativa:** 25–35 min.
**Files:**
- Create: `src/lib/nex/prompt.ts`
- Create: `src/lib/nex/__tests__/prompt.test.ts`

- [ ] **Step 1: Escrever testes TDD**

Conteúdo completo em `src/lib/nex/__tests__/prompt.test.ts`:

```ts
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
      personality: "", tone: "", guardrails: [],
      advancedOverride: null,
      audioInputEnabled: false, kbEnabled: false,
    };
    expect(composeSystemPrompt(cfg, [])).toBe(IDENTITY_BASE);
  });

  it("compõe personality + tone + guardrails", () => {
    const out = composeSystemPrompt(
      {
        personality: "amigável", tone: "informal",
        guardrails: ["não fale finanças", "não invente"],
        advancedOverride: null,
        audioInputEnabled: false, kbEnabled: false,
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
        personality: "x", tone: "y",
        guardrails: ["z"],
        advancedOverride: "PROMPT CRU",
        audioInputEnabled: false, kbEnabled: true,
      },
      [{ name: "doc", extractedText: "conteudo" }],
    );
    expect(out).toBe("PROMPT CRU");
  });

  it("KB desabilitada não injeta", () => {
    const out = composeSystemPrompt(
      {
        personality: "", tone: "", guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false, kbEnabled: false,
      },
      [{ name: "doc", extractedText: "importante" }],
    );
    expect(out).not.toContain("importante");
  });

  it("KB habilitada injeta com header", () => {
    const out = composeSystemPrompt(
      {
        personality: "", tone: "", guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false, kbEnabled: true,
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
        personality: "", tone: "", guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false, kbEnabled: true,
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
      rows: [{
        personality: "p", tone: "t",
        guardrails: ["g"],
        advanced_override: null,
        audio_input_enabled: false,
        kb_enabled: true,
      }],
      rowCount: 1,
    } as never);
    const cfg = await getNexPromptConfig();
    expect(cfg).toMatchObject({
      personality: "p", tone: "t",
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
      personality: "", tone: "", guardrails: [],
      advancedOverride: null,
      audioInputEnabled: false, kbEnabled: true,
    });
  });
});

describe("saveNexPromptConfig", () => {
  it("rejeita personality > 500", async () => {
    await expect(
      saveNexPromptConfig({
        personality: "x".repeat(501),
        tone: "", guardrails: [],
        advancedOverride: null,
        audioInputEnabled: false, kbEnabled: true,
      }),
    ).rejects.toThrow(/500/);
  });

  it("rejeita > 20 guardrails", async () => {
    await expect(
      saveNexPromptConfig({
        personality: "", tone: "",
        guardrails: Array(21).fill("x"),
        advancedOverride: null,
        audioInputEnabled: false, kbEnabled: true,
      }),
    ).rejects.toThrow(/20/);
  });

  it("rejeita override > MAX_PROMPT_LEN", async () => {
    await expect(
      saveNexPromptConfig({
        personality: "", tone: "", guardrails: [],
        advancedOverride: "x".repeat(MAX_PROMPT_LEN + 1),
        audioInputEnabled: false, kbEnabled: true,
      }),
    ).rejects.toThrow();
  });

  it("UPSERT singleton", async () => {
    q.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    await saveNexPromptConfig({
      personality: "ok", tone: "ok",
      guardrails: ["uma"],
      advancedOverride: null,
      audioInputEnabled: true, kbEnabled: false,
    });
    const sql = String(q.mock.calls[0][0]);
    expect(sql).toContain("INSERT INTO nex_settings");
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
  });
});
```

- [ ] **Step 2: Rodar — falha**

```bash
npm test -- src/lib/nex/__tests__/prompt.test.ts
```

- [ ] **Step 3: Implementar `src/lib/nex/prompt.ts`**

(Conteúdo completo descrito na spec v3 §6.5; usa o algoritmo definido lá.)

```ts
import "server-only";
import { pgPool } from "@/lib/pg-pool";
import { ensureNexTables } from "./ensure-tables";

export const MAX_PERSONALITY_LEN = 500;
export const MAX_TONE_LEN = 500;
export const MAX_GUARDRAIL_LEN = 300;
export const MAX_GUARDRAILS = 20;
export const MAX_PROMPT_LEN = 50_000;
export const MAX_KB_TOTAL_CHARS = 30_000;

export const IDENTITY_BASE = `Você é o Agente Nex, assistente da plataforma Nexus Insights que analisa dados de atendimento do Chatwoot.

CAPACIDADES:
- Consultar conversas, mensagens, contatos e atendentes via tools.
- Agregar e cruzar dados (contagens, médias, top N).
- Responder em português brasileiro de forma direta e útil.

DIRETRIZES:
- Sempre use tools para obter dados — nunca invente números.
- Se o período for ambíguo, pergunte (ex.: "Você quer dados de hoje ou de outro período?").
- Apresente números formatados em pt-BR (ex.: 1.234, 12,5%).
- Para listas longas, mostre os 5-10 primeiros e ofereça expandir.
- Se a tool retornar erro, explique brevemente e sugira reformular.
- Use markdown para listas, **negrito** para destacar, tabelas quando útil.

TIMEZONE PADRÃO: America/Sao_Paulo (BRT). "Hoje" = das 00:00 às 23:59:59 BRT.`;

export interface NexPromptConfig {
  personality: string;
  tone: string;
  guardrails: string[];
  advancedOverride: string | null;
  audioInputEnabled: boolean;
  kbEnabled: boolean;
}

export interface KbDocSnippet { name: string; extractedText: string; }

function asStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function getNexPromptConfig(): Promise<NexPromptConfig> {
  await ensureNexTables();
  const r = await pgPool.query<{
    personality: string; tone: string; guardrails: unknown;
    advanced_override: string | null;
    audio_input_enabled: boolean; kb_enabled: boolean;
  }>(`SELECT personality, tone, guardrails, advanced_override, audio_input_enabled, kb_enabled FROM nex_settings WHERE id = 'global' LIMIT 1`);
  if (r.rowCount === 0) {
    return { personality: "", tone: "", guardrails: [], advancedOverride: null, audioInputEnabled: false, kbEnabled: true };
  }
  const row = r.rows[0];
  return {
    personality: row.personality ?? "",
    tone: row.tone ?? "",
    guardrails: asStrArray(row.guardrails),
    advancedOverride: row.advanced_override,
    audioInputEnabled: !!row.audio_input_enabled,
    kbEnabled: !!row.kb_enabled,
  };
}

export async function saveNexPromptConfig(cfg: NexPromptConfig, updatedById?: string | null): Promise<void> {
  if (cfg.personality.length > MAX_PERSONALITY_LEN) throw new Error(`personality > ${MAX_PERSONALITY_LEN}`);
  if (cfg.tone.length > MAX_TONE_LEN) throw new Error(`tone > ${MAX_TONE_LEN}`);
  if (cfg.guardrails.length > MAX_GUARDRAILS) throw new Error(`máximo ${MAX_GUARDRAILS} guardrails`);
  for (const g of cfg.guardrails) {
    if (g.length > MAX_GUARDRAIL_LEN) throw new Error(`guardrail > ${MAX_GUARDRAIL_LEN}`);
  }
  if (cfg.advancedOverride && cfg.advancedOverride.length > MAX_PROMPT_LEN) {
    throw new Error(`override avançado > ${MAX_PROMPT_LEN}`);
  }
  await ensureNexTables();
  await pgPool.query(
    `INSERT INTO nex_settings (id, personality, tone, guardrails, advanced_override, audio_input_enabled, kb_enabled, updated_at, updated_by_id)
     VALUES ('global', $1, $2, $3::jsonb, $4, $5, $6, NOW(), $7)
     ON CONFLICT (id) DO UPDATE SET
       personality = EXCLUDED.personality,
       tone = EXCLUDED.tone,
       guardrails = EXCLUDED.guardrails,
       advanced_override = EXCLUDED.advanced_override,
       audio_input_enabled = EXCLUDED.audio_input_enabled,
       kb_enabled = EXCLUDED.kb_enabled,
       updated_at = NOW(),
       updated_by_id = EXCLUDED.updated_by_id`,
    [cfg.personality, cfg.tone, JSON.stringify(cfg.guardrails), cfg.advancedOverride ?? null, cfg.audioInputEnabled, cfg.kbEnabled, updatedById ?? null],
  );
}

export function composeSystemPrompt(cfg: NexPromptConfig, kbDocs: KbDocSnippet[]): string {
  if (cfg.advancedOverride && cfg.advancedOverride.trim().length > 0) {
    return cfg.advancedOverride;
  }
  const parts: string[] = [IDENTITY_BASE];
  if (cfg.personality.trim()) parts.push(`\n\n[PERSONALIDADE]\nPersonalidade: ${cfg.personality.trim()}`);
  if (cfg.tone.trim()) parts.push(`\n\n[TOM]\nTom: ${cfg.tone.trim()}`);
  if (cfg.guardrails.length > 0) {
    parts.push(`\n\n[GUARDRAILS]\nRegras importantes:\n${cfg.guardrails.map((g) => `- ${g.trim()}`).join("\n")}`);
  }
  if (cfg.kbEnabled && kbDocs.length > 0) {
    let budget = MAX_KB_TOTAL_CHARS;
    const chunks: string[] = ["\n\n[BASE DE CONHECIMENTO]\nConhecimento adicional fornecido pelo administrador:"];
    let truncated = false;
    for (const d of kbDocs) {
      if (budget <= 0) { truncated = true; break; }
      const head = `\n\n=== ${d.name} ===\n`;
      const remaining = budget - head.length;
      if (remaining <= 0) { truncated = true; break; }
      const body = d.extractedText.length <= remaining ? d.extractedText : `${d.extractedText.slice(0, remaining)}\n[...truncado...]`;
      chunks.push(`${head}${body}`);
      budget -= head.length + body.length;
      if (d.extractedText.length > remaining) { truncated = true; break; }
    }
    if (truncated && !chunks.join("").includes("[...truncado...]")) {
      chunks.push("\n[...truncado...]");
    }
    parts.push(chunks.join(""));
  }
  return parts.join("");
}
```

- [ ] **Step 4: Rodar — passa**
```bash
npm test -- src/lib/nex/__tests__/prompt.test.ts
```

- [ ] **Step 5: Typecheck**
```bash
npm run typecheck
```

- [ ] **Step 6: Commit**
```bash
git add src/lib/nex/prompt.ts src/lib/nex/__tests__/prompt.test.ts
git commit -m "feat(nex): composeSystemPrompt + getNexPromptConfig + saveNexPromptConfig (T2)"
```

---

## Task 3 — lib `nex/kb.ts`

**Dependências:** T1.
**Estimativa:** 20–30 min.
**Files:**
- Create: `src/lib/nex/kb.ts`
- Create: `src/lib/nex/__tests__/kb.test.ts`

- [ ] **Step 1: Tests TDD** (red)

```ts
jest.mock("@/lib/pg-pool", () => ({ pgPool: { query: jest.fn() } }));
jest.mock("../ensure-tables", () => ({ ensureNexTables: jest.fn(async () => {}) }));

import { pgPool } from "@/lib/pg-pool";
import {
  listKbDocuments,
  getKbDocsForPrompt,
  createKbDocument,
  deleteKbDocument,
  MAX_DOC_CHARS,
  MAX_DOC_FILE_BYTES,
} from "../kb";

const q = pgPool.query as jest.MockedFunction<typeof pgPool.query>;
beforeEach(() => q.mockReset());

describe("listKbDocuments", () => {
  it("retorna sem extracted_text", async () => {
    q.mockResolvedValueOnce({
      rows: [{
        id: "id-1", name: "manual.pdf", mime_type: "application/pdf",
        file_size: 12345, char_count: 1000,
        created_at: new Date("2026-05-01"), updated_at: new Date("2026-05-01"),
      }],
      rowCount: 1,
    } as never);
    const docs = await listKbDocuments();
    expect(docs[0]).toMatchObject({
      id: "id-1", name: "manual.pdf", mimeType: "application/pdf",
      fileSize: 12345, charCount: 1000,
    });
  });
});

describe("getKbDocsForPrompt", () => {
  it("retorna name+extractedText em ordem por created_at asc", async () => {
    q.mockResolvedValueOnce({
      rows: [{ name: "a", extracted_text: "txt-a" }, { name: "b", extracted_text: "txt-b" }],
      rowCount: 2,
    } as never);
    const docs = await getKbDocsForPrompt();
    expect(docs).toEqual([{ name: "a", extractedText: "txt-a" }, { name: "b", extractedText: "txt-b" }]);
  });
});

describe("createKbDocument", () => {
  it("rejeita > MAX_DOC_FILE_BYTES", async () => {
    await expect(
      createKbDocument({ name: "x", mimeType: "application/pdf", fileSize: MAX_DOC_FILE_BYTES + 1, extractedText: "abc" }),
    ).rejects.toThrow(/tamanho/i);
  });
  it("trunca extractedText em MAX_DOC_CHARS e grava charCount", async () => {
    q.mockResolvedValueOnce({ rows: [{ id: "new" }], rowCount: 1 } as never);
    const huge = "x".repeat(MAX_DOC_CHARS + 1000);
    const out = await createKbDocument({ name: "big.txt", mimeType: "text/plain", fileSize: 100, extractedText: huge });
    expect(out.charCount).toBe(MAX_DOC_CHARS);
    const params = q.mock.calls[0][1] as unknown[];
    expect((params[4] as string).length).toBe(MAX_DOC_CHARS);
  });
  it("sanitize NUL bytes antes de gravar", async () => {
    q.mockResolvedValueOnce({ rows: [{ id: "new" }], rowCount: 1 } as never);
    await createKbDocument({ name: "x.txt", mimeType: "text/plain", fileSize: 10, extractedText: "abc def" });
    const params = q.mock.calls[0][1] as unknown[];
    expect(params[4]).toBe("abcdef");
  });
});

describe("deleteKbDocument", () => {
  it("dispara DELETE com id", async () => {
    q.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    await deleteKbDocument("id-1");
    expect(String(q.mock.calls[0][0])).toContain("DELETE FROM nex_kb_documents");
  });
});
```

- [ ] **Step 2: Rodar — falha**

- [ ] **Step 3: Implementar `src/lib/nex/kb.ts`**

```ts
import "server-only";
import { pgPool } from "@/lib/pg-pool";
import { ensureNexTables } from "./ensure-tables";

export const MAX_DOC_CHARS = 100_000;
export const MAX_DOC_FILE_BYTES = 5 * 1024 * 1024;

export interface KbSummary {
  id: string; name: string; mimeType: string;
  fileSize: number; charCount: number;
  createdAt: string; updatedAt: string;
}
export interface KbCreateInput {
  name: string; mimeType: string; fileSize: number; extractedText: string; uploadedById?: string | null;
}

function sanitizeForPostgres(s: string): string {
  // Postgres TEXT não aceita NUL byte ( ); remove.
  return s.replace(/ /g, "");
}

export async function listKbDocuments(): Promise<KbSummary[]> {
  await ensureNexTables();
  const r = await pgPool.query<{
    id: string; name: string; mime_type: string;
    file_size: number; char_count: number;
    created_at: Date | string; updated_at: Date | string;
  }>(`SELECT id, name, mime_type, file_size, char_count, created_at, updated_at FROM nex_kb_documents ORDER BY created_at DESC`);
  return r.rows.map((row) => ({
    id: row.id, name: row.name, mimeType: row.mime_type,
    fileSize: row.file_size, charCount: row.char_count,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
  }));
}

export async function getKbDocsForPrompt(): Promise<Array<{ name: string; extractedText: string }>> {
  await ensureNexTables();
  const r = await pgPool.query<{ name: string; extracted_text: string }>(
    `SELECT name, extracted_text FROM nex_kb_documents ORDER BY created_at ASC`,
  );
  return r.rows.map((row) => ({ name: row.name, extractedText: row.extracted_text }));
}

export async function createKbDocument(input: KbCreateInput): Promise<{ id: string; charCount: number }> {
  if (input.fileSize > MAX_DOC_FILE_BYTES) {
    throw new Error("Arquivo excede o tamanho máximo (5 MB).");
  }
  await ensureNexTables();
  const cleaned = sanitizeForPostgres(input.extractedText);
  const text = cleaned.length > MAX_DOC_CHARS ? cleaned.slice(0, MAX_DOC_CHARS) : cleaned;
  const r = await pgPool.query<{ id: string }>(
    `INSERT INTO nex_kb_documents (id, name, mime_type, file_size, char_count, extracted_text, created_at, updated_at, uploaded_by_id)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW(), $6)
     RETURNING id`,
    [input.name, input.mimeType, input.fileSize, text.length, text, input.uploadedById ?? null],
  );
  return { id: r.rows[0].id, charCount: text.length };
}

export async function deleteKbDocument(id: string): Promise<void> {
  await ensureNexTables();
  await pgPool.query(`DELETE FROM nex_kb_documents WHERE id = $1`, [id]);
}
```

- [ ] **Step 4–6:** rodar tests (passam), typecheck, commit:

```bash
git add src/lib/nex/kb.ts src/lib/nex/__tests__/kb.test.ts
git commit -m "feat(nex): KB CRUD com cap por doc + sanitize NUL (T3)"
```

---

## Task 4 — lib `nex/transcribe.ts`

**Dependências:** nenhuma (lê `getActiveLlmConfig` existente).
**Estimativa:** 15–25 min.
**Files:** Create `src/lib/nex/transcribe.ts` + `__tests__/transcribe.test.ts`.

- [ ] **Step 1: Tests TDD**

```ts
jest.mock("@/lib/llm/get-active-config", () => ({ getActiveLlmConfig: jest.fn() }));

import { getActiveLlmConfig } from "@/lib/llm/get-active-config";
import { transcribeAudio, MAX_AUDIO_BYTES } from "../transcribe";

const realFetch = global.fetch;
beforeEach(() => {
  // @ts-expect-error mock
  global.fetch = jest.fn();
  (getActiveLlmConfig as jest.Mock).mockReset();
});
afterAll(() => { global.fetch = realFetch; });

describe("transcribeAudio", () => {
  it("rejeita provider != openai", async () => {
    (getActiveLlmConfig as jest.Mock).mockResolvedValueOnce({ provider: "anthropic", apiKey: "k", model: "m" });
    await expect(transcribeAudio(new Blob(["x"], { type: "audio/webm" }))).rejects.toThrow(/OpenAI/i);
  });
  it("rejeita áudio > MAX_AUDIO_BYTES", async () => {
    (getActiveLlmConfig as jest.Mock).mockResolvedValueOnce({ provider: "openai", apiKey: "k", model: "m" });
    const big = new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)], { type: "audio/webm" });
    await expect(transcribeAudio(big)).rejects.toThrow(/máximo/i);
  });
  it("retorna text + duration em sucesso", async () => {
    (getActiveLlmConfig as jest.Mock).mockResolvedValueOnce({ provider: "openai", apiKey: "k", model: "m" });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true, json: async () => ({ text: "olá", duration: 4.2 }),
    });
    const r = await transcribeAudio(new Blob(["x"], { type: "audio/webm" }), "pt");
    expect(r).toEqual({ text: "olá", durationSeconds: 4.2 });
  });
  it("propaga erro Whisper", async () => {
    (getActiveLlmConfig as jest.Mock).mockResolvedValueOnce({ provider: "openai", apiKey: "k", model: "m" });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false, status: 500, text: async () => "internal",
    });
    await expect(transcribeAudio(new Blob(["x"], { type: "audio/webm" }))).rejects.toThrow(/500|internal/i);
  });
});
```

- [ ] **Step 2: Implementar `src/lib/nex/transcribe.ts`**

```ts
import "server-only";
import { getActiveLlmConfig } from "@/lib/llm/get-active-config";

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export interface TranscribeResult { text: string; durationSeconds: number; }

export async function transcribeAudio(audio: Blob, language: string = "pt"): Promise<TranscribeResult> {
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new Error(`Áudio excede o tamanho máximo (${MAX_AUDIO_BYTES} bytes).`);
  }
  const cfg = await getActiveLlmConfig();
  if (!cfg) throw new Error("Nenhum provedor de IA configurado.");
  if (cfg.provider !== "openai") {
    throw new Error("Transcrição requer chave OpenAI ativa (Whisper). Outros provedores ainda não suportados.");
  }
  const fd = new FormData();
  fd.append("file", audio, "audio.webm");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  if (language) fd.append("language", language);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Whisper ${res.status}: ${text || res.statusText}`);
  }
  const data = (await res.json()) as { text: string; duration?: number };
  return {
    text: data.text,
    durationSeconds: typeof data.duration === "number" && Number.isFinite(data.duration) ? data.duration : 0,
  };
}
```

- [ ] **Step 3–5:** tests passam, typecheck, commit `feat(nex): transcribeAudio Whisper (T4)`.

---

## Task 5 — pricing whisper-1

**Dependências:** nenhuma.
**Estimativa:** 10 min.
**Files:** Modify `src/lib/llm/pricing.ts` + Create `__tests__/pricing-whisper.test.ts`.

- [ ] **Step 1: Test**
```ts
import { calculateCost } from "../pricing";

describe("calculateCost — whisper-1 per-minute", () => {
  it("$0.006 por minuto", () => {
    expect(calculateCost("whisper-1", 0, 0, { durationMs: 60_000 })).toBeCloseTo(0.006, 6);
  });
  it("0.5 minuto = $0.003", () => {
    expect(calculateCost("whisper-1", 0, 0, { durationMs: 30_000 })).toBeCloseTo(0.003, 6);
  });
  it("modelo regular não regride", () => {
    expect(calculateCost("gpt-4.1-mini", 1_000_000, 1_000_000)).toBeCloseTo(0.4 + 1.6, 6);
  });
});
```

- [ ] **Step 2: Modificar `src/lib/llm/pricing.ts`**

Adicionar entrada `"whisper-1": { ... perMinuteUsd: 0.006 }` na MODEL_PRICING. Estender `ModelPricing` interface com `perMinuteUsd?: number`. Estender `calculateCost(model, tokensInput, tokensOutput, extras?: { durationMs?: number })`. Quando `pricing.perMinuteUsd && extras?.durationMs > 0` calcular `(min * perMinuteUsd)`.

- [ ] **Step 3: Tests passam (incluindo pricing.test.ts antigo — não regride)**
```bash
npm test -- src/lib/llm/__tests__/
```

- [ ] **Step 4: Commit** `feat(llm): pricing whisper-1 per-minute (T5)`.

---

## Task 6 — Route Handler `/api/nex/transcribe`

**Dependências:** T4, T5.
**Estimativa:** 15 min.
**Files:** Create `src/app/api/nex/transcribe/route.ts`.

- [ ] **Step 1: Implementar**

(Conteúdo conforme spec v3 §6.1; auth + provider check + Whisper + logUsage + retorno JSON.)

```ts
import { auth } from "@/auth";
import { logUsage } from "@/lib/llm/agent/usage-logger";
import { calculateCost } from "@/lib/llm/pricing";
import { transcribeAudio } from "@/lib/nex/transcribe";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SessionUserShape { id?: string; platformRole?: string; }

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const user = (session?.user ?? {}) as SessionUserShape;
  if (!user.id) {
    return Response.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  let audio: Blob | null = null;
  let language = "pt";
  try {
    const fd = await req.formData();
    const f = fd.get("audio");
    if (f instanceof Blob) audio = f;
    const lang = fd.get("language");
    if (typeof lang === "string" && lang.length > 0) language = lang;
  } catch {
    return Response.json({ ok: false, error: "Payload multipart inválido" }, { status: 400 });
  }
  if (!audio) {
    return Response.json({ ok: false, error: "Campo 'audio' ausente" }, { status: 400 });
  }

  try {
    const start = Date.now();
    const r = await transcribeAudio(audio, language);
    const cost = calculateCost("whisper-1", 0, 0, { durationMs: r.durationSeconds * 1000 });
    void logUsage({
      provider: "openai", model: "whisper-1",
      tokensInput: 0, tokensOutput: 0, costUsd: cost,
      promptChars: 0, responseChars: r.text.length,
      userId: user.id, durationMs: Date.now() - start,
    });
    return Response.json({ ok: true, text: r.text, durationSeconds: r.durationSeconds }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke compile**
```bash
npm run typecheck
```

- [ ] **Step 3: Commit** `feat(nex): route handler /api/nex/transcribe (T6)`.

---

## Task 7 — Server Actions de prompt + KB

**Dependências:** T2, T3.
**Estimativa:** 30–40 min.
**Files:** Create `src/lib/actions/nex-prompt.ts` + `__tests__/nex-prompt.test.ts`. Modify `package.json` (`pdf-parse`).

- [ ] **Step 1: `npm install pdf-parse`**

```bash
npm install pdf-parse
```

- [ ] **Step 2: Tests TDD**

(Ver spec v3 §6.2; testar guard super_admin, audit log, validações, todos os 6 actions.)

- [ ] **Step 3: Implementar `src/lib/actions/nex-prompt.ts`**

(Implementação completa: 6 actions com `requireSuperAdmin` + `safeAction` + `logAudit`. `uploadKbDocumentAction` lê FormData, extrai PDF via `pdf-parse` ou TXT direto, valida tamanho, chama `createKbDocument`. Conforme spec v3 §6.2.)

- [ ] **Step 4: Tests passam**

- [ ] **Step 5: Commit** `feat(nex): server actions prompt + KB (T7)`.

---

## Task 8 — runNexAgent dinâmico

**Dependências:** T2, T3.
**Estimativa:** 25–30 min.
**Files:** Modify `src/lib/llm/agent/run-nex.ts`, `src/lib/actions/nex-chat.ts`, `src/lib/llm/agent/__tests__/run-nex.test.ts`.

- [ ] **Step 1: Atualizar mocks de `run-nex.test.ts`**

Adicionar:
```ts
jest.mock("@/lib/nex/prompt", () => ({
  getNexPromptConfig: jest.fn(async () => ({
    personality: "", tone: "", guardrails: [],
    advancedOverride: null,
    audioInputEnabled: false, kbEnabled: false,
  })),
  composeSystemPrompt: jest.fn(() => "BASE"),
}));
jest.mock("@/lib/nex/kb", () => ({
  getKbDocsForPrompt: jest.fn(async () => []),
}));
```

- [ ] **Step 2: Modificar `run-nex.ts`**

(Conforme spec v3 §6.4; remove SYSTEM_PROMPT constante, adiciona `promptOverride` + `isPlayground` ao `RunNexInput`, helper `resolveSystemPrompt`, skip logUsage se isPlayground.)

- [ ] **Step 3: Adicionar `testNexPromptAction` em `nex-chat.ts`**

```ts
export async function testNexPromptAction(
  promptText: string,
  cfg: import("@/lib/nex/prompt").NexPromptConfig,
): Promise<SendNexMessageResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Não autenticado" };
  if (promptText.length > 1000) return { ok: false, error: "Mensagem > 1000 chars" };
  const accountId = await getActiveAccountId();
  const userId = (session.user as { id?: string }).id;
  const platformRole = (session.user as { platformRole?: string }).platformRole;
  const { composeSystemPrompt } = await import("@/lib/nex/prompt");
  const { getKbDocsForPrompt } = await import("@/lib/nex/kb");
  const docs = cfg.kbEnabled ? await getKbDocsForPrompt() : [];
  const composed = composeSystemPrompt(cfg, docs);
  const r = await runNexAgent({
    messages: [{ role: "user", content: promptText }],
    accountId, userId, platformRole,
    promptOverride: composed, isPlayground: true,
  });
  return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error };
}
```

- [ ] **Step 4: Tests passam**

- [ ] **Step 5: Commit** `feat(nex): runNexAgent dinâmico + testNexPrompt action (T8)`.

---

## Task 9 — NAV_ITEMS

**Dependências:** nenhuma.
**Estimativa:** 5 min.
**REGRA:** invocar `ui-ux-pro-max:ui-ux-pro-max`.

(Conforme spec v3 §7.4; adicionar item Agente Nex com 4 children, remover Consumo IA standalone.)

- [ ] **Step 1: Editar `src/lib/constants/nav.ts`**
- [ ] **Step 2: Typecheck + Commit** `feat(nav): submenu Agente Nex + remove Consumo IA (T9)`.

---

## Task 10 — `/agente-nex/page.tsx`

**Dependências:** T9.
**Estimativa:** 2 min.

- [ ] **Step 1:** Criar com `redirect("/agente-nex/configuracao")`.
- [ ] **Step 2:** Commit `feat(agente-nex): redirect raiz (T10)`.

---

## Task 11 — `/agente-nex/layout.tsx`

**Dependências:** T9.
**Estimativa:** 1 min.

Layout passthrough.

- [ ] **Step 1:** Criar.
- [ ] **Step 2:** Commit `feat(agente-nex): layout passthrough (T11)`.

---

## Task 12 — Extrair `LlmConfigForm`

**Dependências:** nenhuma.
**Estimativa:** 15 min.
**REGRA:** invocar `ui-ux-pro-max:ui-ux-pro-max`.

- [ ] **Step 1:** Criar `src/components/agente-nex/llm-config-form.tsx` copiando o BODY do `LlmConfigCard` (sem o Card wrapper externo, sem o tab switcher interno entre Configuração/Chaves).
- [ ] **Step 2:** Manter `LlmConfigCard` intacto por enquanto (usado em /configuracoes; será removido em T17).
- [ ] **Step 3:** Typecheck + Commit `feat(agente-nex): extrai LlmConfigForm (T12)`.

---

## Task 13 — `/agente-nex/configuracao/page.tsx`

**Dependências:** T12.
**Estimativa:** 10 min.
**REGRA:** UI/UX Pro Max.

(Conforme spec v3 §7.5; PageShell + PageHeader + Card com `<LlmConfigForm>`.)

---

## Task 14 — `/agente-nex/chaves/page.tsx`

**Dependências:** T9.
**Estimativa:** 8 min.
**REGRA:** UI/UX Pro Max.

(Reutiliza `<LlmCredentialsManager>`.)

---

## Task 15 — `/agente-nex/consumo/page.tsx`

**Dependências:** T9.
**Estimativa:** 5 min.
**REGRA:** UI/UX Pro Max (mínimo — só PageShell/Header).

- [ ] **Step 1:** Criar nova page que **REUSA** `<ConsumoContent>` (não duplica). Mesmo `metadata` + `<PageShell>` + `<PageHeader title="Consumo do Agente Nex" />`.
- [ ] **Step 2:** Typecheck + Commit `feat(agente-nex): /consumo (T15)`.

---

## Task 16 — Redirect `/configuracoes/consumo`

**Dependências:** T15.
**Estimativa:** 3 min.

- [ ] **Step 1:** Substituir `src/app/(protected)/configuracoes/consumo/page.tsx`:

```tsx
import { permanentRedirect } from "next/navigation";

export default function Page(): never {
  permanentRedirect("/agente-nex/consumo");
}
```

- [ ] **Step 2:** Typecheck + Commit `feat(configuracoes): /consumo redireciona 308 (T16)`.

---

## Task 17 — Limpar `/configuracoes/page.tsx`

**Dependências:** T13, T14.
**Estimativa:** 8 min.
**REGRA:** UI/UX Pro Max.

(Conforme spec v3 §7.9; remove imports + bloco do LlmConfigCard.)

---

## Task 18 — NexMessage copy + audio fallback

**Dependências:** nenhuma.
**Estimativa:** 15 min.
**REGRA:** UI/UX Pro Max.

- [ ] **Step 1: Modificar `nex-message.tsx`**
  - Adicionar `kind?: "text" | "audio"`, `audioBlobUrl?: string | null`, `transcription?: string`, `durationSeconds?: number`.
  - Render kind="audio": player (com fallback "(áudio expirado)" se !audioBlobUrl) + transcrição.
  - Render kind="text" (default): copy button em user E assistant.

- [ ] **Step 2: Tests RTL** (3 cenários):
  - Copy em user.
  - Copy em assistant.
  - kind="audio" sem audioBlobUrl → mostra "(áudio expirado)".

- [ ] **Step 3:** Tests passam + Commit `feat(nex): NexMessage com copy universal + suporte audio (T18)`.

---

## Task 19 — AudioPlayer

**Dependências:** nenhuma.
**Estimativa:** 30 min.
**REGRA:** UI/UX Pro Max.

(Conforme spec v3 §8.2; HTML5 audio + speed dropdown 5 níveis.)

---

## Task 20 — AudioRecorder

**Dependências:** nenhuma.
**Estimativa:** 40 min.
**REGRA:** UI/UX Pro Max.

(Conforme spec v3 §8.1; MediaRecorder + start/pause/cancel/send + cap 5min auto-send. Mock global de MediaRecorder no teste.)

---

## Task 21 — Bubble integra audio

**Dependências:** T6, T18, T19, T20.
**Estimativa:** 45 min.
**REGRA:** UI/UX Pro Max.

Sub-tasks:

### T21a. Layout protegido busca `effectiveAudioEnabled`

Modify `src/app/(protected)/layout.tsx`:

```ts
import { getNexPromptConfig } from "@/lib/nex/prompt";
import { getActiveLlmConfig } from "@/lib/llm/get-active-config";
// ... existente

const [llmActive, nexCfg] = await Promise.all([
  getActiveLlmConfig().catch(() => null),
  getNexPromptConfig().catch(() => null),
]);
const effectiveAudioEnabled =
  !!nexCfg?.audioInputEnabled && llmActive?.provider === "openai";

// passar ao bubble:
{nexBubbleEnabled ? <NexBubble audioInputEnabled={effectiveAudioEnabled} /> : null}
```

### T21b. NexBubble + NexChatPanel recebem prop

(Adicionar prop opcional + passar pro panel.)

### T21c. NexChatPanel: integra AudioRecorder + handler

```ts
const handleSendAudio = React.useCallback(async (blob: Blob, durationSeconds: number) => {
  const id = `u_${Date.now()}`;
  const audioBlobUrl = URL.createObjectURL(blob);
  setMessages((m) => [...m, { id, role: "loading", content: "" }]);
  const fd = new FormData();
  fd.append("audio", blob, "audio.webm");
  const controller = new AbortController();
  try {
    const res = await fetch("/api/nex/transcribe", {
      method: "POST", body: fd, signal: controller.signal,
    });
    const data = (await res.json()) as { ok: boolean; text?: string; error?: string };
    setMessages((m) => m.filter((x) => x.id !== id));
    if (!data.ok || !data.text || !data.text.trim()) {
      toast.error(data.error ?? "Não consegui transcrever — áudio inaudível?");
      URL.revokeObjectURL(audioBlobUrl);
      return;
    }
    setMessages((m) => [...m, { id, role: "user", kind: "audio", audioBlobUrl, durationSeconds, content: data.text! }]);
    await sendToAgent(data.text!);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    toast.error("Falha na transcrição. Tente novamente.");
  }
}, []);
```

### T21d. Persistência localStorage sem audioBlobUrl

Antes de salvar:
```ts
const stripped = messages.map((m) => 
  m.kind === "audio" ? { ...m, audioBlobUrl: null } : m
);
localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped.slice(-MAX_HISTORY)));
```

- [ ] **Tests + commit** `feat(nex): bubble com gravação + envio de áudio (T21)`.

---

## Task 22 — PromptConfigForm

**Dependências:** T7.
**Estimativa:** 35 min.
**REGRA:** UI/UX Pro Max.

(Conforme spec v3 §7.8 Card 1.)

---

## Task 23 — ResourcesToggles

**Dependências:** T7.
**Estimativa:** 20 min.
**REGRA:** UI/UX Pro Max.

(Conforme spec v3 §7.8 Card 2; toggle áudio com gating provider via prop `providerAtual`; aviso de bolha desligada.)

---

## Task 24 — KbSection + UploadDialog

**Dependências:** T7.
**Estimativa:** 35 min.
**REGRA:** UI/UX Pro Max.

(Conforme spec v3 §7.8 Card 3; lista + upload dialog + delete + warnings de cap.)

---

## Task 25 — Playground

**Dependências:** T8.
**Estimativa:** 30 min.
**REGRA:** UI/UX Pro Max.

(Conforme spec v3 §7.8 Card 4; textarea cap 1000, send → testNexPromptAction, link "ver prompt usado".)

---

## Task 26 — `/agente-nex/prompt/page.tsx`

**Dependências:** T22, T23, T24, T25.
**Estimativa:** 15 min.
**REGRA:** UI/UX Pro Max.

(Server component composando os 4 cards.)

---

## Task 27 — Release

**Dependências:** T1–T26.
**Estimativa:** 10 min.

Bump 0.15.0 + CHANGELOG entry + STATUS.md update + commit `chore(release): v0.15.0`.

---

## Task 28 — Verify + push + deploy + smoke

**Dependências:** T27.
**Estimativa:** 15 min + tempo de build/deploy.

Lista completa de smoke checks (19 itens da spec v3 §11.4).

---

## Self-Review

Aplicar pente fino #2 separado (review-2 file).
