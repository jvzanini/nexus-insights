# Suite Agente Nex Polish v4 (v0.27.0) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 6 bugs/má-UX da v0.26 (Editar abre tela errada, Prompt em collapse desnecessário, Playground input bar feio, Playground sem histórico, AudioPlayer speed tag vazando, Dialog "Ver prompt usado" não aparece).

**Architecture:** Mudanças cirúrgicas + 1 schema additive (column `identity_base` em nex_settings). Playground simplifica drasticamente trocando `testNexPromptAction` (sem tools/histórico) por `sendNexMessage` (mesmo path da bubble). PromptPreviewCard ganha dependência interna nova (IdentityBaseEditor); collapse removido.

**Tech Stack:** Next.js 16 · TypeScript · base-ui Dialog/Sheet · Tailwind v4 · NextAuth v5 · PostgreSQL · Lucide React · Jest + jest-mock-extended.

---

## Convenções (mantidas)

- **Antes de qualquer task UI:** subagente invoca `ui-ux-pro-max:ui-ux-pro-max` via Skill tool. Não negociável.
- **TDD:** RED → GREEN → COMMIT.
- **Commits granulares:** 1 task = 1 commit. Padrão `feat(agente-nex): T-<N> v0.27 — <subject>` ou `fix(agente-nex): T-<N> v0.27 — <subject>`.

---

## Mapa de arquivos

### Grupo E1 — IDENTITY_BASE editável (foundation)
- **Modify:** `src/lib/nex/ensure-tables.ts` — column `identity_base TEXT NULL` em `nex_settings` (ALTER TABLE ADD COLUMN IF NOT EXISTS).
- **Modify:** `src/lib/nex/prompt-compose.ts` — `NexPromptConfig.identityBase?: string | null`. Função `composeSystemPrompt` usa `cfg.identityBase ?? IDENTITY_BASE` no início do array `parts`.
- **Modify:** `src/lib/nex/prompt.ts` — `getNexPromptConfig` lê `identity_base` do row; `saveNexPromptConfig` persiste (NULL = restaurar default).
- **Modify:** `src/lib/actions/nex-prompt.ts` — Server Actions novas: `saveIdentityBaseAction(text: string | null)` e `resetIdentityBaseAction()`. Super_admin gate.
- **Test:** `src/lib/nex/__tests__/prompt-compose.test.ts` (existente — adicionar caso identityBase override); `src/lib/actions/__tests__/nex-prompt.test.ts` (novo — saveIdentityBase tests).

### Grupo E2 — PromptPreviewCard sem collapse + IdentityBaseEditor
- **Modify:** `src/components/agente-nex/prompt-preview-card.tsx` — remove state `showFull` + collapse button + chevron. `<pre>` sempre visível. Remove import `PromptConfigForm`. Trocar Dialog max-edit pra renderizar `<IdentityBaseEditor>` em vez de PromptConfigForm.
- **Create:** `src/components/agente-nex/identity-base-editor.tsx` — Textarea grande (max-h 60vh) com IDENTITY_BASE atual + botão "Restaurar padrão" (reset pro hardcoded) + Salvar. Aceita `current: string` (vem do server) + `onSaved: () => void`.
- **Modify:** `src/app/(protected)/agente-nex/prompt/page.tsx` — passa `currentIdentityBase` (do cfg.identityBase || IDENTITY_BASE).
- **Test:** `src/components/agente-nex/__tests__/prompt-preview-card.test.tsx` (existente — atualizar); `src/components/agente-nex/__tests__/identity-base-editor.test.tsx` (novo).

### Grupo E3 + E4 — PlaygroundSheet input bar = bubble + sendNexMessage com histórico
- **Modify:** `src/components/agente-nex/playground-sheet.tsx`:
  - Substitui `<SheetFooter>` por `<footer>` HTML (igual nex-chat-panel) — placement não-sticky, layout idêntico, counter inline.
  - Placeholder "Pergunte ao agente Nex".
  - `submitMessage(text)` chama `sendNexMessage([...history, { user: text }])` (não mais `testNexPromptAction`).
  - Histórico construído de `items` (filtra user/assistant; ignora loading/system).
  - Mantém Mic + AudioRecorder + Send violet do v0.26.
- **Test:** `src/components/agente-nex/__tests__/playground-sheet.test.tsx` (atualizar mocks: troca testNexPromptAction por sendNexMessage; verifica histórico passado).

### Grupo E5 — AudioPlayer speed tag compacta
- **Modify:** `src/components/nex/audio-player.tsx` — speed button: `h-5 min-w-[34px] px-1 text-[9px]` (era h-6 min-w-[44px] px-1.5 text-[11px]). Cabe no balão violet.
- **Test:** sanity test caso exista (`src/components/nex/__tests__/audio-player.test.tsx` se houver assertions de className).

### Grupo E6 — Dialog "Ver prompt usado" fix (debug-driven)
- **Investigate:** ler `playground-sheet.tsx` + entender por que Dialog não aparece. Provável causa: o `previewSystemPromptAction` falha (no E4 talvez nem use mais — confirmar). Solução baseada em achado:
  - (a) Se preview action falha silenciosamente: expor `result.error` via `toast.error` antes de `setPreviewOpen(true)`.
  - (b) Se Sheet captura focus impedindo Dialog abrir: usar Portal explícito + z-[60] reconfirmar.
  - (c) Se Sheet z-50 está sobrepondo Dialog overlay z-[60]: forçar Dialog overlay z-[70].

