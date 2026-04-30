# Dashboard v0.13.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Cada Task é dispatched para um subagent fresh, com revisão entre tasks.

**Goal:** Resolver 9 problemas de UX/funcionais reportados no dashboard `/dashboard` (variação `pp` indevida, badge "Novo", overlay "Ver detalhes", janelas de semana/mês erradas, drill-downs incompletos, lista limitada a 20, configurabilidade ausente) e 2 melhorias incidentais (tooltip de hora, auditoria Matrix IA).

**Architecture:** Período passa a ser parametrizado por `mode` (`current`/`rolling`) + `weekStartsOn` lidos de `app_settings`. Comparações usam variação relativa (`%`) uniforme. Drill-down de status fica genérico (aceita 0|1|2|3). Lista paginada server-side. Settings novas em card próprio em `/configuracoes`.

**Tech Stack:** Next.js 16 + TypeScript + Tailwind + base-ui + Prisma 7 + PostgreSQL (read-only) + Redis cache + Jest. Stack confirmado pela spec do projeto e pelo Roteador Webhook Meta.

**Spec de referência:** `docs/superpowers/specs/2026-04-30-dashboard-v0.13.0-design.md`

---

## Estrutura de arquivos

### Novos
- `src/lib/dashboard-period.ts` — helper puro de cálculo de período + prev.
- `src/lib/dashboard-settings.ts` — server-only, lê 3 chaves + cache 60s.
- `src/lib/format/relative-time.ts` — `formatRelativeShort(date)`.
- `src/components/settings/dashboard-settings-card.tsx` — Client. Form 3 selects + save.
- `src/components/dashboard/drill-down-pagination.tsx` — Client. Paginador reusável.
- `src/lib/__tests__/dashboard-period.test.ts`
- `src/lib/__tests__/dashboard-settings.test.ts`
- `src/lib/format/__tests__/relative-time.test.ts`

### Modificados
- `src/components/dashboard/kpi-clickable-card.tsx`
- `src/components/dashboard/dashboard-filters.tsx`
- `src/components/dashboard/dashboard-content.tsx`
- `src/components/dashboard/drill-down-contents.tsx`
- `src/lib/actions/dashboard.ts`
- `src/lib/actions/dashboard-drill-down.ts`
- `src/lib/actions/settings.ts`
- `src/lib/chatwoot/queries/dashboard-data.ts`
- `src/lib/chatwoot/queries/dashboard-drill-down.ts`
- `src/app/(protected)/configuracoes/page.tsx`
- `package.json` (bump 0.12.1 → 0.13.0)
- `CHANGELOG.md`
- `docs/STATUS.md`

---

## Tarefa 1 — Helpers puros de período (`dashboard-period.ts`)

**Files:**
- Create: `src/lib/dashboard-period.ts`
- Test: `src/lib/__tests__/dashboard-period.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/dashboard-period.test.ts
import { getDashboardPeriod } from "@/lib/dashboard-period";

describe("getDashboardPeriod", () => {
  // Fixar Date.now em 2026-04-30 14:30 BRT (quinta-feira)
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-30T17:30:00Z")); // 14:30 BRT
  });
  afterAll(() => jest.useRealTimers());

  const tz = "America/Sao_Paulo";

  it("hoje: start=00:00 BRT, end=23:59:59.999 BRT do dia atual", () => {
    const { current } = getDashboardPeriod({
      period: "hoje", mode: "current", weekStartsOn: 1, tz,
    });
    // 2026-04-30 00:00 BRT = 03:00 UTC
    expect(current.start.toISOString()).toBe("2026-04-30T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-01T02:59:59.999Z");
  });

  it("hoje: prev = ontem inteiro", () => {
    const { prev } = getDashboardPeriod({
      period: "hoje", mode: "current", weekStartsOn: 1, tz,
    });
    expect(prev.start.toISOString()).toBe("2026-04-29T03:00:00.000Z");
    expect(prev.end.toISOString()).toBe("2026-04-30T02:59:59.999Z");
  });

  it("semana current weekStartsOn=1: segunda → fim do dia atual (quinta)", () => {
    const { current } = getDashboardPeriod({
      period: "semana", mode: "current", weekStartsOn: 1, tz,
    });
    // segunda 2026-04-27 00:00 BRT, fim quinta 2026-04-30 23:59 BRT
    expect(current.start.toISOString()).toBe("2026-04-27T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-01T02:59:59.999Z");
  });

  it("semana current weekStartsOn=0 (domingo)", () => {
    const { current } = getDashboardPeriod({
      period: "semana", mode: "current", weekStartsOn: 0, tz,
    });
    // domingo 2026-04-26 00:00 BRT até quinta 2026-04-30 23:59 BRT
    expect(current.start.toISOString()).toBe("2026-04-26T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-01T02:59:59.999Z");
  });

  it("semana current: prev tem mesmo tamanho da janela atual", () => {
    const { current, prev } = getDashboardPeriod({
      period: "semana", mode: "current", weekStartsOn: 1, tz,
    });
    const span = current.end.getTime() - current.start.getTime();
    const prevSpan = prev.end.getTime() - prev.start.getTime();
    expect(prevSpan).toBe(span);
    // prev termina no instante imediatamente anterior ao start atual
    expect(prev.end.getTime()).toBe(current.start.getTime() - 1);
  });

  it("semana rolling: now-7d → now", () => {
    const { current } = getDashboardPeriod({
      period: "semana", mode: "rolling", weekStartsOn: 1, tz,
    });
    const expectedStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(current.start.toISOString()).toBe(expectedStart.toISOString());
  });

  it("mes current: dia 1 → fim do dia atual", () => {
    const { current } = getDashboardPeriod({
      period: "mes", mode: "current", weekStartsOn: 1, tz,
    });
    // dia 1 abril 00:00 BRT → 30 abril 23:59 BRT
    expect(current.start.toISOString()).toBe("2026-04-01T03:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-05-01T02:59:59.999Z");
  });

  it("mes current: prev = mês passado, mesma janela de tamanho", () => {
    const { current, prev } = getDashboardPeriod({
      period: "mes", mode: "current", weekStartsOn: 1, tz,
    });
    const span = current.end.getTime() - current.start.getTime();
    const prevSpan = prev.end.getTime() - prev.start.getTime();
    expect(prevSpan).toBe(span);
  });

  it("mes rolling: now-30d → now", () => {
    const { current } = getDashboardPeriod({
      period: "mes", mode: "rolling", weekStartsOn: 1, tz,
    });
    const expectedStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(current.start.toISOString()).toBe(expectedStart.toISOString());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/lib/__tests__/dashboard-period.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/dashboard-period'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/dashboard-period.ts
//
// Helper PURO de cálculo de período do dashboard.
// Recebe (period, mode, weekStartsOn, tz) e devolve { current, prev }
// como Dates UTC. Sem dependência de DB ou Node-only — pode ser usado
// em Client e Server.
//
// Substitui o `periodRanges` duplicado em dashboard.ts e dashboard-drill-down.ts.

import {
  startOfDay,
  endOfDay,
  startOfWeek,
  startOfMonth,
  addMonths,
  addDays,
} from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export type DashboardPeriod = "hoje" | "semana" | "mes";
export type DashboardMode = "current" | "rolling";
/** 0=domingo, 1=segunda, …, 6=sábado. */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface DashboardPeriodInput {
  period: DashboardPeriod;
  mode: DashboardMode;
  weekStartsOn: WeekStartsOn;
  tz: string;
}

export interface DashboardPeriodResult {
  current: PeriodRange;
  prev: PeriodRange;
}

const ROLLING_DAYS: Record<DashboardPeriod, number> = {
  hoje: 1,
  semana: 7,
  mes: 30,
};

export function getDashboardPeriod(
  input: DashboardPeriodInput,
): DashboardPeriodResult {
  const { period, mode, weekStartsOn, tz } = input;
  const nowUtc = new Date();
  const nowInTz = toZonedTime(nowUtc, tz);

  // Calcula start no tz local, depois converte para UTC.
  let startLocal: Date;
  let endLocal: Date;

  if (period === "hoje") {
    startLocal = startOfDay(nowInTz);
    endLocal = endOfDay(nowInTz);
  } else if (mode === "rolling") {
    // Rolling: end = agora; start = end - N dias.
    const days = ROLLING_DAYS[period];
    const startUtc = new Date(nowUtc.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      current: { start: startUtc, end: nowUtc },
      prev: {
        start: new Date(startUtc.getTime() - days * 24 * 60 * 60 * 1000),
        end: new Date(startUtc.getTime() - 1),
      },
    };
  } else if (period === "semana") {
    startLocal = startOfWeek(nowInTz, { weekStartsOn });
    endLocal = endOfDay(nowInTz);
  } else {
    // period === "mes" && mode === "current"
    startLocal = startOfMonth(nowInTz);
    endLocal = endOfDay(nowInTz);
  }

  const start = fromZonedTime(startLocal, tz);
  const end = fromZonedTime(endLocal, tz);
  const spanMs = end.getTime() - start.getTime();

  // Prev = mesma janela de tamanho deslocada para trás.
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);

  return {
    current: { start, end },
    prev: { start: prevStart, end: prevEnd },
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx jest src/lib/__tests__/dashboard-period.test.ts
```
Expected: PASS — todos os 9 casos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard-period.ts src/lib/__tests__/dashboard-period.test.ts
git commit -m "feat(dashboard): helper puro de período com mode + weekStartsOn (T1)

Substitui periodRanges duplicado por um helper único que aceita
modo current/rolling e dia de início da semana configuráveis.
Inclui cálculo de janela 'prev' do mesmo tamanho.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Tarefa 2 — Settings de dashboard (`dashboard-settings.ts`)

