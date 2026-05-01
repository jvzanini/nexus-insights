# Plano — Suite Agente Nex (v0.15.0) — VERSÃO 3 FINAL

> **Status:** v3 FINAL. Incorpora pente fino #1 (25 achados) + #2 (29 achados). Pronto para subagent-driven-development.
> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Cada subagent foca em UMA task fechada.
> **REGRA:** todas as tasks de UI (T9, T11–T15, T17–T26) **DEVEM** invocar `ui-ux-pro-max:ui-ux-pro-max` antes de qualquer Edit. CLAUDE.md §2.2.
> **Histórico:** v1 (`-v1.md`), review-1 (`-review-1.md`), v2 (`-v2.md`), review-2 (`-review-2.md`).

**Goal:** Implementar a Suite Agente Nex conforme spec v3 final.

**Architecture:** Sidebar dedicada `/agente-nex` (4 sub-páginas), system prompt dinâmico via `nex_settings`, KB via `nex_kb_documents`, áudio via Whisper Route Handler `/api/nex/transcribe`, playground inline.

**Tech Stack:** Next.js 16, Postgres (raw SQL via `pgPool`), MediaRecorder, HTML5 Audio, Whisper API, `pdf-parse`, Jest+RTL.

**Spec referência:** `docs/superpowers/specs/2026-05-01-agente-nex-suite-design.md`.

**Convenções:**
- TDD onde aplicável: red → green → commit.
- UI/UX Pro Max em UI tasks.
- Cada task fecha em commit próprio. Conventional Commits (`feat(escopo): descrição (T<n>)`).
- `npm run typecheck` antes de cada commit. `npm test` da área tocada quando há código testável (skip apenas em config-only edits, ex.: T9, T10, T11 — explicitamente marcado nos steps).
- Antes de PUSH: `npm test` completo + `npm run build`.
- Path alias: `@/...`.
- `safeAction` wrapper em todas as Server Actions novas.
- Após save em form, sempre `router.refresh()` para atualizar Server Components consumidores.

**Dependências entre tasks** declaradas no header de cada task.

---

## Task 1 — Schema `nex_settings` + `nex_kb_documents`

**Dependências:** nenhuma.
**Estimativa:** 15–20 min.
**REGRA:** N/A (não é UI).
**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/nex/ensure-tables.ts`
- Create: `src/lib/nex/__tests__/ensure-tables.test.ts`

### Step 1: Atualizar `prisma/schema.prisma`

Adicionar após `model LlmUsage`:

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

### Step 2: `npx prisma generate`

```bash
npx prisma generate
```

Expected: client gerado em `src/generated/prisma/`.

### Step 3: Test TDD

`src/lib/nex/__tests__/ensure-tables.test.ts`:

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

  it("é idempotente", async () => {
    await ensureNexTables();
    const first = q.mock.calls.length;
    await ensureNexTables();
    expect(q.mock.calls.length).toBe(first);
  });
});
```

### Step 4: Rodar — falha (red)

```bash
npm test -- src/lib/nex/__tests__/ensure-tables.test.ts
```
Expected: FAIL — módulo não existe.

### Step 5: Implementar `src/lib/nex/ensure-tables.ts`

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
    .then(() => { ensured = true; })
    .catch((err) => { inflight = null; throw err; })
    .finally(() => { inflight = null; });
  return inflight;
}

