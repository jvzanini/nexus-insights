# Suite Agente Nex Polish v3 (v0.26.0) — Plano de Implementação (v3 final)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar e polir os 4 submenus do Agente Nex (Configuração, Prompt, Playground, Consumo) com USD ticker reativo a spread, identidade fixa colapsável, regra anti-Chatwoot no prompt, tom mais resumido, botão Playground destacado, bubble UX no PlaygroundSheet, fix robusto de z-index do "Ver prompt usado", explicação do Whisper sem tokens, donut com mais respiro, total no filtro mais visível e badges de provider em case-correct.

**Architecture:** Mudanças cirúrgicas — sem alterar nomes de tabelas (`chatwoot_account_urls`, `chatwoot_facts_*`), sem refatorar arquitetura. Migration pura aditiva (`seeded_v2_at` column + UPDATE idempotente). Bump único v0.26.0 ao final.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Recharts · Framer Motion · base-ui · Sonner · BullMQ/Redis · NextAuth v5 · PostgreSQL · Lucide React · Jest + jest-mock-extended · @testing-library/react.

---

## Diff sobre o v2 (achados do pente fino #2)

| # | Categoria | Mudança v2 → v3 |
|---|-----------|------------------|
| 1 | Crítico (concretude) | **R0 → C2: estratégia z-index concreta** — editar `src/components/ui/dialog.tsx` pra aceitar prop `overlayClassName?: string` no `DialogContent`; passar via `cn()` no `<DialogPrimitive.Overlay>` interno. PlaygroundSheet usa `overlayClassName="z-[60]"` + `className="z-[60]"`. |
| 2 | Ordem | **D4 antes de D3** — `PROVIDER_LABELS["gemini"] = "Gemini"` é base do `CustomBarTick`; mudar ordem evita test failure transitório. |
| 3 | Cobertura | **B2 — teste de preservação custom** — adiciona caso "guardrail customizado mencionando 'cite a fonte de cliente X' NÃO é removido" (match exato no SQL `ILIKE '%cite a fonte do número%'`). |
| 4 | Robustez | **A3 — `currentSpreadValue` só atualizado no path de sucesso de `commitSpread`** — explicitamente após `lastSavedSpreadRef.current = parsed` (mesma branch). Documenta no comentário. |
| 5 | Robustez | **C2 — `handleSubmit` antiga removida do PlaygroundSheet** — todo o flow passa por `submitMessage(text)`. |
| 6 | Robustez | **D2 — `border-border/60` em vez de `border-border/40`** — fallback caso a borda do Total fique invisível em dark mode. |
| 7 | Dependência | **A3 depende de A1+A2; C2 depende de R0; D3 depende de D4** — ordem explícita no header de cada task. |
| 8 | Resiliência | **A2 — `setInterval` cancelado no unmount** (já estava ok no v2; v3 só explicita). |
| 9 | Resiliência | **C2 — overlay E content do Dialog em z-[60]** — backdrop não fica atrás do Sheet. |
| 10 | Defensivo | **R1 — `git fetch origin main` ANTES de bump versão** — re-checar `package.json` (outro agente pode ter bumpado pra 0.25 enquanto trabalhei). |
| 11 | Cobertura | **B3 — testar `aria-readonly` removido** — caso simples. |
| 12 | Cobertura | **A2 — testar refresh silencioso (silent=true) NÃO toast** — diferenciar manual vs auto. |
| 13 | Microcopy | **B1 — usar literal "Nunca use 'Chatwoot'"** (com aspas simples) — alinhado com o regex do test. |
| 14 | Decisão explícita | **A3 — comentário no código: "spread é state pra disparar re-render do Ticker; useRef não funciona aqui"** — futuro mantenedor entende o porquê. |

---

## Convenções (mantidas)

- **Antes de qualquer task UI:** o subagente deve invocar `ui-ux-pro-max:ui-ux-pro-max` via Skill tool. Não negociável.
- **TDD:** RED → GREEN → COMMIT por task.
- **Idempotência:** migrations via `ensureNexTables` — sempre `IF NOT EXISTS`, sempre com flag de seed.
- **Commits granulares:** 1 task = 1 commit. Padrão: `feat(agente-nex): T-<grupo><N> v0.26 — <subject>`.
- **Coordenação:** antes de cada commit, `git fetch origin main` + verificar `docs/agents/active/`. Antes de push, `gh run list --limit 5`.

---

## Mapa de arquivos

### Grupo R0 — Pré-requisitos
- **Read:** `src/components/ui/dialog.tsx` — entender API e aplicar `overlayClassName` opcional no `DialogContent`.
- **Modify:** `src/components/ui/dialog.tsx` — adicionar prop `overlayClassName?: string`.

### Grupo A — Configuração (`/agente-nex/configuracao`)
- **Modify:** `src/components/agente-nex/llm-config-form.tsx` — reorg (Toggle / LLM+ações inline / Ticker / Spread destacado); state `currentSpreadValue` reativo pro Ticker.
- **Create:** `src/components/agente-nex/usd-rate-ticker.tsx` — recebe `commercialRate`, `spread` (reativo), `source`, `fetchedAt`; calcula `effectiveRate = commercial × spread` no client; auto-refresh hourly + manual.
- **Create:** `src/lib/actions/exchange-rate-refresh.ts` — Server Action `getCurrentUsdBrlRateAction()` (super_admin gate).
- **Modify:** `src/app/(protected)/agente-nex/configuracao/page.tsx` — passa rate inicial decomposto em props pro form.

### Grupo B — Prompt (`/agente-nex/prompt`)
- **Modify:** `src/lib/nex/prompt-compose.ts` — IDENTITY_BASE: "(Nexus Chat)" único + regra "Nunca use 'Chatwoot'" + máx 3 frases; accountUrls "Mapeamento das contas Nexus Chat".
- **Modify:** `src/lib/nex/ensure-tables.ts` — column `seeded_v2_at` (IF NOT EXISTS); seed v2 sem "cite a fonte"; backfill match-exato.
- **Modify:** `src/components/agente-nex/prompt-preview-card.tsx` — collapse + Editar super_admin only (Dialog max-edit); remover `Maximize2` import + `aria-readonly`.
- **Modify:** `src/components/agente-nex/prompt-config-form.tsx` — adicionar `onSaved?: () => void`; help dos guardrails sem "cite a fonte".
- **Modify:** `src/app/(protected)/agente-nex/prompt/page.tsx` — passa `isSuperAdmin` + `providerKey`.

### Grupo C — Playground (Sheet + Launcher)
- **Modify:** `src/components/agente-nex/playground-launcher.tsx` — botão variant=default + Sparkles + ring; recebe/repassa `providerKey`.
- **Modify:** `src/components/agente-nex/playground-sheet.tsx` — input bar do nex-chat-panel; AudioRecorder embedded; `submitMessage(text)` único helper; Dialog "Ver prompt usado" com `className="z-[60]"` + `overlayClassName="z-[60]"`.

### Grupo D — Consumo (`/agente-nex/consumo`)
- **Modify:** `src/lib/llm/pricing.ts` — `PROVIDER_LABELS["gemini"] = "Gemini"`. (Antes de D3 — dependência.)
- **Modify:** `src/components/charts/bar-chart.tsx` — `CustomBarTick` case-mixed.
- **Modify:** `src/components/charts/donut-with-center.tsx` — defaults `innerRadius=80`, `outerRadius=120`, `height=360`.
- **Modify:** `src/components/llm/consumo-content.tsx` — Total no filtro: text-sm + bg-violet-500/5 dark:bg-violet-500/10 + font-bold + border-border/60; remover override de height/innerR/outerR no donut.
- **Modify:** `src/lib/nex/transcribe.ts` — log inclui body do erro 4xx/5xx do gpt-4o-mini-transcribe.

### Release files
- `package.json`, `CHANGELOG.md`, `docs/STATUS.md`, `docs/agents/HISTORY.md`.

---

## Tasks

> **Ordem definitiva:** R0 → A1, A2, A3 (sequencial: A2 antes de A3) → B1, B2, B3, B4 → C1, C2 (C2 depende de R0) → **D4 → D3** → D1, D2, D5 → R1, R2, R3, R4.

---

### Task R0: dialog primitive — adicionar `overlayClassName` opcional

**Files:**
- Modify: `src/components/ui/dialog.tsx`

**Skill UI/UX:** invocar `ui-ux-pro-max:ui-ux-pro-max` antes de mexer (mesmo sendo primitive: garante que mudança é defensiva e backwards-compatible).

- [ ] **Step 1: Ler arquivo**

```bash
cat src/components/ui/dialog.tsx
```

Identificar:
- Qual classname tem `z-50` (Overlay default).
- Como `DialogContent` recebe e merga className.

- [ ] **Step 2: Edit**

Aceitar prop opcional `overlayClassName` no `DialogContent` e propagar pro Overlay interno (caso o componente tenha `<Overlay>` interno; em alguns shadcn templates, Overlay é peer ao Content).