**Files:**
- Create: `src/lib/dashboard-settings.ts`
- Test: `src/lib/__tests__/dashboard-settings.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/dashboard-settings.test.ts
import { getDashboardSettings, invalidateDashboardSettings } from "@/lib/dashboard-settings";

const mockQuery = jest.fn();
jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

describe("getDashboardSettings", () => {
  beforeEach(() => {
    invalidateDashboardSettings();
    mockQuery.mockReset();
  });

  it("retorna defaults quando nenhuma chave existe", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    const s = await getDashboardSettings();
    expect(s.weekStartsOn).toBe(1);
    expect(s.weekMode).toBe("current");
    expect(s.monthMode).toBe("current");
  });

  it("respeita valores persistidos", async () => {
    mockQuery.mockResolvedValue({
      rowCount: 3,
      rows: [
        { key: "dashboard.week_starts_on", value: "0" },
        { key: "dashboard.week_mode", value: "rolling" },
        { key: "dashboard.month_mode", value: "rolling" },
      ],
    });
    const s = await getDashboardSettings();
    expect(s.weekStartsOn).toBe(0);
    expect(s.weekMode).toBe("rolling");
    expect(s.monthMode).toBe("rolling");
  });

  it("ignora weekStartsOn fora do range 0..6", async () => {
    mockQuery.mockResolvedValue({
      rowCount: 1,
      rows: [{ key: "dashboard.week_starts_on", value: "9" }],
    });
    const s = await getDashboardSettings();
    expect(s.weekStartsOn).toBe(1); // fallback
  });

  it("cache: 2ª chamada não consulta banco", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await getDashboardSettings();
    await getDashboardSettings();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("invalidate força nova leitura", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    await getDashboardSettings();
    invalidateDashboardSettings();
    await getDashboardSettings();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

```bash
npx jest src/lib/__tests__/dashboard-settings.test.ts
```
Expected: FAIL — module não existe.

- [ ] **Step 3: Implementation**

```ts
// src/lib/dashboard-settings.ts
import "server-only";

import { pgPool } from "@/lib/pg-pool";
import type { DashboardMode, WeekStartsOn } from "@/lib/dashboard-period";

export interface DashboardSettings {
  weekStartsOn: WeekStartsOn;
  weekMode: DashboardMode;
  monthMode: DashboardMode;
}

const DEFAULTS: DashboardSettings = {
  weekStartsOn: 1,
  weekMode: "current",
  monthMode: "current",
};

const KEYS = [
  "dashboard.week_starts_on",
  "dashboard.week_mode",
  "dashboard.month_mode",
] as const;

const CACHE_TTL_MS = 60_000;
let cache: { value: DashboardSettings; expiresAt: number } | null = null;

export function invalidateDashboardSettings(): void {
  cache = null;
}

export async function getDashboardSettings(): Promise<DashboardSettings> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  let weekStartsOn: WeekStartsOn = DEFAULTS.weekStartsOn;
  let weekMode: DashboardMode = DEFAULTS.weekMode;
  let monthMode: DashboardMode = DEFAULTS.monthMode;

  try {
    const res = await pgPool.query<{ key: string; value: unknown }>(
      "SELECT key, value FROM app_settings WHERE key = ANY($1::text[])",
      [KEYS as unknown as string[]],
    );
    for (const row of res.rows ?? []) {
      const raw = typeof row.value === "string"
        ? row.value
        : row.value && typeof row.value === "object" && "value" in (row.value as Record<string, unknown>)
          ? String((row.value as Record<string, unknown>).value ?? "")
          : "";
      if (row.key === "dashboard.week_starts_on") {
        const n = parseInt(raw, 10);
        if (Number.isInteger(n) && n >= 0 && n <= 6) {
          weekStartsOn = n as WeekStartsOn;
        }
      } else if (row.key === "dashboard.week_mode") {
        if (raw === "current" || raw === "rolling") weekMode = raw;
      } else if (row.key === "dashboard.month_mode") {
        if (raw === "current" || raw === "rolling") monthMode = raw;
      }
    }
  } catch (err) {
    console.warn("[dashboard-settings] falha ao ler:", (err as Error).message);
  }

  const value: DashboardSettings = { weekStartsOn, weekMode, monthMode };
  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}
```

- [ ] **Step 4: Tests pass**

```bash
npx jest src/lib/__tests__/dashboard-settings.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard-settings.ts src/lib/__tests__/dashboard-settings.test.ts
git commit -m "feat(dashboard): settings de período (week_starts_on/week_mode/month_mode) (T2)

Lê 3 chaves de app_settings com defaults seguros e cache 60s.
invalidateDashboardSettings() expõe invalidação manual.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Tarefa 3 — formatRelativeShort

**Files:**
- Create: `src/lib/format/relative-time.ts`
- Test: `src/lib/format/__tests__/relative-time.test.ts`

- [ ] **Step 1: Tests**

> **[v2 — pente fino do plan]** Spec D5 padronizou em abreviações curtas (`min`/`h`/`d`/`m`/`a`) para evitar gramática inconsistente do plural. Testes refletem isso.

```ts
// src/lib/format/__tests__/relative-time.test.ts
import { formatRelativeShort } from "@/lib/format/relative-time";

describe("formatRelativeShort", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-30T18:00:00Z"));
  });
  afterAll(() => jest.useRealTimers());

  it("agora (< 60s)", () => {
    expect(formatRelativeShort(new Date("2026-04-30T17:59:30Z"))).toBe("agora");
  });
  it("há Xmin", () => {
    expect(formatRelativeShort(new Date("2026-04-30T17:55:00Z"))).toBe("há 5min");
  });
  it("há Xh", () => {
    expect(formatRelativeShort(new Date("2026-04-30T16:00:00Z"))).toBe("há 2h");
  });
  it("há Xd", () => {
    expect(formatRelativeShort(new Date("2026-04-27T18:00:00Z"))).toBe("há 3d");
  });
  it("há Xm (meses, abreviado)", () => {
    expect(formatRelativeShort(new Date("2026-02-28T18:00:00Z"))).toBe("há 2m");
  });
  it("há Xa (anos, abreviado)", () => {
    expect(formatRelativeShort(new Date("2024-04-30T18:00:00Z"))).toBe("há 2a");
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
npx jest src/lib/format/__tests__/relative-time.test.ts
```

- [ ] **Step 3: Implementation**

```ts
// src/lib/format/relative-time.ts
//
// Formatador relativo CURTO (sem "cerca de"). Usado nas tabelas de drill-down.

export function formatRelativeShort(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);

  if (sec < 60) return "agora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `há ${day}d`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `há ${mon}m`;
  const yr = Math.floor(mon / 12);
  return `há ${yr}a`;
}
```

- [ ] **Step 4: Tests pass**

```bash
npx jest src/lib/format/__tests__/relative-time.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/relative-time.ts src/lib/format/__tests__/relative-time.test.ts
git commit -m "feat(format): formatRelativeShort sem 'cerca de' (T3)

'há 2h' / 'há 3d' / 'há 2 mês'. Substitui formatDistanceToNow do
date-fns nas tabelas do dashboard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Tarefa 4 — KpiClickableCard sem overlap + sem fallback "Novo"

**Files:**
- Modify: `src/components/dashboard/kpi-clickable-card.tsx`

- [ ] **Step 1: Ler arquivo atual**

```bash
cat src/components/dashboard/kpi-clickable-card.tsx | head -180
```

- [ ] **Step 2: Aplicar duas mudanças no JSX**

Mudança A — remover o fallback "Novo" badge (linhas que mostram `<Badge>Novo</Badge>` quando não há trend nem badge custom). Trend é a única coisa que aparece no canto superior direito; quando ausente, espaço fica vazio.

Mudança B — mover o hint "Ver detalhes" para abaixo da linha do ícone+trend (não mais `absolute right-3 bottom-3`). Sparkline ocupa o final do card sem competição.

Substituir todo o JSX a partir da linha 91 por:

```tsx
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={prefersReducedMotion ? undefined : { scale: 1.01 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      aria-label={ariaLabel ?? `${label}: ${value}. Clique para ver detalhes.`}
      className={cn(
        "group relative flex w-full flex-col rounded-xl border border-border bg-card p-5 text-left",
        "min-h-[7rem] cursor-pointer outline-none",
        "transition-[border-color,box-shadow] duration-200",
        "hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5",
        "focus-visible:border-violet-500/40 focus-visible:ring-2 focus-visible:ring-violet-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "motion-reduce:transition-none",
        className,
      )}
    >
      {/* Linha topo: ícone + trend */}
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            iconBg,
          )}
        >
          <Icon className={cn("h-5 w-5", iconColor)} aria-hidden />
        </div>
        <div className="flex items-center gap-1 text-xs font-medium">
          {badge ? (
            <Badge
              variant="outline"
              className="border-border text-xs text-muted-foreground"
            >
              {badge}
            </Badge>
          ) : trend ? (
            <span className={cn("inline-flex items-center gap-0.5", trendClass)}>
              <TrendIcon className="h-3.5 w-3.5" aria-hidden />
              {trend.value}
            </span>
          ) : null}
        </div>
      </div>

      {/* Hint "ver detalhes" — discreto, alinhado à direita, abaixo do trend */}
      <span
        aria-hidden
        className="mt-1 self-end text-[10px] font-medium uppercase tracking-wide text-violet-400/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 inline-flex items-center gap-1"
      >
        ver detalhes
        <ArrowRight className="h-3 w-3" />
      </span>

      {/* Valor + label */}
      <div className="mt-3">
        <p className="font-heading text-2xl font-bold tabular-nums text-foreground">
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {label}
          {sublabel ? <span className="ml-1">{sublabel}</span> : null}
        </p>
      </div>

      {/* Sparkline — ocupa o final do card sem competir com texto */}
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

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```
Expected: 0 erros.

- [ ] **Step 4: Smoke visual**

Não há test unitário visual; mudança será verificada no E2E manual final. Garantir que `import { Badge }` ainda é usado (sim, quando `badge` prop é passada).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/kpi-clickable-card.tsx
git commit -m "fix(dashboard): hint 'ver detalhes' sai de cima do sparkline + remove fallback 'Novo' (T4)

Hint passa para uma 2ª linha alinhada à direita, abaixo do trend.
Quando não há trend nem badge custom, canto superior direito fica
vazio (em vez de mostrar 'Novo'). Card 'Abertas' passa a receber
trend coerente após T6 — sem fallback intermediário necessário.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Tarefa 5 — DashboardFilters: pills "Hoje | Semana | Mês"

**Files:**
- Modify: `src/components/dashboard/dashboard-filters.tsx`

- [ ] **Step 1: Substituir o array `periods`**

Trocar tipo `DashboardPeriod` (será atualizado em T6); aqui só os labels exibidos. Substituir o array hardcoded:

```tsx
const periods: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
];
```

E o comentário do JSDoc (linha ~22):

```tsx
 *  - Pills de período (Hoje / Semana / Mês).
