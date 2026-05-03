# Suite Agente Nex Polish v3 (v0.26.0) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar e polir os 4 submenus do Agente Nex (Configuração, Prompt, Playground, Consumo) com USD ticker hourly, identidade fixa colapsável, regra anti-Chatwoot no prompt, tom mais resumido, botão Playground destacado, bubble UX no PlaygroundSheet, fix de z-index do "Ver prompt usado", explicação do Whisper sem tokens, donut com mais respiro, total no filtro mais visível e badges de provider em case-correct.

**Architecture:** Mudanças em escopo cirúrgico — sem mudar nomes de tabelas (`chatwoot_account_urls`, `chatwoot_facts_*`), sem refatorar arquitetura. Agrupado por submenu (4 grupos). Cada grupo independente — pode ser executado em paralelo (não há dependência cruzada). Bump único v0.26.0 ao final.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Recharts · Framer Motion · base-ui · Sonner · BullMQ/Redis · NextAuth v5 · PostgreSQL/Prisma · Lucide React · Jest + jest-mock-extended · @testing-library/react.

---

## Convenções deste plano

- **Antes de qualquer task UI:** o subagente deve invocar `ui-ux-pro-max:ui-ux-pro-max` via Skill tool. Não negociável.
- **TDD:** cada task tem teste primeiro (RED), depois implementação (GREEN), depois commit. Exceções (CSS-only / config) seguem pattern de "verification" via typecheck + visual check no dev.
- **Idempotência:** migrations via `ensureNexTables` ou similar — sempre `IF NOT EXISTS`, sempre com flag de seed.
- **Commits granulares:** 1 task = 1 commit. Mensagem padrão: `feat(agente-nex): T<N> v0.26 — <subject>` ou `fix(agente-nex): T<N> v0.26 — <subject>`.
- **Coordenação:** antes de cada commit, `git fetch origin main` + verificar `docs/agents/active/`. Antes de push, `gh run list --limit 5`.

---

## Mapa de arquivos

### Grupo A — Configuração (`/agente-nex/configuracao`)
- **Modify:** `src/components/agente-nex/llm-config-form.tsx` — reorg sections; Spread em section própria com destaque (Card embutido, ícone Coins violet, helper expandido); Testar conexão movido junto ao Salvar (já está, mas validar layout final).
- **Create:** `src/components/agente-nex/usd-rate-ticker.tsx` — client component com badge ao vivo do USD/BRL (commercial × spread = effective), refresh a cada hora via `setInterval`, fonte (live/cache/fallback), timestamp da última atualização, tooltip explicativo.
- **Create:** `src/lib/actions/exchange-rate-refresh.ts` (ou expandir `src/lib/actions/exchange-rate.ts`) — Server Action `getCurrentUsdBrlRateAction()` que invalida memo e retorna `UsdBrlRate`.
- **Modify:** `src/app/(protected)/agente-nex/configuracao/page.tsx` — passa `currentRate` inicial pro `UsdRateTicker`.
- **Test:** `src/components/agente-nex/__tests__/usd-rate-ticker.test.tsx` (novo).

### Grupo B — Prompt (`/agente-nex/prompt`)
- **Modify:** `src/lib/nex/prompt-compose.ts` — IDENTITY_BASE: 1) substituir "(Nexus Chat / Chatwoot)" por "(Nexus Chat)"; 2) adicionar regra "Nunca use 'Chatwoot' — sempre 'Nexus Chat'"; 3) reforçar concisão "Máximo 3 frases por resposta, salvo se o usuário pedir detalhe."; 4) substituir "Mapeamento das contas Chatwoot" → "Mapeamento das contas Nexus Chat".
- **Modify:** `src/lib/nex/ensure-tables.ts` — remover guardrail "Sempre cite a fonte do número..." do bloco de seed; adicionar coluna `seeded_v2_at` + UPDATE idempotente que remove o guardrail "Sempre cite a fonte..." de installs existentes (1 vez só).
- **Modify:** `src/components/agente-nex/prompt-preview-card.tsx` — collapse do `<pre>` do prompt completo (oculto por default, click pra abrir); remover botão Maximizar; comportamento condicionado a `isSuperAdmin`: se super_admin → botão "Editar" abre Dialog max-edit; senão → só "Copiar" + collapse read-only.
- **Modify:** `src/app/(protected)/agente-nex/prompt/page.tsx` — passa `isSuperAdmin={user.platformRole === "super_admin"}` pro PromptPreviewCard.
- **Modify:** `src/components/agente-nex/prompt-config-form.tsx` — atualizar texto do help dos guardrails (remover exemplo "Sempre cite a fonte do número").
- **Test:** `src/lib/nex/__tests__/prompt-compose.test.ts` (existente — adicionar/atualizar testes); `src/components/agente-nex/__tests__/prompt-preview-card.test.tsx` (existente — atualizar); `src/lib/nex/__tests__/ensure-tables.test.ts` (existente — adicionar teste de remoção condicional).

### Grupo C — Playground (PlaygroundSheet + Launcher)
- **Modify:** `src/components/agente-nex/playground-launcher.tsx` — botão destaque: variant=default (já é violet primary) + ícone Sparkles + ring violet sutil; size=default em vez de sm.
- **Modify:** `src/components/agente-nex/playground-sheet.tsx` — refator do input bar: copiar layout do `nex-chat-panel` (Mic externo + inner area unificada `rounded-xl border bg-background` + Send violet via `bg-gradient-to-br from-violet-600 to-violet-500`); integrar `<AudioRecorder mode="embedded">` controlado por ref; ajustar comportamento Send dinâmico (idle → handleSubmit, recording → recorder.sendNow); fix do Dialog "Ver prompt usado" → z-[60] (acima do Sheet z-50).
- **Test:** `src/components/agente-nex/__tests__/playground-sheet.test.tsx` (existente — adicionar testes do novo layout + audio + z-index).