### Release files
- `package.json` (0.26 → 0.27)
- `CHANGELOG.md`
- `docs/STATUS.md`
- `docs/agents/HISTORY.md`

---

## Tasks

### Task E1a: ensure-tables — column identity_base

**Files:**
- Modify: `src/lib/nex/ensure-tables.ts`
- Test: `src/lib/nex/__tests__/ensure-tables.test.ts`

- [ ] **Step 1: Skill ui-ux-pro-max** — não aplica.

- [ ] **Step 2: Write failing test**

Adicionar a `src/lib/nex/__tests__/ensure-tables.test.ts`:

```typescript
describe("ensure-tables — identity_base column (v0.27)", () => {
  it("adiciona column identity_base TEXT NULL via IF NOT EXISTS (idempotente)", async () => {
    const { mockedPgPool } = setupMocks();
    await ensureNexTables();
    const alterCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).match(/ADD COLUMN IF NOT EXISTS\s+"?identity_base/i),
    );
    expect(alterCall).toBeDefined();
    expect(String(alterCall![0])).toMatch(/TEXT/i);
  });
});
```

- [ ] **Step 3: Run RED**

```bash
npm test -- ensure-tables
```

- [ ] **Step 4: Edit ensure-tables.ts**

Adicionar dentro de `createTables()` (após o ALTER do `seeded_v2_at`):

```typescript
// v0.27.0: identity_base column — NULL = usa default hardcoded em prompt-compose.ts
await pgPool.query(`
  ALTER TABLE "nex_settings"
    ADD COLUMN IF NOT EXISTS "identity_base" TEXT NULL;
`);
```

- [ ] **Step 5: Run GREEN**

```bash
npm test -- ensure-tables
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/nex/ensure-tables.ts src/lib/nex/__tests__/ensure-tables.test.ts
git commit -m "feat(agente-nex): T-E1a v0.27 — column identity_base TEXT NULL em nex_settings"
```

---

### Task E1b: prompt-compose suporta identityBase override

**Files:**
- Modify: `src/lib/nex/prompt-compose.ts`
- Test: `src/lib/nex/__tests__/prompt-compose.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe("composeSystemPrompt — identityBase override (v0.27)", () => {
  it("usa cfg.identityBase quando setado (não hardcoded IDENTITY_BASE)", () => {
    const out = composeSystemPrompt(
      {
        identityBase: "Você é um agente custom.",
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
    expect(out).toMatch(/Você é um agente custom\./);
    expect(out).not.toMatch(/Você é o Agente Nex —/);
  });

  it("usa IDENTITY_BASE default quando cfg.identityBase é null/undefined", () => {
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
    expect(out).toMatch(/Você é o Agente Nex —/);
  });
});
```

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Edit prompt-compose.ts**

```typescript
export interface NexPromptConfig {
  identityBase: string | null; // v0.27: null = usa IDENTITY_BASE hardcoded
  personality: string;
  tone: string;
  guardrails: string[];
  advancedOverride: string | null;
  audioInputEnabled: boolean;
  kbEnabled: boolean;
}
```

E na função `composeSystemPrompt`, trocar a linha `const parts: string[] = [IDENTITY_BASE];` por:

```typescript
const baseIdentity =
  cfg.identityBase && cfg.identityBase.trim().length > 0
    ? cfg.identityBase
    : IDENTITY_BASE;
const parts: string[] = [baseIdentity];
```

- [ ] **Step 4: Run GREEN**

- [ ] **Step 5: Commit**

```bash
git add src/lib/nex/prompt-compose.ts src/lib/nex/__tests__/prompt-compose.test.ts
git commit -m "feat(agente-nex): T-E1b v0.27 — composeSystemPrompt aceita identityBase override (NULL=default hardcoded)"
```

---

### Task E1c: prompt.ts persiste identity_base + Server Actions

**Files:**
- Modify: `src/lib/nex/prompt.ts`
- Modify: `src/lib/actions/nex-prompt.ts`
- Test: `src/lib/actions/__tests__/nex-prompt.test.ts` (criar se não existir)

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/actions/__tests__/nex-prompt.test.ts
import { saveIdentityBaseAction, resetIdentityBaseAction } from "../nex-prompt";

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));
jest.mock("@/lib/nex/prompt", () => ({
  ...jest.requireActual("@/lib/nex/prompt"),
  saveNexPromptConfig: jest.fn(),
  getNexPromptConfig: jest.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import { saveNexPromptConfig, getNexPromptConfig } from "@/lib/nex/prompt";

describe("saveIdentityBaseAction", () => {
  beforeEach(() => jest.clearAllMocks());

  it("super_admin: persiste identity_base no DB", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ platformRole: "super_admin", id: "u1" });
    (getNexPromptConfig as jest.Mock).mockResolvedValue({
      identityBase: null,
      personality: "",
      tone: "",
      guardrails: [],
      advancedOverride: null,
      audioInputEnabled: false,
      kbEnabled: false,
    });
    const result = await saveIdentityBaseAction("Novo prompt");
    expect(result.ok).toBe(true);
    expect(saveNexPromptConfig).toHaveBeenCalledWith(
      expect.objectContaining({ identityBase: "Novo prompt" }),
      "u1",
    );
  });

  it("não-superadmin: nega", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ platformRole: "viewer" });
    const result = await saveIdentityBaseAction("x");
    expect(result.ok).toBe(false);
  });
});