Padrão esperado (assumindo o componente compõe Overlay+Content como filhos do Portal):

```typescript
// Antes (típico):
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 ...",
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));

// Depois:
interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  overlayClassName?: string;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, overlayClassName, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 ...",
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;
```

(Se o `DialogOverlay` tem `z-50` hardcoded e o consumidor passa `z-[60]`, o `cn()` precisa garantir que a CLASSE NOVA vença. Tailwind merge resolve isso quando ambas são `z-*`.)

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "components/ui/dialog" || echo "OK"
```

- [ ] **Step 4: Smoke test em outro Dialog do projeto** (verificar nada quebrou):

```bash
npm test -- ui/dialog 2>&1 | tail -10
# Se não houver test específico, rodar test que use Dialog (ex: prompt-preview-card)
npm test -- prompt-preview-card 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/dialog.tsx
git commit -m "feat(ui): T-R0 v0.26 — Dialog aceita overlayClassName opcional (suporta z-[60] override)"
```

---

### Task A1: USD Rate Ticker — Server Action

**Depende de:** nada.

**Files:**
- Create: `src/lib/actions/exchange-rate-refresh.ts`
- Test: `src/lib/actions/__tests__/exchange-rate-refresh.test.ts`

- [ ] **Step 1: Skill ui-ux-pro-max** — não aplica (server-only).

- [ ] **Step 2: Write failing test**

```typescript
// src/lib/actions/__tests__/exchange-rate-refresh.test.ts
import { jest } from "@jest/globals";

jest.mock("@/lib/llm/exchange-rate", () => ({
  getUsdBrlRate: jest.fn(),
  __resetUsdBrlCache: jest.fn(),
}));
jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

import { getCurrentUsdBrlRateAction } from "../exchange-rate-refresh";
import { getUsdBrlRate, __resetUsdBrlCache } from "@/lib/llm/exchange-rate";
import { getCurrentUser } from "@/lib/auth";

describe("getCurrentUsdBrlRateAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("super_admin: invalida memo e retorna rate atual", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ platformRole: "super_admin" });
    (getUsdBrlRate as jest.Mock).mockResolvedValue({
      rate: 6.05,
      commercial: 5.5,
      spread: 1.1,
      source: "live",
      fetchedAt: new Date("2026-05-03T14:00:00Z"),
    });

    const result = await getCurrentUsdBrlRateAction();

    expect(__resetUsdBrlCache).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rate).toBe(6.05);
      expect(result.data.source).toBe("live");
    }
  });

  it("não-superadmin: nega acesso", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ platformRole: "viewer" });
    const result = await getCurrentUsdBrlRateAction();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/permissão/i);
    }
  });

  it("não autenticado: nega", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const result = await getCurrentUsdBrlRateAction();
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run test (RED)**

```bash
npm test -- exchange-rate-refresh
```

- [ ] **Step 4: Implement**

```typescript
// src/lib/actions/exchange-rate-refresh.ts
"use server";

import { getCurrentUser } from "@/lib/auth";
import {
  __resetUsdBrlCache,
  getUsdBrlRate,
  type UsdBrlRate,
} from "@/lib/llm/exchange-rate";

export type GetUsdBrlActionResult =
  | { ok: true; data: UsdBrlRate }
  | { ok: false; error: string };

export async function getCurrentUsdBrlRateAction(): Promise<GetUsdBrlActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  if (user.platformRole !== "super_admin") {
    return { ok: false, error: "Sem permissão para consultar a cotação" };
  }
  __resetUsdBrlCache();
  const data = await getUsdBrlRate();
  return { ok: true, data };
}
```

- [ ] **Step 5: Run tests (GREEN)**

```bash
npm test -- exchange-rate-refresh
```

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "exchange-rate-refresh" || echo "OK"
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/actions/exchange-rate-refresh.ts src/lib/actions/__tests__/exchange-rate-refresh.test.ts
git commit -m "feat(agente-nex): T-A1 v0.26 — Server Action getCurrentUsdBrlRateAction (super_admin gate, invalida memo + retorna rate)"
```

---

### Task A2: UsdRateTicker — client component reativo a spread

**Depende de:** A1.

**Files:**
- Create: `src/components/agente-nex/usd-rate-ticker.tsx`
- Test: `src/components/agente-nex/__tests__/usd-rate-ticker.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — invocar. Validar:
  - Card border + bg-muted/30, ícone DollarSign violet, badge live/cache/fallback semântico, refresh circular pequeno, tabular-nums, tooltip explicativo.

- [ ] **Step 2: Write failing test**

```typescript
// src/components/agente-nex/__tests__/usd-rate-ticker.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UsdRateTicker } from "../usd-rate-ticker";

const mockAction = jest.fn();
jest.mock("@/lib/actions/exchange-rate-refresh", () => ({
  getCurrentUsdBrlRateAction: (...args: unknown[]) => mockAction(...args),
}));

const mockToast = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    error: (msg: string) => mockToast("error", msg),
    success: (msg: string) => mockToast("success", msg),
  },
}));

describe("UsdRateTicker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renderiza commercial × spread = effective rate", () => {
    render(
      <UsdRateTicker
        commercialRate={5.5}
        spread={1.1}
        source="live"
        fetchedAt={new Date("2026-05-03T14:00:00Z")}
      />,
    );
    expect(screen.getByText(/6[,.]05/)).toBeInTheDocument();
    expect(screen.getByText(/Live/i)).toBeInTheDocument();
  });

  it("recalcula rate quando spread muda (reativo)", () => {
    const { rerender } = render(
      <UsdRateTicker
        commercialRate={5.0}
        spread={1.10}
        source="live"
        fetchedAt={new Date()}
      />,
    );
    expect(screen.getByText(/5[,.]50/)).toBeInTheDocument();
    rerender(
      <UsdRateTicker
        commercialRate={5.0}
        spread={1.20}
        source="live"
        fetchedAt={new Date()}
      />,
    );
    expect(screen.getByText(/6[,.]00/)).toBeInTheDocument();
  });

  it("clicar refresh dispara action e atualiza commercial", async () => {
    mockAction.mockResolvedValue({
      ok: true,
      data: {
        rate: 6.16,
        commercial: 5.6,
        spread: 1.10,
        source: "live",
        fetchedAt: new Date(),
      },
    });
    render(
      <UsdRateTicker
        commercialRate={5.5}
        spread={1.1}
        source="cache"
        fetchedAt={new Date()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /atualizar/i }));
    await waitFor(() => expect(mockAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/6[,.]16/)).toBeInTheDocument());
  });

  it("source 'cache' usa estilo amber", () => {
    render(
      <UsdRateTicker
        commercialRate={5.5}
        spread={1.1}
        source="cache"
        fetchedAt={new Date()}
      />,
    );
    const badge = screen.getByText(/Cache/i);
    expect(badge.className).toMatch(/amber/);
  });

  it("source 'fallback' usa estilo destrutivo", () => {
    render(
      <UsdRateTicker
        commercialRate={5.5}
        spread={1.1}
        source="fallback"
        fetchedAt={new Date()}
      />,
    );
    const badge = screen.getByText(/Fallback/i);
    expect(badge.className).toMatch(/destructive|red/);
  });

  it("erro do action manual mostra toast.error", async () => {
    mockAction.mockResolvedValue({ ok: false, error: "Sem permissão" });
    render(
      <UsdRateTicker
        commercialRate={5.5}
        spread={1.1}
        source="live"
        fetchedAt={new Date()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /atualizar/i }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith("error", "Sem permissão"),
    );
  });
});
```

- [ ] **Step 3: Run test (RED)**

```bash
npm test -- usd-rate-ticker
```

- [ ] **Step 4: Implement**

```tsx
// src/components/agente-nex/usd-rate-ticker.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { DollarSign, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getCurrentUsdBrlRateAction } from "@/lib/actions/exchange-rate-refresh";
import type { UsdBrlRate } from "@/lib/llm/exchange-rate";

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

type Source = UsdBrlRate["source"];

interface UsdRateTickerProps {
  /** Cotação comercial (sem spread). Atualiza no refresh. */
  commercialRate: number;
  /** Spread cartão atual — REATIVO. Quando o user altera no Spread form, o pai re-renderiza com novo valor. */
  spread: number;
  source: Source;
  fetchedAt: Date | string;
}

const SOURCE_STYLES: Record<Source, string> = {
  live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cache: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  fallback: "bg-destructive/10 text-destructive",
};

const SOURCE_LABELS: Record<Source, string> = {
  live: "Live",
  cache: "Cache",
  fallback: "Fallback",
};

export function UsdRateTicker({
  commercialRate: commercialInitial,
  spread,
  source: sourceInitial,
  fetchedAt: fetchedAtInitial,
}: UsdRateTickerProps) {
  const [commercial, setCommercial] = useState<number>(commercialInitial);
  const [source, setSource] = useState<Source>(sourceInitial);
  const [fetchedAt, setFetchedAt] = useState<Date>(
    fetchedAtInitial instanceof Date ? fetchedAtInitial : new Date(fetchedAtInitial),
  );
  const [isRefreshing, startRefresh] = useTransition();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function refresh(silent = false) {
    startRefresh(async () => {
      const result = await getCurrentUsdBrlRateAction();
      if (!result.ok) {
        if (!silent) toast.error(result.error);
        return;
      }
      setCommercial(result.data.commercial);
      setSource(result.data.source);
      setFetchedAt(
        result.data.fetchedAt instanceof Date
          ? result.data.fetchedAt
          : new Date(result.data.fetchedAt),
      );
      if (!silent) toast.success("Cotação atualizada");
    });
  }

  useEffect(() => {
    intervalRef.current = setInterval(() => refresh(true), REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveRate = commercial * spread;

  return (
    <Card className="rounded-xl border border-border bg-muted/30">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500"
          >
            <DollarSign className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              USD/BRL com spread
            </p>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {brlFmt.format(effectiveRate)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
              Comercial {brlFmt.format(commercial)} × Spread {spread.toFixed(2)} ·
              Atualizado às {timeFmt.format(fetchedAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
              SOURCE_STYLES[source],
            )}
          >
            {SOURCE_LABELS[source]}
          </span>
          <button
            type="button"
            onClick={() => refresh(false)}
            disabled={isRefreshing}
            aria-label="Atualizar cotação agora"
            title="Atualiza automaticamente a cada 1 hora"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Run tests (GREEN)**

```bash
npm test -- usd-rate-ticker
```

- [ ] **Step 6: Commit**

```bash
git add src/components/agente-nex/usd-rate-ticker.tsx src/components/agente-nex/__tests__/usd-rate-ticker.test.tsx
git commit -m "feat(agente-nex): T-A2 v0.26 — UsdRateTicker reativo a spread (auto-refresh hourly + manual + source badge + toast errors)"
```

---

### Task A3: integrar UsdRateTicker + reorganizar Configuração

**Depende de:** A1, A2.

**Files:**
- Modify: `src/app/(protected)/agente-nex/configuracao/page.tsx`
- Modify: `src/components/agente-nex/llm-config-form.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — validar:
  - Hierarquia: 1) Toggle Nex; 2) LLM section + ações inline; 3) Ticker; 4) Spread destacado.
  - Spread em Card violet (`border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/10`).
  - Label `<Label htmlFor>` semântico + span "× " decorativo `aria-hidden`.