### Grupo D — Consumo (`/agente-nex/consumo`)
- **Modify:** `src/components/charts/donut-with-center.tsx` — defaults bumped: `innerRadius` → 80 (de 60); `outerRadius` → 120 (de 80); height default → 360 (de 320); padding inner via `padding="calc(var(--spacing-6) + 8px)"`; tooltip near-mouse mantém + `coordinate.outside` (já tem `allowEscapeViewBox`); atualizar prop default + teste.
- **Modify:** `src/components/llm/consumo-content.tsx` — Total no filtro: `text-sm` (de `text-xs`) + `bg-violet-500/5 dark:bg-muted/40` + remover `uppercase tracking-wide` (mantém legibilidade) + `font-bold` (de `font-semibold`); aumentar height do donut card pra 400; passar props bumped no `<DonutWithCenter>` (innerRadius=80 outerRadius=120 height=380).
- **Modify:** `src/components/charts/bar-chart.tsx` — `CustomBarTick`: remover `.toUpperCase()` no `badgeText`; reduzir letterSpacing de 0.5 pra 0.2 (case mixed precisa menos spacing); ajustar largura: `badgeText.length * 6 + 14` (case mixed mais largo que upper).
- **Modify:** `src/lib/llm/pricing.ts` — `PROVIDER_LABELS["gemini"]` de "Google Gemini" → "Gemini" (alinha com pedido do user).
- **Modify:** `src/lib/nex/transcribe.ts` — adicionar `error_reason?: string` no log/console quando cai no fallback (retorna body do erro 4xx/5xx do gpt-4o-mini-transcribe pra debug em prod); atualizar comentário-doc.
- **Test:** `src/components/charts/__tests__/donut-with-center.test.tsx` (existente — atualizar defaults); `src/components/charts/__tests__/bar-chart-custom-tick.test.tsx` (criar se não existir, ou adicionar em arquivo existente — verificar `badgeText` não-uppercase, larguras corretas).

### Release files
- **Modify:** `package.json` — bump `0.24.0` → `0.26.0`.
- **Modify:** `CHANGELOG.md` — entrada `## v0.26.0 — Suite Agente Nex Polish v3`.
- **Modify:** `docs/STATUS.md` — entrada release.
- **Append:** `docs/agents/HISTORY.md` — registro do release.

---

## Tasks

> **Ordem sugerida pra subagent-driven-development:** A1, A2, A3 (paralelo possível com A4); B1, B2, B3 (B1 antes de B2); B4, B5; C1, C2; D1, D2, D3, D4; D5; Release (R1, R2, R3, R4).

### Task A1: USD Rate Ticker — Server Action de refresh

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

  it("invalida cache memo e retorna rate atual", async () => {
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

  it("nega acesso pra não super_admin", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ platformRole: "viewer" });

    const result = await getCurrentUsdBrlRateAction();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/permissão|forbidden|acesso/i);
    }
  });
});
```

- [ ] **Step 3: Run test (RED)**

Run: `npm test -- exchange-rate-refresh`
Expected: FAIL com `Cannot find module '../exchange-rate-refresh'`.

- [ ] **Step 4: Implement Server Action**

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
    return { ok: false, error: "Sem permissão" };
  }
  __resetUsdBrlCache();
  const data = await getUsdBrlRate();
  return { ok: true, data };
}
```

- [ ] **Step 5: Run tests (GREEN)**

Run: `npm test -- exchange-rate-refresh`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json | grep "exchange-rate-refresh"`
Expected: sem erros nos arquivos tocados.

- [ ] **Step 7: Commit**

```bash
git add src/lib/actions/exchange-rate-refresh.ts src/lib/actions/__tests__/exchange-rate-refresh.test.ts
git commit -m "feat(agente-nex): T-A1 v0.26 — Server Action getCurrentUsdBrlRateAction (super_admin gate, invalida memo + retorna rate)"
```

---

### Task A2: USD Rate Ticker — client component

**Files:**
- Create: `src/components/agente-nex/usd-rate-ticker.tsx`
- Test: `src/components/agente-nex/__tests__/usd-rate-ticker.test.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — invocar via Skill tool antes de codar. Validar:
  - Padrão do projeto: ícone DollarSign violet (`text-violet-500`), card com border + bg-muted/30, badge "live"/"cache"/"fallback" com cores semânticas (emerald/amber/destructive), tabular-nums, refresh manual via botão circular pequeno.
  - Tooltip Title explicando "Cotação atualiza a cada hora ou quando você clicar em recarregar".

- [ ] **Step 2: Write failing test**

```typescript
// src/components/agente-nex/__tests__/usd-rate-ticker.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UsdRateTicker } from "../usd-rate-ticker";

const mockAction = jest.fn();
jest.mock("@/lib/actions/exchange-rate-refresh", () => ({
  getCurrentUsdBrlRateAction: (...args: unknown[]) => mockAction(...args),
}));

const initial = {
  rate: 6.05,
  commercial: 5.5,
  spread: 1.1,
  source: "live" as const,
  fetchedAt: new Date("2026-05-03T14:00:00Z"),
};

describe("UsdRateTicker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renderiza valor inicial commercial × spread", () => {
    render(<UsdRateTicker initial={initial} />);
    expect(screen.getByText(/R\$/)).toBeInTheDocument();
    expect(screen.getByText(/6[,.]05/)).toBeInTheDocument();
    expect(screen.getByText(/Live/i)).toBeInTheDocument();
  });

  it("dispara action ao clicar no botão refresh", async () => {
    mockAction.mockResolvedValue({
      ok: true,
      data: { ...initial, rate: 6.10, fetchedAt: new Date() },
    });
    render(<UsdRateTicker initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: /atualizar/i }));
    await waitFor(() => expect(mockAction).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText(/6[,.]10/)).toBeInTheDocument(),
    );
  });

  it("mostra source 'cache' com cor amber", () => {
    render(<UsdRateTicker initial={{ ...initial, source: "cache" }} />);
    const badge = screen.getByText(/Cache/i);
    expect(badge).toHaveClass(/amber/);
  });

  it("mostra source 'fallback' com cor destrutiva", () => {
    render(<UsdRateTicker initial={{ ...initial, source: "fallback" }} />);
    const badge = screen.getByText(/Fallback/i);
    expect(badge.className).toMatch(/destructive|red/);
  });
});
```

- [ ] **Step 3: Run test (RED)**

Run: `npm test -- usd-rate-ticker`
Expected: FAIL com `Cannot find module '../usd-rate-ticker'`.

- [ ] **Step 4: Implement component**

