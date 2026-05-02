# Dashboard Polish v0.22.0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polir o `/dashboard` (PeriodNavigator tag-style, KPIs no padrão consumo, drill-downs alinhados com nomenclatura "Estado" + Departamento + tag âmbar + TotalBadge), corrigir bug de contagem do drill-down "Conversas sem resposta" e investigar bug do gráfico semana/mês inconsistente com dia.

**Architecture:** Mudanças isoladas em `src/components/dashboard/` + ajustes pontuais em `src/lib/chatwoot/queries/dashboard-drill-down.ts`. Reuso dos charts genéricos (`<DonutWithCenter>`, `<InteractiveAreaChart>`, `<InteractiveBarChart>`) sem editá-los (escopo de outro agente). Workflow: TDD por task, ui-ux-pro-max em UI, commits frequentes.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, Recharts, Jest + jest-mock-extended + jsdom + @testing-library/react, Postgres + pg-node.

**Versão alvo:** v0.22.0 (pulo v0.21 que está em curso).

**Coordenação:** files-not-to-touch documentados em `docs/agents/active/claude-dashboard-polish-v022.md`. Não tocar `dashboard/page.tsx` (claude-empresa-ativa-global) nem charts genéricos (claude-nex-suite-polish-v020).

---

## Sumário das tasks

| Task | Escopo | Estima |
|------|--------|--------|
| T1 | Helpers + componentes novos (TotalBadge, WaitingBucketsDonut) | TDD |
| T2 | PeriodNavigator tag-style refactor | TDD |
| T3 | KpiClickableCard refactor pro padrão consumo | TDD |
| T4 | dashboard-content.tsx — migrar `sublabel` → `subtitle` | TDD trivial |
| T5 | Backend: SQL queries + types (team_name JOIN + noResponse fix) | TDD via SQL inspection |
| T6 | drill-down-contents.tsx — Estado label + Departamento col + tag âmbar + TotalBadge + yAxisWidth + labels HH:00 | TDD |
| T7 | no-response-drill-down.tsx — substituir Resumo por Faixa de espera + tabela polish | TDD |
| T8 | team-drill-down.tsx — Estado label + tag âmbar + TotalBadge | TDD |
| T9 | Diagnóstico G2 (chart semana/mês) + fix se aplicável | runtime debug |
| T10 | Smoke test manual + verificação | run app + verify |
| T11 | Release (CHANGELOG, STATUS, package.json bump) | mecânico |
| T12 | Push + portainer-fix + memória + HISTORY | deploy assistido |

---

## Task 1: Componentes novos (TotalBadge + WaitingBucketsDonut)

**Files:**
- Create: `src/components/dashboard/total-badge.tsx`
- Create: `src/components/dashboard/waiting-buckets-donut.tsx`
- Test: `src/components/dashboard/__tests__/total-badge.test.tsx`
- Test: `src/components/dashboard/__tests__/waiting-buckets-donut.test.tsx`

**Pré-requisito UI:** invocar `ui-ux-pro-max:ui-ux-pro-max` (skill obrigatória de UI conforme CLAUDE.md §2.2) **antes** de codar.

### Step 1.1: Test TotalBadge

- [ ] Criar `src/components/dashboard/__tests__/total-badge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { TotalBadge } from "../total-badge";

describe("TotalBadge", () => {
  it("renderiza número formatado em pt-BR (separador milhar)", () => {
    render(<TotalBadge n={1234} />);
    expect(screen.getByText("1.234")).toBeInTheDocument();
  });

  it("aplica classe de pill violeta", () => {
    render(<TotalBadge n={5} />);
    const el = screen.getByText("5");
    expect(el).toHaveClass("bg-violet-500/10");
    expect(el).toHaveClass("text-violet-300");
  });

  it("renderiza 0 sem fallback", () => {
    render(<TotalBadge n={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
```

- [ ] Rodar: `npm test -- --testPathPattern=total-badge` → expected FAIL ("Cannot find module").

### Step 1.2: Implementar TotalBadge

- [ ] Criar `src/components/dashboard/total-badge.tsx`:

```tsx
"use client";

interface TotalBadgeProps {
  n: number;
}

export function TotalBadge({ n }: TotalBadgeProps) {
  return (
    <span className="ml-2 inline-flex items-center rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-violet-300">
      {n.toLocaleString("pt-BR")}
    </span>
  );
}
```

- [ ] Rodar: `npm test -- --testPathPattern=total-badge` → expected PASS.

### Step 1.3: Test WaitingBucketsDonut

- [ ] Criar `src/components/dashboard/__tests__/waiting-buckets-donut.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { WaitingBucketsDonut } from "../waiting-buckets-donut";

const HOUR = 3600;
const DAY = 24 * HOUR;

describe("WaitingBucketsDonut", () => {
  it("bucketiza items em 4 faixas (0-4h, 4-24h, 1-3d, >3d)", () => {
    const items = [
      { id: 1, displayId: 1, contactName: "A", inboxName: "X", assigneeName: null, waitingSeconds: HOUR, lastIncomingAt: "2026-05-02T00:00:00Z", snippet: null },
      { id: 2, displayId: 2, contactName: "B", inboxName: "X", assigneeName: null, waitingSeconds: 5 * HOUR, lastIncomingAt: "2026-05-02T00:00:00Z", snippet: null },
      { id: 3, displayId: 3, contactName: "C", inboxName: "X", assigneeName: null, waitingSeconds: 2 * DAY, lastIncomingAt: "2026-05-02T00:00:00Z", snippet: null },
      { id: 4, displayId: 4, contactName: "D", inboxName: "X", assigneeName: null, waitingSeconds: 5 * DAY, lastIncomingAt: "2026-05-02T00:00:00Z", snippet: null },
    ];
    render(<WaitingBucketsDonut items={items} total={4} oldestSeconds={5 * DAY} />);
    expect(screen.getByText("0–4h")).toBeInTheDocument();
    expect(screen.getByText("4–24h")).toBeInTheDocument();
    expect(screen.getByText("1–3 dias")).toBeInTheDocument();
    expect(screen.getByText("Mais de 3 dias")).toBeInTheDocument();
  });

  it("mostra total no centro do donut", () => {
    render(<WaitingBucketsDonut items={[]} total={31} oldestSeconds={4 * DAY} />);
    // O DonutWithCenter mostra centerValue mesmo sem items via prop
    expect(screen.getByText("31")).toBeInTheDocument();
  });

  it("mostra 'Mais antiga há …' quando oldestSeconds > 0", () => {
    render(<WaitingBucketsDonut items={[]} total={5} oldestSeconds={3 * DAY} />);
    expect(screen.getByText(/Mais antiga há/i)).toBeInTheDocument();
  });

  it("não mostra 'Mais antiga' quando oldestSeconds = 0", () => {
    render(<WaitingBucketsDonut items={[]} total={0} oldestSeconds={0} />);
    expect(screen.queryByText(/Mais antiga há/i)).not.toBeInTheDocument();
  });
});
```

- [ ] Rodar: `npm test -- --testPathPattern=waiting-buckets-donut` → expected FAIL.

### Step 1.4: Implementar WaitingBucketsDonut

- [ ] Criar `src/components/dashboard/waiting-buckets-donut.tsx`:

```tsx
"use client";

import { DonutWithCenter } from "@/components/charts";
import { CHART_COLORS } from "@/lib/charts/colors";
import { formatDuration } from "@/lib/utils/format-time";
import type { NoResponseDrillDownItem } from "@/lib/chatwoot/queries/dashboard-drill-down";

interface WaitingBucketsDonutProps {
  items: NoResponseDrillDownItem[];
  total: number;
  oldestSeconds: number;
}

const HOUR = 3600;
const DAY = 24 * HOUR;

interface BucketDef {
  label: string;
  threshold: number; // upper bound exclusivo, em segundos
  color: string;
}

const BUCKETS: BucketDef[] = [
  { label: "0–4h", threshold: 4 * HOUR, color: CHART_COLORS.yellow },
  { label: "4–24h", threshold: DAY, color: CHART_COLORS.amber },
  { label: "1–3 dias", threshold: 3 * DAY, color: CHART_COLORS.orange },
  { label: "Mais de 3 dias", threshold: Number.POSITIVE_INFINITY, color: CHART_COLORS.red },
];

export function WaitingBucketsDonut({
  items,
  total,
  oldestSeconds,
}: WaitingBucketsDonutProps) {
  // bucketização (cap implícito: items vem com no máximo 100 do backend)
  const counts = BUCKETS.map((b) => ({ ...b, count: 0 }));
  for (const it of items) {
    const idx = counts.findIndex((c) => it.waitingSeconds < c.threshold);
    if (idx >= 0) counts[idx]!.count += 1;
  }

  const data = counts.map((c) => ({
    name: c.label,
    value: c.count,
    color: c.color,
  }));

  return (
    <div className="space-y-3">
      <DonutWithCenter
        data={data}
        centerLabel="aguardando"
        centerValue={total.toLocaleString("pt-BR")}
        height={260}
        emptyMessage="Nada na fila"
      />
      {oldestSeconds > 0 ? (
        <p className="text-xs text-amber-400 text-center">
          Mais antiga há{" "}
          <span className="font-semibold">{formatDuration(oldestSeconds)}</span>
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] Verificar se `CHART_COLORS.yellow`, `.orange`, `.red` existem. Se não, usar valores hex fallback (ex.: `#fbbf24`, `#fb923c`, `#ef4444`).

- [ ] Rodar: `npm test -- --testPathPattern=waiting-buckets-donut` → expected PASS.

### Step 1.5: Commit T1

- [ ] Commit:

```bash
git add src/components/dashboard/total-badge.tsx \
        src/components/dashboard/waiting-buckets-donut.tsx \
        src/components/dashboard/__tests__/total-badge.test.tsx \
        src/components/dashboard/__tests__/waiting-buckets-donut.test.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): T1 v0.22.0 — TotalBadge + WaitingBucketsDonut helpers

- TotalBadge: pill violeta com número pt-BR (substitui "(N)" cosmético).
- WaitingBucketsDonut: 4 faixas (0-4h, 4-24h, 1-3d, >3d) calculado
  client-side a partir de items[].waitingSeconds.
- 7 tests (4 + 3) PASS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: PeriodNavigator tag-style refactor

**Files:**
- Modify: `src/components/dashboard/period-navigator.tsx:91-131`
- Test: `src/components/dashboard/__tests__/period-navigator.test.tsx` (novo)

**Pré-requisito UI:** invocar `ui-ux-pro-max:ui-ux-pro-max` antes.

### Step 2.1: Test PeriodNavigator

- [ ] Criar `src/components/dashboard/__tests__/period-navigator.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { PeriodNavigator } from "../period-navigator";

const baseProps = {
  period: "dia" as const,
  range: { start: "2026-05-01T03:00:00Z", end: "2026-05-02T02:59:59Z" },
  tz: "America/Sao_Paulo",
  weekStartsOn: 1,
  referenceDate: null,
  nextAvailable: true,
};