describe("resetIdentityBaseAction", () => {
  beforeEach(() => jest.clearAllMocks());
  it("super_admin: persiste identityBase=null", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ platformRole: "super_admin", id: "u1" });
    (getNexPromptConfig as jest.Mock).mockResolvedValue({
      identityBase: "custom",
      personality: "",
      tone: "",
      guardrails: [],
      advancedOverride: null,
      audioInputEnabled: false,
      kbEnabled: false,
    });
    const result = await resetIdentityBaseAction();
    expect(result.ok).toBe(true);
    expect(saveNexPromptConfig).toHaveBeenCalledWith(
      expect.objectContaining({ identityBase: null }),
      "u1",
    );
  });
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- nex-prompt.test
```

- [ ] **Step 3: Edit prompt.ts**

Em `getNexPromptConfig`, adicionar `identity_base` ao SELECT e ao return:

```typescript
const r = await pgPool.query<{
  identity_base: string | null;
  personality: string;
  tone: string;
  guardrails: unknown;
  advanced_override: string | null;
  audio_input_enabled: boolean;
  kb_enabled: boolean;
}>(
  `SELECT identity_base, personality, tone, guardrails, advanced_override, audio_input_enabled, kb_enabled
   FROM nex_settings WHERE id = 'global' LIMIT 1`,
);
if (r.rowCount === 0) {
  return {
    identityBase: null,
    personality: "",
    tone: "",
    guardrails: [],
    advancedOverride: null,
    audioInputEnabled: false,
    kbEnabled: true,
  };
}
const row = r.rows[0];
return {
  identityBase: row.identity_base,
  personality: row.personality ?? "",
  tone: row.tone ?? "",
  guardrails: asStrArray(row.guardrails),
  advancedOverride: row.advanced_override,
  audioInputEnabled: !!row.audio_input_enabled,
  kbEnabled: !!row.kb_enabled,
};
```

E em `saveNexPromptConfig`, atualizar o INSERT/UPDATE pra incluir `identity_base`:

```typescript
await pgPool.query(
  `INSERT INTO nex_settings (id, identity_base, personality, tone, guardrails, advanced_override, audio_input_enabled, kb_enabled, updated_at, updated_by_id)
   VALUES ('global', $1, $2, $3, $4::jsonb, $5, $6, $7, NOW(), $8)
   ON CONFLICT (id) DO UPDATE SET
     identity_base = EXCLUDED.identity_base,
     personality = EXCLUDED.personality,
     tone = EXCLUDED.tone,
     guardrails = EXCLUDED.guardrails,
     advanced_override = EXCLUDED.advanced_override,
     audio_input_enabled = EXCLUDED.audio_input_enabled,
     kb_enabled = EXCLUDED.kb_enabled,
     updated_at = NOW(),
     updated_by_id = EXCLUDED.updated_by_id`,
  [
    cfg.identityBase ?? null,
    cfg.personality,
    cfg.tone,
    JSON.stringify(cfg.guardrails),
    cfg.advancedOverride ?? null,
    cfg.audioInputEnabled,
    cfg.kbEnabled,
    updatedById ?? null,
  ],
);
```

(Atenção: o INSERT existente tem 7 placeholders pré-existentes. Insira `identity_base` como $1 e shift os demais.)

- [ ] **Step 4: Edit nex-prompt.ts (Server Actions)**

Adicionar ao final de `src/lib/actions/nex-prompt.ts`:

```typescript
const MAX_IDENTITY_BASE_LEN = 5_000;

export async function saveIdentityBaseAction(
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  if (user.platformRole !== "super_admin") {
    return { ok: false, error: "Sem permissão" };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Identity base não pode ficar vazia" };
  }
  if (trimmed.length > MAX_IDENTITY_BASE_LEN) {
    return { ok: false, error: `Identity base > ${MAX_IDENTITY_BASE_LEN} chars` };
  }
  const current = await getNexPromptConfig();
  await saveNexPromptConfig({ ...current, identityBase: trimmed }, user.id);
  return { ok: true };
}