```tsx
// src/components/agente-nex/usd-rate-ticker.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { DollarSign, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getCurrentUsdBrlRateAction,
  type GetUsdBrlActionResult,
} from "@/lib/actions/exchange-rate-refresh";
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

interface UsdRateTickerProps {
  initial: UsdBrlRate;
}

const SOURCE_STYLES: Record<UsdBrlRate["source"], string> = {
  live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cache: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  fallback: "bg-destructive/10 text-destructive",
};

const SOURCE_LABELS: Record<UsdBrlRate["source"], string> = {
  live: "Live",
  cache: "Cache",
  fallback: "Fallback",
};

export function UsdRateTicker({ initial }: UsdRateTickerProps) {
  const [rate, setRate] = useState<UsdBrlRate>(initial);
  const [isRefreshing, startRefresh] = useTransition();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function refresh(silent = false) {
    startRefresh(async () => {
      const result = await getCurrentUsdBrlRateAction();
      if (!result.ok) {
        if (!silent) toast.error(result.error);
        return;
      }
      setRate(result.data);
      if (!silent) toast.success("Cotação atualizada");
    });
  }

  useEffect(() => {
    intervalRef.current = setInterval(() => refresh(true), REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const fetchedDate = rate.fetchedAt instanceof Date ? rate.fetchedAt : new Date(rate.fetchedAt);

  return (
    <Card className="rounded-xl border border-border bg-muted/30">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500"
          >
            <DollarSign className="h-4.5 w-4.5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              USD/BRL com spread
            </p>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {brlFmt.format(rate.rate)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
              Comercial {brlFmt.format(rate.commercial)} × Spread {rate.spread.toFixed(2)} ·
              Atualizado às {timeFmt.format(fetchedDate)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
              SOURCE_STYLES[rate.source],
            )}
          >
            {SOURCE_LABELS[rate.source]}
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

Run: `npm test -- usd-rate-ticker`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/agente-nex/usd-rate-ticker.tsx src/components/agente-nex/__tests__/usd-rate-ticker.test.tsx
git commit -m "feat(agente-nex): T-A2 v0.26 — UsdRateTicker (auto-refresh hourly + manual refresh + source badge)"
```

---

### Task A3: integrar UsdRateTicker + reorganizar Configuração

**Files:**
- Modify: `src/app/(protected)/agente-nex/configuracao/page.tsx`
- Modify: `src/components/agente-nex/llm-config-form.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — validar:
  - Hierarquia visual: 1) Toggle Nex (estado primário) → 2) Banner Configurado + LLM (provider/modelo/chave) + actions (Testar conexão / Salvar) → 3) USD Rate Ticker (informativo) → 4) Spread cartão em destaque (Card com helper expandido). 
  - Spread ganha mais peso visual: ícone Coins violet, Input com prefix "×", helper card explicando o cálculo (Comercial × Spread = Effective).

- [ ] **Step 2: Modify page**

```tsx
// src/app/(protected)/agente-nex/configuracao/page.tsx
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { LlmConfigForm } from "@/components/agente-nex/llm-config-form";
import { UsdRateTicker } from "@/components/agente-nex/usd-rate-ticker";
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
            currentRate={currentRate}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
```

- [ ] **Step 3: Modify LlmConfigForm — aceitar `currentRate` + reorganizar sections**

Em `src/components/agente-nex/llm-config-form.tsx`:

```typescript
// Adicionar import
import { UsdRateTicker } from "@/components/agente-nex/usd-rate-ticker";
import type { UsdBrlRate } from "@/lib/llm/exchange-rate";

// Adicionar prop opcional
interface LlmConfigFormProps {
  initial: PublicLlmConfig | null;
  initialNexEnabled: boolean;
  initialCredentials: CredentialSummary[];
  initialSpread: number;
  currentRate?: UsdBrlRate | null;
}

export function LlmConfigForm({
  initial,
  initialNexEnabled,
  initialCredentials,
  initialSpread,
  currentRate,
}: LlmConfigFormProps) {
  // ...código existente...
}
```

Reordenar JSX (substituir o return existente):

```tsx
return (
  <div className="space-y-8">
    {/* 1. Toggle global */}
    <div className="..." /* exatamente como já está */>
      {/* ... existing toggle ... */}
    </div>

    {/* 2. LLM section + ações (Testar conexão + Salvar inline no fim) */}
    <div className="space-y-6 border-t border-border/50 pt-6">
      {/* banner verde "Configurado" — existing */}
      {/* grid Provedor/Modelo — existing */}
      {/* Chave de API + atalhos — existing */}
      {/* Test result panel — existing */}

      {/* AÇÕES movidas pra dentro da LLM section */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={handleTest} disabled={actionsDisabled}>
          {/* ... */} Testar conexão
        </Button>
        <Button onClick={handleSave} disabled={actionsDisabled}>
          {/* ... */} Salvar configuração
        </Button>
      </div>
    </div>

    {/* 3. USD Ticker (novo) */}
    {currentRate ? (
      <div className="border-t border-border/50 pt-6">
        <UsdRateTicker initial={currentRate} />
      </div>
    ) : null}

    {/* 4. Spread cartão em destaque (Card embutido + helper expandido) */}
    <div className="space-y-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-foreground">Spread cartão</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Multiplicador aplicado sobre a cotação comercial USD/BRL pra refletir IOF + spread Visa/Master.
        Default 1,10 ≈ 10% acima da comercial. Ajuste pra refletir seu cartão real (sem limite superior).
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">×</span>
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
    </div>

    {/* hint sem credenciais — existing, manter */}
  </div>
);
```

- [ ] **Step 4: Update test snapshot if needed**

Run: `npm test -- llm-config-form`
Expected: PASS (ajustar testes existentes se quebrarem com a reorg).

- [ ] **Step 5: Visual smoke test**

Run dev: `npm run dev`
Navegar: `/agente-nex/configuracao`
Verificar: 4 sections empilhadas (Toggle / LLM+ações / Ticker / Spread destacado), Ticker mostra rate atual + badge fonte, refresh manual funciona, spread aceita decimais.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(protected\)/agente-nex/configuracao/page.tsx src/components/agente-nex/llm-config-form.tsx
git commit -m "feat(agente-nex): T-A3 v0.26 — Configuração reorganizada (Toggle / LLM+ações / USD ticker / Spread destacado)"
```

---

### Task B1: prompt-compose IDENTITY_BASE — anti-Chatwoot + concisão

**Files:**
- Modify: `src/lib/nex/prompt-compose.ts`
- Test: `src/lib/nex/__tests__/prompt-compose.test.ts` (existente)

- [ ] **Step 1: Skill ui-ux-pro-max** — não aplica (lib pura).

- [ ] **Step 2: Write failing tests**

Adicionar a `src/lib/nex/__tests__/prompt-compose.test.ts`:

```typescript
import { IDENTITY_BASE, composeSystemPrompt } from "../prompt-compose";

describe("IDENTITY_BASE — anti-Chatwoot e concisão (v0.26)", () => {
  it("não menciona 'Chatwoot' (substituído por 'Nexus Chat')", () => {
    expect(IDENTITY_BASE).not.toMatch(/Chatwoot/);
    expect(IDENTITY_BASE).toMatch(/Nexus Chat/);
  });

  it("inclui regra explícita anti-Chatwoot", () => {
    expect(IDENTITY_BASE).toMatch(/nunca use ['"]?Chatwoot['"]?/i);
  });

  it("limita resposta a 3 frases por padrão", () => {
    expect(IDENTITY_BASE).toMatch(/máximo 3 frases|3 frases por resposta/i);
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

Run: `npm test -- prompt-compose`
Expected: FAIL nos novos casos.

- [ ] **Step 4: Implement IDENTITY_BASE atualizado**

```typescript
// src/lib/nex/prompt-compose.ts — substituir IDENTITY_BASE
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

E na função `composeSystemPrompt`, na seção de accountUrls, trocar:

```typescript
// ANTES:
parts.push(
  `\n\n## URLs públicas das contas\nMapeamento das contas Chatwoot para a interface pública...`,
);