- [ ] **Step 2: Modify page**

```tsx
// src/app/(protected)/agente-nex/configuracao/page.tsx
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

  const [llmConfig, nexBubbleEnabled, initialCredentials, currentRate] =
    await Promise.all([
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
        subtitle="Provedor, modelo, chave em uso, cotação USD/BRL e spread cartão."
      />
      <Card className="rounded-2xl border border-border bg-muted/30 p-2">
        <CardContent>
          <LlmConfigForm
            initial={llmConfig}
            initialNexEnabled={nexBubbleEnabled}
            initialCredentials={initialCredentials}
            initialSpread={initialSpread}
            initialCommercialRate={currentRate?.commercial ?? null}
            initialRateSource={currentRate?.source ?? null}
            initialFetchedAt={currentRate?.fetchedAt ? currentRate.fetchedAt.toISOString() : null}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
```

- [ ] **Step 3: Modify LlmConfigForm**

Em `src/components/agente-nex/llm-config-form.tsx`:

1. **Adicionar imports:**
```typescript
import { UsdRateTicker } from "@/components/agente-nex/usd-rate-ticker";
import type { UsdBrlRate } from "@/lib/llm/exchange-rate";
```

2. **Atualizar props:**
```typescript
interface LlmConfigFormProps {
  initial: PublicLlmConfig | null;
  initialNexEnabled: boolean;
  initialCredentials: CredentialSummary[];
  initialSpread: number;
  initialCommercialRate: number | null;
  initialRateSource: UsdBrlRate["source"] | null;
  /** ISO string ou null. Convertido pra Date no UsdRateTicker. */
  initialFetchedAt: string | null;
}
```

3. **Adicionar state reativo:**
```typescript
// `currentSpreadValue` é STATE (não useRef) porque o UsdRateTicker precisa
// re-renderizar quando o spread muda — useRef.current não dispara React update.
const [currentSpreadValue, setCurrentSpreadValue] = useState<number>(initialSpread);
```

4. **Atualizar `commitSpread`** — apenas no path de sucesso:

```typescript
function commitSpread(rawValue: string) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    toast.error("Spread inválido");
    setSpreadInput(lastSavedSpreadRef.current.toFixed(2));
    return;
  }
  if (parsed <= 0) {
    toast.error("Spread deve ser maior que zero");
    setSpreadInput(lastSavedSpreadRef.current.toFixed(2));
    return;
  }
  if (Math.abs(parsed - lastSavedSpreadRef.current) < 1e-9) {
    setSpreadInput(parsed.toFixed(2));
    return;
  }
  setIsSavingSpread(true);
  void (async () => {
    try {
      const result = await setCardSpreadAction(parsed);
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao salvar spread");
        setSpreadInput(lastSavedSpreadRef.current.toFixed(2));
        return;
      }
      // Path de sucesso — só aqui atualiza ref + state reativo do Ticker.
      lastSavedSpreadRef.current = parsed;
      setCurrentSpreadValue(parsed);
      setSpreadInput(parsed.toFixed(2));
      toast.success("Spread atualizado");
      router.refresh();
    } finally {
      setIsSavingSpread(false);
    }
  })();
}
```

5. **Reordenar JSX** (substituir return existente):

```tsx
return (
  <div className="space-y-8">
    {/* 1. Toggle Nex (mantém JSX existente) */}
    <div /* ...existing toggle... */ />

    {/* 2. LLM section + ações INLINE */}
    <div className="space-y-6 border-t border-border/50 pt-6">
      {/* banner verde "Configurado" — existing */}
      {/* grid Provedor / Modelo — existing */}
      {/* Chave de API + atalhos — existing */}
      {/* test result panel — existing */}

      {/* AÇÕES — agora inline na LLM section */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={handleTest}
          disabled={actionsDisabled}
          className="cursor-pointer min-h-[44px]"
        >
          {isTesting ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Plug className="mr-1.5 h-4 w-4" />
          )}
          Testar conexão
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={actionsDisabled}
          className="cursor-pointer min-h-[44px]"
        >
          {isSaving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Salvar configuração
        </Button>
      </div>
    </div>

    {/* 3. USD Ticker (NOVO) */}
    {initialCommercialRate !== null &&
    initialRateSource !== null &&
    initialFetchedAt !== null ? (
      <div className="border-t border-border/50 pt-6">
        <UsdRateTicker
          commercialRate={initialCommercialRate}
          spread={currentSpreadValue}
          source={initialRateSource}
          fetchedAt={initialFetchedAt}
        />
      </div>
    ) : null}

    {/* 4. Spread destacado */}
    <div className="space-y-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 dark:bg-violet-500/10">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-violet-500" />
        <Label htmlFor="llm-card-spread" className="text-sm font-semibold text-foreground">
          Spread cartão
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Multiplicador aplicado sobre a cotação comercial USD/BRL pra refletir IOF + spread Visa/Master. Default 1,10 ≈ 10% acima da comercial. Ajuste pra refletir seu cartão real (sem limite superior).
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground" aria-hidden>×</span>
        <Input
          id="llm-card-spread"
          type="number"
          step="0.01"
          value={spreadInput}
          onChange={handleSpreadChange}
          onBlur={handleSpreadBlur}
          disabled={isSavingSpread}
          className="min-h-[44px] w-32"
          aria-describedby="llm-card-spread-help"
          aria-label="Spread cartão (multiplicador USD/BRL)"
        />
        {isSavingSpread ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      <p id="llm-card-spread-help" className="sr-only">
        Multiplicador positivo, sem limite superior. Default 1.10.
      </p>
    </div>

    {/* hint sem credenciais — existing */}
    {hasNoCredentials ? (
      <p className="text-xs text-amber-600 dark:text-amber-400" role="note">
        Sem chaves cadastradas para {catalog.label} — botões desativados.
      </p>
    ) : null}
  </div>
);
```

- [ ] **Step 4: Atualizar tests existentes** (se quebrarem com props novas)

```bash
npm test -- llm-config-form
```

Adicionar mocks vazios pras props novas (pode passar `initialCommercialRate={null}` etc nos tests existentes).

- [ ] **Step 5: Visual smoke**

```bash
npm run dev
```

