# Suite Agente Nex Polish v4 (v0.27.0) — Plano v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Corrigir os 6 bugs/má-UX da v0.26 apontados pelo super_admin.

**Architecture:** Schema additive (column `identity_base`) + simplificação radical do PlaygroundSheet (deixa de gerenciar prompt-em-edição, usa `sendNexMessage` direto da bubble com histórico). PromptPreviewCard ganha collapse removido + IdentityBaseEditor novo.

**Tech Stack:** Next.js 16 · TS · base-ui · Tailwind v4 · NextAuth v5 · PostgreSQL · Lucide React · Jest.

---

## Diff v1 → v2 (achados pente fino #1)

| # | Categoria | Mudança |
|---|-----------|---------|
| 1 | Crítico (SQL) | **E1c — INSERT/UPDATE com 8 placeholders explícitos** — adicionar identity_base como $1 SHIFT todos os outros. Fornecer SQL completo no plan, não só "adicionar como $1". |
| 2 | Crítico (logic) | **E1b — `advancedOverride` short-circuit precede `identityBase`** — composeSystemPrompt mantém: se advancedOverride setado, retorna ele; senão usa identityBase ?? IDENTITY_BASE. Explicitar no código. |
| 3 | Crítico (closure) | **E3+E4 — construir `history` ANTES de `appendItems(userItem)`** — evita closure stale de `items` dentro do startSend async. |
| 4 | Crítico (cfg snapshot) | **E6 — cfgSnapshot precisa incluir identityBase** — sem ele, previewSystemPromptAction usa cfg sem identityBase e a preview fica inconsistente com o prompt real. |
| 5 | Cobertura | **E1c — listar TODOS os arquivos de mocks que precisam adicionar identityBase: null** — 6 arquivos identificados; não pode esquecer. |
| 6 | Cobertura | **E2 — currentIdentityBase fallback robusto** — se cfg.identityBase é string vazia (após user salvar empty), tratar como null no page. |
| 7 | Robustez | **E5 — atualizar audio-player.test.tsx se houver assertions de className do speed button** (verificar antes do edit). |
| 8 | Robustez | **E6 — Diagnose primeiro: instruir subagente a investigar via DOM/Network/Console antes de aplicar fix**. |
| 9 | Decisão | **Manter testNexPromptAction** (não-bloqueante; usado em testes ainda; deletar futuro se não houver consumers). |
| 10 | Microcopy | **E2 — banner italic em PromptPreviewCard adapta texto pra "Use Editar para alterar o prompt do agente"** já no v1, mas reforçar ESPECÍFICO sobre Personalidade/Tom serem na seção Comportamento abaixo (evita confusão). |
| 11 | TS guard | **NexPromptConfig.identityBase: string \| null** — não opcional. Força todos os mocks a setar explicitamente. |
| 12 | Acessibilidade | **IdentityBaseEditor — Textarea com aria-describedby + helper text persistente** sobre as camadas adicionais. |
| 13 | UX | **IdentityBaseEditor — `window.confirm` no Restaurar padrão** mas só se `text !== current` (user editou) OU `isCustom` (DB tem custom). Senão, restaurar é no-op silencioso. |
| 14 | Test alinhamento | **PlaygroundSheet test — atualizar baseProps adicionando identityBase: null no currentConfig** (E1b mudou o tipo). |

---

## Mapa de arquivos

(igual v1 + ajustes do diff acima)

### Tests que precisam adicionar `identityBase: null` em mocks de NexPromptConfig

```
src/components/agente-nex/__tests__/playground-sheet.test.tsx
src/components/agente-nex/__tests__/prompt-config-form.test.tsx
src/components/agente-nex/__tests__/prompt-preview-card.test.tsx
src/lib/nex/__tests__/prompt-compose.test.ts (já tem alguns)
src/lib/llm/agent/__tests__/run-nex.test.ts (verificar)
src/lib/actions/__tests__/nex-prompt.test.ts (NOVO — já contempla)
```

---

## Tasks (igual v1, com ajustes incorporados nos respectivos passos)

### Task E1a: ensure-tables — column identity_base

(igual v1 — mudança trivial idempotente)

### Task E1b: prompt-compose suporta identityBase override (com short-circuit do advancedOverride)

**Diff v1 → v2:** explicitar que advancedOverride continua tendo precedência total.

Em `src/lib/nex/prompt-compose.ts`, alterar a função `composeSystemPrompt`:

```typescript
export function composeSystemPrompt(
  cfg: NexPromptConfig,
  kbDocs: KbDocSnippet[],
  accountUrls: AccountUrlSnippet[] = [],
): string {
  // Modo manual avançado: substitui TUDO (identidade, personality, tom, guardrails, KB, urls).
  if (cfg.advancedOverride && cfg.advancedOverride.trim().length > 0) {
    return cfg.advancedOverride;
  }
  // v0.27.0: identityBase override do DB (NULL/empty = usa IDENTITY_BASE hardcoded).
  const baseIdentity =
    cfg.identityBase && cfg.identityBase.trim().length > 0
      ? cfg.identityBase
      : IDENTITY_BASE;
  const parts: string[] = [baseIdentity];
  // ... resto igual ...
}
```