// DEPOIS:
parts.push(
  `\n\n## URLs públicas das contas\nMapeamento das contas Nexus Chat para a interface pública (use para montar deep-links no formato {publicUrl}/app/accounts/{accountId}/conversations/{conversationId}):\n${bullets}`,
);
```

- [ ] **Step 5: Run tests (GREEN)**

Run: `npm test -- prompt-compose`
Expected: todos PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nex/prompt-compose.ts src/lib/nex/__tests__/prompt-compose.test.ts
git commit -m "feat(agente-nex): T-B1 v0.26 — IDENTITY_BASE anti-Chatwoot + máx 3 frases + accountUrls 'Nexus Chat'"
```

---

### Task B2: ensure-tables — remover guardrail "cite a fonte" (seed + backfill)

**Files:**
- Modify: `src/lib/nex/ensure-tables.ts`
- Test: `src/lib/nex/__tests__/ensure-tables.test.ts` (existente)

- [ ] **Step 1: Skill ui-ux-pro-max** — não aplica.

- [ ] **Step 2: Write failing test**

Adicionar a `src/lib/nex/__tests__/ensure-tables.test.ts`:

```typescript
describe("ensure-tables — guardrails seed v2 (v0.26)", () => {
  it("seed novo NÃO inclui 'Sempre cite a fonte do número'", async () => {
    const { mockedPgPool } = setupMocks(); // helper existente do arquivo
    await ensureNexTables();
    const seedCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).includes("Nunca exponha dados"),
    );
    expect(seedCall).toBeDefined();
    const seedSql = String(seedCall![0]);
    expect(seedSql).not.toMatch(/Sempre cite a fonte do número/);
  });

  it("backfill remove guardrail 'cite a fonte' de installs existentes (idempotente via seeded_v2_at)", async () => {
    const { mockedPgPool } = setupMocks();
    await ensureNexTables();
    const backfillCall = mockedPgPool.query.mock.calls.find((c) =>
      String(c[0]).match(/seeded_v2_at/i),
    );
    expect(backfillCall).toBeDefined();
    const backfillSql = String(backfillCall![0]);
    expect(backfillSql).toMatch(/seeded_v2_at IS NULL/);
    expect(backfillSql).toMatch(/cite a fonte/i);
  });
});
```

- [ ] **Step 3: Run test (RED)**

Run: `npm test -- ensure-tables`
Expected: FAIL.

- [ ] **Step 4: Implement seed v2**

Em `src/lib/nex/ensure-tables.ts`, substituir o bloco de seed de guardrails (linhas 65-78) por:

```typescript
// v0.26.0: adiciona seeded_v2_at (column flag) — backfill remove guardrail "cite a fonte"
await pgPool.query(`
  ALTER TABLE "nex_settings"
    ADD COLUMN IF NOT EXISTS "seeded_v2_at" TIMESTAMPTZ NULL;
`);

// v0.26.0: seed novo (sem "cite a fonte") — backfill condicional
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

// v0.26.0: backfill — remove guardrail "Sempre cite a fonte..." de installs antigos.
// Idempotente via "seeded_v2_at" — só roda 1 vez. NÃO sobrescreve guardrails que o
// usuário tenha customizado (mantém todos os outros itens da lista existente,
// apenas filtra o item específico).
await pgPool.query(`
  UPDATE "nex_settings"
  SET "guardrails" = COALESCE(
    (SELECT jsonb_agg(elem)
     FROM jsonb_array_elements("guardrails") AS elem
     WHERE elem::text NOT ILIKE '%cite a fonte%'),
    '[]'::jsonb
  ),
  "seeded_v2_at" = now()
  WHERE "id" = 'global'
    AND "seeded_v2_at" IS NULL;
`);
```

- [ ] **Step 5: Run tests (GREEN)**

