# Suite Agente Nex Polish v4 (v0.27.0) — Plano v3 final

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Corrigir os 6 bugs/má-UX da v0.26 apontados pelo super_admin: Editar abre tela errada (E1+E2), Prompt em collapse desnecessário (E2), Playground input bar feio (E3), Playground sem histórico (E4), AudioPlayer speed tag vazando (E5), Dialog "Ver prompt usado" não aparece (E6).

**Architecture:** Schema additive (column `identity_base TEXT NULL` em `nex_settings`). PromptPreviewCard ganha IdentityBaseEditor novo (substitui PromptConfigForm como conteúdo do Dialog max-edit) e remove collapse do `<pre>`. PlaygroundSheet simplifica drasticamente: deixa de gerenciar prompt-em-edição, usa `sendNexMessage` da bubble com histórico — qualidade idêntica.

**Tech Stack:** Next.js 16 · TS · base-ui · Tailwind v4 · NextAuth v5 · PostgreSQL · Lucide React · Jest.

---

## Diff v2 → v3

| # | Mudança |
|---|---------|
| 1 | **E1c — explicitar que removendo `promptOverride` do flow simplificou:** `sendNexMessage` usa o prompt do DB direto. PlaygroundSheet em v0.27 NÃO testa prompt em edição (foi a intenção da v0.16, mas v0.27 simplifica isso). Documentar trade-off no plan. |
| 2 | **E2 — adicionar test específico do IdentityBaseEditor** (Save disabled quando !dirty; Reset não-confirm quando !isCustom && !dirty). |
| 3 | **E5 — text-[9px] tem aria-label** já garantido (button já tinha aria-label dinâmico). Sem mudança no plan. |
| 4 | **E6 — diagnose abreviada, fix conservador (Solução B + C combinados)** — z-[70] no Dialog overlay/content + suppress Sheet quando preview abrir. Cobre cenários A/B/C do v1. |
| 5 | **Audio test verificação inline** — passos do E5 incluem grep antes de edit. |

---

## Convenções

- **Antes de qualquer task UI:** subagente invoca `ui-ux-pro-max:ui-ux-pro-max` via Skill tool.
- **TDD:** RED → GREEN → COMMIT.
- **Commits granulares:** 1 task = 1 commit. Padrão `feat(agente-nex): T-<N> v0.27 — <subject>`.

---

## Tasks (v3 final)

> Ordem: E1a → E1b → E1c (com mocks update) → E2 → E3+E4 (combinados) → E5 → E6 → R1, R2, R3, R4.

---

### Task E1a: ensure-tables — column identity_base

**Files:** `src/lib/nex/ensure-tables.ts`, `src/lib/nex/__tests__/ensure-tables.test.ts`.

- [ ] **Step 1:** Skill ui-ux-pro-max — não aplica (lib).

- [ ] **Step 2: Write failing test** — adicionar a `ensure-tables.test.ts`:

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

- [ ] **Step 3: RED** — `npm test -- ensure-tables`.

- [ ] **Step 4: Edit** — em `createTables()`, após `ALTER ... seeded_v2_at`, adicionar:

```typescript
// v0.27.0: identity_base column — NULL = usa default hardcoded em prompt-compose.ts
await pgPool.query(`
  ALTER TABLE "nex_settings"
    ADD COLUMN IF NOT EXISTS "identity_base" TEXT NULL;
`);
```

- [ ] **Step 5: GREEN** — `npm test -- ensure-tables`.

- [ ] **Step 6: Commit:**

```bash
git add src/lib/nex/ensure-tables.ts src/lib/nex/__tests__/ensure-tables.test.ts
git commit -m "feat(agente-nex): T-E1a v0.27 — column identity_base TEXT NULL em nex_settings"
```

---

### Task E1b: prompt-compose suporta identityBase override (advancedOverride precede)

**Files:** `src/lib/nex/prompt-compose.ts`, `src/lib/nex/__tests__/prompt-compose.test.ts`.

- [ ] **Step 1:** Skill — não aplica.

- [ ] **Step 2: Write failing tests:**