### Task E1c: prompt.ts persiste identity_base + Server Actions

**Diff v1 → v2:** SQL explícito.

Em `src/lib/nex/prompt.ts`, substituir o INSERT/UPDATE em `saveNexPromptConfig`:

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

(Total: 8 placeholders na ordem: identity_base, personality, tone, guardrails, advanced_override, audio_input_enabled, kb_enabled, updated_by_id.)

E o `getNexPromptConfig` adiciona identity_base ao SELECT + return:

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
```

E `nex-prompt.ts` Server Actions (saveIdentityBaseAction, resetIdentityBaseAction) — igual v1.

**Step adicional:** atualizar mocks dos 5 arquivos de teste listados. Para cada um, encontrar objetos config com `personality:`, `tone:`, etc, e adicionar `identityBase: null,`.

```bash
# Ajuste em massa (verificar manualmente antes de aceitar):
for f in src/components/agente-nex/__tests__/playground-sheet.test.tsx \
         src/components/agente-nex/__tests__/prompt-config-form.test.tsx \
         src/components/agente-nex/__tests__/prompt-preview-card.test.tsx \
         src/lib/nex/__tests__/prompt-compose.test.ts \
         src/lib/llm/agent/__tests__/run-nex.test.ts; do
  echo "Verificar: $f"
  grep -n "advancedOverride: null" "$f" | head -3
done
```

Para cada match, adicionar a linha `identityBase: null,` ANTES de `personality:` no objeto.

### Task E2: PromptPreviewCard sem collapse + IdentityBaseEditor

**Diff v1 → v2:** microcopy mais específico + window.confirm condicional + Textarea import + aria-describedby.

(corpo igual v1, mas com IdentityBaseEditor refinado:)

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
    // Confirma só se há texto custom no DB OU user editou no form.
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

(Mudança: adicionou `dirty` derived state; Salvar fica disabled quando text === current; Restaurar só pede confirm se há custom ou dirty.)

### Task E3+E4: PlaygroundSheet input bar = bubble + sendNexMessage

**Diff v1 → v2:** construir history ANTES de appendItems pra evitar closure stale.

Em `submitMessage`:

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

Resto igual v1.

### Task E5: AudioPlayer speed tag compacta

**Diff v1 → v2:** verificar test antes do edit.

Step adicional 1.5: `npm test -- audio-player 2>&1 | tail -10` — confirma se há assertions de className do speed button. Se houver, atualizar test.

### Task E6: Dialog "Ver prompt usado" fix (com diagnose-first)

**Diff v1 → v2:** instrução clara de diagnose antes de fix; cfgSnapshot inclui identityBase.

- [ ] **Step 1: Diagnose** — instrução pro subagente:
  1. `npm run dev`
  2. Login super_admin → `/agente-nex/prompt` → Abrir playground.
  3. Abrir DevTools (F12).
  4. Console aberta.
  5. Network aberta.
  6. Clicar "Ver prompt usado".
  7. Anotar:
     - Botão dispara cliques (event listener responde)?
     - `previewSystemPromptAction` é chamado (Network)?
     - Response é success ou error?
     - Console tem erro?
     - DOM tem `<div role="dialog">` mas oculto, ou nem renderiza?

- [ ] **Step 2: Aplicar fix baseado no achado.** 3 cenários no v1.

- [ ] **Step 3: Verificar cfgSnapshot inclui identityBase.** Em `playground-sheet.tsx`, garantir que o config passado ao `previewSystemPromptAction` inclui `identityBase`. Como `currentConfig` vem de prop do `PlaygroundLauncher` (que recebe do page), isso JÁ é incluso quando `cfg.identityBase` está preenchido pelo `getNexPromptConfig` atualizado em E1c. Logo: depois de E1c, cfgSnapshot vai automaticamente ter identityBase. **Sem ação adicional**.

(Resto do plano R1, R2, R3, R4 — igual v1.)

---

## Self-Review v2

### Spec coverage
(igual v1)

### Achados v1 → v2 incorporados
- 14 issues mapeados; críticos resolvidos (SQL explícito, advancedOverride precedence, history closure, mocks listados, cfgSnapshot OK, Diagnose-first no E6).

### Type consistency
- `NexPromptConfig.identityBase: string | null` (não opcional) — força mocks explicitos.
- `IdentityBaseEditorProps { current, isCustom, onSaved }` — consistente.
- `sendNexMessage(messages: ChatMessage[])` — consistente.
- `dirty` boolean derivado — consistente.