Run: `npm test -- ensure-tables`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nex/ensure-tables.ts src/lib/nex/__tests__/ensure-tables.test.ts
git commit -m "fix(agente-nex): T-B2 v0.26 — seed v2 sem 'cite a fonte' + backfill idempotente via seeded_v2_at"
```

---

### Task B3: PromptPreviewCard — collapse + role-gated edit

**Files:**
- Modify: `src/components/agente-nex/prompt-preview-card.tsx`
- Modify: `src/app/(protected)/agente-nex/prompt/page.tsx`
- Test: `src/components/agente-nex/__tests__/prompt-preview-card.test.tsx` (existente)

- [ ] **Step 1: Skill ui-ux-pro-max** — validar:
  - Estrutura: Card "Prompt completo" + descritivo + 1 collapse principal "Ver prompt completo (somente leitura)" oculto por default.
  - Botões header: sempre Copiar + (super_admin) Editar. Sem Maximizar separado.
  - "Editar" abre Dialog max-edit que reusa PromptConfigForm dentro (full edit; salvar fecha o dialog).
  - Tooltip explicativo no Editar pra não-super_admin (caso renderize): "Apenas super_admins editam".

- [ ] **Step 2: Write failing test**

Em `src/components/agente-nex/__tests__/prompt-preview-card.test.tsx`:

```typescript
describe("PromptPreviewCard — v0.26 collapse + role gating", () => {
  const baseConfig = {
    personality: "",
    tone: "",
    guardrails: [],
    advancedOverride: null,
    audioInputEnabled: false,
    kbEnabled: false,
  };

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

  it("super_admin vê botão Editar (e não vê Maximizar separado)", () => {
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

  it("não super_admin NÃO vê botão Editar (apenas Copiar)", () => {
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
  });

  it("clicar em Editar (super_admin) abre Dialog max-edit", () => {
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
});
```

- [ ] **Step 3: Run test (RED)**

Run: `npm test -- prompt-preview-card`
Expected: FAIL.

- [ ] **Step 4: Implement — refator do PromptPreviewCard**

Substituir o conteúdo de `src/components/agente-nex/prompt-preview-card.tsx`:

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
            Preview somente leitura. {isSuperAdmin
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
            {showFull ? "Ocultar prompt completo" : "Ver prompt completo (somente leitura)"}
          </button>

          {showFull ? (
            <ScrollArea className="max-h-[400px] w-full overflow-x-hidden rounded-lg border border-border bg-muted/40">
              <pre
                data-testid="prompt-preview"
                aria-readonly="true"
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

- [ ] **Step 5: Update PromptConfigForm — aceitar `onSaved` callback**

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

- [ ] **Step 6: Update prompt page — passa isSuperAdmin**

Em `src/app/(protected)/agente-nex/prompt/page.tsx`:

```tsx
// ... existing imports ...

  const isSuperAdmin = user.platformRole === "super_admin";

  return (
    <PageShell variant="narrow">
      {/* ... existing PageHeader ... */}
      <div className="space-y-6">
        <PromptPreviewCard
          config={cfg}
          kbDocs={kbForPrompt}
          accountUrls={accountUrls}
          isSuperAdmin={isSuperAdmin}
        />
        {/* ... resto igual ... */}
      </div>
    </PageShell>
  );
```

- [ ] **Step 7: Run tests (GREEN)**

Run: `npm test -- prompt-preview-card`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/agente-nex/prompt-preview-card.tsx src/components/agente-nex/prompt-config-form.tsx src/app/\(protected\)/agente-nex/prompt/page.tsx src/components/agente-nex/__tests__/prompt-preview-card.test.tsx
git commit -m "feat(agente-nex): T-B3 v0.26 — PromptPreviewCard collapse + Editar super_admin only (Dialog max-edit)"
```

---

### Task B4: prompt-config-form — atualizar texto do help dos guardrails

**Files:**
- Modify: `src/components/agente-nex/prompt-config-form.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — confirma microcopy em pt-BR conciso.

- [ ] **Step 2: Edit**

Substituir (em ~linha 308):

```typescript
// ANTES:
<p className="text-xs text-muted-foreground">
  Regras que o agente nunca deve violar (ex.: &quot;Nunca exponha dados
  de outro tenant&quot;, &quot;Sempre cite a fonte do número&quot;).
</p>

// DEPOIS:
<p className="text-xs text-muted-foreground">
  Regras que o agente nunca deve violar (ex.: &quot;Nunca exponha dados
  de outro tenant&quot;, &quot;Não simule ações destrutivas&quot;).
</p>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json | grep "prompt-config-form" || true`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/agente-nex/prompt-config-form.tsx
git commit -m "feat(agente-nex): T-B4 v0.26 — help text dos guardrails sem 'cite a fonte'"
```

---

### Task C1: PlaygroundLauncher — botão destacado violet

**Files:**
- Modify: `src/components/agente-nex/playground-launcher.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — validar:
  - Botão variant=default (violet primary do projeto), size=default, ícone Sparkles em vez de MessageSquare (mais "AI/playground" semantic).
  - Adicionar ring sutil violet-500/30 no hover. Min-height 44px (touch target).
  - Texto "Abrir playground" mantido (claro e conciso).

- [ ] **Step 2: Edit**

```tsx
// src/components/agente-nex/playground-launcher.tsx
"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PlaygroundSheet } from "@/components/agente-nex/playground-sheet";
import type { NexPromptConfig } from "@/lib/nex/prompt";

interface PlaygroundLauncherProps {
  currentConfig: NexPromptConfig;
  providerLabel?: string;
  modelLabel?: string;
}

export function PlaygroundLauncher({
  currentConfig,
  providerLabel,
  modelLabel,
}: PlaygroundLauncherProps) {
  const [open, setOpen] = useState<boolean>(false);
  const ready = !!providerLabel && !!modelLabel;

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
        providerLabel={providerLabel}
        modelLabel={modelLabel}
      />
    </>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json | grep "playground-launcher" || true`
Expected: sem erros.

- [ ] **Step 4: Visual smoke**

Navegar `/agente-nex/prompt` — verificar botão destacado no header.

- [ ] **Step 5: Commit**

```bash
git add src/components/agente-nex/playground-launcher.tsx
git commit -m "feat(agente-nex): T-C1 v0.26 — Playground launcher destacado (violet primary + Sparkles + ring sutil)"
```

---

### Task C2: PlaygroundSheet — bubble UX (input bar + áudio + z-index fix)

**Files:**
- Modify: `src/components/agente-nex/playground-sheet.tsx`
- Test: `src/components/agente-nex/__tests__/playground-sheet.test.tsx` (existente)

- [ ] **Step 1: Skill ui-ux-pro-max** — validar:
  - Reusar layout do nex-chat-panel (input bar v0.15.4): `flex items-end gap-2` externo, Mic externo só em idle, inner area `flex-1 rounded-xl border bg-background min-h-9 px-3 py-1`, Send externo violet-gradient via `bg-gradient-to-br from-violet-600 to-violet-500`.
  - Suportar áudio quando `audioInputEnabled` (resolvido a partir de currentConfig.audioInputEnabled + provider OpenAI).
  - Dialog "Ver prompt usado": z-index >= z-[60] (acima do Sheet z-50). Backdrop específico não compete.

- [ ] **Step 2: Write failing test**

Adicionar a `src/components/agente-nex/__tests__/playground-sheet.test.tsx`:

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
    providerLabel: "OpenAI",
    modelLabel: "gpt-5.4-nano",
  };

  it("renderiza Mic externo quando audioInputEnabled e idle", () => {
    render(<PlaygroundSheet {...baseProps} />);
    expect(
      screen.getByRole("button", { name: /gravar áudio/i }),
    ).toBeInTheDocument();
  });

  it("Send button usa gradient violet (classList contém 'gradient' + 'violet')", () => {
    render(<PlaygroundSheet {...baseProps} />);
    const sendBtn = screen.getByRole("button", { name: /enviar/i });
    expect(sendBtn.className).toMatch(/bg-gradient/);
    expect(sendBtn.className).toMatch(/violet/);
  });

  it("Dialog 'Ver prompt usado' tem z-index >= 60 (acima do Sheet z-50)", async () => {
    mockPreview.mockResolvedValue({ ok: true, data: { composedPrompt: "test" } });
    render(<PlaygroundSheet {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /ver prompt usado/i }));
    const dialog = await screen.findByRole("dialog", { name: /prompt usado/i });
    const overlay = dialog.closest("[data-slot='dialog-content']")?.parentElement;
    expect(overlay?.className).toMatch(/z-\[60\]|z-60/);
  });
});
```

- [ ] **Step 3: Run test (RED)**

Run: `npm test -- playground-sheet`
Expected: FAIL.

- [ ] **Step 4: Implement — input bar refator + Dialog z-index**

Substituir o `<SheetFooter>` block + Dialog em `playground-sheet.tsx`:

```tsx
// Adicionar imports
import { Mic, Send } from "lucide-react";
import { AudioRecorder, type AudioRecorderHandle } from "@/components/nex/audio-recorder";

// Adicionar refs/state
const recorderRef = useRef<AudioRecorderHandle | null>(null);
const [isRecording, setIsRecording] = useState<boolean>(false);
const [audioFlight, setAudioFlight] = useState<boolean>(false);

// Resolver audioInputEnabled da config + provider
const audioEnabled =
  currentConfig.audioInputEnabled && providerLabel?.toLowerCase().includes("openai");

// Send dinâmico
function handleSendClick() {
  if (isRecording) {
    recorderRef.current?.sendNow();
    return;
  }
  handleSubmit();
}

async function handleSendAudio(blob: Blob, durationSeconds: number) {
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
      } catch {}
      toast.error(`Falha ao transcrever áudio: ${detail}`);
      return;
    }
    const data = (await res.json()) as { text?: string };
    const text = (data?.text ?? "").trim();
    if (!text) {
      toast.error("Não conseguimos entender o áudio. Tente de novo.");
      return;
    }
    // Injeta o texto transcrito como mensagem do user e dispara o flow normal.
    setMessage(text);
    setTimeout(() => handleSubmit(), 0);
  } catch (err) {
    toast.error(
      `Falha ao transcrever áudio: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    setAudioFlight(false);
  }
}

// SheetFooter substituído
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

    <div className="flex min-h-9 flex-1 items-center rounded-xl border border-input bg-background px-3 py-1 transition-colors focus-within:border-violet-500/60 focus-within:ring-3 focus-within:ring-violet-400/30">
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
      disabled={
        isRecording
          ? false
          : !canSubmit || audioFlight
      }
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
      className={cn(
        "text-xs tabular-nums",
        counterClass(message.length, MAX_INPUT_LEN),
      )}
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

E o Dialog "Ver prompt usado" — adicionar `className="z-[60]"` no `<DialogContent>` (ou se o Dialog primitive não aceita, envolver no portal e ajustar overlay):

```tsx
<Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
  <DialogContent
    className="sm:max-w-3xl z-[60]"
    aria-label="Prompt usado nesta sessão"
  >
    {/* ... existing ... */}
  </DialogContent>
</Dialog>
```

> Se o Dialog primitive aplicar z fixo no overlay, ajustar via CSS module ou tailwind config — alternativa: adicionar prop `overlayClassName="z-[60]"` no Dialog (verificar API do shadcn local).

- [ ] **Step 5: Run tests (GREEN)**

Run: `npm test -- playground-sheet`
Expected: PASS.

- [ ] **Step 6: Visual smoke**

Navegar `/agente-nex/prompt` → clicar "Abrir playground" → verificar input bar igual à bubble (Mic + textarea + Send violet) → clicar "Ver prompt usado" → Dialog deve aparecer ACIMA do Sheet.

- [ ] **Step 7: Commit**

```bash
git add src/components/agente-nex/playground-sheet.tsx src/components/agente-nex/__tests__/playground-sheet.test.tsx
git commit -m "feat(agente-nex): T-C2 v0.26 — PlaygroundSheet bubble UX (Mic + AudioRecorder + Send violet) + Dialog z-[60]"
```

---

### Task D1: DonutWithCenter — defaults bumped (innerRadius/outerRadius/height)

**Files:**
- Modify: `src/components/charts/donut-with-center.tsx`
- Test: `src/components/charts/__tests__/donut-with-center.test.tsx` (existente)

- [ ] **Step 1: Skill ui-ux-pro-max** — validar:
  - Donut maior dá respiro pro texto central (que tem px-6 + max-w-[60%]).
  - innerRadius=80 outerRadius=120 → ratio 0.66 (mantém leitura).
  - Tooltip near-mouse com offset=12 + allowEscapeViewBox NÃO sobrepõe (verificar visual em dark/light).

- [ ] **Step 2: Write failing test**

```typescript
// src/components/charts/__tests__/donut-with-center.test.tsx
import { render } from "@testing-library/react";
import { DonutWithCenter } from "../donut-with-center";

describe("DonutWithCenter — defaults v0.26", () => {
  it("usa innerRadius=80 e outerRadius=120 por default", () => {
    // Render + inspect SVG <Pie> attributes
    const { container } = render(
      <DonutWithCenter
        data={[{ name: "A", value: 50 }, { name: "B", value: 30 }]}
        centerLabel="Total"
        centerValue="80"
      />,
    );
    // Recharts não expõe innerRadius como atributo direto — testamos via prop default explicit:
    // (Snapshot ou via testid no wrapper SVG)
    const wrapper = container.querySelector("[role='img']");
    expect(wrapper).toBeInTheDocument();
    // Verifica height default (360)
    expect((wrapper as HTMLElement)?.style?.height).toBe("360px");
  });
});
```

- [ ] **Step 3: Run test (RED)**

Run: `npm test -- donut-with-center`
Expected: FAIL (height ainda é 320).

- [ ] **Step 4: Edit defaults**

```typescript
// src/components/charts/donut-with-center.tsx — assinatura
export function DonutWithCenter({
  data,
  centerLabel,
  centerValue,
  height = 360,
  innerRadius = 80,
  outerRadius = 120,
  // ... resto igual
}: DonutWithCenterProps) { /* ... */ }
```

- [ ] **Step 5: Run tests (GREEN)**

Run: `npm test -- donut-with-center`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/charts/donut-with-center.tsx src/components/charts/__tests__/donut-with-center.test.tsx
git commit -m "feat(charts): T-D1 v0.26 — DonutWithCenter defaults bumped (innerR=80, outerR=120, height=360)"
```

---

### Task D2: ConsumoContent — Total no filtro destaque + donut props

**Files:**
- Modify: `src/components/llm/consumo-content.tsx`

- [ ] **Step 1: Skill ui-ux-pro-max** — validar:
  - Total no filtro: text-sm (1pt acima de text-xs) + bg-violet-500/5 (light/dark) + font-bold + remover `uppercase tracking-wide` (legibilidade); border-b border-border/40 mantém.
  - Donut card height adequado a outerRadius=120 + center text + padding.

- [ ] **Step 2: Edit Total row classes**

Substituir (linha ~671):

```tsx
<TableRow className="sticky top-0 z-[1] bg-violet-500/5 border-b border-border/40 text-foreground font-bold text-sm">
```

- [ ] **Step 3: Edit donut props (opcional — defaults já cobrem)**

Se o donut estiver dentro de um Card com altura forçada, ajustar pra acomodar height=380:

```tsx
<DonutWithCenter
  data={providerPieData}
  centerLabel="Custo total"
  centerValue={totalCostBrlFormatted}
  height={380}
  innerRadius={80}
  outerRadius={120}
  formatValue={formatBrl4}
  ariaLabel="Custo agrupado por provider em BRL"
  emptyMessage="Sem dados de provider"
/>
```

(Remover prop `tooltipPosition="top-right"` — está deprecated.)

- [ ] **Step 4: Visual smoke**

Run dev: `npm run dev` → `/agente-nex/consumo` → verificar:
- Total no filtro: linha visivelmente destacada, fonte 1pt maior, sem uppercase.
- Donut: maior, espaço entre gráfico e centro respirando, tooltip não cobre o donut.

- [ ] **Step 5: Commit**

```bash
git add src/components/llm/consumo-content.tsx
git commit -m "feat(agente-nex): T-D2 v0.26 — Consumo Total no filtro destaque (text-sm + violet-500/5 + bold) + donut height 380"
```

---

### Task D3: bar-chart CustomBarTick — badge case-mixed (sem .toUpperCase)

**Files:**
- Modify: `src/components/charts/bar-chart.tsx`
- Test: `src/components/charts/__tests__/bar-chart-custom-tick.test.tsx` (NOVO)

- [ ] **Step 1: Skill ui-ux-pro-max** — validar:
  - Marca: OpenAI (não OPENAI), Anthropic, Gemini, OpenRouter — case-mixed. Letterspacing reduzido pra 0.2 (case mixed lê melhor sem espaçamento).
  - Largura recalculada: char ~6px em case mixed.

- [ ] **Step 2: Write failing test**

```typescript
// src/components/charts/__tests__/bar-chart-custom-tick.test.tsx
import { render } from "@testing-library/react";
import { InteractiveBarChart } from "../bar-chart";

describe("CustomBarTick — case mixed v0.26", () => {
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
    expect(badge?.textContent).not.toBe("OPENAI");
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
      (t) => /gemini/i.test(t.textContent ?? "") && !/-/.test(t.textContent ?? ""),
    );
    expect(badge?.textContent).toBe("Gemini");
  });
});
```

- [ ] **Step 3: Run test (RED)**

Run: `npm test -- bar-chart-custom-tick`
Expected: FAIL (atual mostra OPENAI).

- [ ] **Step 4: Edit makeCustomBarTick**

Em `src/components/charts/bar-chart.tsx` — função `makeCustomBarTick`:

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
    // v0.26.0: case-mixed (OpenAI, Anthropic, Gemini, OpenRouter) — sem .toUpperCase()
    const badgeText = providerLabel;
    // Heurística case-mixed: ~6px/char + 14px padding total.
    const badgeWidth = badgeText.length * 6 + 14;
    return (
      <g transform={`translate(${numX},${numY})`}>
        <text
          x={0}
          y={0}
          dy={16}
          textAnchor="middle"
          fontSize={13}
          fill="currentColor"
        >
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
              letterSpacing={0.2}
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

Run: `npm test -- bar-chart-custom-tick`
Expected: PASS (mas o test do "Gemini" depende do PROVIDER_LABELS atualizado — vide D4).

- [ ] **Step 6: Commit (parcial — Gemini test pode ainda falhar)**

```bash
git add src/components/charts/bar-chart.tsx src/components/charts/__tests__/bar-chart-custom-tick.test.tsx
git commit -m "feat(charts): T-D3 v0.26 — CustomBarTick case-mixed (OpenAI/Anthropic/Gemini/OpenRouter)"
```

---

### Task D4: PROVIDER_LABELS — "Gemini" em vez de "Google Gemini"

**Files:**
- Modify: `src/lib/llm/pricing.ts`
- Test: depende de testes existentes que esperam "Google Gemini" — atualizar.

- [ ] **Step 1: Skill ui-ux-pro-max** — não aplica (config).

- [ ] **Step 2: Edit**

```typescript
// src/lib/llm/pricing.ts
export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  openrouter: "OpenRouter",
};
```

- [ ] **Step 3: Atualizar testes que esperam "Google Gemini"**

```bash
grep -rn "Google Gemini" src/ tests/
```

Atualizar para "Gemini" onde for label visual ou test de PROVIDER_LABELS. NÃO alterar onde é texto de marketing/docs sobre o produto Google.

- [ ] **Step 4: Run full test suite**

Run: `npm test -- llm/pricing` + `npm test -- bar-chart-custom-tick`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/pricing.ts src/components/charts/__tests__/bar-chart-custom-tick.test.tsx
# + outros tests que precisaram atualizar
git commit -m "feat(agente-nex): T-D4 v0.26 — PROVIDER_LABELS 'Gemini' (sem 'Google Gemini')"
```