Navegar `/agente-nex/configuracao`:
- 4 sections empilhadas.
- Mudar spread → ticker atualiza imediatamente (re-render reativo).
- Refresh manual no ticker funciona.
- Botões "Testar conexão" + "Salvar" agora aparecem na LLM section.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(protected\)/agente-nex/configuracao/page.tsx src/components/agente-nex/llm-config-form.tsx
git commit -m "feat(agente-nex): T-A3 v0.26 — Configuração reorg (Toggle / LLM+ações inline / USD ticker reativo / Spread destacado)"
```

---

### Task B1: prompt-compose IDENTITY_BASE — anti-Chatwoot + concisão

**Depende de:** nada.

**Files:**
- Modify: `src/lib/nex/prompt-compose.ts`
- Test: `src/lib/nex/__tests__/prompt-compose.test.ts`

- [ ] **Step 1: Skill ui-ux-pro-max** — não aplica.

- [ ] **Step 2: Write failing tests**

```typescript
import { IDENTITY_BASE, composeSystemPrompt } from "../prompt-compose";

describe("IDENTITY_BASE — anti-Chatwoot e concisão (v0.26)", () => {
  it("não menciona 'Chatwoot' (substituído por 'Nexus Chat')", () => {
    expect(IDENTITY_BASE).not.toMatch(/Chatwoot/);
    expect(IDENTITY_BASE).toMatch(/Nexus Chat/);
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
```

- [ ] **Step 3: Run test (RED)**

```bash
npm test -- prompt-compose
```

- [ ] **Step 4: Implement**

Substituir `IDENTITY_BASE`:

```typescript
export const IDENTITY_BASE = `Você é o Agente Nex — assistente da plataforma Nexus Insights, que reúne relatórios e analytics do atendimento (Nexus Chat).

## Postura
- Respostas curtas e diretas. **Máximo 3 frases por resposta**, salvo se o usuário pedir detalhe explícito.
- Sem se apresentar a cada turno (apresente-se só no primeiro contato da sessão).
- Sem citar nomes técnicos internos (tools, queries, campos, "dashboard summary", "snapshot", etc.). Fale como um analista, não como um console.
- Pergunta objetiva → resposta objetiva. Sem rodeios.

## Identidade
- Você é o Agente Nex. Não mencione modelos comerciais ("ChatGPT", "GPT", "Claude", "Gemini", "OpenAI", "Anthropic", "Google") como sua identidade.
- Quando perguntarem sobre seus parâmetros técnicos: "Sou um assistente configurado pela Nexus Insights. Os parâmetros são gerenciados pela equipe da plataforma."
- **Nunca use 'Chatwoot' nas respostas.** Mesmo que o conhecimento, links ou contexto técnico mencione esse termo, sempre se refira à plataforma como **'Nexus Chat'**. Sem exceções.

## Operação
- Idioma: pt-BR. Fuso: America/Sao_Paulo. Datas: dd/mm/aaaa. Números: pt-BR (1.234,56).
- Não invente dados. Quando precisar de número, use as ferramentas disponíveis.
- Tópicos fora do escopo (clima, política, programação, etc.): "Esse tópico está fora do escopo do Agente Nex."
- Para deep-links de conversa: use o mapeamento de URL pública configurado (se disponível); senão, avise o usuário em vez de inventar.`;
```

E na função `composeSystemPrompt`, na seção de accountUrls:

```typescript
parts.push(
  `\n\n## URLs públicas das contas\nMapeamento das contas Nexus Chat para a interface pública (use para montar deep-links no formato {publicUrl}/app/accounts/{accountId}/conversations/{conversationId}):\n${bullets}`,
);
```

- [ ] **Step 5: Run tests (GREEN)**

```bash
npm test -- prompt-compose
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/nex/prompt-compose.ts src/lib/nex/__tests__/prompt-compose.test.ts
git commit -m "feat(agente-nex): T-B1 v0.26 — IDENTITY_BASE anti-Chatwoot + máx 3 frases + accountUrls 'Nexus Chat'"
```

---

### Task B2: ensure-tables — backfill match-exato + flag seeded_v2_at

**Depende de:** nada.

**Files:**
- Modify: `src/lib/nex/ensure-tables.ts`
- Test: `src/lib/nex/__tests__/ensure-tables.test.ts`

- [ ] **Step 1: Skill ui-ux-pro-max** — não aplica.

- [ ] **Step 2: Write failing tests**

```typescript
describe("ensure-tables — guardrails seed v2 + backfill (v0.26)", () => {
  it("seed novo NÃO inclui 'Sempre cite a fonte do número'", async () => {
    const { mockedPgPool } = setupMocks();
    await ensureNexTables();
    const seedCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).includes("Nunca exponha dados"),
    );
    expect(seedCall).toBeDefined();
    expect(String(seedCall![0])).not.toMatch(/Sempre cite a fonte do número/);
  });

  it("backfill usa match EXATO 'cite a fonte do número' (preserva customizações que mencionem 'cite a fonte' em outro contexto)", async () => {
    const { mockedPgPool } = setupMocks();
    await ensureNexTables();
    const backfillCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).match(/seeded_v2_at\s*=\s*now\(\)/i),
    );
    expect(backfillCall).toBeDefined();
    const backfillSql = String(backfillCall![0]);
    // Match EXATO — não usa só 'cite a fonte' (false-positive em customizações)
    expect(backfillSql).toMatch(/cite a fonte do número/i);
    expect(backfillSql).not.toMatch(/ILIKE\s+'%cite a fonte%'/i); // não match genérico
  });

  it("seed da column seeded_v2_at é IF NOT EXISTS (idempotente)", async () => {
    const { mockedPgPool } = setupMocks();
    await ensureNexTables();
    const alterCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).match(/ADD COLUMN IF NOT EXISTS\s+"?seeded_v2_at/i),
    );
    expect(alterCall).toBeDefined();
  });

  it("backfill condicional: WHERE seeded_v2_at IS NULL (idempotente — só roda 1 vez por install)", async () => {
    const { mockedPgPool } = setupMocks();
    await ensureNexTables();
    const backfillCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).match(/seeded_v2_at\s*=\s*now\(\)/i),
    );
    expect(String(backfillCall![0])).toMatch(/seeded_v2_at IS NULL/);
  });
});
```

- [ ] **Step 3: Run test (RED)**

```bash
npm test -- ensure-tables
```

- [ ] **Step 4: Implement**

Em `src/lib/nex/ensure-tables.ts`, substituir o seed antigo de guardrails (linhas 65-78) E adicionar column + backfill:

```typescript
// v0.26.0: column flag pra backfill idempotente
await pgPool.query(`
  ALTER TABLE "nex_settings"
    ADD COLUMN IF NOT EXISTS "seeded_v2_at" TIMESTAMPTZ NULL;
`);

// v0.26.0: seed novo SEM "cite a fonte" — backfill condicional pra installs novos
await pgPool.query(`
  UPDATE "nex_settings"
  SET "guardrails" = '[
    "Nunca exponha dados de uma conta diferente da ativa no contexto.",
    "Nunca compartilhe API keys, tokens, secrets, IDs internos ou variáveis de ambiente.",
    "Se um número parecer impossível ou inconsistente, alerte o usuário antes de afirmar.",
    "Não execute, sugira ou simule ações destrutivas (apagar conversas, mudar config sem confirmação, mexer em produção)."
  ]'::jsonb,
  "seeded_defaults_at" = COALESCE("seeded_defaults_at", now())
  WHERE "id" = 'global'
    AND "seeded_defaults_at" IS NULL
    AND ("guardrails" IS NULL OR "guardrails" = '[]'::jsonb);
`);

// v0.26.0: backfill — remove guardrail "Sempre cite a fonte do número..." de
// installs antigos. Match EXATO do texto do seed antigo (preserva guardrails
// customizados que mencionem "cite a fonte" em outro contexto). Idempotente
// via "seeded_v2_at" — só roda 1 vez por install.
await pgPool.query(`
  UPDATE "nex_settings"
  SET "guardrails" = COALESCE(
    (SELECT jsonb_agg(elem)
     FROM jsonb_array_elements("guardrails") AS elem
     WHERE elem::text NOT ILIKE '%cite a fonte do número%'),
    '[]'::jsonb
  ),
  "seeded_v2_at" = now()
  WHERE "id" = 'global'
    AND "seeded_v2_at" IS NULL;
`);
```

- [ ] **Step 5: Run tests (GREEN)**

```bash
npm test -- ensure-tables
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/nex/ensure-tables.ts src/lib/nex/__tests__/ensure-tables.test.ts
git commit -m "fix(agente-nex): T-B2 v0.26 — seed v2 sem 'cite a fonte' + backfill idempotente match-exato (seeded_v2_at)"
```

---

### Task B3: PromptPreviewCard — collapse + role-gated edit

**Depende de:** nada (B3 não depende de B1/B2 logicamente).

**Files:**
- Modify: `src/components/agente-nex/prompt-preview-card.tsx`
- Modify: `src/components/agente-nex/prompt-config-form.tsx`
- Modify: `src/app/(protected)/agente-nex/prompt/page.tsx`
- Test: `src/components/agente-nex/__tests__/prompt-preview-card.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — validar:
  - Botões: Copiar (todos) + Editar (super_admin only). Sem Maximizar.
  - Collapse "Ver prompt completo (somente leitura)" oculto por default.
  - Editar abre Dialog max-edit (`max-w-1000`, `max-h-90vh`, ScrollArea interno) com `<PromptConfigForm>` dentro.
  - Microcopy: "Apenas super_admins podem editar." pra não-super_admin.
  - Imports limpos: SEM `Maximize2`.