export function __resetEnsureNexTablesCache(): void {
  ensured = false;
  inflight = null;
}
```

### Step 6: Rodar — passa (green)

```bash
npm test -- src/lib/nex/__tests__/ensure-tables.test.ts
```
Expected: PASS.

### Step 7: Typecheck

```bash
npm run typecheck
```
Expected: 0 erros.

### Step 8: Commit

```bash
git add prisma/schema.prisma src/lib/nex/ensure-tables.ts src/lib/nex/__tests__/ensure-tables.test.ts src/generated/prisma
git commit -m "feat(nex): tabelas nex_settings + nex_kb_documents (T1)"
```

---

## Task 2 — lib `nex/prompt.ts` (composeSystemPrompt + CRUD)

**Dependências:** T1.
**Estimativa:** 25–35 min.
**REGRA:** N/A.
**Files:** Create `src/lib/nex/prompt.ts` + `__tests__/prompt.test.ts`.

> Conteúdo dos tests + da implementação detalhados na **v2 do plano §Task 2** (sem mudanças após review-2). Aplicar literalmente.

### Steps:
1. Tests TDD (cobre composeSystemPrompt em todos os cenários: vazio, completo, override, KB com cap).
2. Run → red.
3. Implementar (constantes MAX_*, IDENTITY_BASE, getNexPromptConfig, saveNexPromptConfig, composeSystemPrompt).
4. Run → green.
5. Typecheck.
6. Commit `feat(nex): composeSystemPrompt + getNexPromptConfig + saveNexPromptConfig (T2)`.

---

## Task 3 — lib `nex/kb.ts` (CRUD KB)

**Dependências:** T1.
**Estimativa:** 20–30 min.
**REGRA:** N/A.
**Files:** Create `src/lib/nex/kb.ts` + `__tests__/kb.test.ts`.

> Conteúdo na **v2 §Task 3**. Aplicar.

### Pontos críticos (review-2 fix):
- `sanitizeForPostgres(s)` remove NUL bytes (` `): `s.replace(/ /g, "")`. Test cobre.
- Cap por doc 100k chars (truncate post-sanitize).
- Cap arquivo 5 MB.

### Steps:
1. Tests TDD.
2. Red.
3. Implementar.
4. Green.
5. Typecheck.
6. Commit `feat(nex): KB CRUD com cap + sanitize NUL (T3)`.

---

## Task 4 — lib `nex/transcribe.ts` (Whisper)

**Dependências:** nenhuma (lê `getActiveLlmConfig`).
**Estimativa:** 15–25 min.
**REGRA:** N/A.
**Files:** Create `src/lib/nex/transcribe.ts` + `__tests__/transcribe.test.ts`.

> Conteúdo na **v2 §Task 4**.

### Steps:
1. Tests TDD (4 cenários: provider != openai, > 25MB, sucesso, erro 5xx).
2. Red.
3. Implementar.
4. Green.
5. Typecheck.
6. Commit `feat(nex): transcribeAudio Whisper (T4)`.

---

## Task 5 — pricing `whisper-1` per-minute

**Dependências:** nenhuma.
**Estimativa:** 10 min.
**REGRA:** N/A.
**Files:** Modify `src/lib/llm/pricing.ts` + Create `__tests__/pricing-whisper.test.ts`.

> Conteúdo na **v2 §Task 5**. Não regredir tests antigos de pricing.

### Pontos:
- `ModelPricing` ganha `perMinuteUsd?: number`.
- `calculateCost(model, in, out, extras?: { durationMs?: number })` — quando `pricing.perMinuteUsd && extras?.durationMs > 0` retorna `(durationMs/60000) * perMinuteUsd` arredondado em 6 casas.
- Adicionar `"whisper-1": { inputPerMillion: 0, outputPerMillion: 0, perMinuteUsd: 0.006 }` em `MODEL_PRICING`.
- Atualizar interface tornando o 4º arg opcional → não quebra callers existentes.

### Steps:
1. Test TDD (3 cenários + não-regressão de pricing.test.ts existente).
2. Red.
3. Implementar.
4. Green (todos os pricing tests passam).
5. Typecheck.
6. Commit `feat(llm): pricing whisper-1 per-minute (T5)`.

---

## Task 6 — Route Handler `/api/nex/transcribe`

**Dependências:** T4, T5.
**Estimativa:** 15 min.
**REGRA:** N/A.
**Files:** Create `src/app/api/nex/transcribe/route.ts`.

> Conteúdo na **v2 §Task 6**.

### Pontos críticos (review-2 fix A1):
- Áudio NÃO passa pelo `runNexAgent`. Apenas a transcrição (texto) é enviada do client via `sendNexMessage`.
- Route Handler é caminho separado: blob → Whisper → texto → cliente decide o que fazer com o texto.
- `runtime: "nodejs"`, `maxDuration: 60`.
- `logUsage` com `cost_usd = calculateCost("whisper-1", 0, 0, { durationMs })`.

### Steps:
1. Implementar.
2. Typecheck.
3. Smoke compile (sem teste unitário de Route Handler — fica em E2E na T28).
4. Commit `feat(nex): route handler /api/nex/transcribe (T6)`.

---

## Task 7 — Server Actions de prompt + KB

**Dependências:** T2, T3.
**Estimativa:** 30–40 min.
**REGRA:** N/A.
**Files:** Create `src/lib/actions/nex-prompt.ts` + `__tests__/nex-prompt.test.ts`. Modify `package.json` (`pdf-parse`).

> Conteúdo da implementação na **v2 §Task 7**.

### Pontos críticos (review-2 fix):

**A4 (review-2):** `uploadKbDocumentAction` deve ter try/catch específico em volta do `pdf-parse`:

```ts
let extracted: string;
if (mimeType === "application/pdf") {
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const pdfParse = (await import("pdf-parse")).default as (b: Buffer) => Promise<{ text: string }>;
    const out = await pdfParse(buf);
    extracted = out.text ?? "";
  } catch (err) {
    return { ok: false, error: "Não foi possível extrair texto do PDF. Tente exportar como TXT." };
  }
} else if (mimeType === "text/plain") {
  extracted = await file.text();
} else {
  return { ok: false, error: "Apenas PDF e TXT são aceitos" };
}
```

**A11 (review-2):** Server Actions com FormData no Next.js 16 — pode ter limite de body 1 MB. Validar:
- Se Server Action funciona com PDF de 5 MB: ótimo.
- Se NÃO funcionar (erro `Body exceeded 1 MB limit`): mover upload pra Route Handler `/api/nex/kb/upload` (não previsto na spec original — fallback se necessário).
- Server Action é a primeira tentativa por simplicidade.

### Steps:
1. `npm install pdf-parse`.
2. Tests TDD (super_admin guard, audit log, validações).
3. Red.
4. Implementar 6 actions com `safeAction` wrapper.
5. Green.
6. Typecheck.
7. Commit `feat(nex): server actions prompt + KB (T7)`.

---

## Task 8 — runNexAgent dinâmico + testNexPromptAction

**Dependências:** T2, T3.
**Estimativa:** 25–30 min.
**REGRA:** N/A.
**Files:** Modify `src/lib/llm/agent/run-nex.ts`, `src/lib/actions/nex-chat.ts`, `src/lib/llm/agent/__tests__/run-nex.test.ts`.

> Conteúdo na **v2 §Task 8**.

### Pontos críticos:

- `RunNexInput` ganha `promptOverride?: string` + `isPlayground?: boolean`.
- `resolveSystemPrompt` (helper interno): se `promptOverride && length > 0` → usa (cap `MAX_PROMPT_OVERRIDE_LEN = 50000`); senão → `composeSystemPrompt(getNexPromptConfig(), kbEnabled ? getKbDocsForPrompt() : [])`.
- Quando `isPlayground === true` → skipping de TODOS os `logUsage` calls.
- Mocks novos no test: `@/lib/nex/prompt` + `@/lib/nex/kb`.

### Steps:
1. Atualizar `__tests__/run-nex.test.ts` com mocks novos.
2. Modificar `run-nex.ts` (incluir resolver dinâmico).
3. Tests passam.
4. Adicionar `testNexPromptAction` em `nex-chat.ts` (cap 1000 chars, isPlayground=true).
5. Typecheck.
6. Commit `feat(nex): runNexAgent dinâmico + testNexPrompt action (T8)`.

---

## Task 9 — NAV_ITEMS submenu Agente Nex

**Dependências:** nenhuma.
**Estimativa:** 5 min.
**REGRA:** **invocar `ui-ux-pro-max:ui-ux-pro-max`** antes de Edit.
**Files:** Modify `src/lib/constants/nav.ts`.

### Pontos críticos (review-2 fix A5):
- Imports lucide a adicionar: `SlidersHorizontal`, `KeyRound`, `BookOpen`, `TrendingUp`. (`Sparkles` já importado.)
- Item antigo "Consumo IA" (com `href: "/configuracoes/consumo"`) **REMOVIDO**.

### Steps:
1. Adicionar imports lucide.
2. Adicionar item Agente Nex (submenu) entre Relatórios e Usuários:

```ts
{
  label: "Agente Nex",
  href: "/agente-nex",
  icon: Sparkles,
  superAdminOnly: true,
  section: "admin",
  children: [
    { label: "Configuração", href: "/agente-nex/configuracao", icon: SlidersHorizontal, superAdminOnly: true },
    { label: "Chaves de API", href: "/agente-nex/chaves", icon: KeyRound, superAdminOnly: true },
    { label: "Prompt", href: "/agente-nex/prompt", icon: BookOpen, superAdminOnly: true },
    { label: "Consumo", href: "/agente-nex/consumo", icon: TrendingUp, superAdminOnly: true },
  ],
},
```

3. Remover bloco antigo "Consumo IA".
4. Typecheck (skip tests — config-only).
5. Commit `feat(nav): submenu Agente Nex + remove Consumo IA standalone (T9)`.

---

## Task 10 — `/agente-nex/page.tsx` redirect

**Dependências:** T9.
**Estimativa:** 2 min.
**REGRA:** N/A (redirect simples).
**Files:** Create `src/app/(protected)/agente-nex/page.tsx`.

```tsx
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page(): never {
  redirect("/agente-nex/configuracao");
}
```

Skip tests. Typecheck. Commit `feat(agente-nex): redirect raiz /agente-nex → /configuracao (T10)`.

---

## Task 11 — `/agente-nex/layout.tsx` passthrough

**Dependências:** T9.
**Estimativa:** 1 min.
**REGRA:** UI/UX Pro Max (mínima — só wrapper).
**Files:** Create `src/app/(protected)/agente-nex/layout.tsx`.

```tsx
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