---

### Task D5: transcribe — log do motivo de fallback

**Files:**
- Modify: `src/lib/nex/transcribe.ts`
- Test: `src/lib/nex/__tests__/transcribe.test.ts` (existente)

- [ ] **Step 1: Skill ui-ux-pro-max** — não aplica.

- [ ] **Step 2: Write failing test**

```typescript
// src/lib/nex/__tests__/transcribe.test.ts — adicionar
describe("transcribeAudio — v0.26 fallback logging", () => {
  it("loga motivo do fallback (response body) quando gpt-4o-mini-transcribe retorna 4xx", async () => {
    // Mock fetch: primeiro fail 400 com body JSON, segundo (whisper-1) ok.
    const fetchMock = jest.spyOn(global, "fetch") as unknown as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "model_not_available" } }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: "ok", duration: 1 }), {
          status: 200,
        }),
      );
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

    await transcribeAudio(new Blob(["x"]));

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/gpt-4o-mini-transcribe.*400.*model_not_available/),
    );
  });
});
```

- [ ] **Step 3: Run test (RED)**

Run: `npm test -- transcribe`
Expected: FAIL (log atual não inclui body).

- [ ] **Step 4: Edit transcribe**

Em `src/lib/nex/transcribe.ts`, no bloco `if (response.ok) {...}` substituir o `console.warn` simples por:

```typescript
} else {
  let errorBody = "";
  try {
    errorBody = await response.text();
  } catch {}
  console.warn(
    `[transcribe] gpt-4o-mini-transcribe ${response.status} — ${errorBody.slice(0, 200)} — fallback whisper-1`,
  );
}
```

- [ ] **Step 5: Run tests (GREEN)**

Run: `npm test -- transcribe`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nex/transcribe.ts src/lib/nex/__tests__/transcribe.test.ts
git commit -m "fix(agente-nex): T-D5 v0.26 — transcribe loga response body do gpt-4o-mini-transcribe no fallback (debug em prod)"
```

---

### Task R1: bump versão + CHANGELOG + STATUS

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Sync remote**

Run: `git fetch origin main && git status`
Verificar se outro agente bumped — se sim, escolher próximo livre (v0.27 etc).

- [ ] **Step 2: Edit package.json**

```json
{
  "version": "0.26.0"
}
```

- [ ] **Step 3: Append CHANGELOG entry**

```markdown
## v0.26.0 — Suite Agente Nex Polish v3 — 2026-05-03

### Configuração (/agente-nex/configuracao)
- Reorganização: Toggle Nex / LLM section + ações inline (Testar conexão + Salvar) / **USD/BRL ticker** novo (auto-refresh hourly + manual + badge fonte live/cache/fallback) / Spread cartão em destaque (Card violet-500/5 + helper expandido + cálculo Comercial × Spread = Effective).
- Server Action `getCurrentUsdBrlRateAction` (super_admin gate; invalida memo + retorna rate atual).