- [ ] **Step 2: Write failing tests**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { PromptPreviewCard } from "../prompt-preview-card";

const baseConfig = {
  personality: "",
  tone: "",
  guardrails: [],
  advancedOverride: null,
  audioInputEnabled: false,
  kbEnabled: false,
};

describe("PromptPreviewCard — v0.26", () => {
  it("oculta o prompt por default; revela ao clicar no collapse", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin
      />,
    );
    expect(screen.queryByTestId("prompt-preview")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /ver prompt completo/i }));
    expect(screen.getByTestId("prompt-preview")).toBeInTheDocument();
  });

  it("super_admin vê Editar (e NÃO vê Maximizar)", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin
      />,
    );
    expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /maximizar/i })).not.toBeInTheDocument();
  });

  it("não super_admin: NÃO vê Editar, mostra microcopy explicativo", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin={false}
      />,
    );
    expect(screen.getByRole("button", { name: /copiar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Apenas super_admins podem editar/i)).toBeInTheDocument();
  });

  it("clicar Editar (super_admin) abre Dialog max-edit", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Editar prompt do Agente Nex/i)).toBeInTheDocument();
  });

  it("pre do prompt-preview NÃO usa aria-readonly (atributo inválido em HTML)", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ver prompt completo/i }));
    const pre = screen.getByTestId("prompt-preview");
    expect(pre.getAttribute("aria-readonly")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test (RED)**

```bash
npm test -- prompt-preview-card
```

- [ ] **Step 4: Implement PromptPreviewCard**

Substituir conteúdo de `src/components/agente-nex/prompt-preview-card.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { BookText, ChevronRight, Copy, Pencil } from "lucide-react";
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
import { PromptConfigForm } from "@/components/agente-nex/prompt-config-form";
import {
  composeSystemPrompt,
  type AccountUrlSnippet,
  type KbDocSnippet,
  type NexPromptConfig,
} from "@/lib/nex/prompt-compose";
import { cn } from "@/lib/utils";

interface PromptPreviewCardProps {
  config: NexPromptConfig;
  kbDocs: KbDocSnippet[];
  accountUrls: AccountUrlSnippet[];
  isSuperAdmin: boolean;
}

export function PromptPreviewCard({
  config,
  kbDocs,
  accountUrls,
  isSuperAdmin,
}: PromptPreviewCardProps) {
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [showFull, setShowFull] = useState<boolean>(false);

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
              ? "Use Editar para ajustar Personalidade · Tom · Guardrails · Modo manual."
              : "Apenas super_admins podem editar."}
          </p>

          <button
            type="button"
            onClick={() => setShowFull((v) => !v)}
            aria-expanded={showFull}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                showFull && "rotate-90",
              )}
              aria-hidden="true"
            />
            {showFull
              ? "Ocultar prompt completo"
              : "Ver prompt completo (somente leitura)"}
          </button>

          {showFull ? (
            <ScrollArea className="max-h-[400px] w-full overflow-x-hidden rounded-lg border border-border bg-muted/40">
              <pre
                data-testid="prompt-preview"
                className="min-w-0 cursor-text p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground"
              >
                {prompt}
              </pre>
            </ScrollArea>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-[min(1000px,95vw)] flex-col gap-3 p-6 sm:max-w-[min(1000px,95vw)]">
          <DialogHeader>
            <DialogTitle>Editar prompt do Agente Nex</DialogTitle>
            <DialogDescription>
              Personalidade, Tom, Guardrails e Modo prompt manual. Salvar atualiza imediatamente.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1 w-full pr-2">
            <PromptConfigForm initial={config} onSaved={() => setEditOpen(false)} />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 5: Update PromptConfigForm — `onSaved`**

Em `src/components/agente-nex/prompt-config-form.tsx`:

```typescript
interface PromptConfigFormProps {
  initial: NexPromptConfig;
  onSaved?: () => void;
}

export function PromptConfigForm({ initial, onSaved }: PromptConfigFormProps) {
  // ... existing code ...

  function handleSave() {
    if (overrideOn && override.trim().length === 0) {
      toast.error("Modo manual ativo precisa de texto não-vazio.");
      return;
    }
    startSave(async () => {
      const result = await saveNexPromptConfigAction(currentConfig);
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao salvar configuração");
        return;
      }
      toast.success("Configuração do Agente Nex salva");
      router.refresh();
      onSaved?.();
    });
  }
}
```

- [ ] **Step 6: Update prompt page — `isSuperAdmin`**

Em `src/app/(protected)/agente-nex/prompt/page.tsx`:

```tsx
const isSuperAdmin = user.platformRole === "super_admin";

// ... no JSX:
<PromptPreviewCard
  config={cfg}
  kbDocs={kbForPrompt}
  accountUrls={accountUrls}
  isSuperAdmin={isSuperAdmin}
/>
```

- [ ] **Step 7: Run tests (GREEN)**

```bash
npm test -- prompt-preview-card
```

- [ ] **Step 8: Commit**

```bash
git add src/components/agente-nex/prompt-preview-card.tsx src/components/agente-nex/prompt-config-form.tsx src/app/\(protected\)/agente-nex/prompt/page.tsx src/components/agente-nex/__tests__/prompt-preview-card.test.tsx
git commit -m "feat(agente-nex): T-B3 v0.26 — PromptPreviewCard collapse + Editar super_admin only (Dialog max-edit + onSaved)"
```

---

### Task B4: prompt-config-form — help text

**Files:**
- Modify: `src/components/agente-nex/prompt-config-form.tsx`

- [ ] **Step 1: Edit (~linha 308):**

```tsx
<p className="text-xs text-muted-foreground">
  Regras que o agente nunca deve violar (ex.: &quot;Nunca exponha dados
  de outro tenant&quot;, &quot;Não simule ações destrutivas&quot;).
</p>
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "prompt-config-form" || echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add src/components/agente-nex/prompt-config-form.tsx
git commit -m "feat(agente-nex): T-B4 v0.26 — help text dos guardrails sem 'cite a fonte'"
```

---

### Task C1: PlaygroundLauncher — botão destacado + providerKey

**Depende de:** nada.

**Files:**
- Modify: `src/components/agente-nex/playground-launcher.tsx`
- Modify: `src/app/(protected)/agente-nex/prompt/page.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — validar:
  - variant=default + size=default + Sparkles + ring violet sutil + min-h-[44px].

- [ ] **Step 2: Edit playground-launcher.tsx**

```tsx
"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PlaygroundSheet } from "@/components/agente-nex/playground-sheet";
import type { NexPromptConfig } from "@/lib/nex/prompt";
import type { LlmProvider } from "@/lib/llm/types";

interface PlaygroundLauncherProps {
  currentConfig: NexPromptConfig;
  /** Key canonic do provider — usada pra gating de áudio. null = não configurado. */
  providerKey: LlmProvider | null;
  /** Label legível do provider (ex.: "OpenAI"). */
  providerLabel?: string;
  /** Label do modelo (ex.: "gpt-5.4-nano"). */
  modelLabel?: string;
}

export function PlaygroundLauncher({
  currentConfig,
  providerKey,
  providerLabel,
  modelLabel,
}: PlaygroundLauncherProps) {
  const [open, setOpen] = useState<boolean>(false);
  const ready = !!providerLabel && !!modelLabel && providerKey !== null;

  return (
    <>
      <Button
        type="button"
        variant="default"
        size="default"
        onClick={() => setOpen(true)}
        disabled={!ready}
        title={
          ready
            ? "Abrir playground em painel lateral"
            : "Configure provider e modelo primeiro em /agente-nex/configuracao"
        }
        className="cursor-pointer min-h-[44px] gap-2 shadow-sm shadow-violet-600/20 ring-1 ring-violet-400/20 hover:shadow-md hover:shadow-violet-600/30 hover:ring-violet-400/40"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" strokeWidth={2.25} />
        Abrir playground
      </Button>

      <PlaygroundSheet
        open={open}
        onOpenChange={setOpen}
        currentConfig={currentConfig}
        providerKey={providerKey}
        providerLabel={providerLabel}
        modelLabel={modelLabel}
      />
    </>
  );
}
```

- [ ] **Step 3: Update prompt page — `providerKey`**

Em `src/app/(protected)/agente-nex/prompt/page.tsx`:

```tsx
actions={
  <PlaygroundLauncher
    currentConfig={cfg}
    providerKey={providerAtual}
    providerLabel={providerLabel}
    modelLabel={modelLabel}
  />
}
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(playground-launcher|prompt/page)" || echo "OK"
```

- [ ] **Step 5: Commit**

```bash
git add src/components/agente-nex/playground-launcher.tsx src/app/\(protected\)/agente-nex/prompt/page.tsx
git commit -m "feat(agente-nex): T-C1 v0.26 — Playground launcher destacado (violet primary + Sparkles + ring) + providerKey canonic"
```

---

### Task C2: PlaygroundSheet — bubble UX + áudio + z-[60]

**Depende de:** R0, C1.

**Files:**
- Modify: `src/components/agente-nex/playground-sheet.tsx`
- Test: `src/components/agente-nex/__tests__/playground-sheet.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — validar:
  - Layout do nex-chat-panel input bar.
  - Send violet via `bg-gradient-to-br from-violet-600 to-violet-500`.
  - AudioRecorder mode="embedded" via ref.
  - Dialog "Ver prompt usado" com z-[60] (overlay E content).
  - `submitMessage(text)` único; `handleSubmit` antiga REMOVIDA.

- [ ] **Step 2: Write failing tests**

```typescript
describe("PlaygroundSheet — v0.26 bubble UX", () => {
  const baseProps = {
    open: true,
    onOpenChange: jest.fn(),
    currentConfig: {
      personality: "",
      tone: "",
      guardrails: [],
      advancedOverride: null,
      audioInputEnabled: true,
      kbEnabled: false,
    },
    providerKey: "openai" as const,
    providerLabel: "OpenAI",
    modelLabel: "gpt-5.4-nano",
  };

  it("renderiza Mic externo quando audioInputEnabled + provider OpenAI + idle", () => {
    render(<PlaygroundSheet {...baseProps} />);
    expect(screen.getByRole("button", { name: /gravar áudio/i })).toBeInTheDocument();
  });

  it("não renderiza Mic se providerKey !== 'openai'", () => {
    render(
      <PlaygroundSheet
        {...baseProps}
        providerKey="anthropic"
        providerLabel="Anthropic"
      />,
    );
    expect(screen.queryByRole("button", { name: /gravar áudio/i })).not.toBeInTheDocument();
  });

  it("Send button usa gradient violet", () => {
    render(<PlaygroundSheet {...baseProps} />);
    const sendBtn = screen.getByRole("button", { name: /enviar/i });
    expect(sendBtn.className).toMatch(/bg-gradient/);
    expect(sendBtn.className).toMatch(/violet/);
  });

  it("Dialog 'Ver prompt usado' tem className z-[60] no DialogContent", async () => {
    mockPreview.mockResolvedValue({ ok: true, data: { composedPrompt: "test" } });
    render(<PlaygroundSheet {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /ver prompt usado/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toMatch(/z-\[60\]/);
  });
});
```

- [ ] **Step 3: Run test (RED)**

```bash
npm test -- playground-sheet
```

- [ ] **Step 4: Implement**

Em `src/components/agente-nex/playground-sheet.tsx`:

1. **Adicionar imports + types:**
```typescript
import { Mic, Send } from "lucide-react";
import { AudioRecorder, type AudioRecorderHandle } from "@/components/nex/audio-recorder";
import type { LlmProvider } from "@/lib/llm/types";
```

2. **Atualizar props:**
```typescript
export interface PlaygroundSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentConfig: NexPromptConfig;
  providerKey: LlmProvider | null;
  providerLabel?: string;
  modelLabel?: string;
}
```

3. **Adicionar refs/state + helpers + REMOVER `handleSubmit` antiga:**

```typescript
const recorderRef = useRef<AudioRecorderHandle | null>(null);
const [isRecording, setIsRecording] = useState<boolean>(false);
const [audioFlight, setAudioFlight] = useState<boolean>(false);

const audioEnabled = currentConfig.audioInputEnabled && providerKey === "openai";

/** Envia uma mensagem de texto direto (sem ler `message` state — evita closure stale). */
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
      const r = await testNexPromptAction(trimmed, cfgSnapshot);
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

function handleSendClick() {
  if (isRecording) {
    recorderRef.current?.sendNow();
    return;
  }
  submitMessage(message);
}

async function handleSendAudio(blob: Blob, _durationSeconds: number) {
  if (audioFlight) return;
  setAudioFlight(true);
  try {
    const fd = new FormData();
    fd.append("audio", blob, "recording.webm");
    fd.append("language", "pt");
    const res = await fetch("/api/nex/transcribe", { method: "POST", body: fd });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const data = (await res.json()) as { error?: string };
        if (data?.error) detail = data.error;
      } catch {
        /* noop */
      }
      toast.error(`Falha ao transcrever áudio: ${detail}`);
      return;
    }
    const data = (await res.json()) as { text?: string };
    const text = (data?.text ?? "").trim();
    if (!text) {
      toast.error("Não conseguimos entender o áudio. Tente de novo.");
      return;
    }
    submitMessage(text);
  } catch (err) {
    toast.error(`Falha ao transcrever áudio: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setAudioFlight(false);
  }
}

function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!isSending && !isPreviewLoading && !audioFlight) {
      submitMessage(message);
    }
  }
}
```

(IMPORTANTE: **deletar a função `handleSubmit` original** do v0.16.0 — todo flow passa por `submitMessage`.)

4. **Substituir SheetFooter:**

```tsx
<SheetFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
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
          placeholder="Pergunte algo ao Nex…"
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
      <Send className="h-4 w-4" strokeWidth={2.25} />
    </button>
  </form>
  <div className="flex items-center justify-between gap-2 px-1">
    <span
      className={cn("text-xs tabular-nums", counterClass(message.length, MAX_INPUT_LEN))}
      aria-live="polite"
    >
      {message.length}/{MAX_INPUT_LEN}
    </span>
    <span className={cn("text-[11px] text-muted-foreground", isRecording && "invisible")}>
      Enter envia · Shift+Enter quebra linha
    </span>
  </div>
</SheetFooter>
```

5. **Dialog "Ver prompt usado" com z-[60]:**

```tsx
<Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
  <DialogContent
    className="sm:max-w-3xl z-[60]"
    overlayClassName="z-[60]"
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

- [ ] **Step 5: Run tests (GREEN)**

```bash
npm test -- playground-sheet
```

- [ ] **Step 6: Visual smoke**

Navegar `/agente-nex/prompt` → "Abrir playground" → input bar igual à bubble; "Ver prompt usado" abre POR CIMA do Sheet.

- [ ] **Step 7: Commit**

```bash
git add src/components/agente-nex/playground-sheet.tsx src/components/agente-nex/__tests__/playground-sheet.test.tsx
git commit -m "feat(agente-nex): T-C2 v0.26 — PlaygroundSheet bubble UX (Mic + AudioRecorder + Send violet) + Dialog z-[60] (content+overlay)"
```

---

### Task D4: PROVIDER_LABELS — "Gemini" único

**Depende de:** nada. **Antes de D3.**

**Files:**
- Modify: `src/lib/llm/pricing.ts`
- Possible: outros arquivos de teste que esperam "Google Gemini"

- [ ] **Step 1: Edit**

```typescript
export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  openrouter: "OpenRouter",
};
```

- [ ] **Step 2: Atualizar testes que dependem do label antigo**

```bash
grep -rn "Google Gemini" src/ tests/ 2>/dev/null
```

Para cada arquivo encontrado: avaliar se é label visual (atualizar pra "Gemini") ou texto sobre o produto Google (manter).

- [ ] **Step 3: Run pricing tests**

```bash
npm test -- llm/pricing
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/llm/pricing.ts
# + outros tests atualizados, se houver
git commit -m "feat(agente-nex): T-D4 v0.26 — PROVIDER_LABELS 'Gemini' (sem 'Google Gemini')"
```

---

### Task D3: bar-chart CustomBarTick — case-mixed

**Depende de:** D4.

**Files:**
- Modify: `src/components/charts/bar-chart.tsx`
- Test: `src/components/charts/__tests__/bar-chart-custom-tick.test.tsx` (NOVO)

- [ ] **Step 1: Skill ui-ux-pro-max** — validar:
  - Case-mixed: OpenAI / Anthropic / Gemini / OpenRouter.
  - letterSpacing 0.3 (compromisso 0.2-0.5).
  - Largura recalculada: `length * 6 + 14`.

- [ ] **Step 2: Write failing test**

```typescript
// src/components/charts/__tests__/bar-chart-custom-tick.test.tsx
import { render } from "@testing-library/react";
import { InteractiveBarChart } from "../bar-chart";

describe("CustomBarTick — case-mixed v0.26", () => {
  it("renderiza badge 'OpenAI' (não 'OPENAI')", () => {
    const { container } = render(
      <InteractiveBarChart
        data={[{ name: "gpt-5.4", Custo: 0.5 }]}
        series={[{ key: "Custo", label: "Custo" }]}
        providersByModel={{ "gpt-5.4": "openai" }}
        showLegend={false}
      />,
    );
    const texts = Array.from(container.querySelectorAll("text"));
    const badge = texts.find((t) => /openai/i.test(t.textContent ?? ""));
    expect(badge?.textContent).toBe("OpenAI");
  });

  it("renderiza badge 'Gemini' (não 'GEMINI' nem 'Google Gemini')", () => {
    const { container } = render(
      <InteractiveBarChart
        data={[{ name: "gemini-2.5-flash", Custo: 0.3 }]}
        series={[{ key: "Custo", label: "Custo" }]}
        providersByModel={{ "gemini-2.5-flash": "gemini" }}
        showLegend={false}
      />,
    );
    const texts = Array.from(container.querySelectorAll("text"));
    const badge = texts.find(
      (t) => /^gemini$/i.test((t.textContent ?? "").trim()),
    );
    expect(badge?.textContent?.trim()).toBe("Gemini");
  });
});
```

- [ ] **Step 3: Run test (RED)**

```bash
npm test -- bar-chart-custom-tick
```

- [ ] **Step 4: Edit makeCustomBarTick**

```typescript
function makeCustomBarTick(providersByModel?: Record<string, string>) {
  return function CustomBarTick(tickProps: {
    x?: string | number;
    y?: string | number;
    payload?: { value?: string | number };
  }) {
    const { x = 0, y = 0, payload } = tickProps;
    const numX = typeof x === "number" ? x : Number(x) || 0;
    const numY = typeof y === "number" ? y : Number(y) || 0;
    const value = String(payload?.value ?? "");
    const truncated = value.length > 24 ? `${value.slice(0, 21)}…` : value;
    const provider = providersByModel?.[value];
    const providerLabel = provider
      ? (PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] ?? provider)
      : "";
    // v0.26.0: case-mixed — sem .toUpperCase()
    const badgeText = providerLabel;
    // Heurística case-mixed: ~6px/char + 14px padding.
    const badgeWidth = badgeText.length * 6 + 14;
    return (
      <g transform={`translate(${numX},${numY})`}>
        <text x={0} y={0} dy={16} textAnchor="middle" fontSize={13} fill="currentColor">
          {truncated}
        </text>
        {badgeText ? (
          <g transform="translate(0, 26)">
            <rect
              x={-badgeWidth / 2}
              y={0}
              width={badgeWidth}
              height={14}
              rx={3}
              fill="transparent"
              stroke="currentColor"
              strokeOpacity={0.3}
              strokeWidth={1}
            />
            <text
              x={0}
              y={10}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              opacity={0.7}
              letterSpacing={0.3}
            >
              {badgeText}
            </text>
          </g>
        ) : null}
      </g>
    );
  };
}
```

- [ ] **Step 5: Run tests (GREEN)**

```bash
npm test -- bar-chart-custom-tick
```

- [ ] **Step 6: Commit**

```bash
git add src/components/charts/bar-chart.tsx src/components/charts/__tests__/bar-chart-custom-tick.test.tsx
git commit -m "feat(charts): T-D3 v0.26 — CustomBarTick case-mixed (letterSpacing 0.3, sem .toUpperCase)"
```

---

### Task D1: DonutWithCenter — defaults bumped

**Depende de:** nada.

**Files:**
- Modify: `src/components/charts/donut-with-center.tsx`
- Test: `src/components/charts/__tests__/donut-with-center.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — validar.