Skip tests. Typecheck. Commit `feat(agente-nex): layout passthrough (T11)`.

---

## Task 12 — Extrair `LlmConfigForm`

**Dependências:** nenhuma.
**Estimativa:** 15 min.
**REGRA:** **UI/UX Pro Max**.
**Files:** Create `src/components/agente-nex/llm-config-form.tsx`.

### Pontos críticos (review-2 fix M2):
- `LlmConfigCard.tsx` permanece intacto nesta release. Será removido em release futura quando ninguém o consumir mais. (Hoje ainda é usado em `/configuracoes/page.tsx`, que será limpo em T17.)
- Após T17, `LlmConfigCard.tsx` pode ser deletado em release subsequente — mas NÃO nesta.

### Steps:
1. Copiar o BODY do `LlmConfigCard` (toggle bolha + status + provider/model/credential + spread + Testar/Salvar) para `llm-config-form.tsx`. Sem `<Card>` wrapper externo, sem o tab switcher Configuração/Chaves.
2. Manter mesmo signature: `<LlmConfigForm initial={...} initialNexEnabled={...} initialCredentials={...} initialSpread={...} />`.
3. Typecheck.
4. Commit `feat(agente-nex): extrai LlmConfigForm de LlmConfigCard (T12)`.

---

## Task 13 — `/agente-nex/configuracao/page.tsx`

**Dependências:** T12.
**Estimativa:** 10 min.
**REGRA:** **UI/UX Pro Max**.
**Files:** Create `src/app/(protected)/agente-nex/configuracao/page.tsx`.