```typescript
describe("composeSystemPrompt — identityBase override (v0.27)", () => {
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
      },
      [],
      [],
    );
    expect(out).toBe("RAW PROMPT");
    expect(out).not.toMatch(/custom base/);
    expect(out).not.toMatch(/Você é o Agente Nex —/);
  });
});
```

- [ ] **Step 3: RED** — `npm test -- prompt-compose`.

- [ ] **Step 4: Edit** — em `src/lib/nex/prompt-compose.ts`:

```typescript
export interface NexPromptConfig {
  /** v0.27: texto-base do agente. NULL = usa IDENTITY_BASE hardcoded como default. */
  identityBase: string | null;
  personality: string;
  tone: string;
  guardrails: string[];
  advancedOverride: string | null;
  audioInputEnabled: boolean;
  kbEnabled: boolean;
}
```

E na função `composeSystemPrompt`, manter o short-circuit do `advancedOverride` no topo, e trocar `const parts: string[] = [IDENTITY_BASE];` por:

```typescript
// v0.27.0: identityBase override do DB tem prioridade sobre IDENTITY_BASE hardcoded
// (mas advancedOverride continua precedendo TUDO — modo manual).
const baseIdentity =
  cfg.identityBase && cfg.identityBase.trim().length > 0
    ? cfg.identityBase
    : IDENTITY_BASE;
const parts: string[] = [baseIdentity];
```

- [ ] **Step 5: GREEN** — `npm test -- prompt-compose` (todos PASS).

- [ ] **Step 6: Commit:**

```bash
git add src/lib/nex/prompt-compose.ts src/lib/nex/__tests__/prompt-compose.test.ts
git commit -m "feat(agente-nex): T-E1b v0.27 — composeSystemPrompt aceita identityBase override (advancedOverride continua precedendo)"
```

---

### Task E1c: prompt.ts persiste identity_base + Server Actions + atualiza mocks

**Files:**
- Modify: `src/lib/nex/prompt.ts`
- Modify: `src/lib/actions/nex-prompt.ts`
- Create: `src/lib/actions/__tests__/nex-prompt.test.ts`
- Modify (mocks): `src/components/agente-nex/__tests__/playground-sheet.test.tsx`, `src/components/agente-nex/__tests__/prompt-config-form.test.tsx`, `src/components/agente-nex/__tests__/prompt-preview-card.test.tsx`, `src/lib/llm/agent/__tests__/run-nex.test.ts` (verificar)

- [ ] **Step 1:** Skill — não aplica.

- [ ] **Step 2: Write failing tests** em `src/lib/actions/__tests__/nex-prompt.test.ts` (novo):

```typescript
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/nex/prompt", () => ({
  ...jest.requireActual<typeof import("@/lib/nex/prompt")>("@/lib/nex/prompt"),
  saveNexPromptConfig: jest.fn(),
  getNexPromptConfig: jest.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import { saveNexPromptConfig, getNexPromptConfig } from "@/lib/nex/prompt";
import {
  saveIdentityBaseAction,
  resetIdentityBaseAction,
} from "../nex-prompt";

const baseCfg = {
  identityBase: null,
  personality: "",
  tone: "",
  guardrails: [],
  advancedOverride: null,
  audioInputEnabled: false,
  kbEnabled: false,
};

describe("saveIdentityBaseAction (v0.27)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("super_admin: persiste identity_base no DB", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({
      platformRole: "super_admin",
      id: "u1",
    });
    (getNexPromptConfig as jest.Mock).mockResolvedValue(baseCfg);
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
    if (!result.ok) expect(result.error).toMatch(/permissão/i);
  });

  it("texto vazio: nega", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({
      platformRole: "super_admin",
      id: "u1",
    });
    (getNexPromptConfig as jest.Mock).mockResolvedValue(baseCfg);
    const result = await saveIdentityBaseAction("   ");
    expect(result.ok).toBe(false);
  });
});

describe("resetIdentityBaseAction (v0.27)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("super_admin: persiste identityBase=null", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({
      platformRole: "super_admin",
      id: "u1",
    });
    (getNexPromptConfig as jest.Mock).mockResolvedValue({
      ...baseCfg,
      identityBase: "custom",
    });
    const result = await resetIdentityBaseAction();
    expect(result.ok).toBe(true);
    expect(saveNexPromptConfig).toHaveBeenCalledWith(
      expect.objectContaining({ identityBase: null }),
      "u1",
    );
  });

  it("não-superadmin: nega", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ platformRole: "viewer" });
    const result = await resetIdentityBaseAction();
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: RED** — `npm test -- nex-prompt.test`.

- [ ] **Step 4: Edit prompt.ts** — atualizar SELECT e INSERT/UPDATE em `getNexPromptConfig` e `saveNexPromptConfig`:

```typescript
export async function getNexPromptConfig(): Promise<NexPromptConfig> {
  await ensureNexTables();
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
}