export async function resetIdentityBaseAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  if (user.platformRole !== "super_admin") {
    return { ok: false, error: "Sem permissão" };
  }
  const current = await getNexPromptConfig();
  await saveNexPromptConfig({ ...current, identityBase: null }, user.id);
  return { ok: true };
}
```

- [ ] **Step 5: Run GREEN**

```bash
npm test -- nex-prompt.test
npm test -- prompt-compose
```

- [ ] **Step 6: Atualizar tests existentes que usam NexPromptConfig** (sem identityBase) — adicionar `identityBase: null` em todos os mocks.

```bash
grep -rln "audioInputEnabled" src/components src/lib/__tests__ src/lib/nex/__tests__ 2>/dev/null | xargs grep -l "advancedOverride: null" 2>/dev/null
```

Em cada arquivo encontrado, adicionar `identityBase: null,` no objeto config (antes de `personality:` ou similar).

- [ ] **Step 7: Commit**

```bash
git add src/lib/nex/prompt.ts src/lib/actions/nex-prompt.ts src/lib/actions/__tests__/nex-prompt.test.ts
# + outros tests atualizados
git commit -m "feat(agente-nex): T-E1c v0.27 — getNexPromptConfig/saveNexPromptConfig persiste identity_base + saveIdentityBaseAction/resetIdentityBaseAction (super_admin gate)"
```

---

### Task E2: PromptPreviewCard sem collapse + IdentityBaseEditor

**Files:**
- Create: `src/components/agente-nex/identity-base-editor.tsx`
- Modify: `src/components/agente-nex/prompt-preview-card.tsx`
- Modify: `src/app/(protected)/agente-nex/prompt/page.tsx`
- Test: `src/components/agente-nex/__tests__/identity-base-editor.test.tsx` (novo)
- Test: `src/components/agente-nex/__tests__/prompt-preview-card.test.tsx` (atualizar)

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Textarea grande (rows 18, max-h 60vh) com fonte mono.
  - Counter X/5000 chars.
  - Botão "Restaurar padrão" outline (chama resetIdentityBaseAction; pede confirmação se há texto custom).
  - Botão "Salvar" primary (chama saveIdentityBaseAction; fecha Dialog após success).

- [ ] **Step 2: Create identity-base-editor.tsx**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  saveIdentityBaseAction,
  resetIdentityBaseAction,
} from "@/lib/actions/nex-prompt";
import { cn } from "@/lib/utils";

const MAX_LEN = 5_000;

interface IdentityBaseEditorProps {
  /** Texto atual do IDENTITY_BASE (do DB se setado, senão hardcoded default). */
  current: string;
  /** Indica se é custom (DB) ou default (hardcoded). */
  isCustom: boolean;
  /** Callback após save bem-sucedido — usado pelo Dialog pra fechar. */
  onSaved: () => void;
}

function counterClass(len: number, max: number): string {
  const ratio = len / max;
  if (len > max) return "text-destructive";
  if (ratio >= 0.9) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export function IdentityBaseEditor({
  current,
  isCustom,
  onSaved,
}: IdentityBaseEditorProps) {
  const router = useRouter();
  const [text, setText] = useState<string>(current);
  const [isSaving, startSave] = useTransition();
  const [isResetting, startReset] = useTransition();

  function handleSave() {
    if (text.trim().length === 0) {
      toast.error("Texto não pode ficar vazio");
      return;
    }
    startSave(async () => {
      const result = await saveIdentityBaseAction(text);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Prompt do agente atualizado");
      router.refresh();
      onSaved();
    });
  }

  function handleReset() {
    const ok =
      typeof window !== "undefined"
        ? window.confirm(
            "Restaurar o prompt para o texto padrão do Agente Nex? O texto customizado será descartado.",
          )
        : true;
    if (!ok) return;
    startReset(async () => {
      const result = await resetIdentityBaseAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Prompt restaurado para o padrão");
      router.refresh();
      onSaved();
    });
  }

  const busy = isSaving || isResetting;
  const overLimit = text.length > MAX_LEN;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="identity-base-textarea" className="text-sm">
          Prompt do agente {isCustom ? "(customizado)" : "(padrão)"}
        </Label>
        <span
          className={cn("text-xs tabular-nums", counterClass(text.length, MAX_LEN))}
        >
          {text.length}/{MAX_LEN}
        </span>
      </div>
      <Textarea
        id="identity-base-textarea"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        rows={18}
        disabled={busy}
        className="font-mono text-xs leading-relaxed max-h-[60vh]"
        aria-label="Prompt completo do Agente Nex"
      />
      <p className="text-xs text-muted-foreground">
        Texto-base do Agente Nex. Define identidade, postura e regras de operação.
        Personalidade, Tom, Guardrails e Modo manual continuam sendo editados na
        seção <strong>Comportamento</strong> abaixo (são camadas adicionais).
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {isCustom ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={busy}
            className="cursor-pointer min-h-[44px]"
          >
            {isResetting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-4 w-4" />
            )}
            Restaurar padrão
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={handleSave}
          disabled={busy || overLimit}
          className="cursor-pointer min-h-[44px]"
        >
          {isSaving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Salvar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Modify prompt-preview-card.tsx**

Substituir conteúdo (remover `showFull` state + `<button collapse>` + import `PromptConfigForm`):

```tsx
"use client";

import { useMemo, useState } from "react";
import { BookText, Copy, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IdentityBaseEditor } from "@/components/agente-nex/identity-base-editor";
import {
  composeSystemPrompt,
  type AccountUrlSnippet,
  type KbDocSnippet,
  type NexPromptConfig,
} from "@/lib/nex/prompt-compose";

interface PromptPreviewCardProps {
  config: NexPromptConfig;
  kbDocs: KbDocSnippet[];
  accountUrls: AccountUrlSnippet[];
  isSuperAdmin: boolean;
  /** Texto atual do IDENTITY_BASE — DB se customizado, hardcoded default senão. */
  currentIdentityBase: string;
  /** True quando há texto customizado no DB. */
  isIdentityBaseCustom: boolean;
}