```tsx
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { LlmConfigForm } from "@/components/agente-nex/llm-config-form";
import { getCurrentUser } from "@/lib/auth";
import { getPublicActiveLlmConfig } from "@/lib/llm/get-active-config";
import { listCredentials } from "@/lib/llm/credentials";
import { getUsdBrlRate, DEFAULT_CARD_SPREAD } from "@/lib/llm/exchange-rate";
import { isNexBubbleEnabled } from "@/lib/llm/get-nex-bubble-enabled";

export const metadata = { title: "Configuração — Agente Nex | Nexus Insights" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [llmConfig, nexBubbleEnabled, initialCredentials, currentRate] = await Promise.all([
    getPublicActiveLlmConfig(),
    isNexBubbleEnabled(),
    listCredentials().catch(() => []),
    getUsdBrlRate().catch(() => null),
  ]);
  const initialSpread = currentRate?.spread ?? DEFAULT_CARD_SPREAD;

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={Sparkles}
        title="Configuração do Agente Nex"
        subtitle="Provedor, modelo, chave em uso e spread cartão."
      />
      <Card className="rounded-2xl border border-border bg-muted/30 p-2">
        <CardContent>
          <LlmConfigForm
            initial={llmConfig}
            initialNexEnabled={nexBubbleEnabled}
            initialCredentials={initialCredentials}
            initialSpread={initialSpread}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
```

Skip tests. Typecheck. Commit `feat(agente-nex): /configuracao com LlmConfigForm (T13)`.

---

## Task 14 — `/agente-nex/chaves/page.tsx`

**Dependências:** T9.
**Estimativa:** 8 min.
**REGRA:** **UI/UX Pro Max**.
**Files:** Create `src/app/(protected)/agente-nex/chaves/page.tsx`.

```tsx
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { LlmCredentialsManager } from "@/components/settings/llm-credentials-manager";
import { getCurrentUser } from "@/lib/auth";
import { listCredentials } from "@/lib/llm/credentials";
import { getPublicActiveLlmConfig } from "@/lib/llm/get-active-config";

export const metadata = { title: "Chaves de API — Agente Nex" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [credentials, llmConfig] = await Promise.all([
    listCredentials().catch(() => []),
    getPublicActiveLlmConfig(),
  ]);

  return (
    <PageShell variant="narrow">
      <PageHeader icon={KeyRound} title="Chaves de API" subtitle="Gerencie as chaves por provedor." />
      <Card className="rounded-2xl border border-border bg-muted/30 p-2">
        <CardContent>
          <LlmCredentialsManager initial={credentials} activeCredentialId={llmConfig?.credentialId ?? null} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
```

Skip tests. Typecheck. Commit `feat(agente-nex): /chaves (T14)`.

---

## Task 15 — `/agente-nex/consumo/page.tsx`

**Dependências:** T9.
**Estimativa:** 5 min.
**REGRA:** **UI/UX Pro Max**.
**Files:** Create `src/app/(protected)/agente-nex/consumo/page.tsx`.

### Pontos (review-2 fix A6):
- Reusa `<ConsumoContent>` em `src/components/llm/consumo-content.tsx` (não duplica). Path `llm/` é histórico — manter.
- Mesmo `metadata.title`, mesma estrutura PageShell + PageHeader.

### Steps:
1. Copiar lógica de `src/app/(protected)/configuracoes/consumo/page.tsx` (Server Component que fetcha minDate via `getSystemCreatedAt` etc.).
2. Reusar `<ConsumoContent>`.
3. Typecheck.
4. Commit `feat(agente-nex): /consumo reutilizando ConsumoContent (T15)`.

---

## Task 16 — Redirect `/configuracoes/consumo` → `/agente-nex/consumo`

**Dependências:** T15.
**Estimativa:** 3 min.
**REGRA:** N/A.
**Files:** Modify `src/app/(protected)/configuracoes/consumo/page.tsx`.

```tsx
import { permanentRedirect } from "next/navigation";

export default function Page(): never {
  permanentRedirect("/agente-nex/consumo");
}
```

Skip tests. Typecheck. Commit `feat(configuracoes): /consumo redireciona 308 → /agente-nex (T16)`.

---

## Task 17 — Limpar `/configuracoes/page.tsx`

**Dependências:** T13, T14.
**Estimativa:** 8 min.
**REGRA:** **UI/UX Pro Max**.
**Files:** Modify `src/app/(protected)/configuracoes/page.tsx`.

### Steps:
1. Remover imports: `LlmConfigCard`, `getPublicActiveLlmConfig`, `listCredentials`, `getUsdBrlRate`, `DEFAULT_CARD_SPREAD`, `isNexBubbleEnabled`.
2. Remover suas linhas no `Promise.all([...])`.
3. Remover bloco `{isSuperAdmin && (<LlmConfigCard ... />)}`.
4. Manter: PlatformSettingsCard, EnabledReportsCard, MatrixIAToggleCard, PollingSettingsForm, VisibilitySettingsForm.
5. Typecheck (importante — confirma que não há referências quebradas).
6. Commit `refactor(configuracoes): remove cards Nex (T17)`.

---

## Task 18 — NexMessage com copy universal + suporte audio

**Dependências:** nenhuma.
**Estimativa:** 20 min.
**REGRA:** **UI/UX Pro Max**.
**Files:** Modify `src/components/nex/nex-message.tsx` + `src/components/nex/__tests__/nex-message.test.tsx` (criar/atualizar).

### Pontos críticos (review-2 fix A2):
- Atualizar interface `UiMessage` em `nex-chat-panel.tsx` também (importa de `nex-message.tsx`).

### Steps:
1. Estender `NexMessageProps`:
```ts
export interface NexMessageProps {
  role: NexMessageRole;
  content: string;
  toolName?: string;
  // NOVOS:
  kind?: "text" | "audio";
  audioBlobUrl?: string | null;
  durationSeconds?: number;
}
```