export async function saveNexPromptConfig(
  cfg: NexPromptConfig,
  updatedById?: string | null,
): Promise<void> {
  // ...validations existentes...
  await ensureNexTables();
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
}
```

- [ ] **Step 5: Edit nex-prompt.ts** — adicionar Server Actions ao final:

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
    return {
      ok: false,
      error: `Identity base > ${MAX_IDENTITY_BASE_LEN} chars`,
    };
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

(Verificar imports do file existente: precisa importar `getCurrentUser` e `getNexPromptConfig`/`saveNexPromptConfig` se não estiverem.)

- [ ] **Step 6: Atualizar mocks** — busca + edição em massa:

```bash
grep -rln "advancedOverride: null" src/components/agente-nex/__tests__ src/lib/llm/agent/__tests__ 2>/dev/null
```

Para cada arquivo encontrado, antes de cada `personality:` (ou primeiro field do config), adicionar `identityBase: null,`. Verificar manualmente cada edit.

- [ ] **Step 7: GREEN** — todos os tests:

```bash
npm test -- nex-prompt.test prompt-compose prompt-config-form playground-sheet prompt-preview-card run-nex
```

- [ ] **Step 8: Commit:**

```bash
git add src/lib/nex/prompt.ts src/lib/actions/nex-prompt.ts src/lib/actions/__tests__/nex-prompt.test.ts
# + arquivos de tests com mocks atualizados (lista do step 6)
git commit -m "feat(agente-nex): T-E1c v0.27 — getNexPromptConfig/saveNexPromptConfig persiste identity_base + saveIdentityBaseAction/resetIdentityBaseAction (super_admin gate) + atualiza mocks de NexPromptConfig em testes existentes"
```

---

### Task E2: PromptPreviewCard sem collapse + IdentityBaseEditor

**Files:**
- Create: `src/components/agente-nex/identity-base-editor.tsx`
- Modify: `src/components/agente-nex/prompt-preview-card.tsx`
- Modify: `src/app/(protected)/agente-nex/prompt/page.tsx`
- Test: `src/components/agente-nex/__tests__/identity-base-editor.test.tsx` (NOVO)
- Test: `src/components/agente-nex/__tests__/prompt-preview-card.test.tsx` (atualizar)

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Textarea grande (rows 18, max-h 60vh, font-mono).
  - Counter X/5000 (color amber/destructive perto do limite).
  - Botão "Restaurar padrão" outline (só aparece quando isCustom).
  - Botão "Salvar" primary (disabled quando !dirty || overLimit).
  - aria-describedby helper text persistente.
  - Confirm-on-reset só quando isCustom || dirty.

- [ ] **Step 2: Write failing tests do IdentityBaseEditor** em `__tests__/identity-base-editor.test.tsx` (novo):

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockSave = jest.fn();
const mockReset = jest.fn();
jest.mock("@/lib/actions/nex-prompt", () => ({
  saveIdentityBaseAction: (...args: unknown[]) => mockSave(...args),
  resetIdentityBaseAction: () => mockReset(),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));
const mockToast = { error: jest.fn(), success: jest.fn() };
jest.mock("sonner", () => ({ toast: mockToast }));

import { IdentityBaseEditor } from "../identity-base-editor";

describe("IdentityBaseEditor (v0.27)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToast.error.mockClear();
    mockToast.success.mockClear();
  });

  it("renderiza Textarea com texto current", () => {
    render(
      <IdentityBaseEditor current="Você é o agente." isCustom={false} onSaved={jest.fn()} />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("Você é o agente.");
  });

  it("Salvar disabled quando text === current (não-dirty)", () => {
    render(
      <IdentityBaseEditor current="abc" isCustom={false} onSaved={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: /salvar/i })).toBeDisabled();
  });

  it("Salvar enabled após editar (dirty)", () => {
    render(
      <IdentityBaseEditor current="abc" isCustom={false} onSaved={jest.fn()} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "abc!" } });
    expect(screen.getByRole("button", { name: /salvar/i })).not.toBeDisabled();
  });

  it("Restaurar padrão só aparece quando isCustom=true", () => {
    const { rerender } = render(
      <IdentityBaseEditor current="abc" isCustom={false} onSaved={jest.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /restaurar/i })).not.toBeInTheDocument();
    rerender(
      <IdentityBaseEditor current="abc" isCustom onSaved={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: /restaurar/i })).toBeInTheDocument();
  });

  it("Salvar chama saveIdentityBaseAction + onSaved + toast.success", async () => {
    mockSave.mockResolvedValue({ ok: true });
    const onSaved = jest.fn();
    render(
      <IdentityBaseEditor current="abc" isCustom={false} onSaved={onSaved} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "novo texto" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith("novo texto"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mockToast.success).toHaveBeenCalled();
  });

  it("Salvar com erro mostra toast.error e NÃO chama onSaved", async () => {
    mockSave.mockResolvedValue({ ok: false, error: "Sem permissão" });
    const onSaved = jest.fn();
    render(
      <IdentityBaseEditor current="abc" isCustom={false} onSaved={onSaved} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("Sem permissão"));
    expect(onSaved).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: RED** — `npm test -- identity-base-editor`.

- [ ] **Step 4: Implement IdentityBaseEditor** — ver código completo no v2 (reaproveitar 1:1):

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
  current: string;
  isCustom: boolean;
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

  const dirty = text !== current;

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
    if (isCustom || dirty) {
      const ok =
        typeof window !== "undefined"
          ? window.confirm(
              "Restaurar o prompt para o texto padrão do Agente Nex? O texto customizado será descartado.",
            )
          : true;
      if (!ok) return;
    }
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
        maxLength={MAX_LEN + 100}
        className="font-mono text-xs leading-relaxed max-h-[60vh]"
        aria-label="Prompt completo do Agente Nex"
        aria-describedby="identity-base-help"
      />
      <p id="identity-base-help" className="text-xs text-muted-foreground">
        Texto-base do Agente Nex — define identidade, postura e regras de operação.
        <strong className="font-semibold"> Personalidade, Tom, Guardrails e Modo manual</strong> continuam sendo editados na seção <strong>Comportamento</strong> abaixo (são camadas adicionais aplicadas DEPOIS deste prompt-base).
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
          disabled={busy || overLimit || !dirty}
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

- [ ] **Step 5: Modify PromptPreviewCard** — substituir conteúdo (ver v1/v2 — reaproveitar):

(código completo no v1/v2 — substitui collapse + Editar abre IdentityBaseEditor)

- [ ] **Step 6: Modify prompt page** — passa `currentIdentityBase` + `isIdentityBaseCustom`:

```tsx
import { IDENTITY_BASE } from "@/lib/nex/prompt-compose";