```

- [ ] **Step 2: Atualizar import do tipo**

O tipo `DashboardPeriod` é importado de `@/lib/actions/dashboard`. Esse vai ser atualizado em T6, então deixar o import igual.

- [ ] **Step 3: Type-check (esperar erros temporários até T6)**

```bash
npm run typecheck
```
Expected: erros de mismatch entre `"7d"|"30d"|"today"` e `"hoje"|"semana"|"mes"` em vários arquivos (dashboard.ts, dashboard-content.tsx, etc). É esperado — vamos resolver em T6.

- [ ] **Step 4: NÃO commitar ainda**

Esta task fica em standby até T6 ser concluída na mesma branch. Continuar para T6.

---

## Tarefa 6 — Backend dashboard.ts + dashboard-data.ts (período + comparison.open + diffPct)

**Files:**
- Modify: `src/lib/actions/dashboard.ts`
- Modify: `src/lib/chatwoot/queries/dashboard-data.ts`

- [ ] **Step 1: Atualizar tipo + periodRanges em `actions/dashboard.ts`**

Substituir todo o conteúdo a partir da declaração do tipo:

```ts
"use server";

import { getCurrentUser } from "@/lib/auth";
import { getKnownAccounts, getAccessibleAccountIds } from "@/lib/tenant";
import {
  dashboardData,
  type DashboardData,
} from "@/lib/chatwoot/queries/dashboard-data";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import { getDashboardPeriod, type DashboardPeriod } from "@/lib/dashboard-period";
import { getDashboardSettings } from "@/lib/dashboard-settings";
import { getPlatformTz } from "@/lib/datetime";
import type { AuthUser } from "@/lib/auth-helpers";

export type { DashboardPeriod };

export interface DashboardActionResult {
  success: boolean;
  data?: DashboardData & {
    accounts: Array<{ id: number; name: string }>;
    activeAccountId: number;
  };
  error?: string;
}

export async function getDashboardData(args: {
  accountId: number;
  period: DashboardPeriod;
}): Promise<DashboardActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Não autenticado" };
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      isOwner: user.isOwner,
      mustChangePassword: user.mustChangePassword,
      avatarUrl: user.avatarUrl,
      theme: user.theme,
      accountIds: user.accountIds,
      teamIds: user.teamIds,
    };

    const accessibleIds = await getAccessibleAccountIds(authUser);
    if (!accessibleIds.includes(args.accountId)) {
      return { success: false, error: "Acesso negado a esta conta" };
    }

    const allAccounts = await getKnownAccounts();
    const accounts = allAccounts.filter((a) => accessibleIds.includes(a.id));

    const [tz, settings, excludeMatrixIA] = await Promise.all([
      getPlatformTz(),
      getDashboardSettings(),
      shouldExcludeMatrixIA(),
    ]);

    const mode =
      args.period === "semana"
        ? settings.weekMode
        : args.period === "mes"
          ? settings.monthMode
          : "current";

    const { current, prev } = getDashboardPeriod({
      period: args.period,
      mode,
      weekStartsOn: settings.weekStartsOn,
      tz,
    });

    const result = await dashboardData({
      accountId: args.accountId,
      period: current,
      prevPeriod: prev,
      excludeMatrixIA,
    });

    return {
      success: true,
      data: {
        ...result.data,
        accounts,
        activeAccountId: args.accountId,
      },
    };
  } catch (err) {
    console.error("[getDashboardData]", err);
    return { success: false, error: "Erro ao carregar dashboard" };
  }
}
```

- [ ] **Step 2: Atualizar `dashboard-data.ts` — adicionar `comparison.open` e mudar `comparison.resolutionRate` para variação relativa**

Em `src/lib/chatwoot/queries/dashboard-data.ts`:

A. Atualizar interface:

```ts
export interface DashboardComparison {
  received: number | null;
  resolved: number | null;
  open: number | null;
  resolutionRate: number | null; // variação relativa em % (era pp)
}
```

B. Bump cache key:

```ts
const key = cacheKey({
  scope: "report",
  name: "dashboard-data-v3",
  ...
});
```

C. Adicionar SQL e Promise.all do `openPrev`:

Encontrar a query `sqlOpen` (linhas ~248-256) e logo abaixo dela adicionar `sqlOpenPrev = sqlOpen` (mesma SQL, params do prev).

Encontrar o `Promise.all` (linha ~457) e adicionar uma 14ª query:

```ts
pool.query<RowCount>(sqlOpen, prevPeriodParams), // openPrev
```

(Renomear destructure para incluir `openPrevRes`.)

D. Calcular comparison:

Localizar o trecho que monta `comparison` (linha ~495) e substituir por:

```ts
const openPrev = Number(openPrevRes.rows[0]?.total ?? 0);

const comparison: DashboardComparison = {
  received: pctDiff(received, receivedPrev),
  resolved: pctDiff(resolved, resolvedPrev),
  open: pctDiff(open, openPrev),
  resolutionRate:
    resolutionRate !== null && resolutionRatePrev !== null
      ? pctDiff(resolutionRate, resolutionRatePrev)
      : null,
};
```

- [ ] **Step 3: Atualizar componente `dashboard-content.tsx`**

Em `src/components/dashboard/dashboard-content.tsx`, adicionar `trend` no card "Abertas":

Encontrar o `<KpiClickableCard ... label="Abertas" ...>` (linha ~379) e adicionar:

```tsx
trend={trendFor(stats.comparison.open, "%")}
miniChart={
  <Sparkline
    data={chartPoints ? chartPoints.map((p) => p.received - p.resolved) : []}
    color={CHART_COLORS.amber}
    ariaLabel="Tendência de abertas no período"
  />
}
```

E mudar a chamada do card "Taxa de resolução" — sufixo `"pp"` → `"%"`:

```tsx
trend={trendFor(stats.comparison.resolutionRate, "%")}
```

- [ ] **Step 4: Atualizar testes existentes do dashboard**

```bash
grep -rn '"7d"\|"30d"\|"today"' src/lib src/components 2>/dev/null
grep -rn 'periodRanges\|comparison.resolutionRate' src/lib/chatwoot/queries/__tests__/ 2>/dev/null
```

Se houver tests existentes que esperam `resolutionRate - resolutionRatePrev` (pp), atualizar para `pctDiff(...)`.

- [ ] **Step 5: Type-check**

```bash
npm run typecheck
```
Expected: 0 erros.

- [ ] **Step 6: Rodar tests do dashboard**

```bash
npx jest --testPathPattern='dashboard'
```
Expected: PASS.

- [ ] **Step 7: Commit (junto da T5)**

```bash
git add src/lib/actions/dashboard.ts src/lib/chatwoot/queries/dashboard-data.ts src/components/dashboard/dashboard-filters.tsx src/components/dashboard/dashboard-content.tsx
git commit -m "feat(dashboard): período baseado em settings + comparison.open + variação relativa para taxa (T5+T6)

- DashboardPeriod = 'hoje'|'semana'|'mes'; pills renomeadas.
- periodRanges duplicado substituído por getDashboardPeriod
  (lê week_starts_on / week_mode / month_mode de app_settings).
- comparison.open computado como pctDiff (mesma coorte do prev).
- comparison.resolutionRate vira variação relativa em % (era pp).
- Card 'Abertas' agora mostra trend; card 'Taxa de resolução' mostra %.
- Cache key bump dashboard-data-v3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Tarefa 7 — Backend drill-downs (status genérico + paginação received/resolved + diffPct)

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-drill-down.ts`
- Modify: `src/lib/actions/dashboard-drill-down.ts`
- Modify: `src/components/dashboard/drill-down-contents.tsx`

- [ ] **Step 1: dashboard-drill-down.ts (queries)**

A. Renomear `getOpenDrillDown` para `getStatusDrillDown` e parametrizar status:

```ts
export interface StatusDrillDownInput extends DrillDownPeriodInput {
  status: 0 | 1 | 2 | 3;
}

export interface StatusDrillDownData {
  status: 0 | 1 | 2 | 3;
  total: number;
  byInbox: DrillDownByInbox[];
  items: DrillDownConversationItem[];
  page: number;
  pageSize: number;
}