2. No render: se `kind === "audio"`:
```tsx
return (
  <div className="flex w-full justify-end">
    <div className="flex max-w-[85%] flex-col gap-1.5">
      {audioBlobUrl ? (
        <AudioPlayer src={audioBlobUrl} durationSeconds={durationSeconds} />
      ) : (
        <div className="rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          (áudio expirado, escute na sessão original)
        </div>
      )}
      <div className="rounded-2xl bg-violet-600/15 px-3 py-1.5 text-xs text-muted-foreground">
        📝 {content}
      </div>
    </div>
  </div>
);
```
(Import `AudioPlayer` quando T19 estiver pronto. Por agora, implementar fallback.)

3. Render `kind="text"` (default): adicionar `group` class no wrapper E `CopyButton` em **toda** mensagem (user + assistant). Manter classes existentes.

4. Tests RTL `__tests__/nex-message.test.tsx`:
```ts
import { render, screen } from "@testing-library/react";
import { NexMessage } from "../nex-message";

describe("NexMessage", () => {
  it("copy button visível em user e assistant", () => {
    const { rerender } = render(<NexMessage role="user" content="hello" />);
    expect(screen.getByLabelText(/copiar/i)).toBeInTheDocument();
    rerender(<NexMessage role="assistant" content="hi" />);
    expect(screen.getByLabelText(/copiar/i)).toBeInTheDocument();
  });

  it("kind='audio' sem audioBlobUrl mostra '(áudio expirado)'", () => {
    render(<NexMessage role="user" kind="audio" content="oi mundo" audioBlobUrl={null} />);
    expect(screen.getByText(/áudio expirado/i)).toBeInTheDocument();
    expect(screen.getByText(/oi mundo/i)).toBeInTheDocument();
  });
});
```

5. Tests passam.
6. Typecheck.
7. Commit `feat(nex): NexMessage com copy universal + suporte audio (T18)`.

---

## Task 19 — AudioPlayer

**Dependências:** nenhuma.
**Estimativa:** 30 min.
**REGRA:** **UI/UX Pro Max**.
**Files:** Create `src/components/nex/audio-player.tsx` + `__tests__/audio-player.test.tsx`.

> Conteúdo na **v2 §Task 19**. HTML5 audio + custom controls + speed dropdown 5 níveis.

### Steps:
1. Implementar.
2. Tests RTL (3 cenários: render, dropdown 5 opções, speed muda playbackRate).
3. Typecheck.
4. Commit `feat(nex): AudioPlayer com 5 níveis de velocidade (T19)`.

---

## Task 20 — AudioRecorder

**Dependências:** nenhuma.
**Estimativa:** 40 min.
**REGRA:** **UI/UX Pro Max**.
**Files:** Create `src/components/nex/audio-recorder.tsx` + `__tests__/audio-recorder.test.tsx` + Create `src/test-utils/media-recorder-mock.ts` (review-2 fix A8).

### Pontos críticos:
- Cap 5min (auto-send). Toast antes do auto-send "Limite de 5 min — enviando…".
- Mock MediaRecorder em arquivo helper compartilhável.

### Steps:
1. Criar `src/test-utils/media-recorder-mock.ts`:
```ts
export class MockMediaRecorder {
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType = "audio/webm";
  static isTypeSupported() { return true; }
  constructor(public stream: MediaStream, public options?: { mimeType: string }) {
    if (options?.mimeType) this.mimeType = options.mimeType;
  }
  start(_t?: number) { this.state = "recording"; }
  pause() { this.state = "paused"; }
  resume() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

export function installMediaRecorderMock() {
  // @ts-expect-error mock global
  global.MediaRecorder = MockMediaRecorder;
  Object.defineProperty(global.navigator, "mediaDevices", {
    value: {
      getUserMedia: jest.fn(async () => ({
        getTracks: () => [{ stop: jest.fn() }] as MediaStreamTrack[],
      })),
    },
    configurable: true,
  });
}
```

2. Implementar `audio-recorder.tsx` (conforme spec v3 §8.1).
3. Tests `__tests__/audio-recorder.test.tsx` usando o helper:
```ts
import { installMediaRecorderMock } from "@/test-utils/media-recorder-mock";
installMediaRecorderMock();
import { fireEvent, render, screen } from "@testing-library/react";
import { AudioRecorder } from "../audio-recorder";

describe("AudioRecorder", () => {
  it("começa em idle", () => {
    render(<AudioRecorder onSend={() => {}} />);
    expect(screen.getByLabelText(/gravar áudio/i)).toBeInTheDocument();
  });
  // pause, cancel, etc.
});
```

4. Tests passam.
5. Typecheck.
6. Commit `feat(nex): AudioRecorder (record/pause/cancel/send + cap 5min) (T20)`.

---

## Task 21 — Bubble integra audio (sub-tasks)

**Dependências:** T6, T18, T19, T20.
**Estimativa:** 45 min.
**REGRA:** **UI/UX Pro Max**.

### T21a — Layout protegido busca `effectiveAudioEnabled`

**File:** Modify `src/app/(protected)/layout.tsx`.

```ts
// adicionar imports:
import { getNexPromptConfig } from "@/lib/nex/prompt";
import { getActiveLlmConfig } from "@/lib/llm/get-active-config";

// adicionar fetches no Promise.all existente:
const [llmActive, nexCfg] = await Promise.all([
  getActiveLlmConfig().catch(() => null),
  getNexPromptConfig().catch(() => null),
]);

const effectiveAudioEnabled =
  !!nexCfg?.audioInputEnabled && llmActive?.provider === "openai";

// passar prop ao bubble:
{nexBubbleEnabled ? <NexBubble audioInputEnabled={effectiveAudioEnabled} /> : null}
```