// ...
const currentIdentityBase =
  cfg.identityBase && cfg.identityBase.trim().length > 0
    ? cfg.identityBase
    : IDENTITY_BASE;
const isIdentityBaseCustom =
  cfg.identityBase !== null && cfg.identityBase.trim().length > 0;

// no JSX:
<PromptPreviewCard
  config={cfg}
  kbDocs={kbForPrompt}
  accountUrls={accountUrls}
  isSuperAdmin={isSuperAdmin}
  currentIdentityBase={currentIdentityBase}
  isIdentityBaseCustom={isIdentityBaseCustom}
/>
```

- [ ] **Step 7: Atualizar prompt-preview-card.test.tsx** — substituir tests do v0.26 (collapse + Editar abre PromptConfigForm) pelos novos:

```typescript
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

  it("não-superadmin: Editar oculto + microcopy", () => {
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

- [ ] **Step 8: GREEN** — `npm test -- identity-base-editor prompt-preview-card`.

- [ ] **Step 9: Commit:**

```bash
git add src/components/agente-nex/identity-base-editor.tsx src/components/agente-nex/prompt-preview-card.tsx src/components/agente-nex/__tests__/identity-base-editor.test.tsx src/components/agente-nex/__tests__/prompt-preview-card.test.tsx src/app/\(protected\)/agente-nex/prompt/page.tsx
git commit -m "feat(agente-nex): T-E2 v0.27 — PromptPreviewCard sem collapse + Editar abre IdentityBaseEditor (Textarea grande + Restaurar padrão + Salvar dirty-aware)"
```

---

### Task E3+E4: PlaygroundSheet input bar = bubble + sendNexMessage com histórico

**Files:**
- Modify: `src/components/agente-nex/playground-sheet.tsx`
- Modify: `src/components/agente-nex/__tests__/playground-sheet.test.tsx`

**Trade-off documentado:** PlaygroundSheet em v0.27 NÃO testa mais "prompt em edição" (intenção da v0.16). Usa o prompt do DB direto via `sendNexMessage`. Justificativa: usuário pediu qualidade idêntica à bubble; flow de "testar antes de salvar" foi rejeitado em favor de "edita IDENTITY_BASE → salva → testa direto na bubble ou playground (que usa o salvo)".

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar layout do nex-chat-panel input bar.

- [ ] **Step 2: Write failing tests** em `playground-sheet.test.tsx`:

```typescript
describe("PlaygroundSheet — v0.27 sendNexMessage com histórico", () => {
  it("usa sendNexMessage (não testNexPromptAction) com histórico completo", async () => {
    const { sendNexMessage } = await import("@/lib/actions/nex-chat");
    (sendNexMessage as jest.Mock).mockResolvedValue({ ok: true, message: "ola" });

    render(<PlaygroundSheet {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Quantas conversas?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await waitFor(() => expect(sendNexMessage).toHaveBeenCalled());

    expect((sendNexMessage as jest.Mock).mock.calls[0][0]).toEqual([
      { role: "user", content: "Quantas conversas?" },
    ]);
  });

  it("placeholder 'Pergunte ao agente Nex'", () => {
    render(<PlaygroundSheet {...baseProps} />);
    expect(screen.getByPlaceholderText(/Pergunte ao agente Nex/i)).toBeInTheDocument();
  });
});
```

(Atualizar `baseProps.currentConfig` pra incluir `identityBase: null`.)

- [ ] **Step 3: RED** — `npm test -- playground-sheet`.

- [ ] **Step 4: Edit playground-sheet.tsx**

1. Imports:
```typescript
// REMOVE:
// import { testNexPromptAction } from "@/lib/actions/nex-chat";

// ADD:
import { sendNexMessage } from "@/lib/actions/nex-chat";
import type { ChatMessage } from "@/lib/llm/types";

// Trocar Sheet imports — remove SheetFooter:
import { Sheet, SheetBody, SheetHeader } from "@/components/ui/sheet";
```

2. `submitMessage` — construir history ANTES de appendItems:

```typescript
function submitMessage(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (trimmed.length > MAX_INPUT_LEN) {
    toast.error(`Mensagem acima de ${MAX_INPUT_LEN} chars.`);
    return;
  }

  // Construir histórico ANTES de appendItems pra evitar closure stale do `items`.
  const history: ChatMessage[] = [
    ...items
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: trimmed },
  ];

  const userItem: ChatItem = { id: genId(), role: "user", content: trimmed };
  appendItems([userItem]);
  setMessage("");

  startSend(async () => {
    try {
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

3. Trocar `<SheetFooter>...</SheetFooter>` por `<footer>` HTML:

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

(Counter `{message.length}/{MAX_INPUT_LEN}` removido do footer — não é essencial; quem quer ver vê o `maxLength` natural do textarea.)

- [ ] **Step 5: GREEN** — `npm test -- playground-sheet`.

- [ ] **Step 6: Commit:**

```bash
git add src/components/agente-nex/playground-sheet.tsx src/components/agente-nex/__tests__/playground-sheet.test.tsx
git commit -m "feat(agente-nex): T-E3+E4 v0.27 — PlaygroundSheet input bar = bubble (footer HTML não-sticky) + sendNexMessage com histórico (qualidade idêntica) + placeholder 'Pergunte ao agente Nex'"
```

---

### Task E5: AudioPlayer speed tag compacta

**Files:** `src/components/nex/audio-player.tsx`, `src/components/nex/__tests__/audio-player.test.tsx`.

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Speed button compacto: h-5 min-w-[34px] px-1 text-[9px].
  - Cabe no balão violet (max-w-[320px]) nas velocidades 1.25x/1.75x.
  - aria-label dinâmico mantém a11y mesmo com fonte 9px.

- [ ] **Step 2: Verificar test existente:**

```bash
grep -n "min-w\|speed\|1\\.75" src/components/nex/__tests__/audio-player.test.tsx | head -10
```

Se houver assertion de className do speed button, atualizar pra refletir `h-5 min-w-[34px]`.

- [ ] **Step 3: Edit audio-player.tsx (linhas 167-174):**

```typescript
className={cn(
  // v0.27.0: tag compacta — cabe no balão sem vazar nas velocidades 1.25x/1.75x.
  "flex h-5 min-w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-md border border-violet-500/30 bg-transparent px-1 font-mono text-[9px] font-medium tabular-nums text-violet-700 dark:text-violet-300",
  "transition-all duration-150 hover:scale-105 hover:border-violet-500/60 hover:bg-violet-500/20",
  "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
)}
```

- [ ] **Step 4: Run tests** — `npm test -- audio-player`.

- [ ] **Step 5: Visual smoke** — abrir bubble Nex no DEV, gravar áudio, mudar pra 1.75x, verificar tag dentro do balão.

- [ ] **Step 6: Commit:**

```bash
git add src/components/nex/audio-player.tsx src/components/nex/__tests__/audio-player.test.tsx
git commit -m "fix(bubble): T-E5 v0.27 — AudioPlayer speed tag compacta (h-5 min-w-[34px] text-[9px]) — cabe no balão nas velocidades 1.25x/1.75x"
```

---

### Task E6: Dialog "Ver prompt usado" fix (z-[70] + Sheet suppress)

**Files:** `src/components/agente-nex/playground-sheet.tsx`.

**Estratégia:** aplicar fix conservador combinando Solução B (z-[70]) + Solução C (suppress Sheet quando preview abre). Cobre todos os cenários A/B/C identificados no v1.

- [ ] **Step 1: Skill ui-ux-pro-max** — INVOCAR. Validar:
  - Dialog do "Ver prompt usado" com z-[70] (acima de Sheet z-50).
  - Sheet suppressed quando preview abre (Sheet.open = open && !sheetSuppressed) — assim Dialog não disputa focus com Sheet.
  - Quando user fecha preview, Sheet volta a aparecer.
  - Toast.error explícito quando action falha (era silencioso em v0.26).

- [ ] **Step 2: Edit playground-sheet.tsx**

1. Adicionar state:
```typescript
const [sheetSuppressed, setSheetSuppressed] = useState<boolean>(false);
```

2. Atualizar handleOpenPreview:
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
      setSheetSuppressed(true); // Sheet sai do caminho
      setPreviewOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erro inesperado: ${msg}`);
    }
  });
}
```

3. Sheet root condicional:
```tsx
<Sheet open={open && !sheetSuppressed} onOpenChange={onOpenChange} width={480}>
  {/* ... */}