- [ ] **Step 2: Write failing test**

```typescript
describe("DonutWithCenter — defaults v0.26", () => {
  it("usa height=360 por default", () => {
    const { container } = render(
      <DonutWithCenter
        data={[{ name: "A", value: 50 }, { name: "B", value: 30 }]}
        centerLabel="Total"
        centerValue="80"
      />,
    );
    const wrapper = container.querySelector("[role='img']") as HTMLElement;
    expect(wrapper.style.height).toBe("360px");
  });
});
```

- [ ] **Step 3: Run test (RED)**

```bash
npm test -- donut-with-center
```

- [ ] **Step 4: Edit defaults**

```typescript
export function DonutWithCenter({
  data,
  centerLabel,
  centerValue,
  height = 360,
  innerRadius = 80,
  outerRadius = 120,
  // ...
}: DonutWithCenterProps) { /* ... */ }
```

- [ ] **Step 5: Run tests (GREEN)**

```bash
npm test -- donut-with-center
```

- [ ] **Step 6: Commit**

```bash
git add src/components/charts/donut-with-center.tsx src/components/charts/__tests__/donut-with-center.test.tsx
git commit -m "feat(charts): T-D1 v0.26 — DonutWithCenter defaults bumped (innerR=80, outerR=120, height=360)"
```

---

### Task D2: ConsumoContent — Total destaque + donut sem override

**Depende de:** D1.

**Files:**
- Modify: `src/components/llm/consumo-content.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — validar.

- [ ] **Step 2: Edit Total row** (~linha 671):

```tsx
<TableRow className="sticky top-0 z-[1] bg-violet-500/5 dark:bg-violet-500/10 border-b border-border/60 text-foreground font-bold text-sm">
```

- [ ] **Step 3: Limpar prop deprecated do donut**

```tsx
<DonutWithCenter
  data={providerPieData}
  centerLabel="Custo total"
  centerValue={totalCostBrlFormatted}
  formatValue={formatBrl4}
  ariaLabel="Custo agrupado por provider em BRL"
  emptyMessage="Sem dados de provider"
/>
```

(Removido `tooltipPosition="top-right"` deprecated; sem override de height/innerR/outerR — usa defaults bumped do D1.)

- [ ] **Step 4: Visual smoke (light + dark mode)**

```bash
npm run dev
```

Navegar `/agente-nex/consumo` → verificar Total destacado + donut maior em light e dark.

- [ ] **Step 5: Commit**

```bash
git add src/components/llm/consumo-content.tsx
git commit -m "feat(agente-nex): T-D2 v0.26 — Consumo Total destaque (text-sm + violet/5 dark/10 + bold) + donut usa defaults"
```

---

### Task D5: transcribe — log do motivo do fallback

**Depende de:** nada.

**Files:**
- Modify: `src/lib/nex/transcribe.ts`
- Test: `src/lib/nex/__tests__/transcribe.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe("transcribeAudio — v0.26 fallback logging", () => {
  it("loga response body do gpt-4o-mini-transcribe quando 4xx", async () => {
    const fetchMock = jest.spyOn(global, "fetch") as unknown as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "model_not_available" } }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: "ok", duration: 1 }), { status: 200 }),
      );
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

    await transcribeAudio(new Blob(["x"]));

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/gpt-4o-mini-transcribe.*400.*model_not_available/),
    );
    consoleWarnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test (RED)**

```bash
npm test -- transcribe
```

- [ ] **Step 3: Edit transcribe**

Em `src/lib/nex/transcribe.ts`, no bloco onde gpt-4o-mini-transcribe falha:

```typescript
if (response.ok) {
  // ... existing success path (mantido) ...
} else {
  let errorBody = "";
  try {
    errorBody = await response.text();
  } catch {
    /* noop */
  }
  console.warn(
    `[transcribe] gpt-4o-mini-transcribe ${response.status} — ${errorBody.slice(0, 200)} — fallback whisper-1`,
  );
}
```

- [ ] **Step 4: Run tests (GREEN)**

```bash
npm test -- transcribe
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/nex/transcribe.ts src/lib/nex/__tests__/transcribe.test.ts
git commit -m "fix(agente-nex): T-D5 v0.26 — transcribe loga body do erro 4xx no fallback (debug em prod)"
```

---

### Task R1: bump versão + CHANGELOG + STATUS

- [ ] **Step 1: Sync remote** (CRÍTICO — outro agente pode ter bumpado)

```bash
git fetch origin main
git status
cat package.json | grep '"version"'
```

Se `0.24.0` ainda → bumpar pra `0.26.0`. Se já estiver `0.25.x` → bumpar pra `0.26.0`. Se `0.26.x` → bumpar pra `0.27.0` (próximo livre).

- [ ] **Step 2: Edit package.json**

```json
{
  "version": "0.26.0"
}
```

- [ ] **Step 3: CHANGELOG entry**