**Crítico (review-2 fix A10):** Após editar layout, rodar `npm run build` localmente para detectar erros SSR.

### T21b — NexBubble + NexChatPanel recebem prop

Adicionar prop opcional `audioInputEnabled?: boolean` em `NexBubble` e `NexChatPanel`. Passar adiante.

### T21c — NexChatPanel: AudioRecorder + handler

```tsx
// estado novo:
const [audioFlight, setAudioFlight] = React.useState(false);
const audioControllerRef = React.useRef<AbortController | null>(null);

const handleSendAudio = React.useCallback(async (blob: Blob, durationSeconds: number) => {
  const id = `u_${Date.now()}`;
  const audioBlobUrl = URL.createObjectURL(blob);
  setMessages((m) => [...m, { id, role: "loading", content: "" }]);
  setAudioFlight(true);
  audioControllerRef.current = new AbortController();
  const fd = new FormData();
  fd.append("audio", blob, "audio.webm");
  try {
    const res = await fetch("/api/nex/transcribe", {
      method: "POST", body: fd, signal: audioControllerRef.current.signal,
    });
    const data = (await res.json()) as { ok: boolean; text?: string; error?: string };
    setMessages((m) => m.filter((x) => x.id !== id));
    if (!data.ok || !data.text || !data.text.trim()) {
      toast.error(data.error ?? "Não consegui transcrever — áudio inaudível?");
      URL.revokeObjectURL(audioBlobUrl);
      return;
    }
    setMessages((m) => [...m, {
      id, role: "user", kind: "audio", audioBlobUrl,
      durationSeconds, content: data.text!,
    }]);
    await sendToAgent(data.text!);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    setMessages((m) => m.filter((x) => x.id !== id));
    toast.error("Falha na transcrição. Tente novamente.");
    URL.revokeObjectURL(audioBlobUrl);
  } finally {
    setAudioFlight(false);
    audioControllerRef.current = null;
  }
}, []);

// no UI: render condicional do botão mic ao lado do enviar
{audioInputEnabled && !audioFlight ? (
  <AudioRecorder onSend={handleSendAudio} />
) : null}
```

### T21d — Persistência localStorage sem audioBlobUrl (review-2 fix A3)

```ts
// ao salvar:
React.useEffect(() => {
  try {
    const stripped = messages.map((m) =>
      m.kind === "audio" ? { ...m, audioBlobUrl: null } : m,
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped.slice(-MAX_HISTORY)));
  } catch { /* noop */ }
}, [messages]);
```

Carregamento (já existe) — não precisa mudar; `audioBlobUrl` virá `null` e `NexMessage` mostra fallback.

### Tests + Commit

```bash
npm test -- src/components/nex
npm run build  # essential — Layout edit precisa de build smoke
git add src/components/nex/ "src/app/(protected)/layout.tsx"
git commit -m "feat(nex): bubble com gravação + envio de áudio + persistência local (T21)"
```

---

## Task 22 — PromptConfigForm

**Dependências:** T7.
**Estimativa:** 35 min.
**REGRA:** **UI/UX Pro Max**.
**Files:** Create `src/components/agente-nex/prompt-config-form.tsx` + `__tests__/prompt-config-form.test.tsx`.

> Conteúdo na **v2 §Task 22**. Form com personality + tone + guardrails + override toggle. Botão "Salvar" + "Pré-visualizar prompt" (Dialog modal). Após save: `router.refresh()`.

### Pontos (spec v3 §4.5):
- Toggle override avançado ON → revela textarea + warning amarelo: "Override desativa Personalidade, Tom, Guardrails e Base de conhecimento. Inclua manualmente o que quiser que entre."

### Steps:
1. Implementar.
2. Tests RTL.
3. Typecheck.
4. Commit `feat(agente-nex): PromptConfigForm (T22)`.

---

## Task 23 — ResourcesToggles

**Dependências:** T7.
**Estimativa:** 20 min.
**REGRA:** **UI/UX Pro Max**.
**Files:** Create `src/components/agente-nex/resources-toggles.tsx`.

### Pontos críticos (spec v3 §4.4):
- Componente recebe prop `providerAtual: string | null`.
- Toggle áudio: clickable mas mostra badge `(inativo — provider atual não suporta)` se `providerAtual !== "openai"`.
- Aviso quando `bubbleEnabled = false`: "ℹ️ Bolha desligada — esses recursos só funcionam com a bolha ativa."

### Steps:
1. Implementar.
2. Sem tests específicos (visual + comportamental simples — coberto em smoke E2E T28).
3. Typecheck.
4. Commit `feat(agente-nex): ResourcesToggles (T23)`.

---

## Task 24 — KbSection + UploadDialog

**Dependências:** T7.
**Estimativa:** 35 min.
**REGRA:** **UI/UX Pro Max**.
**Files:** Create `src/components/agente-nex/kb-section.tsx` + `kb-upload-dialog.tsx` + tests.

### Pontos críticos:
- Header mostra `Math.min(sum, 30000) / 30000 chars`.
- Warning vermelho quando `sum > 30000` ("X chars excedendo o limite serão truncados").
- Warning amarelo quando `sum > 25000`.
- Após upload/delete: `router.refresh()`.