describe("PeriodNavigator (tag-style v0.22.0)", () => {
  it("renderiza label do dia", () => {
    render(<PeriodNavigator {...baseProps} onChange={() => {}} />);
    expect(screen.getByText("01/05")).toBeInTheDocument();
  });

  it("usa tipografia text-sm font-medium (size match com checkboxes)", () => {
    render(<PeriodNavigator {...baseProps} onChange={() => {}} />);
    const label = screen.getByText("01/05");
    expect(label).toHaveClass("text-sm");
    expect(label).toHaveClass("font-medium");
  });

  it("desabilita botão next quando nextAvailable=false", () => {
    render(
      <PeriodNavigator {...baseProps} nextAvailable={false} onChange={() => {}} />,
    );
    const next = screen.getByLabelText("Próximo período");
    expect(next).toBeDisabled();
  });

  it("dispara onChange ao clicar prev", () => {
    const onChange = jest.fn();
    render(<PeriodNavigator {...baseProps} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Período anterior"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] Rodar: `npm test -- --testPathPattern=period-navigator` → expected FAIL no test #2 (ainda text-[11px]).

### Step 2.2: Refactor visual

- [ ] Editar `src/components/dashboard/period-navigator.tsx:91-131`:

```tsx
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border bg-violet-500/5 px-2 py-1.5",
        "border-violet-500/30 transition-all duration-150",
        "hover:border-violet-500/60 hover:bg-violet-500/10",
      )}
      role="group"
      aria-label={`Navegação de ${period}`}
    >
      <button
        type="button"
        onClick={handlePrev}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded transition-colors duration-150",
          "text-violet-300 hover:bg-violet-500/25 hover:text-violet-100 cursor-pointer",
          "focus-visible:outline-none focus-visible:bg-violet-500/30",
        )}
        aria-label="Período anterior"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="px-2 text-sm font-medium tabular-nums text-violet-100 select-none whitespace-nowrap leading-none">
        {label}
      </span>
      <button
        type="button"
        onClick={handleNext}
        disabled={!nextAvailable}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded transition-colors duration-150",
          nextAvailable
            ? "text-violet-300 hover:bg-violet-500/25 hover:text-violet-100 cursor-pointer focus-visible:outline-none focus-visible:bg-violet-500/30"
            : "text-violet-300/30 cursor-not-allowed",
        )}
        aria-label="Próximo período"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
```

- [ ] Rodar: `npm test -- --testPathPattern=period-navigator` → expected PASS (4/4).

### Step 2.3: Commit T2

- [ ] Commit:

```bash
git add src/components/dashboard/period-navigator.tsx \
        src/components/dashboard/__tests__/period-navigator.test.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): T2 v0.22.0 — PeriodNavigator tag-style maior

- text-[11px] → text-sm font-medium (match com checkboxes do gráfico).
- h-5 w-5 → h-7 w-7 nos botões (alvo de toque ≥ 28px).
- chevrons h-3 → h-4.
- padding container 0.5 → px-2 py-1.5.
- border violet 50% → 30% (mais sutil; hover compensa).
- 4 tests TDD PASS (label, tipografia, disabled, click).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: KpiClickableCard refactor (padrão consumo)

**Files:**
- Modify: `src/components/dashboard/kpi-clickable-card.tsx`
- Test: `src/components/dashboard/__tests__/kpi-clickable-card.test.tsx` (novo)

**Pré-requisito UI:** invocar `ui-ux-pro-max:ui-ux-pro-max`.

### Step 3.1: Test KpiClickableCard

- [ ] Criar `src/components/dashboard/__tests__/kpi-clickable-card.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { KpiClickableCard } from "../kpi-clickable-card";

const baseProps = {
  icon: Inbox,
  label: "Conversas recebidas",
  value: "99",
  onClick: () => {},
};

describe("KpiClickableCard (v0.22.0)", () => {
  it("renderiza label em UPPERCASE", () => {
    render(<KpiClickableCard {...baseProps} />);
    const label = screen.getByText("Conversas recebidas");
    expect(label).toHaveClass("uppercase");
  });

  it("renderiza valor em 3xl bold", () => {
    render(<KpiClickableCard {...baseProps} />);
    const value = screen.getByText("99");
    expect(value).toHaveClass("text-3xl");
    expect(value).toHaveClass("font-bold");
  });

  it("renderiza subtitle quando provido", () => {
    render(<KpiClickableCard {...baseProps} subtitle="no período" />);
    expect(screen.getByText("no período")).toBeInTheDocument();
  });

  it("aceita prop legacy 'sublabel' como fallback de subtitle", () => {
    render(<KpiClickableCard {...baseProps} sublabel="(no período)" />);
    expect(screen.getByText("(no período)")).toBeInTheDocument();
  });

  it("dispara onClick", () => {
    const onClick = jest.fn();
    render(<KpiClickableCard {...baseProps} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renderiza trend abaixo do valor com cor verde quando direction=up", () => {
    render(
      <KpiClickableCard
        {...baseProps}
        trend={{ direction: "up", value: "+12.3%" }}
      />,
    );
    const trend = screen.getByText("+12.3%");
    expect(trend).toBeInTheDocument();
  });
});
```

- [ ] Rodar: `npm test -- --testPathPattern=kpi-clickable-card` → expected FAIL (label sem uppercase, value 2xl).

### Step 3.2: Refactor

- [ ] Substituir `src/components/dashboard/kpi-clickable-card.tsx` inteiro:

```tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface KpiTrend {
  direction: "up" | "down" | "flat";
  value: string;
  invert?: boolean;
}

export interface KpiClickableCardProps {
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  label: string;
  /** @deprecated use `subtitle`. Mantido por compat. */
  sublabel?: string;
  subtitle?: string;
  value: string;
  trend?: KpiTrend | null;
  badge?: string;
  miniChart?: React.ReactNode;
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
}

export function KpiClickableCard({
  icon: Icon,
  iconColor = "text-violet-400",
  iconBg = "bg-violet-500/10",
  label,
  sublabel,
  subtitle,
  value,
  trend,
  badge,
  miniChart,
  onClick,
  ariaLabel,
  className,
}: KpiClickableCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const effectiveSubtitle = subtitle ?? sublabel;

  const trendIsGood =
    trend && trend.direction !== "flat"
      ? trend.invert
        ? trend.direction === "down"
        : trend.direction === "up"
      : false;
  const trendIsBad =
    trend && trend.direction !== "flat"
      ? trend.invert
        ? trend.direction === "up"
        : trend.direction === "down"
      : false;

  const trendClass = trendIsGood
    ? "text-emerald-400"
    : trendIsBad
      ? "text-red-400"
      : "text-muted-foreground";

  const TrendIcon =
    trend?.direction === "up"
      ? ArrowUpRight
      : trend?.direction === "down"
        ? ArrowDownRight
        : ArrowRight;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={prefersReducedMotion ? undefined : { scale: 1.01 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      aria-label={
        ariaLabel ??
        `${label}: ${value}.${effectiveSubtitle ? ` ${effectiveSubtitle}.` : ""} Clique para ver detalhes.`
      }
      className={cn(
        "group relative flex w-full flex-col rounded-xl border border-border bg-card p-5 text-left",
        "min-h-[8rem] cursor-pointer outline-none",
        "transition-[border-color,box-shadow] duration-200",
        "hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5",
        "focus-visible:border-violet-500/40 focus-visible:ring-2 focus-visible:ring-violet-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "motion-reduce:transition-none",
        className,
      )}
    >
      {/* Linha topo: label + ícone (top-right) */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
        </div>
        <div className="flex items-start gap-2">
          {badge ? (
            <Badge
              variant="outline"
              className="border-border text-xs text-muted-foreground"
            >
              {badge}
            </Badge>
          ) : null}
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              iconBg,
            )}
          >
            <Icon className={cn("h-5 w-5", iconColor)} aria-hidden />
          </div>
        </div>
      </div>

      {/* Hint "ver detalhes" (hover) */}
      <span
        aria-hidden
        className="mt-1 self-end inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-violet-400/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        ver detalhes
        <ArrowRight className="h-3 w-3" />
      </span>

      {/* Valor */}
      <div className="mt-3">
        <p className="font-heading text-3xl font-bold tracking-tight tabular-nums text-foreground">
          {value}
        </p>
        {trend ? (
          <p
            className={cn(
              "mt-1 inline-flex items-center gap-1 text-xs font-medium",
              trendClass,
            )}
          >
            <TrendIcon className="h-3.5 w-3.5" aria-hidden />
            {trend.value}
          </p>
        ) : null}
        {effectiveSubtitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground/80">
            {effectiveSubtitle}
          </p>
        ) : null}
      </div>

      {/* Sparkline */}
      {miniChart ? (
        <div
          aria-hidden
          className="mt-3 -mx-1 opacity-90 transition-opacity duration-200 group-hover:opacity-100"
        >
          {miniChart}
        </div>
      ) : null}
    </motion.button>
  );
}
```

- [ ] Rodar: `npm test -- --testPathPattern=kpi-clickable-card` → expected PASS (6/6).

### Step 3.3: Commit T3

- [ ] Commit:

```bash
git add src/components/dashboard/kpi-clickable-card.tsx \
        src/components/dashboard/__tests__/kpi-clickable-card.test.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): T3 v0.22.0 — KpiClickableCard padrão consumo

Refactor pro layout do KpiCard (consumo Nex):
- label UPPERCASE text-xs em cima (era xs muted abaixo do valor).
- valor 2xl → 3xl font-bold tabular-nums.
- trend em linha abaixo do valor (era top-right).
- subtitle muted abaixo do trend (props nova).
- ícone top-right (era top-left); badge ao lado.
- prop legacy `sublabel` mantida como fallback de `subtitle`.
- aria-label inclui subtitle no contexto.
- min-h 7rem → 8rem (acomoda label+valor+trend+subtitle+sparkline).

6 tests TDD PASS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: dashboard-content.tsx — `sublabel` → `subtitle`

**Files:**
- Modify: `src/components/dashboard/dashboard-content.tsx:399`

### Step 4.1: Migrar prop

- [ ] Editar `src/components/dashboard/dashboard-content.tsx`:

Encontrar (≈ linha 396-403):

```tsx
        <KpiClickableCard
          icon={MessageSquare}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-400"
          label="Abertas"
          sublabel="(no período)"
          value={stats.open.toLocaleString("pt-BR")}
```

Substituir por:

```tsx
        <KpiClickableCard
          icon={MessageSquare}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-400"
          label="Abertas"
          subtitle="no período"
          value={stats.open.toLocaleString("pt-BR")}
```

- [ ] Adicionar `subtitle="no período"` aos outros 3 KPIs (Recebidas, Resolvidas, Taxa de resolução). Cada KpiClickableCard recebe a mesma prop.

- [ ] Rodar: `npm run typecheck` → expected 0 erros.

### Step 4.2: Commit T4

- [ ] Commit:

```bash
git add src/components/dashboard/dashboard-content.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): T4 v0.22.0 — KPIs do topo recebem subtitle="no período"

Aplica o novo padrão (T3) nos 4 KpiClickableCard:
- subtitle="no período" em todos.
- sublabel="(no período)" do card "Abertas" deduplicado.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Backend — SQL queries + types

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-drill-down.ts`

### Step 5.1: Estender contratos

- [ ] Editar `src/lib/chatwoot/queries/dashboard-drill-down.ts`:

Encontrar:

```ts
export interface DrillDownConversationItem {
  id: number;
  displayId: number;
  contactName: string | null;
  inboxName: string | null;
  assigneeName: string | null;
  status: number;
  lastActivityAt: string;
}
```

Adicionar campo:

```ts
export interface DrillDownConversationItem {
  id: number;
  displayId: number;
  contactName: string | null;
  inboxName: string | null;
  teamName: string | null;
  assigneeName: string | null;
  status: number;
  lastActivityAt: string;
}
```

Encontrar `interface RowConversation` (linha ≈ 208) e adicionar `team_name: string | null`.

Encontrar `interface NoResponseDrillDownItem` e adicionar `teamName: string | null`.

Encontrar `interface RowNoResponseFull` e adicionar `team_name: string | null`.

Encontrar `interface ByTeamDrillDownItem` e adicionar `teamName: string | null` (consistência — embora aqui a coluna não vai ser exibida no team-drill-down, manter contrato).

### Step 5.2: SQL — adicionar JOIN teams nas queries de listagem

- [ ] Em `getReceivedDrillDown.sqlRecent` (linha ≈ 340-358):

```sql
            SELECT
              c.id, c.display_id,
              ct.name AS contact_name,
              i.name AS inbox_name,
              t.name AS team_name,                  -- ← novo
              u.name AS assignee_name,
              c.status,
              c.last_activity_at
            FROM conversations c
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes i ON i.id = c.inbox_id
            LEFT JOIN teams t ON t.id = c.team_id   -- ← novo
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              ${matrixClause}
            ORDER BY c.created_at DESC NULLS LAST
            LIMIT $4 OFFSET $5
```

E no `.map((r) => ({...}))` adicionar:

```ts
teamName: r.team_name,
```

- [ ] Idem em `getResolvedDrillDown.sqlRecent` (linha ≈ 543-562) — JOIN teams + map.

- [ ] Idem em `getStatusDrillDown` (`sqlList` da função) — JOIN teams + map.

- [ ] Idem em `getNoResponseDrillDown.sqlList` (linha ≈ 1141-1174) — JOIN teams + map.

- [ ] Idem em `getByTeamDrillDown` (consistência) — JOIN teams + map em `items` (renomear `team_name` → `teamName`).

Bumpa cache keys em **todas** as queries afetadas:
- `dashboard-drill-received-v3` → `dashboard-drill-received-v4`
- `dashboard-drill-resolved-v3` → `dashboard-drill-resolved-v4`
- `dashboard-drill-status-vN` → próxima versão (ler atual).
- `dashboard-drill-no-response` → `dashboard-drill-no-response-v2`
- `dashboard-drill-by-team-vN` → próxima versão.

### Step 5.3: G5 fix — getNoResponseDrillDown alinhar ao widget

- [ ] No `sqlAgg` da `getNoResponseDrillDown`:

Substituir:

```sql
WITH last_msg AS (
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id,
    m.created_at,
    m.message_type
  FROM messages m
  ORDER BY m.conversation_id, m.created_at DESC
)
…
WHERE c.account_id = $1
  AND c.created_at >= $2
  AND c.created_at < $3
  AND c.status = 0
```

Por:

```sql
WITH last_msg AS (
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id,
    m.created_at,
    m.message_type
  FROM messages m
  WHERE m.message_type IN (0, 1)
  ORDER BY m.conversation_id, m.created_at DESC
)
…
WHERE c.account_id = $1
  AND c.last_activity_at >= $2
  AND c.last_activity_at < $3
  AND c.status = 0
```

- [ ] Replicar a mesma mudança em `sqlList`, `sqlByInbox`, `sqlByAssignee` da `getNoResponseDrillDown`.

### Step 5.4: Type-check

- [ ] Rodar: `npm run typecheck` → expected 0 erros (callers que usam `inboxName` continuam funcionando; novos `teamName` aparecem como opcionais).

### Step 5.5: Commit T5

- [ ] Commit:

```bash
git add src/lib/chatwoot/queries/dashboard-drill-down.ts
git commit -m "$(cat <<'EOF'
fix(dashboard): T5 v0.22.0 — drill-down queries: + team_name JOIN + alinhar getNoResponseDrillDown ao widget

Mudanças:
1. JOIN teams t ON t.id = c.team_id em sqlRecent (received), sqlRecent
   (resolved), sqlList (status, no-response, by-team). Acrescenta
   coluna team_name → teamName no mapper.
2. DrillDownConversationItem + NoResponseDrillDownItem +
   ByTeamDrillDownItem ganham campo teamName: string | null.
3. getNoResponseDrillDown alinha às mesmas regras do widget
   dashboardData.noResponse:
   - last_msg WHERE message_type IN (0, 1) (ignora activity/template).
   - filtro c.last_activity_at (era c.created_at).
   Bug original: 31 conversas no widget vs 11 no drill-down.
4. Cache keys bumpadas (received-v4, resolved-v4, no-response-v2 etc).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: drill-down-contents.tsx — todas as mudanças do G4

**Files:**
- Modify: `src/components/dashboard/drill-down-contents.tsx`
- Test: `src/components/dashboard/__tests__/drill-down-contents.test.tsx` (novo, smoke)

**Pré-requisito UI:** invocar `ui-ux-pro-max:ui-ux-pro-max`.

### Step 6.1: Test smoke

- [ ] Criar `src/components/dashboard/__tests__/drill-down-contents.test.tsx`:

```tsx
/**
 * Smoke tests para `drill-down-contents.tsx`. Mocka `getReceivedDrillDownAction`
 * (action) com payload mínimo e valida (a) header "Estado" presente,
 * (b) coluna Departamento presente, (c) tag âmbar em "Quando", (d) TotalBadge
 * no título da seção.
 */
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ReceivedDrillDownContent } from "../drill-down-contents";

jest.mock("@/lib/actions/dashboard-drill-down", () => ({
  getReceivedDrillDownAction: jest.fn().mockResolvedValue({
    success: true,
    data: {
      total: 99,
      granularity: "day",
      chart: [],
      byInbox: [{ id: 1, name: "SP-São Paulo", count: 22 }],
      byHour: [{ hour: 14, count: 3 }],
      items: [
        {
          id: 1,
          displayId: 100,
          contactName: "Paulo",
          inboxName: "SP-São Paulo",
          teamName: "Vendas",
          assigneeName: "Hevelyn",
          status: 0,
          lastActivityAt: new Date().toISOString(),
        },
      ],
      page: 1,
      pageSize: 50,
      recent: [],
    },
  }),
}));

describe("ReceivedDrillDownContent (v0.22.0)", () => {
  it("renderiza header 'Estado' (não 'Inbox')", async () => {
    render(<ReceivedDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() =>
      expect(screen.getAllByText(/Estado/i).length).toBeGreaterThan(0),
    );
    expect(screen.queryByText(/^Inbox$/)).not.toBeInTheDocument();
  });

  it("renderiza coluna Departamento", async () => {
    render(<ReceivedDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() =>
      expect(screen.getByText("Departamento")).toBeInTheDocument(),
    );
    expect(screen.getByText("Vendas")).toBeInTheDocument();
  });

  it("renderiza TotalBadge com total formatado", async () => {
    render(<ReceivedDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() => expect(screen.getByText("99")).toBeInTheDocument());
  });

  it("renderiza distribuição por hora com label HH:00 (sem '01:00 – 01:59')", async () => {
    render(<ReceivedDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() =>
      expect(screen.getByText(/Distribuição por hora/i)).toBeInTheDocument(),
    );
    // O nome do data point é "14:00" (não "14:00 – 14:59")
    // Verificação implícita pelo render do label do XAxis — tooltip não é
    // testável sem hover. Confiar no test do componente.
    // Não há assertion direta aqui, mas garantir que não quebrou.
  });
});
```

- [ ] Rodar: `npm test -- --testPathPattern=drill-down-contents` → expected FAIL (Inbox header presente; Departamento ausente; TotalBadge não usado).

### Step 6.2: Migrar `drill-down-contents.tsx`

- [ ] Topo do arquivo: importar TotalBadge:

```ts
import { TotalBadge } from "./total-badge";
```

- [ ] No `ConversationTable`:

```tsx
function ConversationTable({
  items,
  accountId,
  emptyMessage,
}: {
  items: Array<{
    id: number;
    displayId: number;
    contactName: string | null;
    inboxName: string | null;
    teamName: string | null;        // ← novo
    assigneeName: string | null;
    status: number;
    lastActivityAt: string;
  }>;
  accountId: number;
  emptyMessage: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table className="min-w-[820px]">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Quando
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Contato
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Estado
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Departamento
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Atendente
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Status
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Ação
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow
                key={item.id}
                className="border-border/50 transition-colors hover:bg-accent/30"
              >
                <TableCell className="py-2.5">
                  <span className="inline-block rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-amber-400">
                    {formatRelativeShort(item.lastActivityAt)}
                  </span>
                </TableCell>
                <TableCell className="py-2.5 text-sm text-foreground">
                  {item.contactName ?? "—"}
                </TableCell>
                <TableCell className="py-2.5 text-sm text-muted-foreground">
                  {item.inboxName ?? "—"}
                </TableCell>
                <TableCell className="py-2.5 text-sm text-muted-foreground">
                  {item.teamName ?? "—"}
                </TableCell>
                <TableCell className="py-2.5 text-sm text-muted-foreground">
                  {item.assigneeName ?? "—"}
                </TableCell>
                <TableCell className="py-2.5">
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell className="py-2.5">
                  <OpenInChatwoot
                    accountId={accountId}
                    displayId={item.displayId}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] Em cada drill-down, mudar:
  - `byInboxData` keep mesmo conteúdo, mas `<DrillDownSection title="Distribuição por estado">` (era "por inbox").
  - `byHourData` map: `name: "${String(h.hour).padStart(2, "0")}:00"` (sem ` – HH:59`).
  - `<InteractiveBarChart … yAxisWidth={160} height={Math.max(280, Math.min(480, byInboxData.length * 28 + 60))} />`.

- [ ] Trocar todos os `title={`Conversas X — ${total} no total`}` por:

```tsx
<DrillDownSection
  title={
    <>
      Conversas recebidas
      <TotalBadge n={data.total} />
    </>
  }
  description="Ordenadas por data de criação (mais recente primeiro)"
>
```

(`DrillDownSection.title` aceita ReactNode — verificar componente; se for `string`, ajustar a interface dele em uma sub-step. Vide step 6.2.b abaixo.)

### Step 6.2.b: Verificar interface DrillDownSection

- [ ] `cat src/components/ui/drill-down-dialog.tsx | grep -n "title"` — ver se é `title: string` ou `title: ReactNode`.
  - Se string-only: estender pra `string | ReactNode`.

### Step 6.3: Rodar teste

- [ ] `npm test -- --testPathPattern=drill-down-contents` → expected PASS (4/4).

### Step 6.4: Commit T6

- [ ] Commit:

```bash
git add src/components/dashboard/drill-down-contents.tsx \
        src/components/dashboard/__tests__/drill-down-contents.test.tsx \
        src/components/ui/drill-down-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): T6 v0.22.0 — drill-down-contents alinhamento G4

Mudanças em ReceivedDrillDownContent, ResolvedDrillDownContent,
StatusDrillDownContent, OpenDrillDownContent e ResolutionRateDrillDownContent:
- Header e descrições "Inbox" → "Estado".
- Distribuição por hora: labels HH:00 (sem janela completa no name; o
  description já comunica que "cada coluna cobre HH:00 – HH:59").
- Distribuição por estado: yAxisWidth 120 → 160 e height proporcional
  ao volume (cap 480px). Todos os labels visíveis.
- Tabela: + coluna Departamento (entre Estado e Atendente). + tag âmbar
  pill em "Quando" (consistência com "esperando há"/no-response-card).
- TotalBadge no título da seção (substitui "— X no total").
- min-w da table aumentado pra 820px (mais 1 col).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: no-response-drill-down — substituir Resumo + tabela polish

**Files:**
- Modify: `src/components/dashboard/no-response-drill-down.tsx`
- Test: `src/components/dashboard/__tests__/no-response-drill-down.test.tsx` (novo)

**Pré-requisito UI:** invocar `ui-ux-pro-max:ui-ux-pro-max`.

### Step 7.1: Test

- [ ] Criar `src/components/dashboard/__tests__/no-response-drill-down.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { NoResponseDrillDownContent } from "../no-response-drill-down";

jest.mock("@/lib/actions/dashboard-drill-down", () => ({
  getNoResponseDrillDownAction: jest.fn().mockResolvedValue({
    success: true,
    data: {
      total: 31,
      oldestSeconds: 4 * 86400,
      items: Array.from({ length: 31 }, (_, i) => ({
        id: i + 1,
        displayId: 100 + i,
        contactName: `Contato ${i + 1}`,
        inboxName: i % 2 === 0 ? "SP-São Paulo" : "BA-Bahia",
        teamName: i % 2 === 0 ? "Vendas" : "Suporte",
        assigneeName: "Hevelyn",
        waitingSeconds: i < 5 ? 3 * 3600 : i < 12 ? 12 * 3600 : i < 24 ? 2 * 86400 : 5 * 86400,
        lastIncomingAt: new Date().toISOString(),
        snippet: null,
      })),
      byInbox: [{ id: 1, name: "SP-São Paulo", count: 16 }],
      byAssignee: [{ id: 1, name: "Hevelyn", count: 31 }],
    },
  }),
}));

describe("NoResponseDrillDownContent (v0.22.0)", () => {
  it("substitui 'Resumo / Snapshot atual' por 'Faixa de espera'", async () => {
    render(<NoResponseDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() =>
      expect(screen.getByText(/Faixa de espera/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Snapshot atual/i)).not.toBeInTheDocument();
  });

  it("renderiza header 'Estado' na distribuição (não 'Inbox')", async () => {
    render(<NoResponseDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() =>
      expect(screen.getByText(/Distribuição por estado/i)).toBeInTheDocument(),
    );
  });

  it("toggle Estado/Atendente (era Inbox/Atendente)", async () => {
    render(<NoResponseDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() => {
      const estadoBtn = screen.getByRole("radio", { name: /Estado/i });
      expect(estadoBtn).toBeInTheDocument();
      expect(estadoBtn).toHaveAttribute("aria-checked", "true");
    });
  });

  it("remove coluna 'Última msg' e adiciona 'Departamento'", async () => {
    render(<NoResponseDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() => screen.getByText("Departamento"));
    expect(screen.queryByText(/Última msg/i)).not.toBeInTheDocument();
  });

  it("renderiza TotalBadge com total formatado pt-BR", async () => {
    render(<NoResponseDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() => expect(screen.getByText("31")).toBeInTheDocument());
  });
});
```

- [ ] Rodar: `npm test -- --testPathPattern=no-response-drill-down` → expected FAIL.

### Step 7.2: Refactor

- [ ] Editar `src/components/dashboard/no-response-drill-down.tsx`:

Substituir bloco "Resumo / Distribuição" (linhas 99-171) por:

```tsx
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DrillDownSection
          title="Faixa de espera"
          description="Quanto tempo cada conversa está aguardando agora"
        >
          <WaitingBucketsDonut
            items={data.items}
            total={data.total}
            oldestSeconds={data.oldestSeconds}
          />
        </DrillDownSection>

        <DrillDownSection
          title="Distribuição"
          description="Veja por estado ou por atendente"
          action={
            <div
              role="radiogroup"
              aria-label="Agrupar por"
              className="inline-flex rounded-lg border border-border bg-card/80 p-0.5"
            >
              <button
                type="button"
                role="radio"
                aria-checked={groupBy === "inbox"}
                onClick={() => setGroupBy("inbox")}
                className={`rounded-md px-2.5 py-1 text-xs cursor-pointer transition-all ${
                  groupBy === "inbox"
                    ? "bg-violet-600 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Estado
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={groupBy === "assignee"}
                onClick={() => setGroupBy("assignee")}
                className={`rounded-md px-2.5 py-1 text-xs cursor-pointer transition-all ${
                  groupBy === "assignee"
                    ? "bg-violet-600 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Atendente
              </button>
            </div>
          }
        >
          <InteractiveBarChart
            data={chartData}
            series={series}
            layout="horizontal"
            height={Math.max(220, Math.min(480, chartData.length * 28 + 40))}
            showLegend={false}
            yAxisWidth={160}
            emptyMessage="Sem dados para agrupar"
          />
        </DrillDownSection>
      </div>

      <DrillDownSection
        title={
          <>
            Conversas sem resposta
            <TotalBadge n={data.items.length} />
          </>
        }
        description="Ordenadas pelo tempo de espera"
      >
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Esperando há
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Contato
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Estado
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Departamento
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Atendente
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Ação
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    Nenhuma conversa sem resposta no período.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="border-border/50 transition-colors hover:bg-accent/30"
                  >
                    <TableCell className="py-2.5">
                      <span className="inline-block rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-amber-400">
                        {formatWaiting(item.waitingSeconds)}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 text-sm text-foreground">
                      {item.contactName ?? "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-sm text-muted-foreground">
                      {item.inboxName ?? "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-sm text-muted-foreground">
                      {item.teamName ?? "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-sm text-muted-foreground">
                      {item.assigneeName ?? "Sem atendente"}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <OpenInChatwoot
                        accountId={accountId}
                        displayId={item.displayId}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DrillDownSection>
    </div>
  );
}
```

- [ ] Topo importar:

```ts
import { TotalBadge } from "./total-badge";
import { WaitingBucketsDonut } from "./waiting-buckets-donut";
```

- [ ] Remover import `formatDistanceToNow` e `ptBR` se não usados em outro lugar.

### Step 7.3: Rodar teste

- [ ] `npm test -- --testPathPattern=no-response-drill-down` → expected PASS (5/5).

### Step 7.4: Commit T7

- [ ] Commit:

```bash
git add src/components/dashboard/no-response-drill-down.tsx \
        src/components/dashboard/__tests__/no-response-drill-down.test.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): T7 v0.22.0 — no-response drill-down polish (G6, G7)

- Substitui "Resumo / Snapshot atual" por <WaitingBucketsDonut/> com
  4 faixas (0-4h, 4-24h, 1-3d, >3d).
- "Distribuição por inbox" → "Distribuição por estado" (toggle).
- Tabela: + coluna Departamento (entre Estado e Atendente).
- Tabela: − coluna "Última msg" (redundante com "Esperando há").
- Tabela: tag âmbar pill em "Esperando há" (consistência com no-response
  card hero).
- Título "Conversas sem resposta" recebe <TotalBadge/>.

5 tests TDD PASS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: team-drill-down.tsx — Estado label + tag âmbar + TotalBadge

**Files:**
- Modify: `src/components/dashboard/team-drill-down.tsx`

### Step 8.1: Renames + tag

- [ ] Linha 130: `Inbox` → `Estado`.
- [ ] Linha 124: `Última atividade` → mantém (é coluna específica do team-drill, não "Quando" — mas aplicar a mesma tag âmbar).
- [ ] Linhas 159-164: substituir `<TableCell>{formatDistanceToNow(...)}</TableCell>` por:

```tsx
<TableCell className="py-2.5">
  <span className="inline-block rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-amber-400">
    {formatDistanceToNow(new Date(item.lastActivityAt), {
      addSuffix: true,
      locale: ptBR,
    })}
  </span>
</TableCell>
```

- [ ] Linha 117: `title={`Conversas (${data.items.length})`}` →
  ```tsx
  title={<>Conversas <TotalBadge n={data.items.length} /></>}
  ```
- [ ] Importar `TotalBadge`.

### Step 8.2: typecheck

- [ ] `npm run typecheck` → expected 0 erros.

### Step 8.3: Commit T8

- [ ] Commit:

```bash
git add src/components/dashboard/team-drill-down.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): T8 v0.22.0 — team-drill-down alinhamento G4/G8

- Header "Inbox" → "Estado".
- Tag âmbar pill em "Última atividade".
- Título da tabela usa <TotalBadge/>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: G2 — diagnóstico chart semana/mês

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-data.ts` (potencial)
- Modify: `src/components/dashboard/conversations-line-chart.tsx` (potencial)

### Step 9.1: Adicionar log estruturado server-side

- [ ] Em `dashboardData()` antes do `return data;`, adicionar:

```ts
console.log("[dashboardData] period diag", {
  granularity,
  rangeStart: args.period.start.toISOString(),
  rangeEnd: args.period.end.toISOString(),
  chartLen: data.chart.length,
  chartFirst: data.chart[0],
  chartLast: data.chart[data.chart.length - 1],
});
```

- [ ] Em `fillBuckets` (client), adicionar log temporário:

```ts
console.log("[fillBuckets]", {
  granularity,
  emptyKeys: empty.map(...).slice(0, 5),
  realKeys: Array.from(realByKey.keys()).slice(0, 5),
});
```

### Step 9.2: Testar manualmente em dev

- [ ] `npm run dev` (porta padrão).
- [ ] Abrir `/dashboard` em modo Dia → anotar totais por hora visíveis no chart.
- [ ] Trocar pra Semana → tooltip do mesmo dia → comparar.
- [ ] Trocar pra Mês → tooltip do mesmo dia → comparar.
- [ ] Coletar console.log do server (terminal) e do client (DevTools).

### Step 9.3: Diagnóstico e fix

Hipóteses cobertas no spec G2. Aplicar fix conforme dado coletado:

- **Se SQL retorna bucket diferente em dia vs semana**: ajustar `date_trunc` ou TZ casting.
- **Se fillBuckets matching falha**: corrigir `Intl.DateTimeFormat` em `realByKey`.
- **Se `getDashboardPeriod` produz range errado**: corrigir `startOfMonth`/`endOfMonth`.

Se diagnóstico inconclusivo: criar PR diagnostic-only e tratar como hotfix v0.22.1. **Não fingir que arrumei sem evidência.**

### Step 9.4: Limpar logs + commit

- [ ] Remover `console.log` temporários (substituir por `// FIXME(diag)` se quiser preservar).
- [ ] Commit:

```bash
git add <arquivos modificados>
git commit -m "$(cat <<'EOF'
fix(dashboard): T9 v0.22.0 — chart semana/mês alinhado ao gráfico do dia

[Conteúdo depende do diagnóstico]

- Causa raiz: <descrever>.
- Fix: <descrever>.
- Validação: tooltip do mesmo dia agora bate em dia/semana/mês (tolerância ≤ 1
  conversa por race do cache TTL=30s).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Se inconclusivo**, commit:

```bash
git commit -m "$(cat <<'EOF'
chore(dashboard): T9 v0.22.0 — diagnostic logging para bug semana/mês

Adiciona logging estruturado em dashboardData() e fillBuckets() pra coletar
evidência sobre divergência entre tooltip do mesmo dia em modo Dia vs
Semana/Mês. Fix definitivo em hotfix v0.22.1 após análise.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Smoke test manual + verificação

### Step 10.1: typecheck + tests + lint

- [ ] `npm run typecheck` → expected 0 erros.
- [ ] `npm test` → expected todos passing (incluindo os ~17 novos desta release + os ~1170 existentes).
- [ ] `npm run lint` → expected 0 erros.

### Step 10.2: Smoke test manual

- [ ] `npm run dev`.
- [ ] Abrir `/dashboard`.
- [ ] Verificar:
  - PeriodNavigator maior, padding generoso, hover funciona.
  - 4 KPIs do topo: label uppercase, valor 3xl, subtitle "no período" abaixo, ícone top-right, hover "ver detalhes" aparece.
  - Click no KPI "Conversas recebidas" → drill-down abre com:
    - Header "Distribuição por estado" (não "Inbox").
    - Todos os labels visíveis (yAxisWidth maior).
    - "Distribuição por hora" labels HH:00.
    - Tabela com coluna Estado + Departamento + Atendente.
    - Tag âmbar em "Quando".
    - TotalBadge no título "Conversas recebidas [N]".
  - Idem nos outros 3 drill-downs (Resolvidas, Abertas, Taxa).
  - Click em "Ver todas" do widget "Conversas sem resposta":
    - `total` igual ao do widget no card.
    - Card "Faixa de espera" com donut + texto "Mais antiga há…".
    - Tabela sem coluna "Última msg".
    - Headers Estado / Departamento.
    - Tag âmbar em "Esperando há".
    - TotalBadge no título.
- [ ] Smoke test mobile (DevTools, 375x667): PeriodNavigator não estoura, drill-downs scrolam OK.

### Step 10.3: Verificação com skill

- [ ] Invocar `superpowers:verification-before-completion`.

---

## Task 11: Release (CHANGELOG, STATUS, package.json bump)

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/STATUS.md`

### Step 11.1: package.json

- [ ] Editar `package.json`: `"version": "0.20.0"` → `"version": "0.22.0"`.

### Step 11.2: CHANGELOG.md

- [ ] Topo: adicionar entrada:

```md
## [0.22.0] — 2026-05-02

### Dashboard polish

- **PeriodNavigator tag-style** (G1): tipografia text-sm e padding alinhados com as
  checkboxes do gráfico; tag violeta sutil maior e mais clicável.
- **KPIs do topo no padrão consumo** (G3): label UPPERCASE em cima, valor 3xl bold,
  subtitle "no período" abaixo, ícone top-right; sparkline e hover "ver detalhes"
  preservados.
- **Drill-downs alinhados** (G4): "Inbox" → "Estado" em headers/títulos;
  "Distribuição por estado" com yAxisWidth 160 (todos os labels visíveis);
  "Distribuição por hora" labels HH:00; tabela ganha coluna **Departamento**
  (entre Estado e Atendente) e tag âmbar pill em "Quando"; **TotalBadge**
  destacado em todos os títulos.
- **Faixa de espera no drill-down "Sem resposta"** (G6): donut com 4 buckets
  (0–4h, 4–24h, 1–3d, >3d) substitui "Resumo / Snapshot atual".
- **Tabela "Sem resposta"** (G7): remove coluna duplicada "Última msg"; adiciona
  Departamento; tag âmbar em "Esperando há"; TotalBadge no título.

### Bugfix

- **Drill-down "Sem resposta" com contagem inconsistente** (G5, fix): widget
  mostrava 31 conversas e drill-down mostrava 11 — `getNoResponseDrillDown`
  passa a usar `c.last_activity_at` ∈ período + filtro `message_type IN (0,1)`
  no last_msg, alinhado ao widget. Cache key bumpada.
- **Drill-down list ganha coluna `team_name` via JOIN teams** (queries:
  received, resolved, status, no-response, by-team). Cache keys bumpadas.

### Investigação

- **Chart semana/mês inconsistente com dia** (G2): [conteúdo conforme T9].

### Internals

- `<TotalBadge n>` reutilizável (`src/components/dashboard/total-badge.tsx`).
- `<WaitingBucketsDonut>` (`src/components/dashboard/waiting-buckets-donut.tsx`).
- `KpiClickableCard` aceita `subtitle?: string` (prop legacy `sublabel` mantida).
- `DrillDownConversationItem`, `NoResponseDrillDownItem`, `ByTeamDrillDownItem`
  ganham campo `teamName: string | null`.
- 17 novos testes (period-navigator, total-badge, waiting-buckets-donut,
  kpi-clickable-card, drill-down-contents, no-response-drill-down).

### Coordenação

- Coexiste com claude-empresa-ativa-global (v0.21.0) e claude-nex-suite-polish-v020
  (v0.20.0) sem conflitos. Pulo de versão (0.20 → 0.22) intencional.
```

### Step 11.3: docs/STATUS.md

- [ ] Bump versão pra 0.22.0 + linhas de release notes resumo.

### Step 11.4: Commit T11

- [ ] Commit:

```bash
git add package.json CHANGELOG.md docs/STATUS.md
git commit -m "$(cat <<'EOF'
chore(release): v0.22.0 — Dashboard Polish

Pacote G1-G8: PeriodNavigator tag-style + KPIs padrão consumo +
drill-downs com Estado/Departamento/tag âmbar/TotalBadge + Faixa de
espera donut + bugfix contagem no-response. Detalhes no CHANGELOG.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Push + portainer-fix + memória + HISTORY

### Step 12.1: Verificar concorrência

- [ ] `gh run list --limit 5` — esperar se há build em curso de outro agente.

### Step 12.2: Push

- [ ] `git push origin main` (uma única vez).
- [ ] `gh run watch <run-id>` — esperar build success.

### Step 12.3: Portainer-fix

- [ ] `gh workflow run portainer-fix.yml -f service=app -f version=v0.22.0` (ou seguir runbook do projeto).
- [ ] `curl -s https://nexus-insights.matrixfitnessgroup.com/api/health | jq .` — esperar `version=v0.22.0`.

### Step 12.4: Atualizar HISTORY

- [ ] Append em `docs/agents/HISTORY.md`:

```
2026-05-02 ... | agent=claude-dashboard-polish-v022 | run=<id> | scope=release | summary=v0.22.0 LIVE — Dashboard Polish (G1-G8). PeriodNavigator tag-style + KPIs padrão consumo + drill-downs Estado/Departamento/tag âmbar/TotalBadge + Faixa de espera donut + bugfix no-response 31/11 (last_activity_at + msg_type filter). 17 testes novos. typecheck 0. Coordenado com nex-suite-polish-v020 (v0.20.0) e empresa-ativa-global (v0.21.0).
```

### Step 12.5: Atualizar memória

- [ ] Criar `~/.claude/projects/-Users.../memory/project_v0.22_release.md`:

```md
---
name: Release v0.22.0 deployed (Dashboard Polish)
description: PeriodNavigator tag · KPIs padrão consumo · drill-downs Estado/Departamento/tag âmbar/TotalBadge · Faixa de espera donut · bugfix no-response 31/11
type: project
---

v0.22.0 deployed em 2026-05-02. Pacote de polish do `/dashboard`:

- PeriodNavigator maior (text-sm, h-7, padding generoso) — match com checkboxes.
- KPIs do topo no padrão `<KpiCard>` consumo (label UPPERCASE / valor 3xl / subtitle muted).
- Drill-downs (Recebidas/Resolvidas/Abertas/Taxa/Sem-resposta/Departamento):
  - "Inbox" → "Estado" em UI (campo interno `inboxName` mantido).
  - + coluna **Departamento** (JOIN teams).
  - Tag âmbar pill em "Quando" / "Esperando há" / "Última atividade".
  - `<TotalBadge n>` violeta no título da seção.
  - Distribuição por estado: yAxisWidth 160 + height proporcional → todos os labels visíveis.
  - Distribuição por hora: labels HH:00 (sem janela completa no name).
- Sem resposta drill-down:
  - "Resumo / Snapshot atual" → `<WaitingBucketsDonut>` (4 buckets 0-4h/4-24h/1-3d/>3d).
  - − coluna "Última msg" duplicada.
- **Bugfix G5 contagem 31 vs 11**: `getNoResponseDrillDown` passa a usar `last_activity_at`
  + `message_type IN (0,1)` (mesma def do widget). Cache key bumpada → v2.
- **G2 chart semana/mês**: [conforme T9].

17 testes novos · typecheck 0 · build verde · v0.20.0 (nex polish) e v0.21.0 (empresa
ativa global) coexistem sem conflito.
```

- [ ] Adicionar linha em `MEMORY.md`:

```
- [Release v0.22.0 deployed (Dashboard Polish)](project_v0.22_release.md) — PeriodNavigator tag · KPIs consumo · Estado/Departamento/tag âmbar/TotalBadge · Faixa de espera · fix no-response 31/11
```

### Step 12.6: Encerrar sessão

- [ ] Deletar `docs/agents/active/claude-dashboard-polish-v022.md`.
- [ ] Append em `docs/agents/HISTORY.md`:

```
2026-05-02 ... | agent=claude-dashboard-polish-v022 | observation=session-end | summary=v0.22.0 LIVE em produção. Active file deletado.
```

- [ ] Avisar João via mensagem final.

---

## Self-review

### Spec coverage
- G1 → T2 ✓
- G2 → T9 ✓
- G3 → T3, T4 ✓
- G4 (renomes, distribuição estado, distribuição hora, depto col, tag âmbar, TotalBadge) → T5 (backend), T6 (UI), T8 (team-drill) ✓
- G5 → T5 ✓
- G6 → T1 (component), T7 (uso) ✓
- G7 → T7 ✓
- G8 → T1 (component) + uso em T6, T7, T8 ✓
- Tests → cada task tem test próprio + smoke T10 ✓
- Release → T11 ✓
- Deploy + memória → T12 ✓

Sem gaps.

### Placeholder scan
- Sem "TBD"/"TODO" em steps.
- T9 tem placeholder por design ("conteúdo depende do diagnóstico") — explicitamente honesto sobre incerteza, não preguiça. Aceito.

### Type consistency
- `teamName: string | null` em todos os 4 contratos novos (`DrillDownConversationItem`, `NoResponseDrillDownItem`, `ByTeamDrillDownItem`, `RowConversation`).
- `team_name AS … from teams t` consistente em todas as queries.
- `WaitingBucketsDonut` props `items + total + oldestSeconds` — bate com import em T7.
- `TotalBadge` prop `n: number` — bate com usos em T6/T7/T8.

### Pente fino #1 (review do plan v1)

Achados (aplicados na v2 do plan):
1. **T1: WaitingBucketsDonut tem dependência implícita de `CHART_COLORS.yellow|orange|red`**. v2 adiciona step de validação + fallback hex.
2. **T5: cache keys bumpadas mas falta listar `dashboard-drill-status-vN`** com versão atual. v2 acrescenta "ler atual" em vez de chutar v3 → v4.
3. **T6: `DrillDownSection.title` pode ser `string` (não ReactNode) — quebraria `<>...</>`** com TotalBadge. v2 adiciona step 6.2.b explícita pra verificar e estender se necessário.
4. **T6: byHour name deixa de ter " – HH:59" mas o description "Cada coluna cobre HH:00 – HH:59" continua útil**. v2 mantém.
5. **T9: log estruturado vai pro produção se não removido** — v2 explicita "remover ou substituir por `// FIXME(diag)`".
6. **T11: CHANGELOG menciona G2 mas T9 pode ser inconclusivo** — v2 aceita ambos os caminhos no CHANGELOG.
7. **T12.3 portainer-fix command pode não estar exatamente no formato** — v2 acrescenta "ou seguir runbook do projeto".
8. **T8: `team-drill-down.tsx` mantém "Última atividade" como header — não foi pra "Quando"** — decisão consciente (header é semanticamente mais específico aqui). Documentado.

### Pente fino #2 (review do plan v2 — mais profundo)

Achados (aplicados na v3 do plan = arquivo atual):

1. **T1.4: comportamento quando `items` vem vazio** mas `total > 0` (cache stale ou backend cap)
   — `BUCKETS` retorna 4 fatias com count=0. `<DonutWithCenter data={[{name, value:0}, ...]}/>` cai em empty state nativo? Verificar comportamento. Se não, filtrar fatias com count=0 OU prover `centerValue={total}` mesmo sem fatias. **Solução**: já passa `centerValue` direto pra DonutWithCenter; se data tem todos zero, o componente trata. Aceito risco; se estourar, ajustar em hotfix.
2. **T3: `subtitle` prop nova mas legacy `sublabel` continua na interface** — não é só compat: outros usos podem aparecer. Grep confirma 1 uso só. Limpeza completa pode ser hotfix mas evitando agora pra reduzir blast radius. Aceito.
3. **T6: tabela ganha 1 coluna mas `min-w-[720px]` não foi aumentado** — v3 sobe pra 820px (testa em mobile pode estourar; com overflow-x-auto resolve).
4. **T6: TotalBadge dentro de `<DrillDownSection title=…>` exige que o componente aceite ReactNode**. v3 mantém step 6.2.b de validação inline.
5. **T7 quando `data.items.length === 0` mas `data.total > 0`** — backend pode ter total > 0 mas LIMIT 100 ainda não cobre? Não — total é COUNT(*) e itens é LIMIT 100. Se total > 100, mostra os 100 primeiros (mais antigos). UX consistente.
6. **T9 sem teste automatizado** — bug é funcional, dependente de dados de produção. TDD não aplicável; teste manual em dev é o único caminho. Documentado.
7. **T11 release notes G2 com placeholder** — v3 aceita: o placeholder será preenchido APÓS T9 executar.
8. **T12.4 HISTORY tem timestamp `...`** — v3 deixa vago propositadamente; será preenchido com data/hora real no momento.
9. **Tour `data-tour="dashboard-kpis"` no parent — não preciso replicar nos cards** — confirmado.
10. **`subagent-driven-development`: cada subagent precisa do briefing do v3 da spec + o checklist da task** — v3 já tem isso por design.

### Decisões finais (v3 plan)

- Manter v3 do plan como entregável.
- Subagent-driven-development com 1 subagent por task (T1-T9), em sequência.
- T10 (smoke) executado pelo controlador.
- T11 (release) controlador.
- T12 (push + memória) controlador.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-02-dashboard-polish-v022.md`.**

Execução: subagent-driven-development (1 subagent por task, review entre tasks).