export async function getStatusDrillDown(args: StatusDrillDownInput & {
  page?: number;
  pageSize?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const excludeMatrixIA = args.excludeMatrixIA !== false;
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.max(10, Math.min(100, args.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const filtersForHash = {
    period: { start: args.period.start.toISOString(), end: args.period.end.toISOString() },
    status: args.status,
    page,
    pageSize,
    excludeMatrixIA,
  };
  const key = cacheKey({
    scope: "report",
    name: "dashboard-drill-status-v3",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<StatusDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<StatusDrillDownData>(
        async () => {
          const pool = getChatwootPool();
          const matrixClause = excludeMatrixIA ? " AND c.inbox_id <> 31" : "";

          const sqlTotal = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.created_at >= $2 AND c.created_at < $3
              AND c.status = $4
              ${matrixClause}
          `;
          const sqlByInbox = `
            SELECT i.id, i.name, COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN inboxes i ON i.id = c.inbox_id
            WHERE c.account_id = $1
              AND c.created_at >= $2 AND c.created_at < $3
              AND c.status = $4
              ${matrixClause}
            GROUP BY i.id, i.name
            ORDER BY total DESC
            LIMIT 10
          `;
          // Para status=0 ordenar por last_activity ASC (mais antiga primeiro = priorizar);
          // demais ordenar por last_activity DESC (mais recente primeiro).
          const orderClause =
            args.status === 0
              ? "ORDER BY c.last_activity_at ASC NULLS LAST"
              : "ORDER BY c.last_activity_at DESC NULLS LAST";
          const sqlList = `
            SELECT
              c.id, c.display_id,
              ct.name AS contact_name,
              i.name AS inbox_name,
              u.name AS assignee_name,
              c.status,
              c.last_activity_at
            FROM conversations c
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes i ON i.id = c.inbox_id
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE c.account_id = $1
              AND c.created_at >= $2 AND c.created_at < $3
              AND c.status = $4
              ${matrixClause}
            ${orderClause}
            LIMIT $5 OFFSET $6
          `;

          const baseParams = [args.accountId, args.period.start, args.period.end, args.status];
          const listParams = [...baseParams, pageSize, offset];

          const [totalRes, byInboxRes, listRes] = await Promise.all([
            pool.query<RowCount>(sqlTotal, baseParams),
            pool.query<RowInbox>(sqlByInbox, baseParams),
            pool.query<RowConversation>(sqlList, listParams),
          ]);

          return {
            status: args.status,
            total: Number(totalRes.rows[0]?.total ?? 0),
            byInbox: byInboxRes.rows.filter((r) => r.name).map((r) => ({
              id: r.id,
              name: r.name ?? "(sem nome)",
              count: Number(r.total ?? 0),
            })),
            items: listRes.rows.map((r) => ({
              id: r.id,
              displayId: r.display_id,
              contactName: r.contact_name,
              inboxName: r.inbox_name,
              assigneeName: r.assignee_name,
              status: r.status,
              lastActivityAt: new Date(r.last_activity_at).toISOString(),
            })),
            page,
            pageSize,
          };
        },
        { fallbackKey: key },
      ),
  });
}

// Wrapper de compat para callers existentes que esperavam `getOpenDrillDown`.
export const getOpenDrillDown = (args: DrillDownPeriodInput & { page?: number; pageSize?: number }) =>
  getStatusDrillDown({ ...args, status: 0 });

export type OpenDrillDownData = StatusDrillDownData;
```

(Remover a interface antiga `OpenDrillDownData` se existir no topo do arquivo, e remover a função antiga `getOpenDrillDown`.)

B. Adicionar paginação em `getReceivedDrillDown` e `getResolvedDrillDown`. Substituir `LIMIT 20` por `LIMIT $5 OFFSET $6` no SQL `sqlRecent`, aceitar `page`/`pageSize` no input, retornar `{ items, page, pageSize, total }`. Trocar `recent` por `items` na interface (manter `recent` como alias por compat).

```ts
// Adicionar a ReceivedDrillDownData e ResolvedDrillDownData:
export interface ReceivedDrillDownData {
  total: number;
  granularity: "hour" | "day";
  chart: DrillDownChartPoint[];
  byInbox: DrillDownByInbox[];
  byHour: DrillDownByHour[];
  items: DrillDownConversationItem[];
  page: number;
  pageSize: number;
  /** @deprecated Use items. Mantido por compat para uma versão. */
  recent: DrillDownConversationItem[];
}
```

(Idem ResolvedDrillDownData.)

E nas funções `getReceivedDrillDown` e `getResolvedDrillDown`:

```ts
// Adicionar no topo:
const page = Math.max(1, args.page ?? 1);
const pageSize = Math.max(10, Math.min(100, args.pageSize ?? 50));
const offset = (page - 1) * pageSize;

// Bump cache key:
name: "dashboard-drill-received-v2",
// (e "dashboard-drill-resolved-v2")

// Hash inclui page/pageSize:
const filtersForHash = {
  period: { ... },
  page,
  pageSize,
  excludeMatrixIA,
  tz,
};

// SQL: trocar 'ORDER BY ... LIMIT 20' por 'ORDER BY ... LIMIT $5 OFFSET $6'.
// Para 'received': ORDER BY c.created_at DESC.
// Para 'resolved': manter 'ORDER BY c.last_activity_at DESC'.

// Params:
const recentParams = [args.accountId, args.period.start, args.period.end, pageSize, offset];

// Retorno:
return {
  total: Number(totalRes.rows[0]?.total ?? 0),
  granularity,
  chart: chartRes.rows.map(...),
  byInbox: byInboxRes.rows.filter(...).map(...),
  byHour: byHourRes.rows.map(...),
  items: recentRes.rows.map(...),
  page,
  pageSize,
  recent: recentRes.rows.map(...), // alias
};
```

C. Em `getResolutionRateDrillDown`, renomear `diffPp` → `diffPct` e mudar fórmula:

```ts
// Substituir:
// const diffPp = current !== null && previous !== null ? current - previous : null;
// Por:
const diffPct =
  current !== null && previous !== null
    ? previous === 0
      ? current === 0 ? 0 : null
      : ((current - previous) / previous) * 100
    : null;

// Manter `diffPp` no payload por uma versão (compat):
const diffPp = current !== null && previous !== null ? current - previous : null;

return {
  current,
  previous,
  diffPp,   // @deprecated — remove em v0.14.0
  diffPct,  // novo: variação relativa em %
  history: ...,
  topAgents: ...,
};
```

E na interface `ResolutionRateDrillDownData`:

```ts
export interface ResolutionRateDrillDownData {
  current: number | null;
  previous: number | null;
  /** @deprecated use diffPct (variação relativa em %). */
  diffPp: number | null;
  diffPct: number | null;
  history: DrillDownHistoricalRatePoint[];
  topAgents: DrillDownAgentRate[];
}
```

E bump cache key: `dashboard-drill-resolution-v2`.

- [ ] **Step 2: actions/dashboard-drill-down.ts**

Atualizar para usar `getDashboardPeriod`:

```ts
"use server";

import { getCurrentUser } from "@/lib/auth";
import { getAccessibleAccountIds } from "@/lib/tenant";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import { getDashboardPeriod, type DashboardPeriod } from "@/lib/dashboard-period";
import { getDashboardSettings } from "@/lib/dashboard-settings";
import { getPlatformTz } from "@/lib/datetime";
import type { AuthUser } from "@/lib/auth-helpers";
import {
  getStatusDrillDown,
  getReceivedDrillDown,
  getResolvedDrillDown,
  getResolutionRateDrillDown,
  getNoResponseDrillDown,
  getByTeamDrillDown,
  type StatusDrillDownData,
  type ReceivedDrillDownData,
  type ResolutionRateDrillDownData,
  type ResolvedDrillDownData,
  type NoResponseDrillDownData,
  type ByTeamDrillDownData,
} from "@/lib/chatwoot/queries/dashboard-drill-down";

export type { DashboardPeriod };

export interface DrillDownActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function authorize(accountId: number) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const authUser: AuthUser = {
    id: user.id, email: user.email, name: user.name,
    platformRole: user.platformRole, isOwner: user.isOwner,
    mustChangePassword: user.mustChangePassword, avatarUrl: user.avatarUrl,
    theme: user.theme, accountIds: user.accountIds, teamIds: user.teamIds,
  };
  const accessibleIds = await getAccessibleAccountIds(authUser);
  if (!accessibleIds.includes(accountId)) {
    return { ok: false as const, error: "Acesso negado a esta conta" };
  }
  const [excludeMatrixIA, tz, settings] = await Promise.all([
    shouldExcludeMatrixIA(),
    getPlatformTz(),
    getDashboardSettings(),
  ]);
  return { ok: true as const, excludeMatrixIA, tz, settings };
}

function rangeForPeriod(period: DashboardPeriod, settings: { weekMode: "current"|"rolling"; monthMode: "current"|"rolling"; weekStartsOn: 0|1|2|3|4|5|6 }, tz: string) {
  const mode = period === "semana" ? settings.weekMode : period === "mes" ? settings.monthMode : "current";
  return getDashboardPeriod({
    period,
    mode,
    weekStartsOn: settings.weekStartsOn,
    tz,
  });
}

export async function getReceivedDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
  page?: number;
  pageSize?: number;
}): Promise<DrillDownActionResult<ReceivedDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = rangeForPeriod(args.period, auth.settings, auth.tz);
    const result = await getReceivedDrillDown({
      accountId: args.accountId,
      period: current,
      excludeMatrixIA: auth.excludeMatrixIA,
      page: args.page,
      pageSize: args.pageSize,
    });
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[getReceivedDrillDownAction]", err);
    return { success: false, error: "Erro ao carregar drill-down" };
  }
}

export async function getResolvedDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
  page?: number;
  pageSize?: number;
}): Promise<DrillDownActionResult<ResolvedDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = rangeForPeriod(args.period, auth.settings, auth.tz);
    const result = await getResolvedDrillDown({
      accountId: args.accountId,
      period: current,
      excludeMatrixIA: auth.excludeMatrixIA,
      page: args.page,
      pageSize: args.pageSize,
    });
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[getResolvedDrillDownAction]", err);
    return { success: false, error: "Erro ao carregar drill-down" };
  }
}

export async function getStatusDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
  status: 0 | 1 | 2 | 3;
  page?: number;
  pageSize?: number;
}): Promise<DrillDownActionResult<StatusDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = rangeForPeriod(args.period, auth.settings, auth.tz);
    const result = await getStatusDrillDown({
      accountId: args.accountId,
      period: current,
      excludeMatrixIA: auth.excludeMatrixIA,
      status: args.status,
      page: args.page,
      pageSize: args.pageSize,
    });
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[getStatusDrillDownAction]", err);
    return { success: false, error: "Erro ao carregar drill-down" };
  }
}

// Wrapper compat para callers antigos:
export const getOpenDrillDownAction = (args: {
  accountId: number;
  period: DashboardPeriod;
}) => getStatusDrillDownAction({ ...args, status: 0 });

export async function getNoResponseDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
}): Promise<DrillDownActionResult<NoResponseDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = rangeForPeriod(args.period, auth.settings, auth.tz);
    const result = await getNoResponseDrillDown({
      accountId: args.accountId,
      period: current,
      excludeMatrixIA: auth.excludeMatrixIA,
    });
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[getNoResponseDrillDownAction]", err);
    return { success: false, error: "Erro ao carregar drill-down" };
  }
}

export async function getByTeamDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
  teamId: number | null;
}): Promise<DrillDownActionResult<ByTeamDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current } = rangeForPeriod(args.period, auth.settings, auth.tz);
    const result = await getByTeamDrillDown({
      accountId: args.accountId,
      period: current,
      teamId: args.teamId,
      excludeMatrixIA: auth.excludeMatrixIA,
    });
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[getByTeamDrillDownAction]", err);
    return { success: false, error: "Erro ao carregar drill-down" };
  }
}

export async function getResolutionRateDrillDownAction(args: {
  accountId: number;
  period: DashboardPeriod;
}): Promise<DrillDownActionResult<ResolutionRateDrillDownData>> {
  try {
    const auth = await authorize(args.accountId);
    if (!auth.ok) return { success: false, error: auth.error };
    const { current, prev } = rangeForPeriod(args.period, auth.settings, auth.tz);
    const result = await getResolutionRateDrillDown({
      accountId: args.accountId,
      period: current,
      prevPeriod: prev,
      excludeMatrixIA: auth.excludeMatrixIA,
    });
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[getResolutionRateDrillDownAction]", err);
    return { success: false, error: "Erro ao carregar drill-down" };
  }
}
```

- [ ] **Step 3: typecheck e tests**

```bash
npm run typecheck
npx jest --testPathPattern='dashboard'
```
Resolver erros antes de commitar.

- [ ] **Step 4: Commit**

```bash
git add src/lib/chatwoot/queries/dashboard-drill-down.ts src/lib/actions/dashboard-drill-down.ts
git commit -m "feat(dashboard): drill-down de status genérico + paginação received/resolved + diffPct (T7)

- getOpenDrillDown vira getStatusDrillDown (parametriza status=0|1|2|3).
- getReceivedDrillDown e getResolvedDrillDown ganham page/pageSize
  (default 50/pg) e retornam { items, page, pageSize, total }.
  'recent' alias mantido.
- getResolutionRateDrillDown adiciona diffPct (variação relativa em %)
  e mantém diffPp por uma versão (deprecated).
- Actions usam getDashboardPeriod + getDashboardSettings (sem
  duplicação de periodRanges).
- Cache keys bumped (dashboard-drill-status-v3, drill-received-v2, etc).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Tarefa 8 — Frontend drill-down (paginação, status genérico, formatRelativeShort, tooltip de hora)

**Files:**
- Create: `src/components/dashboard/drill-down-pagination.tsx`
- Modify: `src/components/dashboard/drill-down-contents.tsx`
- Modify: `src/components/dashboard/dashboard-content.tsx`

- [ ] **Step 1: Componente DrillDownPagination**

```tsx
// src/components/dashboard/drill-down-pagination.tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DrillDownPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onChange: (page: number) => void;
}

export function DrillDownPagination({
  page,
  pageSize,
  total,
  loading = false,
  onChange,
}: DrillDownPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-2 px-1 pt-3 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {from.toLocaleString("pt-BR")} – {to.toLocaleString("pt-BR")} de{" "}
        <span className="text-foreground font-medium">
          {total.toLocaleString("pt-BR")}
        </span>
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2"
          disabled={loading || page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2"
          disabled={loading || page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Atualizar `drill-down-contents.tsx`**

A. Trocar import:

```tsx
// Remover:
// import { formatDistanceToNow } from "date-fns";
// import { ptBR } from "date-fns/locale";

// Adicionar:
import { formatRelativeShort } from "@/lib/format/relative-time";
import { DrillDownPagination } from "./drill-down-pagination";
```

B. `ConversationTable`: trocar `formatDistanceToNow(new Date(item.lastActivityAt), {...})` por `formatRelativeShort(item.lastActivityAt)`. Aceitar `useCreatedAt?: boolean` se o caller quer formatar `created_at` em vez de `last_activity_at` (não aplicável agora — só passamos `lastActivityAt`).

C. `ReceivedDrillDownContent` e `ResolvedDrillDownContent`: adicionar estado de página local; refetch quando página muda; mostrar paginador no rodapé.

```tsx
export function ReceivedDrillDownContent({
  accountId,
  period,
  enabled,
}: DrillDownProps) {
  const [data, setData] = useState<ReceivedDrillDownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1); // resetar quando o period muda
  }, [period]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      const res = await getReceivedDrillDownAction({
        accountId,
        period,
        page,
        pageSize: 50,
      });
      if (cancelled) return;
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error ?? "Erro desconhecido");
      }
      setLoading(false);
    }
    void run();
    return () => { cancelled = true; };
  }, [accountId, period, enabled, page]);

  if (loading && !data) return <DrillDownSkeleton />;
  if (error && !data) return <ErrorState message={error} />;
  if (!data) return null;

  /* ... mesma renderização dos charts ... */

  return (
    <div className="space-y-5">
      {/* charts */}

      <DrillDownSection
        title={`Conversas recebidas — ${data.total.toLocaleString("pt-BR")} no total`}
        description="Ordenadas por data de criação (mais recente primeiro)"
      >
        <ConversationTable
          items={data.items ?? data.recent}
          accountId={accountId}
          emptyMessage="Nenhuma conversa recebida no período"
        />
        <DrillDownPagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          loading={loading}
          onChange={setPage}
        />
      </DrillDownSection>
    </div>
  );
}
```

(idem `ResolvedDrillDownContent`.)

D. Renomear `OpenDrillDownContent` → `StatusDrillDownContent` e parametrizar status:

```tsx
const STATUS_LABEL: Record<0|1|2|3, string> = {
  0: "Aberto",
  1: "Resolvido",
  2: "Pendente",
  3: "Adiado",
};

export function StatusDrillDownContent({
  accountId,
  period,
  status,
  enabled,
}: DrillDownProps & { status: 0 | 1 | 2 | 3 }) {
  const [data, setData] = useState<StatusDrillDownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [period, status]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      const res = await getStatusDrillDownAction({
        accountId, period, status, page, pageSize: 50,
      });
      if (cancelled) return;
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error ?? "Erro desconhecido");
      }
      setLoading(false);
    }
    void run();
    return () => { cancelled = true; };
  }, [accountId, period, status, enabled, page]);

  if (loading && !data) return <DrillDownSkeleton />;
  if (error && !data) return <ErrorState message={error} />;
  if (!data) return null;

  const byInboxData = data.byInbox.map((i) => ({ name: i.name, Conversas: i.count }));
  const label = STATUS_LABEL[status];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DrillDownSection title={`Total de conversas com status "${label}"`} description={`Coorte: criadas no período + status=${label.toLowerCase()}`}>
          <div className="flex h-[280px] flex-col items-center justify-center rounded-lg border border-border bg-background/40">
            <p className="font-heading text-5xl font-bold tabular-nums text-foreground">
              {data.total.toLocaleString("pt-BR")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{label}</p>
          </div>
        </DrillDownSection>
        <DrillDownSection title="Top inboxes" description="10 inboxes com mais conversas neste status">
          <InteractiveBarChart
            data={byInboxData}
            series={[{ key: "Conversas", label: "Conversas", color: CHART_COLORS.violet }]}
            layout="horizontal"
            height={280}
            showLegend={false}
            yAxisWidth={120}
            emptyMessage="Sem inboxes com conversas neste status"
          />
        </DrillDownSection>
      </div>

      <DrillDownSection title={`Conversas em "${label}" (${data.total.toLocaleString("pt-BR")} no total)`} description="Ordenadas por última atividade">
        <ConversationTable
          items={data.items}
          accountId={accountId}
          emptyMessage={`Nenhuma conversa "${label.toLowerCase()}" no período`}
        />
        <DrillDownPagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          loading={loading}
          onChange={setPage}
        />
      </DrillDownSection>
    </div>
  );
}

// Wrapper compat para chamadas antigas (KPI "Abertas (no período)"):
export const OpenDrillDownContent = (props: DrillDownProps) => (
  <StatusDrillDownContent {...props} status={0} />
);
```

E. `ResolutionRateDrillDownContent`: subtitle muda `pp` → `%`:

```tsx
const diffLabel =
  data.diffPct !== null
    ? `${data.diffPct > 0 ? "+" : ""}${data.diffPct.toFixed(1)}%`
    : "—";
```

(usar `diffPct` em vez de `diffPp`.)

F. Tooltip do `byHour`: passar prop `formatTooltipLabel` se existir, ou ajustar `name` do dado para `"14:00 – 14:59"`:

```tsx
const byHourData = data.byHour.map((h) => ({
  name: `${String(h.hour).padStart(2, "0")}:00 – ${String(h.hour).padStart(2, "0")}:59`,
  Conversas: h.count,
}));
```

Mas isso polui o eixo X. Solução: manter eixo X curto (`14h`) e colocar a janela completa só no tooltip. Se `InteractiveAreaChart` aceita um `tooltipFormatter` separado, passar ali; caso contrário, transformar `name` no curto e enriquecer o tooltip via prop.

Decisão pragmática: ajustar o `name` para `14h (14:00–14:59)` e deixar o eixo X com fontsize ainda menor para caber. Senão verificar `InteractiveAreaChart` e adicionar suporte.

```tsx
const byHourData = data.byHour.map((h) => ({
  name: `${String(h.hour).padStart(2, "0")}h`,
  hourFull: `${String(h.hour).padStart(2, "0")}:00 – ${String(h.hour).padStart(2, "0")}:59`,
  Conversas: h.count,
}));
```

Se `InteractiveAreaChart` suporta tooltip customizado por dado, usar `hourFull`; senão, deixar como está e aceitar que a clarificação fica no `aria-label` do gráfico.

Na renderização adicionar: `aria-label="Distribuição por hora cheia (HH:00 a HH:59)"` no container do gráfico.

- [ ] **Step 3: Atualizar `dashboard-content.tsx`**

Trocar `OpenDrillDownContent` para `StatusDrillDownContent` no drill-down de status pie:

```tsx
// Antes (em StatusDistributionCard drill-down):
{statusDrill && statusDrill.status === 0 ? (
  <OpenDrillDownContent ... />
) : statusDrill ? (
  <div>... será adicionado em uma versão futura ...</div>
) : null}

// Depois:
{statusDrill ? (
  <StatusDrillDownContent
    accountId={accountId}
    period={period}
    status={statusDrill.status}
    enabled={statusDrill !== null}
  />
) : null}
```

E no drill-down do KPI "Abertas no período":

```tsx
<OpenDrillDownContent  /* mantido — wrapper de compat */
  accountId={accountId}
  period={period}
  enabled={drillDown === "open"}
/>
```

(`OpenDrillDownContent` agora é o wrapper de `StatusDrillDownContent` com `status=0`.)

E no drill-down de inbox:

```tsx
{inboxDrill ? (
  <StatusDrillDownContent
    accountId={accountId}
    period={period}
    status={0}
    enabled={inboxDrill !== null}
  />
) : null}
```

- [ ] **Step 4: typecheck e tests**

```bash
npm run typecheck
npx jest --testPathPattern='dashboard'
```

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/drill-down-pagination.tsx src/components/dashboard/drill-down-contents.tsx src/components/dashboard/dashboard-content.tsx
git commit -m "feat(dashboard): drill-downs paginados + status genérico + tempo curto + tooltip de hora (T8)

- DrillDownPagination novo (50/pg, server-side).
- ReceivedDrillDownContent e ResolvedDrillDownContent ganham
  paginador no rodapé; texto da seção mostra total real.
- StatusDrillDownContent substitui OpenDrillDownContent
  parametrizado por status (cobre Aberto/Resolvido/Pendente/Adiado).
  OpenDrillDownContent vira wrapper compat (status=0).
- formatRelativeShort substitui 'há cerca de X horas' por 'há Xh'.
- Tooltip do gráfico por hora deixa explícito o intervalo HH:00–HH:59
  via aria-label.
- ResolutionRate subtitle migra de pp para %.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Tarefa 9 — Settings UI (DashboardSettingsCard) + saveDashboardSettings action

**Files:**
- Create: `src/components/settings/dashboard-settings-card.tsx`
- Modify: `src/lib/actions/settings.ts`
- Modify: `src/app/(protected)/configuracoes/page.tsx`

> **[v2 — pente fino do plan]** Duas correções vs. versão original:
> 1. `audit.action` **deve** usar enum existente do Prisma (`setting_updated`) com `details.section: "dashboard"` — `"dashboard.settings.update"` não compila porque o enum é tipo PostgreSQL gerado pelo Prisma.
> 2. **Não tocar** `getAllSettings`. Ler `getDashboardSettings()` direto no SSR da page e passar como `initial` ao card. Mantém superfície da função estável.

- [ ] **Step 1: Server Action `saveDashboardSettings`**

Em `src/lib/actions/settings.ts`, adicionar:

```ts
export async function saveDashboardSettings(args: {
  weekStartsOn: number;
  weekMode: "current" | "rolling";
  monthMode: "current" | "rolling";
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user || user.platformRole !== "super_admin") {
      return { success: false, error: "Acesso negado" };
    }
    const ws = Number.isInteger(args.weekStartsOn) && args.weekStartsOn >= 0 && args.weekStartsOn <= 6
      ? args.weekStartsOn
      : 1;
    const wm = args.weekMode === "rolling" ? "rolling" : "current";
    const mm = args.monthMode === "rolling" ? "rolling" : "current";

    await pgPool.query(
      `INSERT INTO app_settings (key, value) VALUES
         ('dashboard.week_starts_on', $1::text),
         ('dashboard.week_mode', $2),
         ('dashboard.month_mode', $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [String(ws), wm, mm],
    );

    invalidateDashboardSettings();
    await logAudit({
      userId: user.id,
      action: "setting_updated", // enum Prisma — usar valor existente
      details: {
        section: "dashboard",
        weekStartsOn: ws,
        weekMode: wm,
        monthMode: mm,
      },
    });
    revalidatePath("/dashboard");
    revalidatePath("/configuracoes");
    return { success: true };
  } catch (err) {
    console.error("[saveDashboardSettings]", err);
    return { success: false, error: "Erro ao salvar configurações" };
  }
}
```

(Imports: `getCurrentUser`, `pgPool`, `invalidateDashboardSettings`, `logAudit`, `revalidatePath`. Usar imports existentes no arquivo.)

**NÃO modificar `getAllSettings`** — leitura inicial das chaves vai via `getDashboardSettings()` direto na page server component (Step 3).

- [ ] **Step 2: Componente DashboardSettingsCard**

```tsx
// src/components/settings/dashboard-settings-card.tsx
"use client";

import { useState, useTransition } from "react";
import { Calendar, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveDashboardSettings } from "@/lib/actions/settings";
import { toast } from "sonner";

interface Props {
  initial: {
    weekStartsOn: number;
    weekMode: "current" | "rolling";
    monthMode: "current" | "rolling";
  };
}

const WEEK_DAYS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
];

export function DashboardSettingsCard({ initial }: Props) {
  const [weekStartsOn, setWeekStartsOn] = useState(String(initial.weekStartsOn));
  const [weekMode, setWeekMode] = useState(initial.weekMode);
  const [monthMode, setMonthMode] = useState(initial.monthMode);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const res = await saveDashboardSettings({
        weekStartsOn: parseInt(weekStartsOn, 10),
        weekMode,
        monthMode,
      });
      if (res.success) toast.success("Configurações do dashboard salvas");
      else toast.error(res.error ?? "Falha ao salvar");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4 text-violet-400" />
          Configurações do Dashboard
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Define como o filtro de Semana e Mês é calculado no dashboard.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Início da semana</Label>
          <Select value={weekStartsOn} onValueChange={setWeekStartsOn}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WEEK_DAYS.map((d) => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Modo da semana</Label>
          <Select value={weekMode} onValueChange={(v) => setWeekMode(v as "current" | "rolling")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Semana atual (do dia configurado até hoje)</SelectItem>
              <SelectItem value="rolling">Últimos 7 dias (rolling)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Modo do mês</Label>
          <Select value={monthMode} onValueChange={(v) => setMonthMode(v as "current" | "rolling")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Mês atual (do dia 1 até hoje)</SelectItem>
              <SelectItem value="rolling">Últimos 30 dias (rolling)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Integrar na page de configurações**

Em `src/app/(protected)/configuracoes/page.tsx`:

1. Importar:
```tsx
import { DashboardSettingsCard } from "@/components/settings/dashboard-settings-card";
import { getDashboardSettings } from "@/lib/dashboard-settings";
```

2. Adicionar `getDashboardSettings()` no `Promise.all` que carrega settings (entre os outros já existentes), e desestruturar:
```tsx
const [
  ...,
  dashboardSettings,
] = await Promise.all([
  ...,
  getDashboardSettings(),
]);
```

3. Renderizar o card próximo aos outros (antes de `MatrixIAToggleCard` ou após `EnabledReportsCard`):

```tsx
<DashboardSettingsCard initial={dashboardSettings} />
```

**Nota:** isso adiciona a leitura ao SSR sem mexer em `getAllSettings`. As 3 chaves novas (`dashboard.*`) ficam isoladas em seu próprio helper.

- [ ] **Step 4: typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/dashboard-settings-card.tsx src/lib/actions/settings.ts src/app/\(protected\)/configuracoes/page.tsx
git commit -m "feat(settings): card 'Configurações do Dashboard' com 3 selects (T9)

- DashboardSettingsCard: início da semana + modo semana + modo mês.
- saveDashboardSettings server action (super_admin only) com audit log.
- Defaults: segunda-feira / current / current.
- Mudanças invalidam cache de getDashboardSettings e revalidatePath.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Tarefa 10 — Polish, testes finais e auditoria Matrix IA

**Files:**
- Various.

- [ ] **Step 1: Auditoria final (checklist §14.4 da spec)**

> **[v3 — pente fino #2 do plan]** Auditoria automatizada cobrindo o checklist da spec §14.4.

```bash
# 1. Tipos antigos eliminados
grep -rn '"7d"\|"30d"\|"today"' src/ --include='*.ts' --include='*.tsx' | grep -v -E '\.(test|spec)\.' | grep -v '//'
# Esperado: 0 matches (apenas comentários ou tests de migração).

# 2. diffPp não usado no frontend
grep -rn "diffPp" src/components/dashboard/ --include='*.ts' --include='*.tsx'
# Esperado: 0 matches.

# 3. Toggle linha/barra removido
grep -rn "useLineBarStorage\|ChartLineBarToggle" src/ --include='*.ts' --include='*.tsx'
# Esperado: 0 matches.

# 4. Visibilidade Matrix IA aplicada em todos os queries do dashboard
grep -n "shouldExcludeMatrixIA\|excludeMatrixIA" src/lib/chatwoot/queries/dashboard-drill-down.ts
grep -n "shouldExcludeMatrixIA\|excludeMatrixIA" src/lib/chatwoot/queries/dashboard-data.ts
# Esperado: cada SQL relevante tem `inbox_id <> 31` quando `excludeMatrixIA=true`.
```

Se algum check falhar, voltar à task que introduziu a regressão antes de prosseguir.

- [ ] **Step 2: Rodar typecheck completo**

```bash
npm run typecheck
```
Expected: 0 erros.

- [ ] **Step 3: Rodar suite completa de tests**

```bash
npm test
```
Expected: 100% PASS.

> **[v3 — pente fino #2 do plan]** Se test antigo falhar:
> - **`recent` vs `items`**: payload mantém `recent` como alias por compat — test antigo que lê `data.recent` deve continuar funcionando.
> - **`diffPp` vs `diffPct`**: payload mantém ambos por uma versão; test antigo continua válido.
> - **`byStatus` removido em status drill-down**: se algum test verificava `byStatus[]` em `OpenDrillDownData`, atualizar para o novo schema (`items`, `byInbox`, sem `byStatus`).
> - **Testes de helpers em `dashboard.ts` antigo (`periodRanges`)**: a função foi removida; test correspondente deve ter sido removido em T6 também.
>
> Não silenciar via `.skip` — corrigir e re-rodar.

- [ ] **Step 4: Build local**

```bash
npm run build
```
Expected: build verde.

- [ ] **Step 5: Atualizar docs (CHANGELOG, STATUS, package.json)**

`package.json`:
```json
"version": "0.13.0"
```

`CHANGELOG.md` — adicionar no topo:

```markdown
## [0.13.0] — 2026-04-30

### Adicionado
- **Configurações de Dashboard** em `/configuracoes` (super_admin):
  - Início da semana (qualquer dia 0–6, default segunda).
  - Modo da semana: atual (segunda → hoje) ou rolling 7 dias.
  - Modo do mês: atual (dia 1 → hoje) ou rolling 30 dias.
- **Drill-down de status completo** para Resolvido/Pendente/Adiado (antes
  só Aberto tinha drill detalhado).
- **Paginação server-side** (50/pg) na lista de conversas dos drill-downs
  Recebidas e Resolvidas (antes limitada a 20).
- `comparison.open` em `dashboardData` (KPI "Abertas" passa a mostrar % vs
  período anterior, eliminando o badge "Novo").
- Tooltip do gráfico por hora deixa explícito o intervalo HH:00–HH:59.

### Mudado
- Pills de período renomeadas: `7 dias` → `Semana`, `30 dias` → `Mês`.
- Card "Taxa de resolução": indicador troca `pp` por variação relativa em `%`.
- KpiClickableCard: hint "Ver detalhes" sai de cima do sparkline (vai para
  abaixo do trend, alinhado à direita, fade-in em hover/focus).
- Tabelas dos drill-downs: tempo relativo curto (`há 2h`) em vez de
  `há cerca de 2 horas` (corrige aparência de fora-de-ordem).
- `getOpenDrillDown` virou `getStatusDrillDown` parametrizado.
- `diffPp` deprecated em `getResolutionRateDrillDown` em favor de `diffPct`.

### Corrigido
- Filtro "7 dias" agora respeita `dashboard.week_mode` (default = semana
  atual a partir de segunda, era rolling 7 dias).
- Filtro "30 dias" agora respeita `dashboard.month_mode` (default = mês
  atual desde dia 1, era rolling 30 dias).

### Compatibilidade
- Cache keys bumped: `dashboard-data-v3`, `dashboard-drill-status-v3`,
  `dashboard-drill-received-v2`, `dashboard-drill-resolved-v2`,
  `dashboard-drill-resolution-v2`. Caches v1/v2 expiram naturalmente em 30s.
- `diffPp` mantido no payload por uma versão; remover em v0.14.0.
- `recent` no drill-down de Recebidas/Resolvidas mantido como alias de `items`.
```

`docs/STATUS.md` — bump da seção "Versão atual" para `v0.13.0` com a data e o resumo.

- [ ] **Step 6: Commit do release prep**

```bash
git add package.json CHANGELOG.md docs/STATUS.md
git commit -m "chore(release): v0.13.0 — dashboard polish + configurabilidade

Bump 0.12.1 → 0.13.0. CHANGELOG e STATUS atualizados.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Tarefa 11 — Pacote H: ConversationsLineChart (TZ audit + scroll + sem toggle)

> **[v3 — pente fino #2 do plan]** Renumerada de "Tarefa 11.5" para "Tarefa 11" para que a leitura linear do plan seja contínua. A "Tarefa 11 — Push" original virou Tarefa 12.

**Files:**
- Modify: `src/components/dashboard/conversations-line-chart.tsx`
- Modify: `src/lib/chatwoot/queries/dashboard-data.ts`
- Modify: `src/lib/chatwoot/queries/dashboard-drill-down.ts`
- Create: `src/lib/utils/__tests__/format-bucket.test.ts`

- [ ] **Step 1: Test TZ — formatBucketLabel coerente com SQL**

```ts
// src/lib/utils/__tests__/format-bucket.test.ts
import { formatBucketLabel } from "@/lib/utils/format-bucket";

describe("formatBucketLabel — TZ correctness", () => {
  it("bucket UTC 17:00 → 14:00 BRT", () => {
    // SQL produz: date_trunc('hour', conversa_14h_BRT AT TIME ZONE 'BRT')
    //             AT TIME ZONE 'BRT' = 2026-04-30T17:00:00Z
    expect(
      formatBucketLabel("2026-04-30T17:00:00.000Z", "hour", "America/Sao_Paulo"),
    ).toBe("14:00");
  });

  it("bucket UTC 03:00 → 00:00 BRT (meia-noite local)", () => {
    expect(
      formatBucketLabel("2026-04-30T03:00:00.000Z", "hour", "America/Sao_Paulo"),
    ).toBe("00:00");
  });

  it("granularity=day usa formato dd/MM", () => {
    expect(
      formatBucketLabel("2026-04-30T03:00:00.000Z", "day", "America/Sao_Paulo"),
    ).toBe("30/04");
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
npx jest src/lib/utils/__tests__/format-bucket.test.ts
```
Expected: PASS já no estado atual (formatBucketLabel não muda; o test serve como guard contra regressão).

- [ ] **Step 3: Fix SQL — devolver timestamptz UTC explícito**

Em `src/lib/chatwoot/queries/dashboard-data.ts`, localizar `sqlChart` (granularity hour e day) e trocar `::timestamp` por `AT TIME ZONE $4`:

```sql
-- Antes:
date_trunc('hour', c.created_at AT TIME ZONE $4)::timestamp AS bucket
-- Depois:
(date_trunc('hour', c.created_at AT TIME ZONE $4) AT TIME ZONE $4) AS bucket
```

(idem para `'day'`.)

Fazer mesma mudança em `dashboard-drill-down.ts`:
- `sqlChart` em `getReceivedDrillDown`
- `sqlChart` em `getResolvedDrillDown`
- `sqlHistory` em `getResolutionRateDrillDown`

> **[v2 — pente fino do plan]** **NÃO mexer em `byHour` queries** — usam `EXTRACT(HOUR FROM ... AT TIME ZONE $4)::int AS hour` e retornam `int 0..23` puro, sem timestamp ambíguo.

> **[v2 — pente fino do plan]** **Bump de cache key obrigatório**: caches `dashboard-data-v3`, `dashboard-drill-received-v2`, `dashboard-drill-resolved-v2`, `dashboard-drill-resolution-v2` podem ter dados serializados com bucket sem TZ. Bump em 1 versão cada:
> - `dashboard-data-v3` → `dashboard-data-v4`
> - `dashboard-drill-received-v2` → `dashboard-drill-received-v3`
> - `dashboard-drill-resolved-v2` → `dashboard-drill-resolved-v3`
> - `dashboard-drill-resolution-v2` → `dashboard-drill-resolution-v3`
> - `dashboard-drill-status-v3` permanece (não tem bucket cacheado).

- [ ] **Step 4: Refactor ConversationsLineChart — eixo cheio + scroll + sem toggle**

Substituir o conteúdo do arquivo por:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { LineChart as LineChartIcon } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBucketLabel } from "@/lib/utils/format-bucket";
import type { DashboardChartPoint } from "@/lib/chatwoot/queries/dashboard-data";

interface ConversationsLineChartProps {
  data: DashboardChartPoint[];
  granularity: "hour" | "day";
  tz: string;
}

const HOUR_PIXEL = 64;          // largura por hora (desktop)
const HOUR_PIXEL_MOBILE = 56;   // largura por hora (mobile)
const VISIBLE_HOURS_DESKTOP = 12;
const VISIBLE_HOURS_MOBILE = 6;

function CustomTooltip(props: TooltipContentProps<ValueType, NameType>) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {payload[0]?.payload?.windowLabel ? (
        <p className="text-[11px] text-muted-foreground/70 mb-2">
          Janela: {payload[0].payload.windowLabel}
        </p>
      ) : null}
      {payload.map((entry) => (
        <p key={entry.name} className="text-xs" style={{ color: entry.color }}>
          {entry.name}:{" "}
          <span className="font-bold">
            {typeof entry.value === "number"
              ? entry.value.toLocaleString("pt-BR")
              : (entry.value ?? "—")}
          </span>
        </p>
      ))}
    </div>
  );
}

/**
 * Preenche todas as 24 horas do dia com 0/0 quando não há dado.
 *
 * - granularity="hour" + `data` tem ≥ 1 ponto: retorna 24 entradas (00..23).
 * - granularity="day" ou data vazia: retorna data como veio (sem mexer).
 *
 * Usa date-fns-tz `fromZonedTime` para construir o ISO de cada hora local
 * no tz da plataforma — sem hack de offset do navegador.
 */
import { fromZonedTime } from "date-fns-tz";

function expandFullDay(
  data: DashboardChartPoint[],
  granularity: "hour" | "day",
  tz: string,
): Array<DashboardChartPoint & { hourOfDay?: number }> {
  if (granularity !== "hour" || data.length === 0) return data;

  // Identifica "qual dia" (em tz) o primeiro bucket pertence (YYYY-MM-DD).
  const sample = new Date(data[0]!.bucket);
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(sample);

  // Index dos buckets existentes por hora-do-dia (em tz).
  const existingByHour = new Map<number, DashboardChartPoint>();
  for (const d of data) {
    const hourLocal = parseInt(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        hour12: false,
      }).format(new Date(d.bucket)),
      10,
    );
    existingByHour.set(hourLocal, d);
  }

  const filled: Array<DashboardChartPoint & { hourOfDay: number }> = [];
  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, "0");
    // Construir Date no tz local e converter pra UTC explicitamente.
    const utcDate = fromZonedTime(`${dayKey}T${hh}:00:00`, tz);
    const existing = existingByHour.get(h);

    filled.push({
      bucket: existing?.bucket ?? utcDate.toISOString(),
      received: existing?.received ?? 0,
      resolved: existing?.resolved ?? 0,
      hourOfDay: h,
    });
  }
  return filled;
}

export function ConversationsLineChart({
  data,
  granularity,
  tz,
}: ConversationsLineChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const title =
    granularity === "hour" ? "Conversas por hora" : "Conversas por dia";

  const expanded = expandFullDay(data, granularity, tz);

  const chartData = expanded.map((point) => {
    const label = formatBucketLabel(point.bucket, granularity, tz);
    const windowLabel =
      granularity === "hour" && "hourOfDay" in point && point.hourOfDay !== undefined
        ? `${String(point.hourOfDay).padStart(2, "0")}:00 – ${String(point.hourOfDay).padStart(2, "0")}:59`
        : undefined;
    return {
      label,
      windowLabel,
      Recebidas: point.received,
      Resolvidas: point.resolved,
    };
  });

  const isEmpty = data.every((p) => p.received === 0 && p.resolved === 0);

  // Scroll para centrar a hora atual ao montar (modo "Hoje" / hora)
  useEffect(() => {
    if (granularity !== "hour" || !scrollRef.current) return;
    const nowHour = parseInt(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        hour12: false,
      }).format(new Date()),
      10,
    );
    const isMobile = window.matchMedia("(max-width: 640px)").matches;
    const px = isMobile ? HOUR_PIXEL_MOBILE : HOUR_PIXEL;
    const visible = isMobile ? VISIBLE_HOURS_MOBILE : VISIBLE_HOURS_DESKTOP;
    const scrollLeft = Math.max(0, (nowHour - Math.floor(visible / 2)) * px);
    scrollRef.current.scrollLeft = scrollLeft;
  }, [granularity, tz, chartData.length]);

  // Largura total do chart (px) para forçar scroll quando excede o container
  const totalPxDesktop = chartData.length * HOUR_PIXEL;

  return (
    <Card className="bg-card border border-border rounded-xl">
      <CardHeader className="pb-2 flex-row items-start justify-between gap-3">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <LineChartIcon className="h-4 w-4 text-violet-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
            Nenhuma conversa no período
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="overflow-x-auto overflow-y-hidden scrollbar-thin"
            tabIndex={0}
            aria-label="Gráfico rolagem horizontal"
          >
            <div style={{ width: granularity === "hour" ? totalPxDesktop : "100%", minWidth: "100%" }}>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={chartData}
                  margin={{ top: 16, right: 16, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#71717a", fontSize: 11 }}
                    tickLine={false}
                    tickMargin={12}
                    axisLine={{ stroke: "#27272a" }}
                    interval={granularity === "hour" ? 0 : "preserveStartEnd"}
                    height={36}
                  />
                  <YAxis
                    tick={{ fill: "#71717a", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={36}
                  />
                  <Tooltip
                    content={CustomTooltip}
                    cursor={{ stroke: "rgba(63, 63, 70, 0.5)" }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    wrapperStyle={{ fontSize: 12 }}
                    iconType="circle"
                  />
                  <Line
                    type="monotone"
                    dataKey="Recebidas"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="Resolvidas"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

(Remove imports `BarChart`, `Bar`, `ChartLineBarToggle`, `useLineBarStorage`, `STORAGE_KEY`. Mantém apenas LineChart.)

- [ ] **Step 5: Limpar `chart-type-toggle.tsx` — remover ChartLineBarToggle**

> **[v2 — pente fino do plan]** Confirmar com grep antes de apagar:
>
> ```bash
> grep -rn "ChartLineBarToggle\|useLineBarStorage" src/ --include='*.ts' --include='*.tsx'
> ```
>
> Esperado: zero matches após o refactor de `conversations-line-chart.tsx` no Step 4. Se houver algum remanescente, atualize esse caller também.

Apagar essas exports do `chart-type-toggle.tsx`:
- `export type LineBarChartType`
- `export interface ChartLineBarToggleProps`
- `export function ChartLineBarToggle`
- `export function useLineBarStorage`

Manter `ChartTypeToggle`, `ChartTypeToggleProps`, `ChartType`, `useChartTypeStorage` (usados por outros componentes).

- [ ] **Step 6: typecheck e tests**

```bash
npm run typecheck
npx jest --testPathPattern='format-bucket\|dashboard'
```

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/conversations-line-chart.tsx src/components/dashboard/chart-type-toggle.tsx src/lib/chatwoot/queries/dashboard-data.ts src/lib/chatwoot/queries/dashboard-drill-down.ts src/lib/utils/__tests__/format-bucket.test.ts
git commit -m "feat(dashboard): ConversationsLineChart — eixo cheio 0-24h + scroll horizontal + TZ explícita (T11.5)

- SQL bucket retorna timestamptz UTC explícito (era timestamp without TZ
  ambíguo). Frontend formata uma única vez via Intl.DateTimeFormat({tz}).
  Test guard adicionado em utils/__tests__/format-bucket.test.ts.
- Eixo X cobre todas as 24h em 'Hoje' (preenche buckets vazios com 0/0).
- Scroll horizontal centrado na hora atual: 12h em desktop, 6h em mobile.
- tickMargin=12 dá espaço entre tick e label (era colado).
- Toggle linha/barra removido (manter só linhas).
- ChartLineBarToggle e useLineBarStorage removidos (código morto).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Tarefa 12 — Push, watch CI e validar deploy

- [ ] **Step 1: Verificar CI alheio antes de push**

```bash
gh run list --limit 5
```
Expected: nada queued/in-progress; se houver, esperar.

> **[v2 — pente fino do plan]** **Verificar também `docs/agents/active/`**: outro agente trabalhando em paralelo pode estar a 1 commit de pushar. Se houver active file alheio < 24h:
>
> ```bash
> ls docs/agents/active/
> tail -10 docs/agents/HISTORY.md
> ```
>
> Se outro agente tiver acabado de pushar (commit recente em main que não é seu), `git pull --rebase origin main` e re-rodar o `npm run typecheck` antes de prosseguir.

- [ ] **Step 2: Atualizar HISTORY.md**

Append:
```
2026-04-30 22:55 | agent=claude-dashboard-v013 | scope=release | summary=Release v0.13.0 — dashboard polish (KpiCard sem overlap + Novo→%, pills Semana/Mês, drill-down status genérico, paginação 50/pg, formatRelativeShort, settings de dashboard, comparison.open, diffPct).
```

```bash
git add docs/agents/HISTORY.md
git commit -m "docs(agents): registra release v0.13.0

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Watch da build**

```bash
gh run list --limit 3
gh run watch <id>
```
Expected: build success em 4–5min.

- [ ] **Step 5: Disparar portainer-fix workflow**

```bash
gh workflow run portainer-fix.yml -f app_version=v0.13.0
gh run list --workflow=portainer-fix.yml --limit 3
gh run watch <id>
```

- [ ] **Step 6: Smoke-test produção**

```bash
curl -s https://insights.nexusai360.com/api/health | jq .
```
Expected: `{"status":"ok","version":"v0.13.0", "db":"<...ms", "redis":"<...ms"}`.

> **[v3 — pente fino #2 do plan]** Host correto confirmado pelo `docker-compose.production.yml` (Traefik label) e `docs/runbooks/deploy.md`.

- [ ] **Step 7: Append em HISTORY.md o status LIVE**

```
2026-04-30 23:05 | agent=claude-dashboard-v013 | run=<id1>,<id2> | scope=infra | summary=Build v0.13.0 success + portainer-fix atualizou APP_VERSION. /api/health version=v0.13.0 status=ok.
```

```bash
git add docs/agents/HISTORY.md
git commit -m "docs(agents): registra v0.13.0 LIVE

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 8: Encerrar sessão**

```bash
rm "docs/agents/active/claude-dashboard-v013.md"
git add -A docs/agents/active/
git commit -m "docs(agents): encerra sessão claude-dashboard-v013

v0.13.0 LIVE em produção. Active file deletado.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

---

## Self-review do plan (v3 final pós double-check)

### Cobertura da spec
- ✅ Todos os 11 problemas reportados (P1–P11) e os 5 do Pacote H (P12–P16) têm task explícita:
  - P1 → T4 · P2 → T6 (comparison.open) + T4 (sem fallback "Novo") · P3 → T6 (variação relativa em rate) + T7 (diffPct no drill-down)
  - P4 → T5 · P5 → T1 + T6 + T7 · P6 → T2 + T9 · P7 → T7 + T8 (paginação)
  - P8 → T3 + T8 (formatRelativeShort) · P9 → T7 + T8 (status genérico) · P10 → T8 + T11 · P11 → T10
  - P12 → T11 (TZ explícita SQL) · P13 → T11 (tickMargin) · P14 → T11 (interval=0)
  - P15 → T11 (eixo cheio + scroll) · P16 → T11 (sem toggle linha/barra)

### Pente fino #1 (achados corrigidos inline)
- ✅ **B1** T3 testes "há X mês" → "há Xm" (consistente com `min`/`h`/`d`).
- ✅ **B2** T9 audit `setting_updated` (enum existente) com `details.section: "dashboard"` (era `"dashboard.settings.update"` que não compila).
- ✅ **B3** T9 não toca `getAllSettings`; lê via `getDashboardSettings()` no SSR.
- ✅ **B4** T11 `expandFullDay` usa `fromZonedTime` de date-fns-tz (era hack com `getTimezoneOffset()`).
- ✅ **B5** T11 bumpa cache keys (v2/v3 → v3/v4) após mudança SQL.
- ✅ **B6** T11 step 5 inclui grep explícito antes de remover exports.

### Pente fino #2 (achados corrigidos inline)
- ✅ **C1** T11.5 → T11; T11 → T12 (numeração linear).
- ✅ **C2** T10 step 1 inclui auditoria automatizada do checklist §14.4 da spec.
- ✅ **C3** T12 host `/api/health` confirmado via `docker-compose.production.yml`: `insights.nexusai360.com`.
- ✅ **C4** `StatusDrillDownData` sem `byStatus` (alinhado com spec D6 corrigida).
- ✅ **C5** T10 step 3 explicita estratégia de regressão: corrigir, nunca silenciar via `.skip`.

### Outros critérios
- ✅ **Sem placeholders:** todo código é concreto.
- ✅ **Tipos consistentes:** `DashboardPeriod = "hoje"|"semana"|"mes"`, `DashboardMode = "current"|"rolling"`, `WeekStartsOn = 0..6`.
- ✅ **Bite-sized:** cada step é 2–5min.
- ✅ **TDD onde faz sentido:** T1, T2, T3 têm tests-first; demais são UI/refactor.
- ✅ **Comandos exatos:** `npx jest`, `npm run typecheck`, `gh run watch`, `curl`.
- ✅ **Frequent commits:** 12 commits ao longo do release.

### Correções no que já foi commitado
Os subagents implementaram T1–T6 antes do double-check. Após o pente:
- 🔧 **T3 (`relative-time.ts` + tests)** precisa **commit corretivo**: trocar `"há X mês"` → `"há Xm"` e `"há X anos"` → `"há Xa"` para alinhar com a spec corrigida. Isso vira o primeiro passo da retomada da execução.
- ✅ T1, T2, T4, T5, T6 já estão alinhados — sem rework necessário.