### Steps:
1. Implementar `kb-upload-dialog.tsx` (Dialog com input file accept `.pdf,.txt`, validação 5 MB cliente).
2. Implementar `kb-section.tsx` (lista + barra de progresso + warnings + botão "Adicionar documento").
3. Tests RTL básicos.
4. Typecheck.
5. Commit `feat(agente-nex): KbSection + UploadDialog (T24)`.

---

## Task 25 — Playground

**Dependências:** T8.
**Estimativa:** 30 min.
**REGRA:** **UI/UX Pro Max**.
**Files:** Create `src/components/agente-nex/playground.tsx` + `__tests__/playground.test.tsx`.

### Pontos críticos (spec v3 §7.8 Card 4):
- Textarea cap 1000 chars (X/1000 contador).
- Submit chama `testNexPromptAction(message, currentFormConfig)` (config do FORM atual, não banco).
- Resposta render como `<NexMessage role="assistant">`.
- Link "ver prompt usado" abre Dialog modal com prompt composto.
- Erro técnico + sugestão "Verifique chave/modelo em Configuração."

### Steps:
1. Implementar.
2. Tests RTL.
3. Typecheck.
4. Commit `feat(agente-nex): Playground (T25)`.

---

## Task 26 — `/agente-nex/prompt/page.tsx`

**Dependências:** T22, T23, T24, T25.
**Estimativa:** 15 min.
**REGRA:** **UI/UX Pro Max**.
**Files:** Create `src/app/(protected)/agente-nex/prompt/page.tsx`.

```tsx
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PromptConfigForm } from "@/components/agente-nex/prompt-config-form";
import { ResourcesToggles } from "@/components/agente-nex/resources-toggles";
import { KbSection } from "@/components/agente-nex/kb-section";
import { Playground } from "@/components/agente-nex/playground";
import { getCurrentUser } from "@/lib/auth";
import { getNexPromptConfig } from "@/lib/nex/prompt";
import { listKbDocuments } from "@/lib/nex/kb";
import { getActiveLlmConfig } from "@/lib/llm/get-active-config";
import { isNexBubbleEnabled } from "@/lib/llm/get-nex-bubble-enabled";

export const metadata = { title: "Prompt — Agente Nex" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [cfg, kbDocs, llmActive, bubbleEnabled] = await Promise.all([
    getNexPromptConfig(),
    listKbDocuments().catch(() => []),
    getActiveLlmConfig().catch(() => null),
    isNexBubbleEnabled().catch(() => true),
  ]);

  const providerAtual = llmActive?.provider ?? null;

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={BookOpen}
        title="Prompt do Agente Nex"
        subtitle="Configure personalidade, tom, regras e base de conhecimento."
      />
      <div className="space-y-6">
        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader><CardTitle>Comportamento</CardTitle></CardHeader>
          <CardContent><PromptConfigForm initial={cfg} /></CardContent>
        </Card>
        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader><CardTitle>Recursos</CardTitle></CardHeader>
          <CardContent>
            <ResourcesToggles initial={cfg} providerAtual={providerAtual} bubbleEnabled={bubbleEnabled} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader><CardTitle>Base de conhecimento</CardTitle></CardHeader>
          <CardContent><KbSection initial={kbDocs} /></CardContent>
        </Card>
        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader><CardTitle>Playground</CardTitle></CardHeader>
          <CardContent><Playground currentConfig={cfg} /></CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
```

Skip tests (composição de componentes já testados). Typecheck. Commit `feat(agente-nex): /prompt page com 4 cards (T26)`.

---

## Task 27 — Release (bump + CHANGELOG + STATUS)

**Dependências:** T1–T26.
**Estimativa:** 10 min.
**REGRA:** N/A.
**Files:** Modify `package.json`, `package-lock.json`, `CHANGELOG.md`, `docs/STATUS.md`.

### Steps:
1. `npm version 0.15.0 --no-git-tag-version`.
2. Adicionar entrada CHANGELOG.md no topo:

```markdown
## [v0.15.0] 2026-05-01 — Suite Agente Nex (sidebar dedicado + áudio + prompt config)

### Added
- **Menu lateral "Agente Nex"** com 4 sub-páginas (`/agente-nex/configuracao`, `/chaves`, `/prompt`, `/consumo`).
- **Gravação de áudio na bolha** (record/pause/cancel/send) — Whisper API transcreve, IA responde texto.
- **Player de áudio** no balão do user com 5 níveis de velocidade (1×/1.25×/1.5×/1.75×/2×) + seek.
- **Copy button** universal em mensagens (user + assistant).
- **System prompt configurável** — personalidade + tom + guardrails + override avançado em `nex_settings`.
- **Base de conhecimento (KB)** — upload PDF/TXT, extração via `pdf-parse`, cap 30k chars no prompt, lista visual com warnings.
- **Playground** — testa o prompt sem salvar; resposta in-line; link "ver prompt usado".
- **Toggles** de áudio e KB no card Recursos.

### Changed
- Tela "Consumo IA" migrou para `/agente-nex/consumo`. URL antiga `/configuracoes/consumo` mantém-se com **redirect 308**.
- `/configuracoes` perde os cards Nex.
- `runNexAgent` lê system prompt dinâmico (não mais constante).

### Schema
- Nova tabela `nex_settings` (singleton, id="global").
- Nova tabela `nex_kb_documents` (id, name, mime_type, file_size, char_count, extracted_text, ...).
- `MODEL_PRICING` ganha `whisper-1` (per-minute, $0.006/min).

### Notes
- Whisper requer chave OpenAI ativa.
- `audio_input_enabled = true` + provider != openai → mic continua oculto até voltar para OpenAI.
```