export function PromptPreviewCard({
  config,
  kbDocs,
  accountUrls,
  isSuperAdmin,
  currentIdentityBase,
  isIdentityBaseCustom,
}: PromptPreviewCardProps) {
  const [editOpen, setEditOpen] = useState<boolean>(false);

  const prompt = useMemo(
    () => composeSystemPrompt(config, kbDocs, accountUrls),
    [config, kbDocs, accountUrls],
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Prompt copiado!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <>
      <Card className="ring-foreground/10">
        <CardHeader className="grid-cols-[1fr_auto] items-start gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2">
              <BookText className="h-4 w-4 shrink-0 text-violet-500" aria-hidden="true" />
              Prompt completo do Agente Nex
            </CardTitle>
            <CardDescription className="text-xs">
              Atualizado em tempo real conforme você edita.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="cursor-pointer"
            >
              <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Copiar
            </Button>
            {isSuperAdmin ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => setEditOpen(true)}
                className="cursor-pointer"
              >
                <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Editar
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-xs italic text-muted-foreground">
            Preview somente leitura.{" "}
            {isSuperAdmin
              ? "Use Editar para alterar o prompt do agente. Personalidade, Tom e Guardrails ficam na seção Comportamento abaixo."
              : "Apenas super_admins podem editar."}
          </p>

          <ScrollArea className="max-h-[400px] w-full overflow-x-hidden rounded-lg border border-border bg-muted/40">
            <pre
              data-testid="prompt-preview"
              className="min-w-0 cursor-text p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground"
            >
              {prompt}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-[min(900px,95vw)] flex-col gap-3 p-6 sm:max-w-[min(900px,95vw)]">
          <DialogHeader>
            <DialogTitle>Editar prompt do Agente Nex</DialogTitle>
            <DialogDescription>
              Edite o texto-base do agente. Personalidade, Tom, Guardrails e Modo manual continuam na seção Comportamento abaixo.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1 w-full pr-2">
            <IdentityBaseEditor
              current={currentIdentityBase}
              isCustom={isIdentityBaseCustom}
              onSaved={() => setEditOpen(false)}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4: Modify prompt page**

Em `src/app/(protected)/agente-nex/prompt/page.tsx`:

```tsx
import { IDENTITY_BASE } from "@/lib/nex/prompt-compose";

// dentro do Page():
const currentIdentityBase = cfg.identityBase ?? IDENTITY_BASE;
const isIdentityBaseCustom = cfg.identityBase !== null && cfg.identityBase.trim().length > 0;

// passar pro PromptPreviewCard:
<PromptPreviewCard
  config={cfg}
  kbDocs={kbForPrompt}
  accountUrls={accountUrls}
  isSuperAdmin={isSuperAdmin}
  currentIdentityBase={currentIdentityBase}
  isIdentityBaseCustom={isIdentityBaseCustom}
/>
```

- [ ] **Step 5: Atualizar tests do prompt-preview-card**

Substituir o test de v0.26 (que esperava collapse + Editar abre PromptConfigForm) por:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { PromptPreviewCard } from "../prompt-preview-card";

jest.mock("../identity-base-editor", () => ({
  IdentityBaseEditor: ({ current, isCustom }: { current: string; isCustom: boolean }) => (
    <div data-testid="identity-editor">
      Editor mock - {isCustom ? "custom" : "default"} - len={current.length}
    </div>
  ),
}));

const baseConfig = {
  identityBase: null,
  personality: "",
  tone: "",
  guardrails: [],
  advancedOverride: null,
  audioInputEnabled: false,
  kbEnabled: false,
};

describe("PromptPreviewCard — v0.27", () => {
  it("prompt SEMPRE visível (sem collapse)", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin
        currentIdentityBase="Você é o Agente Nex —"
        isIdentityBaseCustom={false}
      />,
    );
    expect(screen.getByTestId("prompt-preview")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ver prompt completo/i })).not.toBeInTheDocument();
  });

  it("Editar abre IdentityBaseEditor (não PromptConfigForm)", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin
        currentIdentityBase="texto"
        isIdentityBaseCustom={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByTestId("identity-editor")).toBeInTheDocument();
  });

  it("não-superadmin: Editar oculto, microcopy explicativo", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin={false}
        currentIdentityBase="texto"
        isIdentityBaseCustom={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Apenas super_admins podem editar/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run GREEN**

```bash
npm test -- prompt-preview-card identity-base-editor
```

- [ ] **Step 7: Commit**

```bash
git add src/components/agente-nex/identity-base-editor.tsx src/components/agente-nex/prompt-preview-card.tsx src/components/agente-nex/__tests__/prompt-preview-card.test.tsx src/components/agente-nex/__tests__/identity-base-editor.test.tsx src/app/\(protected\)/agente-nex/prompt/page.tsx
git commit -m "feat(agente-nex): T-E2 v0.27 — PromptPreviewCard sem collapse + Editar abre IdentityBaseEditor (não PromptConfigForm)"
```

---

### Task E3+E4: PlaygroundSheet input bar = bubble + sendNexMessage com histórico

**Files:**
- Modify: `src/components/agente-nex/playground-sheet.tsx`
- Test: `src/components/agente-nex/__tests__/playground-sheet.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Footer HTML normal (não `<SheetFooter>` sticky) — igual nex-chat-panel.
  - Mic externo (h-9 w-9 rounded-full) à esquerda + inner area unificada + Send violet à direita.
  - Counter inline (não em linha separada).
  - Placeholder "Pergunte ao agente Nex".
  - sendNexMessage com history completo.

- [ ] **Step 2: Write failing tests**

Adicionar a `playground-sheet.test.tsx`:

```typescript
describe("PlaygroundSheet — v0.27 sendNexMessage com histórico", () => {
  it("usa sendNexMessage (não testNexPromptAction) com histórico completo", async () => {
    const { sendNexMessage } = await import("@/lib/actions/nex-chat");
    (sendNexMessage as jest.Mock).mockResolvedValue({ ok: true, message: "ola" });

    render(<PlaygroundSheet {...baseProps} />);

    // Envia 1ª msg
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Quantas conversas?" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await waitFor(() => expect(sendNexMessage).toHaveBeenCalled());

    const firstCall = (sendNexMessage as jest.Mock).mock.calls[0][0];
    expect(firstCall).toEqual([
      { role: "user", content: "Quantas conversas?" },
    ]);
  });

  it("placeholder 'Pergunte ao agente Nex'", () => {
    render(<PlaygroundSheet {...baseProps} />);
    expect(screen.getByPlaceholderText(/Pergunte ao agente Nex/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run RED**

- [ ] **Step 4: Edit playground-sheet.tsx**

1. Trocar import:
```typescript
// REMOVE: import { testNexPromptAction } from "@/lib/actions/nex-chat";
import { sendNexMessage } from "@/lib/actions/nex-chat";
import type { ChatMessage } from "@/lib/llm/types";
```

2. `submitMessage` passa a usar histórico:
```typescript
function submitMessage(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (trimmed.length > MAX_INPUT_LEN) {
    toast.error(`Mensagem acima de ${MAX_INPUT_LEN} chars.`);
    return;
  }
  const userItem: ChatItem = { id: genId(), role: "user", content: trimmed };
  appendItems([userItem]);
  setMessage("");

  startSend(async () => {
    try {
      // Histórico = items existentes + nova msg do user.
      const history: ChatMessage[] = [
        ...items
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: trimmed },
      ];
      const r = await sendNexMessage(history);
      if (!r.ok) {
        toast.error(`Erro: ${r.error}. Verifique chave/modelo em Configuração.`);
        return;
      }
      appendItems([{ id: genId(), role: "assistant", content: r.message }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erro: ${msg}. Verifique chave/modelo em Configuração.`);
    }
  });
}
```

3. Trocar placeholder Textarea: `placeholder="Pergunte ao agente Nex…"` (era "Pergunte algo ao Nex").

4. Trocar `<SheetFooter>` por `<footer>` HTML — substituir bloco inteiro:

```tsx
<footer className="border-t border-border bg-background/60 px-3 pt-3 pb-3">
  <form
    onSubmit={(e) => {
      e.preventDefault();
      handleSendClick();
    }}
    className="flex items-end gap-2"
  >
    {audioEnabled && !isRecording && !audioFlight ? (
      <button
        type="button"
        onClick={() => void recorderRef.current?.start()}
        aria-label="Gravar áudio"
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
      >
        <Mic className="h-4 w-4" />
      </button>
    ) : null}

    <div
      className={cn(
        "flex min-h-9 flex-1 items-center rounded-xl border border-input bg-background px-3 py-1 transition-colors",
        "focus-within:border-violet-500/60 focus-within:ring-3 focus-within:ring-violet-400/30",
      )}
    >
      {!isRecording ? (
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_INPUT_LEN}
          rows={1}
          placeholder="Pergunte ao agente Nex…"
          disabled={isSending}
          aria-label="Mensagem para o Nex"
          className="resize-none bg-transparent text-sm leading-relaxed border-0 shadow-none focus-visible:ring-0 px-0 py-1 max-h-28"
        />
      ) : null}
      {audioEnabled ? (
        <AudioRecorder
          ref={recorderRef}
          mode="embedded"
          onSend={(blob, dur) => void handleSendAudio(blob, dur)}
          onRecordingStateChange={setIsRecording}
        />
      ) : null}
    </div>

    <button
      type="submit"
      aria-label={isRecording ? "Enviar áudio" : "Enviar pergunta"}
      disabled={isRecording ? false : !canSubmit || audioFlight}
      className={cn(
        "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl",
        "bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/30",
        "transition-all hover:from-violet-500 hover:to-violet-400 hover:shadow-lg",
        "focus-visible:ring-3 focus-visible:ring-violet-400/50 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
      )}
    >
      {isSending ? (
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        <Send className="h-4 w-4" strokeWidth={2.25} />
      )}
    </button>
  </form>
  <p
    className={cn(
      "mt-1.5 px-1 text-[11px] text-muted-foreground transition-opacity",
      isRecording ? "invisible" : "visible",
    )}
  >
    Enter envia · Shift+Enter quebra linha
  </p>
</footer>
```

(Remova o `import { SheetFooter }` se não houver outro consumer no arquivo.)

5. Atualizar import do Sheet:
```typescript
import { Sheet, SheetBody, SheetHeader } from "@/components/ui/sheet";
// remove SheetFooter do import
```

- [ ] **Step 5: Run GREEN**

```bash
npm test -- playground-sheet
```

- [ ] **Step 6: Commit**

```bash
git add src/components/agente-nex/playground-sheet.tsx src/components/agente-nex/__tests__/playground-sheet.test.tsx
git commit -m "feat(agente-nex): T-E3+E4 v0.27 — PlaygroundSheet input bar = bubble (footer HTML não sticky) + sendNexMessage com histórico (qualidade idêntica à bubble) + placeholder 'Pergunte ao agente Nex'"
```

---

### Task E5: AudioPlayer speed tag compacta

**Files:**
- Modify: `src/components/nex/audio-player.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Speed button compactado: `h-5 min-w-[34px] px-1 text-[9px]`.
  - Cabe dentro do balão violet (max-w-[320px]) sem vazar.
  - Visualmente discreto mas legível (text-[9px] ≈ 11px line-height; font-mono tabular-nums).

- [ ] **Step 2: Edit audio-player.tsx**

Substituir o className do speed button (linhas 167-174) por:

```typescript
className={cn(
  // v0.27.0: tag compacta — cabe dentro do balão sem vazar nas velocidades 1.25x/1.75x
  "flex h-5 min-w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-md border border-violet-500/30 bg-transparent px-1 font-mono text-[9px] font-medium tabular-nums text-violet-700 dark:text-violet-300",
  "transition-all duration-150 hover:scale-105 hover:border-violet-500/60 hover:bg-violet-500/20",
  "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
)}
```

- [ ] **Step 3: Visual smoke**

```bash
npm run dev
```

Bubble Nex → enviar áudio → mudar velocidade pra 1.25x e 1.75x → verificar que tag fica DENTRO do balão.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "audio-player" || echo "OK"
```

- [ ] **Step 5: Commit**

```bash
git add src/components/nex/audio-player.tsx
git commit -m "fix(bubble): T-E5 v0.27 — AudioPlayer speed tag compacta (h-5 min-w-[34px] text-[9px]) — cabe no balão sem vazar nas velocidades 1.25x/1.75x"
```

---

### Task E6: Dialog "Ver prompt usado" fix

**Files:**
- Modify: `src/components/agente-nex/playground-sheet.tsx`

- [ ] **Step 1: Diagnose root cause**

Inspecionar comportamento:
1. Clicar "Ver prompt usado" no DEV.
2. Abrir DevTools → Network → ver se `previewSystemPromptAction` é chamado e retorno.
3. Console → ver erros.
4. Inspecionar DOM → ver se o Dialog é renderizado mas oculto, ou nem é renderizado.

- [ ] **Step 2: Aplicar fix baseado no diagnóstico**

Casos prováveis (escolher 1):

**Caso A — `previewSystemPromptAction` falhando silenciosamente:**

Em `handleOpenPreview`:
```typescript
function handleOpenPreview() {
  startPreview(async () => {
    try {
      const result = await previewSystemPromptAction(cfgSnapshot);
      if (!result.ok || !result.data) {
        const msg = result.error ?? "não foi possível carregar o prompt";
        toast.error(`Erro: ${msg}. Verifique chave/modelo em Configuração.`);
        return;
      }
      setPreviewText(result.data.composedPrompt);
      setPreviewOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erro inesperado: ${msg}`);
    }
  });
}
```

**Caso B — Sheet z-50 sobrepondo Dialog overlay z-[60]:**

Forçar z-[70] no Dialog do "Ver prompt usado":
```tsx
<Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
  <DialogContent
    className="sm:max-w-3xl z-[70]"
    overlayClassName="z-[70]"
    aria-label="Prompt usado nesta sessão"
  >
    {/* ... */}
  </DialogContent>
</Dialog>
```

**Caso C — Sheet capturando focus impede Dialog mount:**

Fechar Sheet temporariamente quando Dialog abrir:
```typescript
const [sheetSuppressed, setSheetSuppressed] = useState<boolean>(false);

function handleOpenPreview() {
  startPreview(async () => {
    const result = await previewSystemPromptAction(cfgSnapshot);
    if (!result.ok || !result.data) {
      toast.error(`Erro: ${result.error ?? "falha"}.`);
      return;
    }
    setPreviewText(result.data.composedPrompt);
    setSheetSuppressed(true); // Sheet fica não-modal
    setPreviewOpen(true);
  });
}

// No <Dialog open={previewOpen} onOpenChange={(o) => { setPreviewOpen(o); if (!o) setSheetSuppressed(false); }}>
```

E no Sheet root: `<Sheet open={open && !sheetSuppressed} ...>` — Sheet fecha quando Dialog abre, reabre quando Dialog fecha.

(Decisão final do caso: depende do diagnóstico do Step 1.)

- [ ] **Step 3: Smoke test** — clicar Ver prompt usado → confirma Dialog aparece centralizado.

- [ ] **Step 4: Commit**

```bash
git add src/components/agente-nex/playground-sheet.tsx
git commit -m "fix(agente-nex): T-E6 v0.27 — Dialog 'Ver prompt usado' aparece corretamente (root cause: <descrição> · solução: <descrição>)"
```

---

### Task R1: bump versão + CHANGELOG + STATUS

- [ ] **Step 1: Sync remote**

```bash
git fetch origin main && git status && cat package.json | grep '"version"'
```

- [ ] **Step 2: Bump 0.26.0 → 0.27.0** em `package.json`.

- [ ] **Step 3: CHANGELOG entry**

```markdown
## [v0.27.0] 2026-05-03 — Suite Agente Nex Polish v4 (correções v0.26)

### Prompt
- **IDENTITY_BASE editável (super_admin):** column nova `identity_base TEXT NULL` em `nex_settings`. NULL = usa default hardcoded; valor setado = override. Server Actions `saveIdentityBaseAction` e `resetIdentityBaseAction` (ambos super_admin-gated).
- **PromptPreviewCard sem collapse:** `<pre>` do prompt completo SEMPRE visível (era oculto-por-default em v0.26 — feedback rejeitou).
- **Editar abre IdentityBaseEditor (não PromptConfigForm):** super_admin clica Editar → Dialog max-edit com Textarea grande do prompt-base + botões Restaurar padrão / Salvar. Personalidade/Tom/Guardrails seguem na seção Comportamento abaixo (não duplica edição).

### Playground
- **Input bar refatorada igual à bubble:** `<footer>` HTML normal (não SheetFooter sticky), Mic externo + inner area unificada + Send violet — alinhamento visual idêntico ao nex-chat-panel.
- **Placeholder "Pergunte ao agente Nex"** (era "Pergunte algo ao Nex").
- **`sendNexMessage` em vez de `testNexPromptAction`:** Playground passa a usar mesmo path da bubble com histórico completo entre turnos. Qualidade das respostas idêntica.
- **Fix Dialog "Ver prompt usado":** Dialog agora aparece corretamente quando clicado (era invisível em v0.26 — root cause + solução documentados em T-E6).

### Bubble
- **AudioPlayer speed tag compacta:** `h-5 min-w-[34px] px-1 text-[9px]` (era h-6 min-w-[44px] px-1.5 text-[11px]). Tag "1.75×" não vaza mais do balão violet.

### Workflow
- Plan v1 → v2 → v3 com 2 pentes-finos REAIS · subagent-driven-development com TDD em cada task · ui-ux-pro-max em todas as tasks UI · two-stage review automático.
```

- [ ] **Step 4: STATUS entry** (curto).

- [ ] **Step 5: Commit**

```bash
git add package.json CHANGELOG.md docs/STATUS.md
git commit -m "chore(release): v0.27.0 — Suite Agente Nex Polish v4 (correções v0.26)"
```

---

### Task R2: typecheck + tests + build

- [ ] `npx tsc --noEmit -p tsconfig.json 2>&1 | tail -20` — 0 erros.
- [ ] `npm test 2>&1 | tail -20` — 1383+ PASS, 20 falhas pré-existentes integrations-power-bi.
- [ ] `npm run build 2>&1 | tail -10` — success.

---

### Task R3: verification + push + portainer-fix

- [ ] `gh run list --limit 5` — sem builds em curso.
- [ ] `git push origin main`.
- [ ] `gh run watch <id>` (run_in_background).
- [ ] Aguarda build success.
- [ ] `gh workflow run "Portainer fix (worker cmd + APP_VERSION)" -f app_version=v0.27.0`.
- [ ] `until curl -fsS https://insights.nexusai360.com/api/health | grep -q '"v0.27.0"'; do sleep 8; done`.
- [ ] `curl -fsS https://insights.nexusai360.com/api/health` — confirma v0.27.0 LIVE.

### Task R4: HISTORY append + cleanup

- [ ] Append entry em `docs/agents/HISTORY.md`.
- [ ] Delete `docs/agents/active/claude-agente-nex-polish-v027.md`.
- [ ] Memory update.

---

## Self-Review

### Spec coverage
- [x] E1 — IDENTITY_BASE editável (column + Server Actions + compose) → E1a, E1b, E1c
- [x] E2 — PromptPreviewCard sem collapse + Editar abre IdentityBaseEditor → E2
- [x] E3 — Playground input bar = bubble exata → E3+E4
- [x] E4 — Playground sendNexMessage com histórico → E3+E4
- [x] E5 — AudioPlayer speed tag compacta → E5
- [x] E6 — Dialog "Ver prompt usado" fix → E6

### Placeholder scan
- [x] Sem TODOs.
- [x] Step "Diagnose root cause" no E6 é DOCUMENTAÇÃO de processo de debug (não placeholder de implementação) — tem 3 soluções pré-mapeadas (caso A, B, C).

### Type consistency
- [x] `NexPromptConfig.identityBase: string | null` consistente em E1b, E1c, E2.
- [x] `IdentityBaseEditorProps { current, isCustom, onSaved }` consistente em E2.
- [x] `sendNexMessage(messages: ChatMessage[])` consistente em E3+E4.