### Prompt (/agente-nex/prompt)
- IDENTITY_BASE: regra anti-Chatwoot (sempre "Nexus Chat") + máx 3 frases por resposta + `accountUrls` rotulado "Nexus Chat".
- Backfill idempotente removendo guardrail "Sempre cite a fonte do número" de installs existentes (flag `seeded_v2_at`).
- PromptPreviewCard: collapse do prompt completo (oculto por default) + remoção do botão Maximizar + botão Editar restrito a `super_admin` (abre Dialog max-edit com PromptConfigForm dentro).
- Help text dos guardrails sem exemplo "cite a fonte".

### Playground (Sheet)
- Botão "Abrir playground" destacado (variant=default violet primary + ícone Sparkles + ring sutil).
- PlaygroundSheet input bar refatorada com layout do nex-chat-panel (Mic externo + inner area unificada + Send violet-gradient) + suporte a áudio via AudioRecorder embedded + transcribe via /api/nex/transcribe.
- Fix: Dialog "Ver prompt usado" com z-[60] (acima do Sheet z-50).

### Consumo (/agente-nex/consumo)
- DonutWithCenter defaults bumped: innerRadius 80, outerRadius 120, height 360 → mais respiro entre fatia e texto central.
- Total no filtro: text-sm (+1pt) + bg-violet-500/5 + font-bold + sem uppercase → destaque visual.
- Bar chart CustomBarTick: badge case-mixed (OpenAI/Anthropic/Gemini/OpenRouter — sem `.toUpperCase()`).
- PROVIDER_LABELS: "Google Gemini" → "Gemini".
- transcribe: console.warn agora inclui body do erro de gpt-4o-mini-transcribe (debug do motivo do fallback em prod).
```

- [ ] **Step 4: Append STATUS entry**

Idêntico ao CHANGELOG, formato curto.

- [ ] **Step 5: Commit**

```bash
git add package.json CHANGELOG.md docs/STATUS.md
git commit -m "chore(release): v0.26.0 — Suite Agente Nex Polish v3"
```

---

### Task R2: typecheck + full test suite

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erros nos arquivos tocados (erros pré-existentes em `integrations-power-bi.test.ts` são aceitos).

- [ ] **Step 2: Run full test**

Run: `npm test 2>&1 | tail -30`
Expected: PASS (exceto 20 falhas pré-existentes em integrations-power-bi).

- [ ] **Step 3: Build smoke**

Run: `npm run build 2>&1 | tail -20`
Expected: build success.

---

### Task R3: skill verification-before-completion

- [ ] **Step 1:** invocar `superpowers:verification-before-completion` via Skill tool.

- [ ] **Step 2:** rodar checklist da skill (golden path manual em dev: navegar 4 submenus, clicar nos botões críticos, verificar que tudo funciona) + reportar evidências.

---

### Task R4: append HISTORY + push monitorado

- [ ] **Step 1: Append HISTORY**

```markdown
2026-05-03 HH:MM | agent=claude-agente-nex-polish-v026 | commit=<hash> | scope=release | summary=v0.26.0 — Suite Agente Nex Polish v3 (Configuração reorg + USD ticker / Prompt anti-Chatwoot + collapse + Editar super_admin / Playground bubble UX + Dialog z-fix / Consumo donut bigger + Total destaque + badges case-mixed). Workflow rigoroso: plan v1→v2→v3 (2 pente-finos). Coordenação: claude-conversas-polish-v025 escopo distinto.
```

- [ ] **Step 2: gh run list (verificar build alheio)**

Run: `gh run list --limit 5`
Expected: nenhum build queued/in-progress de outro agente. Se houver, esperar.

- [ ] **Step 3: Push**

Run: `git push origin main`
Expected: build CI dispara — monitorar via `gh run watch`.

- [ ] **Step 4: Smoke prod**

Run: `curl -fsS https://<prod>/api/health | jq`
Expected: `version=v0.26.0`, `status=ok`.

- [ ] **Step 5: skill finishing-a-development-branch**

Invocar `superpowers:finishing-a-development-branch`. Decidir merge/PR (já estamos em main → just push). Deletar `docs/agents/active/claude-agente-nex-polish-v026.md`.

---

## Self-Review (final)

### Spec coverage
- [x] Configuração reorg + Spread destaque + Testar conexão junto com Salvar → A3
- [x] USD ticker hourly → A1, A2
- [x] Prompt collapse + Editar super_admin only → B3
- [x] Remover guardrail "cite a fonte" → B2
- [x] Anti-Chatwoot no prompt → B1
- [x] Tom mais resumido → B1 (máx 3 frases)
- [x] Playground botão destaque → C1
- [x] Bubble UX no PlaygroundSheet → C2
- [x] Fix z-index "Ver prompt usado" → C2
- [x] Whisper tokens explicação → D5 (logging robusto) + tooltips já existentes (memory v0.24)
- [x] Donut spacing/tooltip → D1, D2
- [x] Total no filtro destaque → D2
- [x] Badge case-mixed → D3, D4

### Placeholder scan
- [x] Sem TODOs, TBDs, "implement later".
- [x] Todos os steps têm código real.

### Type consistency
- [x] `getCurrentUsdBrlRateAction` retorna `{ ok: true; data: UsdBrlRate } | { ok: false; error: string }` — usado em A1, A2.
- [x] `UsdBrlRate.fetchedAt: Date` — A2 tolera Date|string via runtime check.
- [x] `PromptPreviewCardProps.isSuperAdmin: boolean` — usado em B3 + page.tsx prompt.
- [x] `PromptConfigFormProps.onSaved?: () => void` — usado em B3.