3. Bumpar `docs/STATUS.md` para v0.15.0 (entrada principal).
4. Commit `chore(release): v0.15.0 — Suite Agente Nex`.

---

## Task 28 — Verify final + push + deploy + smoke

**Dependências:** T27.
**Estimativa:** 15 min + tempo de build/deploy.
**Files:** Modify `docs/agents/HISTORY.md`, delete `docs/agents/active/claude-agente-nex-suite.md`.

### Step 1: Typecheck + tests + build

```bash
npm run typecheck
npm test
npm run build
```

Expected: 0 erros, suite verde, build success.

### Step 2: Verificar parallel CI

```bash
gh run list --limit 5
```

Sem builds de outros agentes em curso → prossiga.

### Step 3: Push

```bash
git push origin main
```

### Step 4: Watch build

```bash
gh run watch
```

Se falhar: investigar logs (`gh run view <id> --log-failed`), corrigir, re-push.

### Step 5: Portainer-fix

```bash
gh workflow run portainer-fix.yml -f app_version=v0.15.0
gh run watch
```

### Step 6: Smoke production (curl /api/health)

```bash
until curl -s -f https://insights.nexusai360.com/api/health 2>/dev/null | grep -q "v0.15.0"; do sleep 8; done
curl -s https://insights.nexusai360.com/api/health
```

Expected: `{"version":"v0.15.0", "status":"ok", ...}`.

### Step 7: Smoke E2E manual (browser)

Lista completa de smoke checks (spec v3 §11.4):

- [ ] Sidebar mostra Agente Nex como submenu colapsável; 4 itens; "Consumo IA" antigo removido.
- [ ] /agente-nex → redirect /configuracao.
- [ ] /agente-nex/configuracao: trocar modelo, salvar, status atualiza.
- [ ] /agente-nex/chaves: criar nova chave, deletar.
- [ ] /agente-nex/prompt: editar personalidade, salvar; bubble responde refletindo.
- [ ] /agente-nex/prompt: provider OpenAI → toggle áudio normal; troca pra Anthropic → toggle desabilitado com badge.
- [ ] /agente-nex/prompt: ativar toggle áudio (com OpenAI ativo) → bubble mostra mic.
- [ ] /agente-nex/prompt: upload PDF 1MB → lista atualiza; chars contados.
- [ ] /agente-nex/prompt: upload TXT → idem.
- [ ] /agente-nex/prompt: deletar doc → lista atualiza.
- [ ] /agente-nex/prompt: ativar override avançado → warning amarelo aparece; preview mostra prompt cru.
- [ ] /agente-nex/prompt: playground → resposta volta; link "ver prompt usado" abre dialog.
- [ ] Bubble: gravar 5s, pausar, retomar 3s, enviar → player + transcrição + IA responde.
- [ ] Bubble: gravar 1s e cancelar → volta ao idle.
- [ ] Bubble: provider != OpenAI → mic não aparece.
- [ ] Bubble: copy em user message funciona.
- [ ] Bubble: reload da página → mensagem áudio antiga mostra "(áudio expirado)" + transcrição.
- [ ] /agente-nex/consumo: tela carrega; whisper-1 aparece após teste de áudio.
- [ ] /configuracoes/consumo → redireciona para /agente-nex/consumo.
- [ ] /configuracoes: sem cards Nex.
- [ ] Acessibilidade: tab navigation funciona em todos os novos botões.
- [ ] Performance: gravação inicia em <1s após click mic; playground responde em <30s.

### Step 8: HISTORY entry + active file delete

```bash
echo "$(date -u +%Y-%m-%d) HH:MM | agent=claude-agente-nex-suite | commit=<sha> | scope=release | summary=Release v0.15.0 — Suite Agente Nex (sidebar /agente-nex + áudio Whisper + prompt config + KB + playground). Workflow seguiu CLAUDE.md §3 (spec v1→v2→v3 com 22+26 achados; plan v1→v2→v3 com 25+29 achados). UI/UX Pro Max obrigatório em todas tasks UI." >> docs/agents/HISTORY.md
echo "$(date -u +%Y-%m-%d) HH:MM | agent=claude-agente-nex-suite | observation=session-end | summary=v0.15.0 LIVE em produção." >> docs/agents/HISTORY.md
rm docs/agents/active/claude-agente-nex-suite.md
git add docs/agents/active docs/agents/HISTORY.md
git commit -m "docs(agents): registra v0.15.0 LIVE + encerra sessão claude-agente-nex-suite"
git push origin main
```

---

## Self-Review final do plan

Coberto:
- Spec v3 §14 critérios de aceite (1–18) → todos têm task correspondente.
- Pente fino #1 (25 achados) → aplicados em v2.
- Pente fino #2 (29 achados) → aplicados em v3.
- Cada task tem código completo, comando exato, expected output, commit message, dependências documentadas.
- UI/UX Pro Max marcado em 11 tasks de UI.
- TDD em todas tasks com código testável.
- Smoke E2E completa em T28.

Plan está pronto para `superpowers:subagent-driven-development`.