</Sheet>
```

4. Dialog "Ver prompt usado" com z-[70]:
```tsx
<Dialog
  open={previewOpen}
  onOpenChange={(o) => {
    setPreviewOpen(o);
    if (!o) setSheetSuppressed(false); // restaura Sheet quando user fecha preview
  }}
>
  <DialogContent
    className="sm:max-w-3xl z-[70]"
    overlayClassName="z-[70]"
    aria-label="Prompt usado nesta sessão"
  >
    <DialogHeader>
      <DialogTitle>Prompt usado nesta sessão</DialogTitle>
      <DialogDescription>
        Texto enviado ao modelo como system prompt — composto a partir da configuração atual.
      </DialogDescription>
    </DialogHeader>
    <ScrollArea className="max-h-[60vh] rounded-lg border border-border bg-muted/40">
      <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-foreground">
        {previewText}
      </pre>
    </ScrollArea>
  </DialogContent>
</Dialog>
```

- [ ] **Step 3: Visual smoke** — Playground → "Ver prompt usado" → confirma Dialog aparece centralizado, Sheet desaparece, fechar Dialog → Sheet reaparece.

- [ ] **Step 4: Commit:**

```bash
git add src/components/agente-nex/playground-sheet.tsx
git commit -m "fix(agente-nex): T-E6 v0.27 — Dialog 'Ver prompt usado' aparece corretamente (z-[70] + Sheet suppress + toast.error explícito)"
```

---

### Task R1: bump versão + CHANGELOG + STATUS

- [ ] `git fetch origin main` + checar `package.json` atual.
- [ ] Bump 0.26.0 → 0.27.0.
- [ ] CHANGELOG entry (texto completo no v1).
- [ ] STATUS entry (curto).
- [ ] Commit `chore(release): v0.27.0 — Suite Agente Nex Polish v4 (correções v0.26)`.

### Task R2: typecheck + tests + build

- [ ] `npx tsc --noEmit` — 0 erros.
- [ ] `npm test 2>&1 | tail -20` — confirma novas asserts PASS, 20 falhas pré-existentes em integrations-power-bi.
- [ ] `npm run build 2>&1 | tail -10`.

### Task R3: push monitorado + portainer-fix

- [ ] `gh run list --limit 5` — sem builds em curso.
- [ ] `git push origin main`.
- [ ] `gh run watch <id>` (run_in_background).
- [ ] Após build success: `gh workflow run "Portainer fix (worker cmd + APP_VERSION)" -f app_version=v0.27.0`.
- [ ] `until curl -fsS https://insights.nexusai360.com/api/health | grep -q '"v0.27.0"'; do sleep 8; done`.
- [ ] `curl ... /api/health` — confirma v0.27.0 LIVE.