```markdown
## v0.26.0 — Suite Agente Nex Polish v3 — 2026-05-03

### Configuração (/agente-nex/configuracao)
- Reorganização: Toggle Nex / LLM section + ações inline (Testar conexão + Salvar) / **USD/BRL ticker** novo (auto-refresh hourly + manual + badge fonte live/cache/fallback) / Spread cartão em destaque (Card violet-500/5 dark:/10 + helper expandido + cálculo Comercial × Spread = Effective).
- Server Action `getCurrentUsdBrlRateAction` (super_admin gate; invalida memo + retorna rate atual).
- Dialog primitive aceita `overlayClassName` opcional (suporte a override de z-index).

### Prompt (/agente-nex/prompt)
- IDENTITY_BASE: regra anti-Chatwoot (sempre "Nexus Chat") + máximo 3 frases por resposta + `accountUrls` rotulado "Nexus Chat".
- Backfill idempotente removendo guardrail "Sempre cite a fonte do número" de installs existentes (match exato; flag `seeded_v2_at`).
- PromptPreviewCard: collapse do prompt completo (oculto por default) + remoção do botão Maximizar + botão Editar restrito a super_admin (abre Dialog max-edit com PromptConfigForm dentro + onSaved callback).
- Help text dos guardrails sem exemplo "cite a fonte".
- `aria-readonly` removido do `<pre>` (atributo inválido em HTML).

### Playground (Sheet)
- Botão "Abrir playground" destacado (variant=default violet primary + ícone Sparkles + ring sutil + min-h 44px).
- PlaygroundSheet input bar refatorada com layout do nex-chat-panel (Mic externo + inner area unificada + Send violet-gradient) + suporte a áudio via AudioRecorder embedded + transcribe via /api/nex/transcribe.
- `submitMessage(text)` único helper — elimina closure stale do flow de áudio.
- Fix: Dialog "Ver prompt usado" com z-[60] (content + overlay) — não fica mais atrás do Sheet.
- providerKey canonic substitui providerLabel.toLowerCase() pra detecção de OpenAI.

### Consumo (/agente-nex/consumo)
- DonutWithCenter defaults bumped: innerRadius 80, outerRadius 120, height 360 → mais respiro entre fatia e texto central.
- Total no filtro: text-sm (+1pt) + bg-violet-500/5 dark:bg-violet-500/10 + font-bold + border-border/60 + sem uppercase → destaque visual.
- Bar chart CustomBarTick: badge case-mixed (OpenAI/Anthropic/Gemini/OpenRouter — sem `.toUpperCase()`); letterSpacing 0.3; largura `length * 6 + 14`.
- PROVIDER_LABELS: "Google Gemini" → "Gemini".
- transcribe: console.warn agora inclui body do erro de gpt-4o-mini-transcribe (debug do motivo do fallback em prod).

### Workflow rigoroso
- spec não criada (autorizado pelo usuário); plan v1 → v2 → v3 com 2 pente-finos REAIS (28 achados aplicados).
- subagent-driven-development com TDD em cada task UI/lógica.
- ui-ux-pro-max obrigatória em todas as tasks UI.
```

- [ ] **Step 4: STATUS entry** (1 linha curta)

```markdown
v0.26.0 — Suite Agente Nex Polish v3: Configuração reorg + USD ticker / Prompt anti-Chatwoot + collapse + Editar super_admin / Playground bubble UX + Dialog z-fix / Consumo donut bigger + Total destaque + badges case-mixed.
```

- [ ] **Step 5: Commit**

```bash
git add package.json CHANGELOG.md docs/STATUS.md
git commit -m "chore(release): v0.26.0 — Suite Agente Nex Polish v3"
```

---

### Task R2: typecheck + full test suite + build

- [ ] **Step 1: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | tail -20
```

Expected: 0 erros nos arquivos tocados (erros pré-existentes em `integrations-power-bi.test.ts` aceitos).

- [ ] **Step 2: Run full test**

```bash
npm test 2>&1 | tail -30
```

Expected: 1300+ PASS, 20 falhas pré-existentes em integrations-power-bi (escopo distinto).

- [ ] **Step 3: Build smoke**

```bash
npm run build 2>&1 | tail -20
```

Expected: build success.

---

### Task R3: skill verification-before-completion

- [ ] **Step 1:** invocar `superpowers:verification-before-completion` via Skill tool.

- [ ] **Step 2: Golden path manual** em dev (`npm run dev`):
  - `/agente-nex/configuracao`: 4 sections / mudar spread → ticker reativo / refresh manual.
  - `/agente-nex/prompt`: collapse oculto default → revela / Editar abre Dialog max / Copiar funciona.
  - `/agente-nex/prompt` + Playground: input bar = bubble / áudio (se mic ok) / "Ver prompt usado" aparece por cima.
  - `/agente-nex/consumo`: donut maior, tooltip não cobre, Total destacado, badges OpenAI/Anthropic/Gemini/OpenRouter (case correct).

- [ ] **Step 3:** reportar evidências (screenshots ou descrição textual) na PR/issue.

---

### Task R4: append HISTORY + push monitorado

- [ ] **Step 1: Append HISTORY**

```markdown
2026-05-03 HH:MM | agent=claude-agente-nex-polish-v026 | commit=<hash> | scope=release | summary=v0.26.0 — Suite Agente Nex Polish v3 (Configuração reorg + USD ticker / Prompt anti-Chatwoot + collapse + Editar super_admin / Playground bubble UX + Dialog z-[60] fix / Consumo donut bigger + Total destaque + badges case-mixed). Workflow rigoroso: plan v1→v2→v3 (2 pente-finos: 28 achados). Coordenação multi-agente: claude-conversas-polish-v025 escopo distinto (zero overlap em código fonte; sobreposição apenas em release files resolvida via fetch antes do bump).
```

- [ ] **Step 2: gh run list**

```bash
gh run list --limit 5
```

Esperar se há build em curso de outro agente.

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Smoke prod**

```bash
gh run watch
# após sucesso:
curl -fsS https://<prod>/api/health | jq
```

Expected: `version=v0.26.0`, `status=ok`.

- [ ] **Step 5: skill finishing-a-development-branch**

Invocar `superpowers:finishing-a-development-branch`. Deletar `docs/agents/active/claude-agente-nex-polish-v026.md`.

---

## Self-Review (final v3)

### Spec coverage
- [x] Configuração reorg + Spread destaque + Testar conexão junto com Salvar → A3
- [x] USD ticker hourly + reativo a spread → A1, A2, A3
- [x] Prompt collapse + Editar super_admin only → B3
- [x] Remover guardrail "cite a fonte" (match exato) → B2
- [x] Anti-Chatwoot no prompt → B1
- [x] Tom mais resumido → B1 (máx 3 frases)
- [x] Playground botão destaque + providerKey canonic → C1
- [x] Bubble UX no PlaygroundSheet (sem closure stale) → C2
- [x] Fix z-index "Ver prompt usado" (R0 + C2) → R0, C2
- [x] Whisper tokens — log do fallback → D5
- [x] Donut spacing → D1
- [x] Total no filtro destaque → D2
- [x] Badge case-mixed → D3
- [x] PROVIDER_LABELS Gemini → D4

### Diff v2 → v3
- 14 fixes adicionais (vide tabela "Diff" no topo).
- Riscos eliminados: z-index abstrato (R0 concreto), ordem D3↔D4 invertida, false-positive no backfill (match exato), `currentSpreadValue` só em sucesso, `handleSubmit` antiga removida, border invisível em dark, bump de versão re-checked.

### Placeholder scan
- [x] Sem TODOs, TBDs, "implement later".
- [x] Todos os steps têm código real ou comando concreto.

### Type consistency
- [x] `getCurrentUsdBrlRateAction(): GetUsdBrlActionResult` — A1.
- [x] `UsdRateTickerProps { commercialRate, spread, source, fetchedAt }` — A2 (usado em A3).
- [x] `LlmConfigFormProps { initialCommercialRate, initialRateSource, initialFetchedAt }` — A3.
- [x] `PromptPreviewCardProps.isSuperAdmin: boolean` — B3.
- [x] `PromptConfigFormProps.onSaved?: () => void` — B3.
- [x] `PlaygroundLauncherProps.providerKey: LlmProvider \| null` — C1.
- [x] `PlaygroundSheetProps.providerKey: LlmProvider \| null` — C2.
- [x] `DialogContentProps { overlayClassName?: string }` — R0.

### Dependências cruzadas (explicitadas no header de cada task)
- A2 depende de A1.
- A3 depende de A1 + A2.
- C2 depende de R0 + C1.
- D2 depende de D1.
- D3 depende de D4.

---

## Execution Handoff

**Plan completo, escrito em `docs/superpowers/plans/2026-05-03-agente-nex-polish-v026.md`.**

**Recomendação: Subagent-Driven Development** (`superpowers:subagent-driven-development`) — fresh subagent por task com revisão entre tasks. Mais robusto pra um plan de 16 tasks com dependências.

Ordem de despacho:
1. R0 (sequencial, é pré-requisito do C2)
2. A1 → A2 → A3 (sequencial)
3. B1, B2, B3, B4 (B1+B2+B4 paralelizáveis; B3 isolado mas pode rodar com B1)
4. C1 → C2 (C2 espera R0)
5. **D4 → D3** (atenção: D4 ANTES de D3) → D1 → D2 → D5 (D2 espera D1)
6. R1, R2, R3, R4 (sequencial, ao final).