### Task R4: HISTORY + cleanup

- [ ] Append entry em `docs/agents/HISTORY.md`.
- [ ] Delete `docs/agents/active/claude-agente-nex-polish-v027.md`.
- [ ] Memory update.

---

## Self-Review v3

### Spec coverage
- [x] E1+E2 — IDENTITY_BASE editável + PromptPreviewCard sem collapse → E1a, E1b, E1c, E2.
- [x] E3 — Playground input bar = bubble → E3+E4.
- [x] E4 — Playground sendNexMessage com histórico → E3+E4.
- [x] E5 — AudioPlayer speed tag compacta → E5.
- [x] E6 — Dialog "Ver prompt usado" fix → E6.

### Achados v2 → v3
- 5 issues incorporados (trade-off documentado, IdentityBaseEditor tests, audio test verification, fix conservador combinando z-[70]+suppress).

### Placeholder scan — sem TODOs.

### Type consistency
- `NexPromptConfig.identityBase: string | null` (não opcional) consistente em E1b, E1c, E2 (test mocks atualizados em E1c).
- `IdentityBaseEditorProps { current, isCustom, onSaved }` consistente.
- `PromptPreviewCardProps { currentIdentityBase, isIdentityBaseCustom }` consistente E2.
- `sendNexMessage(messages: ChatMessage[])` consistente E3+E4.
