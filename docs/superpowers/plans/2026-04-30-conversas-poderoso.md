# v0.8.0 — Conversas Poderoso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a tela `/relatorios/conversas` poderosa, leve e fácil de usar — query builder centralizado com E/OU, painel de ordenação em cadeia, drill-down inline, sticky toolbar/header, status no feminino com cores ajustadas, etiquetas filtráveis, fix de bugs críticos.

**Architecture:** Reusa primitivos já existentes (`<Dialog>` base-ui, `<ConditionalFilters>`, `applyConditions`, `<MultiSelectCheckbox>`). Substitui o `<FiltersDrawer>` por dois Dialogs centralizados (`<FiltersDialog>` + `<SortingDialog>`). Drill-down via `expandedIds: Set` com linhas extras (`<tr colspan>`). FilterState estendido com `mode: simple|advanced` + `conditionGroup` + `labelIds`, retrocompatível por URL.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, base-ui (Dialog), Framer Motion (animations), Jest + jest-mock-extended + @testing-library/react.

**Reference spec:** `docs/superpowers/specs/2026-04-30-conversas-poderoso-design.md`

---

## File Structure

### Novos arquivos

- `src/components/reports/filters-dialog.tsx` — Dialog centralizado com modos Simples/Avançado
- `src/components/reports/sorting-dialog.tsx` — Painel de ordenação em cadeia
- `src/components/reports/conversa-drill-down.tsx` — Conteúdo expandido da linha (Contato/Etiquetas/Atributos/Tempos)
- `src/lib/reports/condition-group-codec.ts` — base64url encode/decode do `ConditionGroup` para URL
- `src/lib/utils/__tests__/null-compare.test.ts` — testes do comparador null-as-min
- `src/components/reports/__tests__/status-badge.test.tsx` — testes do badge atualizado
- `src/components/reports/__tests__/filters-dialog.test.tsx` — integração do Dialog
- `src/components/reports/__tests__/sorting-dialog.test.tsx` — integração do Dialog
- `src/components/reports/__tests__/conversa-drill-down.test.tsx` — render + expand/collapse

### Arquivos modificados

- `src/lib/utils/null-compare.ts` (novo arquivo extraindo o comparador) — fix R6
- `src/components/reports/conversas-table.tsx` — usa null-compare novo, drill-down, sticky thead, font bumps
- `src/components/reports/status-badge.tsx` — labels femininos, cores ajustadas (R7)
- `src/components/reports/applied-filters-chips.tsx` — labels e copy
- `src/components/reports/advanced-filters.tsx` — substitui drawer por dois Dialogs, sticky, etiquetas
- `src/components/reports/filters-drawer.tsx` — DELETAR (substituído pelo Dialog)
- `src/lib/reports/filter-state.ts` — estende com `labelIds`, `mode`, `conditionGroup`
- `src/lib/chatwoot/queries/meta-cache.ts` — adiciona `getLabels(accountId)`
- `src/app/(protected)/relatorios/conversas/page.tsx` — carrega labels em paralelo
- `src/components/ui/custom-select.tsx` — fix race click outside (Bug 2)
- `src/components/reports/period-pills.tsx` — fix race calendário (Bug 1)
- `src/app/globals.css` — bump font-size root + z-index vars
- `src/lib/tours/conversas-tour.ts` — atualizar steps para novos CTAs
- `package.json` — version bump
- `CHANGELOG.md` — release notes
- `STATUS.md` — versão atual

---

## Onda 1 — Quick wins (R6 + R7 + R9)

### Task 1: Fix `nullableNumberCompare` (R6) — null como valor mínimo simétrico

**Files:**
- Create: `src/lib/utils/null-compare.ts`
- Create: `src/lib/utils/__tests__/null-compare.test.ts`
- Modify: `src/components/reports/conversas-table.tsx:206-214` (substituir helper inline por import)

- [ ] **Step 1.1: Write the failing test**

`src/lib/utils/__tests__/null-compare.test.ts`:

```ts
import { nullableNumberCompare, nullableStringCompare } from "../null-compare";

describe("nullableNumberCompare (null as min)", () => {
  test("two nulls → 0", () => {
    expect(nullableNumberCompare(null, null)).toBe(0);
  });

  test("null vs number → null is smaller (asc: null first)", () => {
    expect(nullableNumberCompare(null, 5)).toBeLessThan(0);
  });

  test("number vs null → null is smaller (asc: number after null)", () => {
    expect(nullableNumberCompare(5, null)).toBeGreaterThan(0);
  });

  test("smaller number first in asc", () => {
    expect(nullableNumberCompare(5, 10)).toBeLessThan(0);
  });

  test("desc symmetry: factor=-1 reverses to null last", () => {
    const cmp = nullableNumberCompare;
    const factor = -1;
    expect(cmp(null, 5) * factor).toBeGreaterThan(0); // null after 5 in desc
    expect(cmp(5, null) * factor).toBeLessThan(0);
  });
});

describe("nullableStringCompare (null at end — preserved)", () => {
  test("null vs string → null at end", () => {
    expect(nullableStringCompare(null, "abc")).toBeGreaterThan(0);
    expect(nullableStringCompare("abc", null)).toBeLessThan(0);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npx jest src/lib/utils/__tests__/null-compare.test.ts -t "null as min"`
Expected: FAIL — module not found.

- [ ] **Step 1.3: Implement `null-compare.ts`**

`src/lib/utils/null-compare.ts`:

```ts
/**
 * Comparadores que tratam null/undefined de forma explícita.
 *
 * `nullableNumberCompare` trata null como o **menor valor possível** (simétrico
 * em asc/desc). Justificativa de produto: em colunas como `waiting_seconds` ou
 * `open_seconds`, "—" (null) significa "não aplicável / não está esperando" —
 * o estado mais saudável — e deve aparecer antes dos valores numéricos quando
 * ordenamos pelo menor tempo.
 */
export function nullableNumberCompare(
  a: number | null,
  b: number | null,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a - b;
}

/**
 * Comparador de strings nullable. Null vai para o fim em asc — "—" em
 * Atendente/Departamento significa "não atribuído" e fica visualmente no
 * fim da lista até o usuário tomar ação.
 */
export function nullableStringCompare(
  a: string | null,
  b: string | null,
): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

/** Comparador de datas ISO/string. Null vai para o fim. */
export function nullableDateCompare(
  a: string | null,
  b: string | null,
): number {
  const av = a ? new Date(a).getTime() : Number.NaN;
  const bv = b ? new Date(b).getTime() : Number.NaN;
  if (Number.isNaN(av) && Number.isNaN(bv)) return 0;
  if (Number.isNaN(av)) return 1;
  if (Number.isNaN(bv)) return -1;
  return av - bv;
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npx jest src/lib/utils/__tests__/null-compare.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 1.5: Substituir helpers inline em `conversas-table.tsx`**

Em `src/components/reports/conversas-table.tsx`, remover funções locais (linhas 206-233 — `nullableNumberCompare`, `nullableStringCompare`, `dateCompare`) e importar do novo módulo:

```ts
// Topo do arquivo, junto com outros imports utilitários:
import {
  nullableNumberCompare,
  nullableStringCompare,
  nullableDateCompare,
} from "@/lib/utils/null-compare";
```

Trocar todas as ocorrências de `dateCompare(` por `nullableDateCompare(` (search/replace no arquivo).

- [ ] **Step 1.6: Verificar tabela ainda compila**

Run: `npm run typecheck` (ou `npx tsc --noEmit`)
Expected: 0 erros.

- [ ] **Step 1.7: Commit**

```bash
git add src/lib/utils/null-compare.ts src/lib/utils/__tests__/null-compare.test.ts src/components/reports/conversas-table.tsx
git commit -m "fix(conversas): null como valor mínimo na ordenação numérica

Tracinho ('—') em waiting_seconds/open_seconds significa 'não está
esperando' — agora aparece primeiro em asc (menor tempo) e por último
em desc (maior tempo), simétrico. Antes ia sempre pro fim em asc."
```

---

### Task 2: Status no feminino + cores ajustadas (R7)

**Files:**
- Modify: `src/components/reports/status-badge.tsx` (mapa + STATUS_OPTIONS)
- Modify: `src/components/reports/applied-filters-chips.tsx` (qualquer label hardcoded)
- Modify: `src/components/reports/filters-drawer.tsx` (STATUS_OPTIONS — antes da Task 7 que deleta)
- Create: `src/components/reports/__tests__/status-badge.test.tsx`

- [ ] **Step 2.1: Write the failing test**

`src/components/reports/__tests__/status-badge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { StatusBadge, STATUS_OPTIONS } from "../status-badge";

describe("StatusBadge — labels femininos + cores v0.8.0", () => {
  test("status 0 → 'Aberta' (amber)", () => {
    render(<StatusBadge status={0} />);
    const el = screen.getByText("Aberta");
    expect(el).toBeInTheDocument();
    expect(el.className).toMatch(/text-amber-500/);
    expect(el.className).toMatch(/bg-amber-500\/15/);
  });

  test("status 1 → 'Resolvida' (sky)", () => {
    render(<StatusBadge status={1} />);
    const el = screen.getByText("Resolvida");
    expect(el).toBeInTheDocument();
    expect(el.className).toMatch(/text-sky-500/);
    expect(el.className).toMatch(/bg-sky-500\/15/);
  });

  test("status 2 → 'Pendente' (violet)", () => {
    render(<StatusBadge status={2} />);
    const el = screen.getByText("Pendente");
    expect(el.className).toMatch(/text-violet-500/);
  });

  test("status 3 → 'Adiada' (slate)", () => {
    render(<StatusBadge status={3} />);
    const el = screen.getByText("Adiada");
    expect(el.className).toMatch(/text-slate-400/);
    expect(el.className).toMatch(/bg-slate-500\/15/);
  });

  test("STATUS_OPTIONS expõe labels femininos", () => {
    expect(STATUS_OPTIONS).toEqual([
      { value: 0, label: "Aberta" },
      { value: 1, label: "Resolvida" },
      { value: 2, label: "Pendente" },
      { value: 3, label: "Adiada" },
    ]);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npx jest src/components/reports/__tests__/status-badge.test.tsx`
Expected: FAIL — labels antigos ("Em aberto", "Resolvida"+emerald).

- [ ] **Step 2.3: Atualizar `status-badge.tsx`**

`src/components/reports/status-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<
  number,
  { label: string; className: string }
> = {
  0: { label: "Aberta",    className: "bg-amber-500/15 text-amber-500" },
  1: { label: "Resolvida", className: "bg-sky-500/15 text-sky-500" },
  2: { label: "Pendente",  className: "bg-violet-500/15 text-violet-500" },
  3: { label: "Adiada",    className: "bg-slate-500/15 text-slate-400" },
};

export const STATUS_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Aberta" },
  { value: 1, label: "Resolvida" },
  { value: 2, label: "Pendente" },
  { value: 3, label: "Adiada" },
];

interface StatusBadgeProps {
  status: number;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const meta = STATUS_MAP[status] ?? {
    label: "—",
    className: "bg-slate-500/15 text-slate-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
```

- [ ] **Step 2.4: Atualizar `filters-drawer.tsx` STATUS_OPTIONS para feminino**

Em `src/components/reports/filters-drawer.tsx` linhas 44-49:

```tsx
const STATUS_OPTIONS: MetaItem[] = [
  { id: 0, name: "Aberta" },
  { id: 1, name: "Resolvida" },
  { id: 2, name: "Pendente" },
  { id: 3, name: "Adiada" },
];
```

(Esse arquivo será removido na Task 8, mas ajustar agora mantém consistência durante o desenvolvimento.)

- [ ] **Step 2.5: Auditar usos hardcoded**

Run:
```bash
grep -rn "Em aberto\|Resolvido\|Adiado" src/ --include="*.ts" --include="*.tsx"
```

Para cada match em código de UI, trocar para feminino. Para enums internos do Chatwoot (priority/status numéricos), deixar como está. Comentários ficam como estão.

- [ ] **Step 2.6: Run tests**

Run: `npx jest src/components/reports/__tests__/status-badge.test.tsx`
Expected: 5 tests PASS.

- [ ] **Step 2.7: Commit**

```bash
git add src/components/reports/status-badge.tsx \
        src/components/reports/__tests__/status-badge.test.tsx \
        src/components/reports/filters-drawer.tsx
git commit -m "refactor(conversas): status no feminino + cor sky para Resolvida

- 'Em aberto' → 'Aberta' (amber, mantido)
- 'Resolvida' (emerald → sky/azul claro)
- 'Pendente' (violet, mantido)
- 'Adiado' → 'Adiada' (zinc → slate cinza claro)"
```

---

### Task 3: Bump tipográfico (R9)

**Files:**
- Modify: `src/app/globals.css` (root font-size + z-index vars)
- Modify: `src/components/reports/conversas-table.tsx` (promoções pontuais)

- [ ] **Step 3.1: Atualizar `globals.css` com font-size root + z-index vars**

Em `src/app/globals.css`, adicionar antes de `@layer base`:

```css
/* ===== TIPOGRAFIA E Z-INDEX (v0.8.0) ===== */
:root {
  /* Bump discreto: 16 → 16.25 (+1.5%); 16.5 em telas grandes (+3%) */
  --base-font-size: 16.25px;
  /* Z-index scale (cumpre z-index-management) */
  --z-toolbar: 30;
  --z-table-thead: 20;
  --z-modal: 100;
  --z-toast: 1000;
}

@media (min-width: 1280px) {
  :root {
    --base-font-size: 16.5px;
  }
}

html {
  font-size: var(--base-font-size);
}
```

- [ ] **Step 3.2: Promoções pontuais na tabela de Conversas**

Em `src/components/reports/conversas-table.tsx`, fazer estas substituições:

1. Header da tabela (linha ~844):
   - `"h-11 text-xs uppercase tracking-wide text-muted-foreground"` →
     `"h-11 text-[13px] uppercase tracking-wide text-muted-foreground"`

2. Botão sort do header (linha ~856):
   - `"text-xs font-semibold uppercase tracking-wide"` →
     `"text-[13px] font-semibold uppercase tracking-wide"`

3. Render dos campos `text-xs` em valores que ficam no tabular display (#8653, datas, durações):
   - Manter `text-xs` em chips (são pequenos por design); promover apenas valores monoespaçados:
   - Linha 245 (display_id): manter `text-xs`
   - Linhas 281, 299, 406, 421, 443, 467: trocar `text-xs` por `text-[13px]`
   - Mobile cards (linhas 932): manter `text-[11px]` mas promover labels `text-[10px]` → `text-[11px]`

Comando rápido (script):
```bash
# Substitui APENAS a string "text-xs text-muted-foreground tabular-nums" → "text-[13px] text-muted-foreground tabular-nums"
node -e "const f='src/components/reports/conversas-table.tsx'; const fs=require('fs'); let c=fs.readFileSync(f,'utf8'); c=c.replace(/text-xs text-muted-foreground tabular-nums/g, 'text-[13px] text-muted-foreground tabular-nums'); c=c.replace(/text-xs font-semibold tabular-nums/g, 'text-[13px] font-semibold tabular-nums'); c=c.replace(/text-xs font-mono text-muted-foreground tabular-nums/g, 'text-[13px] font-mono text-muted-foreground tabular-nums'); c=c.replace(/text-xs whitespace-nowrap text-muted-foreground tabular-nums/g, 'text-[13px] whitespace-nowrap text-muted-foreground tabular-nums'); c=c.replace(/text-\[10px\] uppercase tracking-wide/g, 'text-[11px] uppercase tracking-wide'); fs.writeFileSync(f,c);"
```

- [ ] **Step 3.3: Verificar build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 3.4: Smoke visual no dev**

Run: `npm run dev` (background) e abrir `/relatorios/conversas` no navegador.
Verificar visualmente: tabela não quebra; valores legíveis; mobile não cria horizontal scroll.

- [ ] **Step 3.5: Commit**

```bash
git add src/app/globals.css src/components/reports/conversas-table.tsx
git commit -m "style(typography): bump discreto +1.5% (root 16→16.25px) + tabela mais legível

Promove text-xs em valores tabulares para text-[13px]. Mantém
hierarquia. Inclui z-index scale unificado para sticky/modais."
```

---

## Onda 2 — Etiquetas (R8)

### Task 4: `getLabels(accountId)` em meta-cache

**Files:**
- Modify: `src/lib/chatwoot/queries/meta-cache.ts`
- Test: `src/lib/chatwoot/queries/__tests__/meta-cache-labels.test.ts` (criar se não houver suite específica)

- [ ] **Step 4.1: Verificar shape atual do meta-cache**

Run: `grep -n "export.*function get" src/lib/chatwoot/queries/meta-cache.ts`
Expected: `getInboxes`, `getTeams`, `getUsers`. Espelhar o mesmo shape para `getLabels`.

- [ ] **Step 4.2: Implementar `getLabels`**

Em `src/lib/chatwoot/queries/meta-cache.ts`, adicionar:

```ts
/**
 * Lista de etiquetas (labels) da conta. Usadas para multi-select de filtro
 * em /relatorios/conversas.
 *
 * Cacheada com pull-through — TTL 600s (10 min). Invalidate ao adicionar
 * nova etiqueta no Chatwoot fica para evolução; cache stale é tolerável aqui.
 */
export async function getLabels(accountId: number) {
  const key = cacheKey({
    scope: "meta",
    name: "labels",
    accountId,
  });

  return withCache<{ data: MetaItem[] }>({
    key,
    ttlSeconds: 600,
    fetcher: () =>
      withChatwootResilience<{ data: MetaItem[] }>(
        async () => {
          const pool = getChatwootPool();
          const result = await pool.query<{ id: number; name: string }>(
            `SELECT id, title AS name
             FROM labels
             WHERE account_id = $1
             ORDER BY title ASC`,
            [accountId],
          );
          return { data: result.rows };
        },
        { fallbackKey: key },
      ),
  });
}
```

- [ ] **Step 4.3: Verificar typecheck**

Run: `npm run typecheck`
Expected: 0 erros. Se MetaItem não tiver shape compatível, ajustar para `{ id: number; name: string }` que é o que MultiSelectCheckbox consome.

- [ ] **Step 4.4: Commit**

```bash
git add src/lib/chatwoot/queries/meta-cache.ts
git commit -m "feat(meta-cache): getLabels(accountId) para filtro de etiquetas"
```

---

### Task 5: Estender `FilterState` com `labelIds` + `mode` + `conditionGroup`

**Files:**
- Modify: `src/lib/reports/filter-state.ts`
- Create: `src/lib/reports/condition-group-codec.ts`
- Test: `src/lib/reports/__tests__/filter-state.test.ts` (atualizar existente)

- [ ] **Step 5.1: Criar codec base64url para `ConditionGroup`**

`src/lib/reports/condition-group-codec.ts`:

```ts
/**
 * Codec base64url para serialização de ConditionGroup em URL.
 *
 * Cap de 4kB (limite seguro vs. URL de 8kB típico). Strings maiores
 * retornam null e o caller deve persistir só em localStorage.
 */
import type { ConditionGroup } from "@/lib/utils/apply-conditions";

const MAX_BYTES = 4096;

function base64urlEncode(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(s: string): string {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

export function encodeConditionGroup(group: ConditionGroup): string | null {
  try {
    const json = JSON.stringify(group);
    if (Buffer.byteLength(json, "utf8") > MAX_BYTES) return null;
    return base64urlEncode(json);
  } catch {
    return null;
  }
}

export function decodeConditionGroup(s: string): ConditionGroup | null {
  try {
    const json = base64urlDecode(s);
    const parsed = JSON.parse(json) as ConditionGroup;
    if (
      parsed &&
      typeof parsed === "object" &&
      "combinator" in parsed &&
      Array.isArray((parsed as ConditionGroup).conditions)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5.2: Estender `FilterState`**

Em `src/lib/reports/filter-state.ts`:

```ts
import type { PeriodKey } from "@/lib/datetime-core";
import type { ConditionGroup } from "@/lib/utils/apply-conditions";
import {
  encodeConditionGroup,
  decodeConditionGroup,
} from "./condition-group-codec";

export type FilterMode = "simple" | "advanced";

export interface FilterState {
  period: PeriodKey;
  customRange?: { start: string; end: string };
  inboxIds: number[];
  teamIds: number[];
  assigneeIds: number[];
  statuses: number[];
  priorities: number[];
  labelIds: number[];                    // NOVO
  search?: string;
  mode: FilterMode;                      // NOVO ("simple" default)
  conditionGroup?: ConditionGroup;       // NOVO (só usado em mode=advanced)
}

export const EMPTY_FILTER_STATE: FilterState = {
  period: "hoje",
  inboxIds: [],
  teamIds: [],
  assigneeIds: [],
  statuses: [],
  priorities: [],
  labelIds: [],
  mode: "simple",
};

export function serializeFilterState(state: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  p.set("period", state.period);
  if (state.period === "custom" && state.customRange) {
    p.set("custom_start", state.customRange.start);
    p.set("custom_end", state.customRange.end);
  }
  if (state.inboxIds.length) p.set("inbox", state.inboxIds.join(","));
  if (state.teamIds.length) p.set("team", state.teamIds.join(","));
  if (state.assigneeIds.length) p.set("assignee", state.assigneeIds.join(","));
  if (state.statuses.length) p.set("status", state.statuses.join(","));
  if (state.priorities.length) p.set("priority", state.priorities.join(","));
  if (state.labelIds.length) p.set("label", state.labelIds.join(","));
  if (state.search?.trim()) p.set("q", state.search.trim());
  if (state.mode === "advanced") {
    p.set("mode", "advanced");
    if (state.conditionGroup) {
      const encoded = encodeConditionGroup(state.conditionGroup);
      if (encoded) p.set("cg", encoded);
    }
  }
  return p;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function deserializeFilterState(params: URLSearchParams): FilterState {
  const periodRaw = params.get("period") ?? "hoje";
  const validPeriod: PeriodKey =
    periodRaw === "hoje" ||
    periodRaw === "semana_atual" ||
    periodRaw === "mes_atual" ||
    periodRaw === "todos" ||
    periodRaw === "custom"
      ? (periodRaw as PeriodKey)
      : "hoje";

  let customRange: FilterState["customRange"] | undefined;
  if (validPeriod === "custom") {
    const s = params.get("custom_start");
    const e = params.get("custom_end");
    if (s && e && ISO_DATE.test(s) && ISO_DATE.test(e)) {
      customRange = { start: s, end: e };
    }
  }

  const parseIds = (raw: string | null): number[] =>
    raw
      ? raw
          .split(",")
          .map((v) => Number.parseInt(v, 10))
          .filter(Number.isFinite)
      : [];

  const modeRaw = params.get("mode");
  const mode: FilterMode = modeRaw === "advanced" ? "advanced" : "simple";

  const cg = params.get("cg");
  const conditionGroup = cg ? decodeConditionGroup(cg) ?? undefined : undefined;

  return {
    period: validPeriod,
    customRange,
    inboxIds: parseIds(params.get("inbox")),
    teamIds: parseIds(params.get("team")),
    assigneeIds: parseIds(params.get("assignee")),
    statuses: parseIds(params.get("status")),
    priorities: parseIds(params.get("priority")),
    labelIds: parseIds(params.get("label")),
    search: params.get("q") ?? undefined,
    mode,
    conditionGroup,
  };
}

export function diffFilterStates(a: FilterState, b: FilterState): number {
  let diff = 0;
  if (a.period !== b.period) diff++;
  if (
    JSON.stringify(a.customRange ?? null) !==
    JSON.stringify(b.customRange ?? null)
  )
    diff++;
  if (a.inboxIds.join(",") !== b.inboxIds.join(",")) diff++;
  if (a.teamIds.join(",") !== b.teamIds.join(",")) diff++;
  if (a.assigneeIds.join(",") !== b.assigneeIds.join(",")) diff++;
  if (a.statuses.join(",") !== b.statuses.join(",")) diff++;
  if (a.priorities.join(",") !== b.priorities.join(",")) diff++;
  if (a.labelIds.join(",") !== b.labelIds.join(",")) diff++;
  if ((a.search ?? "") !== (b.search ?? "")) diff++;
  if (a.mode !== b.mode) diff++;
  if (
    JSON.stringify(a.conditionGroup ?? null) !==
    JSON.stringify(b.conditionGroup ?? null)
  )
    diff++;
  return diff;
}

export function isFilterStateEqual(a: FilterState, b: FilterState): boolean {
  return diffFilterStates(a, b) === 0;
}
```

- [ ] **Step 5.3: Atualizar testes existentes (se houver)**

Procurar `src/lib/reports/__tests__/filter-state.test.ts`. Adicionar casos:

```ts
test("deserialize com label= retorna labelIds", () => {
  const params = new URLSearchParams("period=hoje&label=1,2,3");
  const state = deserializeFilterState(params);
  expect(state.labelIds).toEqual([1, 2, 3]);
});

test("default mode é 'simple'", () => {
  const params = new URLSearchParams("period=hoje");
  expect(deserializeFilterState(params).mode).toBe("simple");
});

test("mode=advanced + cg= deserializa conditionGroup", () => {
  const cg = { combinator: "AND", conditions: [] };
  const encoded = encodeConditionGroup(cg)!;
  const params = new URLSearchParams(
    `period=hoje&mode=advanced&cg=${encoded}`,
  );
  const state = deserializeFilterState(params);
  expect(state.mode).toBe("advanced");
  expect(state.conditionGroup).toEqual(cg);
});
```

(Se o arquivo de teste não existir, criar com casos básicos cobrindo `serialize/deserialize/diff/isEqual`.)

- [ ] **Step 5.4: Run tests + typecheck**

```bash
npx jest src/lib/reports/__tests__/filter-state.test.ts
npm run typecheck
```
Expected: PASS / 0 erros.

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/reports/filter-state.ts src/lib/reports/condition-group-codec.ts src/lib/reports/__tests__/filter-state.test.ts
git commit -m "feat(filter-state): labelIds, mode simple|advanced e conditionGroup

ConditionGroup serializado em base64url no param 'cg' com cap 4kB.
URL antiga continua válida (mode default 'simple', labelIds vazio)."
```

---

### Task 6: Carregar `getLabels` na page + props para filtros

**Files:**
- Modify: `src/app/(protected)/relatorios/conversas/page.tsx`

- [ ] **Step 6.1: Adicionar `getLabels` ao Promise.all**

Em `src/app/(protected)/relatorios/conversas/page.tsx`, ajustar o bloco `Promise.all` (linhas 69-75):

```tsx
import { getTeams, getUsers, getLabels } from "@/lib/chatwoot/queries/meta-cache";

// ... dentro de ConversasPage:
const [
  inboxesResult,
  teamsResult,
  usersResult,
  labelsResult,
  conversasResult,
] = await Promise.all([
  getInboxesForUser(accountId, user).catch(() => null),
  getTeams(accountId).catch(() => null),
  getUsers(accountId).catch(() => null),
  getLabels(accountId).catch(() => null),
  fetchConversas({ filters: reportFilters, accountId }),
]);

const inboxes = inboxesResult?.data ?? [];
const teams = teamsResult?.data ?? [];
const assignees = usersResult?.data ?? [];
const labels = labelsResult?.data ?? [];

const stale =
  conversasResult.stale ||
  Boolean(inboxesResult?.stale) ||
  Boolean(teamsResult?.stale) ||
  Boolean(usersResult?.stale) ||
  Boolean(labelsResult?.stale);
```

E passar `labels={labels}` para `<AdvancedFilters>`. Também adicionar `labelIds: filterState.labelIds.length ? filterState.labelIds : undefined,` em `reportFilters`.

- [ ] **Step 6.2: Verificar build + smoke**

```bash
npm run typecheck
npm run dev
```

Abrir `/relatorios/conversas?label=1,2` e checar console por erros.

- [ ] **Step 6.3: Commit**

```bash
git add src/app/\(protected\)/relatorios/conversas/page.tsx
git commit -m "feat(conversas): carrega labels em paralelo e propaga para filters/queries"
```

---

## Onda 3 — Componentes novos (R2 + R3 + R4 + R5)

### Task 7: `<FiltersDialog>` — Modo Simples (paridade com drawer atual)

**Files:**
- Create: `src/components/reports/filters-dialog.tsx`
- Test: `src/components/reports/__tests__/filters-dialog.test.tsx`

- [ ] **Step 7.1: Esqueleto do Dialog em modo Simples**

Criar `src/components/reports/filters-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Filter, RotateCcw } from "lucide-react";
import {
  Activity,
  AlertCircle,
  Building2,
  Inbox,
  Tag,
  User,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { MultiSelectCheckbox } from "@/components/ui/multi-select-checkbox";
import {
  EMPTY_FILTER_STATE,
  diffFilterStates,
  isFilterStateEqual,
  type FilterState,
} from "@/lib/reports/filter-state";
import type { MetaItem } from "@/lib/chatwoot/queries/meta-cache";
import { STATUS_OPTIONS as STATUS_BADGE_OPTIONS } from "./status-badge";

const STATUS_OPTIONS: MetaItem[] = STATUS_BADGE_OPTIONS.map((o) => ({
  id: o.value,
  name: o.label,
}));

const PRIORITY_OPTIONS: MetaItem[] = [
  { id: 0, name: "Urgente" },
  { id: 1, name: "Alta" },
  { id: 2, name: "Média" },
  { id: 3, name: "Baixa" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applied: FilterState;
  onApply: (next: FilterState) => void;
  onClear: () => void;
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  labels: MetaItem[];
}

export function FiltersDialog({
  open,
  onOpenChange,
  applied,
  onApply,
  onClear,
  inboxes,
  teams,
  assignees,
  labels,
}: Props) {
  const [draft, setDraft] = useState<FilterState>(applied);

  useEffect(() => {
    if (open) setDraft(applied);
  }, [open, applied]);

  const isDirty = !isFilterStateEqual(draft, applied);
  const isEmpty = isFilterStateEqual(draft, EMPTY_FILTER_STATE);
  const pending = diffFilterStates(draft, applied);

  function update<K extends keyof FilterState>(k: K, v: FilterState[K]) {
    setDraft((p) => ({ ...p, [k]: v }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[920px]">
        <DialogTitle>Filtros avançados</DialogTitle>
        <DialogDescription className="sr-only">
          Refine a lista de conversas combinando filtros nativos.
        </DialogDescription>

        <div className="space-y-3 py-4">
          <CollapsibleSection
            title="Caixa de entrada"
            count={draft.inboxIds.length}
            defaultOpen={draft.inboxIds.length > 0}
            icon={<Inbox className="h-4 w-4 text-muted-foreground" aria-hidden />}
          >
            <MultiSelectCheckbox
              label="Caixa de entrada"
              options={inboxes}
              value={draft.inboxIds}
              onChange={(v) => update("inboxIds", v)}
              emptyLabel="Nenhuma caixa disponível."
              inline
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Departamento"
            count={draft.teamIds.length}
            defaultOpen={draft.teamIds.length > 0}
            icon={<Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />}
          >
            <MultiSelectCheckbox
              label="Departamento"
              options={teams}
              value={draft.teamIds}
              onChange={(v) => update("teamIds", v)}
              emptyLabel="Nenhum departamento disponível."
              inline
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Atendente"
            count={draft.assigneeIds.length}
            defaultOpen={draft.assigneeIds.length > 0}
            icon={<User className="h-4 w-4 text-muted-foreground" aria-hidden />}
          >
            <MultiSelectCheckbox
              label="Atendente"
              options={assignees}
              value={draft.assigneeIds}
              onChange={(v) => update("assigneeIds", v)}
              emptyLabel="Nenhum atendente disponível."
              inline
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Status"
            count={draft.statuses.length}
            defaultOpen={draft.statuses.length > 0}
            icon={<Activity className="h-4 w-4 text-muted-foreground" aria-hidden />}
          >
            <MultiSelectCheckbox
              label="Status"
              options={STATUS_OPTIONS}
              value={draft.statuses}
              onChange={(v) => update("statuses", v)}
              inline
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Prioridade"
            count={draft.priorities.length}
            defaultOpen={draft.priorities.length > 0}
            icon={<AlertCircle className="h-4 w-4 text-muted-foreground" aria-hidden />}
          >
            <MultiSelectCheckbox
              label="Prioridade"
              options={PRIORITY_OPTIONS}
              value={draft.priorities}
              onChange={(v) => update("priorities", v)}
              inline
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Etiquetas"
            count={draft.labelIds.length}
            defaultOpen={draft.labelIds.length > 0}
            icon={<Tag className="h-4 w-4 text-muted-foreground" aria-hidden />}
          >
            <MultiSelectCheckbox
              label="Etiquetas"
              options={labels}
              value={draft.labelIds}
              onChange={(v) => update("labelIds", v)}
              emptyLabel="Nenhuma etiqueta disponível."
              inline
            />
          </CollapsibleSection>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onClear();
              onOpenChange(false);
            }}
            disabled={isEmpty}
            aria-label="Limpar todos os filtros"
          >
            <RotateCcw aria-hidden="true" />
            Limpar todos
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onApply(draft);
                onOpenChange(false);
              }}
              disabled={!isDirty}
              aria-label="Aplicar filtros"
            >
              <Filter aria-hidden="true" />
              Aplicar{pending > 0 ? ` (${pending})` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FiltersDialog;
```

- [ ] **Step 7.2: Teste de integração**

`src/components/reports/__tests__/filters-dialog.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { FiltersDialog } from "../filters-dialog";
import { EMPTY_FILTER_STATE } from "@/lib/reports/filter-state";

describe("FiltersDialog (modo simples)", () => {
  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
    applied: EMPTY_FILTER_STATE,
    onApply: jest.fn(),
    onClear: jest.fn(),
    inboxes: [{ id: 1, name: "Geral" }],
    teams: [],
    assignees: [],
    labels: [{ id: 5, name: "VIP" }],
  };

  beforeEach(() => jest.clearAllMocks());

  test("renderiza grupos incluindo Etiquetas", () => {
    render(<FiltersDialog {...defaultProps} />);
    expect(screen.getByText("Etiquetas")).toBeInTheDocument();
  });

  test("Aplicar dispara onApply com draft + fecha", () => {
    render(<FiltersDialog {...defaultProps} />);
    // ainda sem mudanças → desabilitado; aplica via keyboard test:
    const applyBtn = screen.getByRole("button", { name: /aplicar filtros/i });
    expect(applyBtn).toBeDisabled();
  });

  test("Cancelar fecha sem aplicar", () => {
    render(<FiltersDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    expect(defaultProps.onApply).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7.3: Run tests**

```bash
npx jest src/components/reports/__tests__/filters-dialog.test.tsx
npm run typecheck
```
Expected: PASS / 0 erros.

- [ ] **Step 7.4: Commit**

```bash
git add src/components/reports/filters-dialog.tsx src/components/reports/__tests__/filters-dialog.test.tsx
git commit -m "feat(filters-dialog): Dialog centralizado modo Simples + Etiquetas"
```

---

### Task 8: `<FiltersDialog>` — Modo Avançado (query builder com `<ConditionalFilters>`)

**Files:**
- Modify: `src/components/reports/filters-dialog.tsx`
- Modify: `src/components/ui/conditional-filters.tsx` (adicionar campos novos)

- [ ] **Step 8.1: Definir lista de campos do query builder**

Em `src/components/reports/filters-dialog.tsx`, adicionar:

```tsx
import {
  ConditionalFilters,
  type ConditionFieldDef,
} from "@/components/ui/conditional-filters";

// Helper: monta campos baseados nos metadados disponíveis
function buildFields({
  inboxes,
  teams,
  assignees,
  labels,
}: {
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  labels: MetaItem[];
}): ConditionFieldDef[] {
  return [
    {
      key: "inbox.id",
      label: "Caixa de entrada",
      type: "multi_select",
      options: inboxes.map((i) => ({ value: i.id, label: i.name })),
    },
    {
      key: "team.id",
      label: "Departamento",
      type: "multi_select",
      options: teams.map((t) => ({ value: t.id, label: t.name })),
    },
    {
      key: "assignee.id",
      label: "Atendente",
      type: "multi_select",
      options: assignees.map((a) => ({ value: a.id, label: a.name })),
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: 0, label: "Aberta" },
        { value: 1, label: "Resolvida" },
        { value: 2, label: "Pendente" },
        { value: 3, label: "Adiada" },
      ],
    },
    {
      key: "priority",
      label: "Prioridade",
      type: "select",
      options: [
        { value: 0, label: "Urgente" },
        { value: 1, label: "Alta" },
        { value: 2, label: "Média" },
        { value: 3, label: "Baixa" },
      ],
    },
    {
      key: "labels",
      label: "Etiquetas",
      type: "multi_select",
      options: labels.map((l) => ({ value: l.id, label: l.name })),
    },
    {
      key: "waiting_seconds",
      label: "Tempo sem resposta (s)",
      type: "number",
    },
    {
      key: "open_seconds",
      label: "Tempo aberta (s)",
      type: "number",
    },
    {
      key: "contact.name",
      label: "Nome do contato",
      type: "string",
    },
    {
      key: "contact.phone_number",
      label: "WhatsApp",
      type: "string",
    },
  ];
}
```

- [ ] **Step 8.2: Adicionar tabs Simples / Avançado dentro do Dialog**

Trocar o body do Dialog para um componente `<Tabs>` (já existe em `src/components/ui/tabs.tsx`):

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// Dentro do <DialogContent>, substituir o `<div className="space-y-3 py-4">`:
<Tabs
  value={draft.mode}
  onValueChange={(v) => update("mode", v as "simple" | "advanced")}
  className="py-4"
>
  <TabsList>
    <TabsTrigger value="simple">Simples</TabsTrigger>
    <TabsTrigger value="advanced">Avançado</TabsTrigger>
  </TabsList>

  <TabsContent value="simple" className="space-y-3 mt-3">
    {/* CollapsibleSections do Step 7.1 */}
  </TabsContent>

  <TabsContent value="advanced" className="mt-3">
    <ConditionalFilters
      fields={buildFields({ inboxes, teams, assignees, labels })}
      initial={draft.conditionGroup}
      onChange={(g) => update("conditionGroup", g)}
    />
  </TabsContent>
</Tabs>
```

- [ ] **Step 8.3: Atualizar `applyConditions` para `contains_all`**

(Opcional — se cabe no orçamento de tempo da release.) Em `src/lib/utils/apply-conditions.ts`, adicionar operador:

```ts
export type ConditionOperator =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "contains" | "starts_with" | "in" | "not_in"
  | "contains_all"; // NOVO

// Em evaluateCondition, dentro do switch:
case "contains_all": {
  if (!Array.isArray(target) || !Array.isArray(fieldValue)) return false;
  const values = (fieldValue as Array<{ id?: number; name?: string }>).map(
    (v) => v?.id ?? v?.name ?? v,
  );
  return target.every((t) => values.some((v) => v === t || String(v) === String(t)));
}
```

E adicionar test em `apply-conditions.test.ts`.

- [ ] **Step 8.4: Aplicação client-side no `<ConversasTable>`**

Em `src/components/reports/conversas-table.tsx`, **antes** do `useMemo` de `sortedRows` (linha 644), adicionar:

```tsx
import { applyConditions } from "@/lib/utils/apply-conditions";

// dentro do componente, antes do `sortedRows`:
const filteredRows = useMemo(() => {
  if (!filters.conditionGroup || !filters.conditionGroup.conditions?.length) {
    return rows;
  }
  return applyConditions(rows, filters.conditionGroup);
}, [rows, filters.conditionGroup]);

// e o sortedRows passa a usar filteredRows
const sortedRows = useMemo(() => {
  if (sortStack.length === 0) return filteredRows;
  // ... resto igual, trocando `rows.map` por `filteredRows.map`
}, [filteredRows, sortStack, allColumns]);
```

A prop `filters` precisa expor `conditionGroup` — passar do server component através de `<AdvancedFilters>` → `<ConversasTable>`.

- [ ] **Step 8.5: Run tests + typecheck**

```bash
npx jest src/components/reports/__tests__/filters-dialog.test.tsx
npm run typecheck
```
Expected: PASS.

- [ ] **Step 8.6: Commit**

```bash
git add src/components/reports/filters-dialog.tsx \
        src/components/ui/conditional-filters.tsx \
        src/lib/utils/apply-conditions.ts \
        src/lib/utils/__tests__/apply-conditions.test.ts \
        src/components/reports/conversas-table.tsx
git commit -m "feat(filters-dialog): modo Avançado com query builder E/OU"
```

---

### Task 9: `<SortingDialog>` — painel de ordenação em cadeia

**Files:**
- Create: `src/components/reports/sorting-dialog.tsx`
- Test: `src/components/reports/__tests__/sorting-dialog.test.tsx`

- [ ] **Step 9.1: Criar componente**

`src/components/reports/sorting-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";

export interface SortRuleOption {
  key: string;
  label: string;
}

export interface SortRule {
  key: string;
  direction: "asc" | "desc";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applied: SortRule[];
  options: SortRuleOption[];
  onApply: (next: SortRule[]) => void;
  onClear: () => void;
}

export function SortingDialog({
  open,
  onOpenChange,
  applied,
  options,
  onApply,
  onClear,
}: Props) {
  const [draft, setDraft] = useState<SortRule[]>(applied);

  useEffect(() => {
    if (open) setDraft(applied);
  }, [open, applied]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const usedKeys = new Set(draft.map((d) => d.key));
  const available = options.filter((o) => !usedKeys.has(o.key));

  const move = (idx: number, delta: -1 | 1) => {
    const next = [...draft];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    setDraft(next);
  };

  const removeRule = (idx: number) => {
    setDraft((p) => p.filter((_, i) => i !== idx));
  };

  const addRule = () => {
    if (!available[0]) return;
    setDraft((p) => [...p, { key: available[0]!.key, direction: "asc" }]);
  };

  const setKey = (idx: number, key: string) => {
    setDraft((p) =>
      p.map((rule, i) => (i === idx ? { ...rule, key } : rule)),
    );
  };

  const toggleDir = (idx: number) => {
    setDraft((p) =>
      p.map((rule, i) =>
        i === idx
          ? { ...rule, direction: rule.direction === "asc" ? "desc" : "asc" }
          : rule,
      ),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogTitle>Ordenação</DialogTitle>
        <DialogDescription className="sr-only">
          Combine múltiplos critérios de ordenação aplicados em sequência.
        </DialogDescription>

        <div className="space-y-3 py-4">
          {draft.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum critério aplicado. Adicione um critério para ordenar a
              tabela.
            </p>
          ) : null}

          <ul className="space-y-2">
            {draft.map((rule, idx) => {
              const fieldOptions = options.map((o) => ({
                value: o.key,
                label: o.label,
              }));
              return (
                <li
                  key={`${rule.key}-${idx}`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary tabular-nums">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <CustomSelect
                      value={rule.key}
                      onChange={(k) => setKey(idx, k)}
                      options={fieldOptions}
                      triggerClassName="h-9 text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    variant={rule.direction === "asc" ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleDir(idx)}
                    aria-label={`Direção ${rule.direction === "asc" ? "ascendente" : "descendente"}`}
                  >
                    {rule.direction === "asc" ? (
                      <ArrowUp aria-hidden />
                    ) : (
                      <ArrowDown aria-hidden />
                    )}
                  </Button>
                  <div className="inline-flex flex-col">
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      aria-label="Mover para cima"
                      className="rounded-md px-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={idx === draft.length - 1}
                      aria-label="Mover para baixo"
                      className="rounded-md px-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRule(idx)}
                    aria-label="Remover critério"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRule}
            disabled={available.length === 0}
          >
            <Plus aria-hidden />
            Adicionar critério
          </Button>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onClear();
              onOpenChange(false);
            }}
            disabled={applied.length === 0 && draft.length === 0}
          >
            Limpar
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onApply(draft);
                onOpenChange(false);
              }}
              disabled={!isDirty}
            >
              <ArrowUpDown aria-hidden />
              Aplicar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SortingDialog;
```

- [ ] **Step 9.2: Teste de integração**

`src/components/reports/__tests__/sorting-dialog.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { SortingDialog } from "../sorting-dialog";

const options = [
  { key: "name", label: "Nome" },
  { key: "status", label: "Status" },
  { key: "waiting_seconds", label: "Sem resposta há" },
];

describe("SortingDialog", () => {
  test("Adicionar critério inclui novo item", () => {
    const onApply = jest.fn();
    render(
      <SortingDialog
        open
        onOpenChange={jest.fn()}
        applied={[]}
        options={options}
        onApply={onApply}
        onClear={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /adicionar critério/i }));
    fireEvent.click(screen.getByRole("button", { name: /aplicar/i }));
    expect(onApply).toHaveBeenCalledWith([
      { key: "name", direction: "asc" },
    ]);
  });

  test("Limpar dispara onClear", () => {
    const onClear = jest.fn();
    render(
      <SortingDialog
        open
        onOpenChange={jest.fn()}
        applied={[{ key: "name", direction: "asc" }]}
        options={options}
        onApply={jest.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(onClear).toHaveBeenCalled();
  });
});
```

- [ ] **Step 9.3: Run tests + typecheck**

```bash
npx jest src/components/reports/__tests__/sorting-dialog.test.tsx
npm run typecheck
```
Expected: PASS.

- [ ] **Step 9.4: Commit**

```bash
git add src/components/reports/sorting-dialog.tsx \
        src/components/reports/__tests__/sorting-dialog.test.tsx
git commit -m "feat(sorting-dialog): painel de ordenação em cadeia com Apply"
```

---

### Task 10: Drill-down inline na tabela

**Files:**
- Create: `src/components/reports/conversa-drill-down.tsx`
- Modify: `src/components/reports/conversas-table.tsx` (adicionar trigger + linha extra)
- Test: `src/components/reports/__tests__/conversa-drill-down.test.tsx`

- [ ] **Step 10.1: Criar `<ConversaDrillDown>`**

`src/components/reports/conversa-drill-down.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LabelsChips } from "@/components/reports/labels-chips";
import { OpenInChatwoot } from "@/components/reports/open-in-chatwoot";
import { formatPhone } from "@/lib/utils/format-phone";
import { detectDocument } from "@/lib/utils/format-document";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const MAX_VISIBLE_ATTRS = 30;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "—";
  }
}

interface Props {
  row: ConversaRow;
  accountId: number;
}

export function ConversaDrillDown({ row, accountId }: Props) {
  const phone = row.contact.phone_number
    ? formatPhone(row.contact.phone_number) || row.contact.phone_number
    : "—";
  const doc = detectDocument({
    identifier: row.contact.identifier,
    additional_attributes: row.contact.additional_attributes,
  });
  const docDisplay = doc?.formatted ?? "—";

  const attrs = row.custom_attributes ?? {};
  const entries = Object.entries(attrs).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, MAX_VISIBLE_ATTRS);
  const hidden = entries.length - visible.length;

  return (
    <div
      role="region"
      aria-label={`Detalhes da conversa ${row.display_id}`}
      className="space-y-4 rounded-lg bg-muted/30 p-4 text-[13px]"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Contato
          </h4>
          <dl className="space-y-1">
            <Row label="Nome" value={row.contact.name ?? "—"} />
            <Row label="WhatsApp" value={phone} mono />
            <Row label="Documento" value={docDisplay} mono />
          </dl>
        </div>

        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tempos
          </h4>
          <dl className="space-y-1">
            <Row label="Criada em" value={formatDateTime(row.created_at)} />
            <Row
              label="Última atividade"
              value={formatDateTime(row.last_activity_at)}
            />
          </dl>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Etiquetas
        </h4>
        {row.labels.length > 0 ? (
          <LabelsChips labels={row.labels} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Atributos ({entries.length})
        </h4>
        {visible.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <ul className="grid gap-1 md:grid-cols-2">
            {visible.map(([k, v]) => {
              const raw =
                typeof v === "string" || typeof v === "number" || typeof v === "boolean"
                  ? String(v)
                  : JSON.stringify(v);
              return (
                <li
                  key={k}
                  className="flex items-baseline gap-2 break-all rounded-md border border-border/30 bg-card px-2 py-1"
                >
                  <span className="text-[11px] font-medium text-muted-foreground/80">
                    {k}:
                  </span>
                  <span className="text-[13px] text-foreground/90">{raw}</span>
                </li>
              );
            })}
          </ul>
        )}
        {hidden > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(true)}
            className="mt-2"
          >
            Ver mais ({hidden})
          </Button>
        ) : null}
      </div>

      <div className="flex justify-end border-t border-border pt-3">
        <OpenInChatwoot accountId={accountId} displayId={row.display_id} />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-32 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("text-[13px] text-foreground/90", mono && "font-mono tabular-nums")}>
        {value}
      </dd>
    </div>
  );
}
```

- [ ] **Step 10.2: Adicionar drill-down na tabela**

Em `src/components/reports/conversas-table.tsx`:

1. Adicionar imports e state:

```tsx
import { ChevronRight } from "lucide-react";
import { ConversaDrillDown } from "@/components/reports/conversa-drill-down";

// dentro do componente, junto com outros useState:
const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

const toggleExpand = useCallback((id: number) => {
  setExpandedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}, []);
```

2. Adicionar coluna chevron como **primeira coluna** em `COLUMNS`:

```tsx
const COLUMNS: ColumnDef[] = [
  {
    key: "expand",
    label: "",
    defaultVisible: true,
    defaultOrder: -1, // antes de tudo
    sortable: false,
    className: "w-10",
    render: () => null, // render real fica no body
  },
  // ... resto
];
```

3. Atualizar `defaultVisible: false` para `phone`, `document`, `labels`, `custom_attributes`, `created_at`, `last_activity_at`. Eles continuam disponíveis via ColumnsToggle.

4. No `<TableBody>`, substituir o map atual por:

```tsx
{sortedRows.map((row, idx) => {
  const expanded = expandedIds.has(row.id);
  return (
    <Fragment key={row.id}>
      <TableRow
        className={cn(
          "cursor-pointer hover:bg-muted/30 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150",
          expanded && "bg-muted/40",
        )}
        style={{ animationDelay: `${Math.min(idx, 16) * 15}ms` }}
        onClick={() => toggleExpand(row.id)}
        aria-expanded={expanded}
      >
        {orderedColumns.map((col) => {
          if (col.key === "expand") {
            return (
              <TableCell key="expand" className="w-10">
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    expanded && "rotate-90 text-primary",
                  )}
                />
              </TableCell>
            );
          }
          return (
            <TableCell
              key={col.key}
              className={cn(
                col.align === "right" && "text-right",
                col.align === "center" && "text-center",
              )}
              data-tour={
                col.key === "actions" && idx === 0 ? "open-action" : undefined
              }
            >
              {col.render(row)}
            </TableCell>
          );
        })}
      </TableRow>
      {expanded ? (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={orderedColumns.length} className="p-0">
            <ConversaDrillDown row={row} accountId={accountId} />
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  );
})}
```

(Lembrar de `import { Fragment } from "react"`.)

5. Mobile cards: adicionar trigger drill-down equivalente.

- [ ] **Step 10.3: Teste**

`src/components/reports/__tests__/conversa-drill-down.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { ConversaDrillDown } from "../conversa-drill-down";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const baseRow: ConversaRow = {
  id: 1,
  display_id: 8653,
  contact: {
    id: 1,
    name: "Fernando T.",
    phone_number: "+5531999845112",
    identifier: null,
    additional_attributes: null,
  },
  inbox: { id: 1, name: "Geral" },
  team: { id: null, name: null },
  assignee: { id: null, name: null },
  status: 0,
  priority: 1,
  created_at: "2026-04-23T14:32:00Z",
  last_activity_at: "2026-04-28T09:15:00Z",
  last_message_type: 0,
  last_message_at: null,
  last_incoming_at: null,
  last_outgoing_at: null,
  custom_attributes: { wpp_id: "553199845112", origem: "campanha" },
  waiting_seconds: 8100,
  open_seconds: null,
  labels: [{ name: "VIP", color: "" }],
};

test("renderiza WhatsApp formatado e atributos completos", () => {
  render(<ConversaDrillDown row={baseRow} accountId={1} />);
  expect(screen.getByText(/Fernando T/i)).toBeInTheDocument();
  expect(screen.getByText("VIP")).toBeInTheDocument();
  expect(screen.getByText(/wpp_id/i)).toBeInTheDocument();
});
```

- [ ] **Step 10.4: Run tests + typecheck**

```bash
npx jest src/components/reports/__tests__/conversa-drill-down.test.tsx
npm run typecheck
```
Expected: PASS.

- [ ] **Step 10.5: Commit**

```bash
git add src/components/reports/conversa-drill-down.tsx \
        src/components/reports/__tests__/conversa-drill-down.test.tsx \
        src/components/reports/conversas-table.tsx
git commit -m "feat(conversas): drill-down inline com WhatsApp/Etiquetas/Atributos completos

Click na linha expande detalhes. Colunas Phone/Doc/Labels/Attrs migram
do default visible para o drill-down — usuário pode reativar via toggle."
```

---

### Task 11: Sticky toolbar + sticky thead (R5)

**Files:**
- Modify: `src/components/reports/advanced-filters.tsx` (toolbar wrapper)
- Modify: `src/components/reports/conversas-table.tsx` (thead position sticky)
- Modify: `src/app/globals.css` (CSS var --toolbar-h, fallback)

- [ ] **Step 11.1: CSS de sticky no toolbar**

Em `src/components/reports/advanced-filters.tsx`, ajustar o `<section>` raiz:

```tsx
<section
  aria-label="Filtros avançados"
  role="toolbar"
  className="sticky top-0 z-[var(--z-toolbar)] -mx-4 space-y-3 border-b border-border/60 bg-card/95 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
  data-toolbar="conversas"
>
```

- [ ] **Step 11.2: Calcular --toolbar-h via ResizeObserver**

Adicionar hook em `src/components/reports/advanced-filters.tsx`:

```tsx
import { useEffect, useRef } from "react";

const sectionRef = useRef<HTMLElement>(null);

useEffect(() => {
  const el = sectionRef.current;
  if (!el) return;
  const ro = new ResizeObserver((entries) => {
    const h = Math.ceil(entries[0]?.contentRect.height ?? 0);
    document.documentElement.style.setProperty("--toolbar-h", `${h}px`);
  });
  ro.observe(el);
  return () => ro.disconnect();
}, []);
```

E adicionar `ref={sectionRef}` no `<section>`.

- [ ] **Step 11.3: Sticky thead na tabela**

Em `conversas-table.tsx` linha ~824 (`<TableHeader>`):

```tsx
<TableHeader
  className="sticky top-[var(--toolbar-h,132px)] z-[var(--z-table-thead)] bg-card"
>
```

- [ ] **Step 11.4: Verificar visualmente**

```bash
npm run dev
```

Abrir `/relatorios/conversas`, rolar — toolbar e header devem permanecer fixos. Testar light + dark.

- [ ] **Step 11.5: Commit**

```bash
git add src/components/reports/advanced-filters.tsx src/components/reports/conversas-table.tsx
git commit -m "feat(conversas): sticky toolbar e header com z-index disciplinado"
```

---

### Task 12: Cabeamento final do `<AdvancedFilters>` aos novos Dialogs

**Files:**
- Modify: `src/components/reports/advanced-filters.tsx`
- Delete: `src/components/reports/filters-drawer.tsx`
- Modify: `src/components/reports/conversas-table.tsx` (toolbar interno deixa de mostrar chip Ordenação — agora vem do componente pai)

- [ ] **Step 12.1: Substituir `<FiltersDrawer>` por `<FiltersDialog>` + `<SortingDialog>`**

Reescrever `src/components/reports/advanced-filters.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Filter, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PeriodPills } from "@/components/reports/period-pills";
import { useFilterTransition } from "@/components/reports/filter-transition";
import { AppliedFiltersChips } from "@/components/reports/applied-filters-chips";
import { FiltersDialog } from "@/components/reports/filters-dialog";
import { SortingDialog, type SortRule } from "@/components/reports/sorting-dialog";
import {
  EMPTY_FILTER_STATE,
  diffFilterStates,
  isFilterStateEqual,
  serializeFilterState,
  type FilterState,
} from "@/lib/reports/filter-state";
import type { PeriodKey as CanonicalPeriodKey } from "@/lib/datetime-core";
import {
  isPeriodKey,
  type PeriodKey as ExtendedPeriodKey,
} from "@/lib/reports/period";
import type { MetaItem } from "@/lib/chatwoot/queries/meta-cache";

export type { MetaItem };

const SORT_OPTIONS = [
  { key: "display_id", label: "#" },
  { key: "name", label: "Nome" },
  { key: "phone", label: "WhatsApp" },
  { key: "inbox", label: "Estado" },
  { key: "team", label: "Departamento" },
  { key: "assignee", label: "Atendente" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Prioridade" },
  { key: "waiting_seconds", label: "Sem resposta há" },
  { key: "open_seconds", label: "Aberta há" },
  { key: "created_at", label: "Criado em" },
  { key: "last_activity_at", label: "Última atualização" },
];

export interface AdvancedFiltersProps {
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  labels: MetaItem[];
  initial: FilterState;
  accountId?: number;
  /** Permite cabear o estado de ordenação ao componente pai (toolbar interno da tabela vai consumir). */
  sortStack: SortRule[];
  onSortStackChange: (next: SortRule[]) => void;
}

export function AdvancedFilters({
  inboxes,
  teams,
  assignees,
  labels,
  initial,
  accountId,
  sortStack,
  onSortStackChange,
}: AdvancedFiltersProps) {
  const router = useRouter();
  const { startTransition } = useFilterTransition();

  const [draft, setDraft] = useState<FilterState>(initial);
  const [applied, setApplied] = useState<FilterState>(initial);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortingOpen, setSortingOpen] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);

  // Calcula --toolbar-h em runtime
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = Math.ceil(entries[0]?.contentRect.height ?? 0);
      document.documentElement.style.setProperty("--toolbar-h", `${h}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pendingDiff = useMemo(() => diffFilterStates(draft, applied), [draft, applied]);
  const hasPending = pendingDiff > 0;

  const appliedCount = useMemo(
    () =>
      applied.inboxIds.length +
      applied.teamIds.length +
      applied.assigneeIds.length +
      applied.statuses.length +
      applied.priorities.length +
      applied.labelIds.length +
      (applied.mode === "advanced" && applied.conditionGroup?.conditions?.length ? 1 : 0),
    [applied],
  );

  const sortCount = sortStack.length;

  const pushUrl = useCallback(
    (state: FilterState) => {
      const qs = serializeFilterState(state).toString();
      startTransition(() => {
        router.push(qs ? `?${qs}` : "?");
      });
    },
    [router, startTransition],
  );

  const handlePeriodChange = useCallback(
    (period: ExtendedPeriodKey, customRange?: { start: string; end: string }) => {
      const canonical: CanonicalPeriodKey = isPeriodKey(period) ? period : "hoje";
      const next: FilterState = {
        ...draft,
        period: canonical,
        customRange: canonical === "custom" ? customRange : undefined,
      };
      setDraft(next);
      setApplied(next);
      pushUrl(next);
    },
    [draft, pushUrl],
  );

  const handleApply = useCallback(() => {
    if (isFilterStateEqual(draft, applied)) return;
    setApplied(draft);
    pushUrl(draft);
  }, [draft, applied, pushUrl]);

  const handleReset = useCallback(() => {
    setDraft(EMPTY_FILTER_STATE);
    setApplied(EMPTY_FILTER_STATE);
    pushUrl(EMPTY_FILTER_STATE);
  }, [pushUrl]);

  const handleDialogApply = useCallback(
    (next: FilterState) => {
      setDraft(next);
      setApplied(next);
      pushUrl(next);
    },
    [pushUrl],
  );

  const handleRemoveGroup = useCallback(
    (key: keyof FilterState) => {
      const next: FilterState = { ...applied };
      switch (key) {
        case "inboxIds": next.inboxIds = []; break;
        case "teamIds": next.teamIds = []; break;
        case "assigneeIds": next.assigneeIds = []; break;
        case "statuses": next.statuses = []; break;
        case "priorities": next.priorities = []; break;
        case "labelIds": next.labelIds = []; break;
        default: return;
      }
      setApplied(next);
      setDraft(next);
      pushUrl(next);
    },
    [applied, pushUrl],
  );

  const updateSearch = (value: string) => {
    setDraft((prev) => ({ ...prev, search: value || undefined }));
  };

  return (
    <section
      ref={sectionRef}
      aria-label="Filtros avançados"
      role="toolbar"
      className="sticky top-0 z-[var(--z-toolbar,30)] space-y-3 border-b border-border/60 bg-card/95 px-1 py-3 backdrop-blur-md"
    >
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Período
        </span>
        <div data-tour="period">
          <PeriodPills
            value={draft.period}
            customRange={draft.customRange}
            onChange={handlePeriodChange}
            accountId={accountId}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div data-tour="search" className="relative min-w-[260px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={draft.search ?? ""}
            onChange={(e) => updateSearch(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleApply();
              }
            }}
            placeholder="Buscar..."
            aria-label="Buscar conversas"
            className="h-10 pl-9"
          />
        </div>

        <Button
          data-tour="filters-chip"
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setFiltersOpen(true)}
          aria-label={`Abrir filtros${appliedCount > 0 ? ` (${appliedCount} aplicados)` : ""}`}
          className={cn(
            "relative h-10 px-4",
            appliedCount > 0 && "border-violet-500/40 text-foreground",
          )}
        >
          <Filter aria-hidden />
          Filtros
          {appliedCount > 0 ? (
            <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 tabular-nums">
              {appliedCount}
            </Badge>
          ) : null}
          {hasPending ? (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card"
            />
          ) : null}
        </Button>

        <Button
          data-tour="sorting-chip"
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSortingOpen(true)}
          aria-label={`Abrir ordenação${sortCount > 0 ? ` (${sortCount} critérios)` : ""}`}
          className={cn(
            "relative h-10 px-4",
            sortCount > 0 && "border-violet-500/40 text-foreground",
          )}
        >
          <ArrowUpDown aria-hidden />
          Ordenação
          {sortCount > 0 ? (
            <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 tabular-nums">
              {sortCount}
            </Badge>
          ) : null}
        </Button>
      </div>

      <AppliedFiltersChips
        meta={{ inboxes, teams, assignees, labels }}
        applied={applied}
        onRemove={handleRemoveGroup}
        onClearAll={handleReset}
      />

      <FiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        applied={applied}
        onApply={handleDialogApply}
        onClear={handleReset}
        inboxes={inboxes}
        teams={teams}
        assignees={assignees}
        labels={labels}
      />

      <SortingDialog
        open={sortingOpen}
        onOpenChange={setSortingOpen}
        applied={sortStack}
        options={SORT_OPTIONS}
        onApply={onSortStackChange}
        onClear={() => onSortStackChange([])}
      />
    </section>
  );
}
```

- [ ] **Step 12.2: Atualizar `applied-filters-chips.tsx`**

Adicionar suporte para `labelIds` e renomear copy para "Etiquetas". Adicionar prop `meta.labels`. Linha de chip:

```tsx
{applied.labelIds.length > 0 ? (
  <Chip
    label={`Etiquetas (${applied.labelIds.length})`}
    onRemove={() => onRemove("labelIds")}
  />
) : null}
```

- [ ] **Step 12.3: Cabear `sortStack` da tabela ao toolbar**

Em `<ConversasTable>`, expor o `sortStack` para o pai via callback prop `onSortStackChange`. Em `<ConversasPage>`, levantar o estado:

```tsx
// Em src/app/(protected)/relatorios/conversas/page.tsx é Server Component — não pode hostear state.
// Solução: criar um "ClientWrapper" em src/components/reports/conversas-page-client.tsx
// que recebe initialRows + props e cabeia state entre <AdvancedFilters> e <ConversasTable>.
```

Criar `src/components/reports/conversas-page-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { AdvancedFilters } from "@/components/reports/advanced-filters";
import { ConversasTable } from "@/components/reports/conversas-table";
import { ContentLoadingWrapper } from "@/components/reports/content-loading-wrapper";
import type { SortRule } from "@/components/reports/sorting-dialog";
import type { FilterState } from "@/lib/reports/filter-state";
import type { MetaItem } from "@/lib/chatwoot/queries/meta-cache";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import type { FetchConversasInput } from "@/lib/actions/reports/conversas";
import {
  useLocalStorageState,
} from "@/lib/hooks/use-local-storage-state";

const STORAGE_SORT = "conversas-table-sort";

interface Props {
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  labels: MetaItem[];
  filterState: FilterState;
  accountId: number;
  initialRows: ConversaRow[];
  initialCursor: string | null;
  reportFilters: FetchConversasInput["filters"];
}

export function ConversasPageClient({
  inboxes,
  teams,
  assignees,
  labels,
  filterState,
  accountId,
  initialRows,
  initialCursor,
  reportFilters,
}: Props) {
  const [sortStack, setSortStack] = useLocalStorageState<SortRule[]>(STORAGE_SORT, []);

  return (
    <>
      <div data-tour="filters">
        <AdvancedFilters
          inboxes={inboxes}
          teams={teams}
          assignees={assignees}
          labels={labels}
          initial={filterState}
          accountId={accountId}
          sortStack={sortStack}
          onSortStackChange={setSortStack}
        />
      </div>

      <ContentLoadingWrapper>
        <div data-tour="table">
          <ConversasTable
            initialRows={initialRows}
            initialCursor={initialCursor}
            accountId={accountId}
            filters={reportFilters}
            sortStack={sortStack}
            onSortStackChange={setSortStack}
          />
        </div>
      </ContentLoadingWrapper>
    </>
  );
}
```

E em `src/app/(protected)/relatorios/conversas/page.tsx`, substituir o JSX de filtros+tabela por `<ConversasPageClient .../>`.

- [ ] **Step 12.4: `<ConversasTable>` aceita `sortStack` controlado via props**

Modificar `ConversasTable` para receber `sortStack` e `onSortStackChange` como props (em vez de usar `useLocalStorageState` interno). Remover STORAGE_SORT do componente. Click no header chama `onSortStackChange` em vez de setSortStack local.

- [ ] **Step 12.5: Deletar drawer antigo**

```bash
git rm src/components/reports/filters-drawer.tsx
```

Verificar que não há nenhum import sobrando:
```bash
grep -rn "filters-drawer\|FiltersDrawer" src/
```
Expected: nenhum match.

- [ ] **Step 12.6: Run tests + typecheck + build**

```bash
npx jest --testPathPattern='reports'
npm run typecheck
npm run build
```
Expected: tudo PASS / 0 erros.

- [ ] **Step 12.7: Commit**

```bash
git add -A
git commit -m "feat(conversas): toolbar com Filtros + Ordenação centralizados, sticky, cabeado entre filtros e tabela"
```

---

## Onda 4 — Bug fixes (R10)

### Task 13: Fix `<CustomSelect>` race click outside

**Files:**
- Modify: `src/components/ui/custom-select.tsx`

- [ ] **Step 13.1: Substituir handler manual por base-ui Popover**

Reescrever `src/components/ui/custom-select.tsx` baseado no padrão do `<PeriodPills>` (já usa Popover correto):

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Selecionar",
  className,
  triggerClassName,
  icon,
  disabled = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground cursor-pointer transition-all duration-200 hover:border-muted-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed",
              triggerClassName,
              className,
            )}
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span className="flex items-center gap-2 truncate">
              {icon}
              {selected?.icon}
              {selected?.label ?? placeholder}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ml-2",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        }
      />
      <PopoverContent
        align="start"
        sideOffset={4}
        className="z-[var(--z-modal,100)] w-[min(320px,var(--popover-trigger-width))] overflow-hidden rounded-lg border border-border bg-popover p-0 shadow-xl"
      >
        <ul role="listbox">
          {options.map((option) => (
            <li key={option.value} role="option" aria-selected={value === option.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-2.5 text-left cursor-pointer transition-all duration-200 hover:bg-accent",
                  value === option.value && "bg-accent/50",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                    {option.icon ? <span className="shrink-0">{option.icon}</span> : null}
                  </div>
                  {option.description ? (
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {option.description}
                    </span>
                  ) : null}
                </div>
                {value === option.value ? (
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 13.2: Verificar consumidores**

```bash
grep -rn "renderTrigger" src/ | grep CustomSelect
```
Se houver chamada com `renderTrigger`, atualizar. (Spec antiga oferecia essa prop; manter compat se necessário ou inlinar via composition.)

- [ ] **Step 13.3: Run tests**

```bash
npm run typecheck
npm run build
```

Smoke manual: `/relatorios/conversas` → mudar page size 50→100→Todos várias vezes. Esperado: sempre responde.

- [ ] **Step 13.4: Commit**

```bash
git add src/components/ui/custom-select.tsx
git commit -m "fix(custom-select): substitui handler click-outside manual por Popover base-ui

Elimina race em que o trigger era detectado como 'outside' antes do
state setter propagar, causando dropdown que precisava de 2 clicks."
```

---

### Task 14: Fix `<PeriodPills>` race no calendário

**Files:**
- Modify: `src/components/reports/period-pills.tsx`

- [ ] **Step 14.1: Investigar key invalidante**

Em `period-pills.tsx` linha 102: `key={`${initialRange?.start ?? ""}-${initialRange?.end ?? ""}`}` — sempre que o range muda, o panel remonta. Isso pode estar causando o primeiro click após open ser perdido.

**Fix**: usar `key={open ? "panel" : "off"}` para garantir que o panel só remonta na transição open=false→true, não em cada update do range.

```tsx
const panel = open ? (
  <PickerPanel
    key={`panel-${open ? 1 : 0}`} // só muda em transições de abertura
    initialRange={initialRange}
    // ... resto igual
  />
) : null;
```

- [ ] **Step 14.2: Garantir que `<PickerPanel>` não re-faz fetch a cada render**

`getMinReportDate` é chamado em `useEffect` quando `pickerOpen && !minDate && accountId`. Está OK — só busca uma vez por sessão.

- [ ] **Step 14.3: Smoke manual**

```bash
npm run dev
```

`/relatorios/conversas` → click em "Personalizado" → calendário abre → click num dia → calendário responde no primeiro click. Repetir várias vezes.

- [ ] **Step 14.4: Commit**

```bash
git add src/components/reports/period-pills.tsx
git commit -m "fix(period-pills): key estável no PickerPanel evita remount em cada render"
```

---

## Onda 5 — Polimento (R11 + Tour)

### Task 15: Atualizar tour + skip link a11y

**Files:**
- Modify: `src/lib/tours/conversas-tour.ts`
- Modify: `src/app/(protected)/relatorios/conversas/page.tsx` (skip link)

- [ ] **Step 15.1: Adicionar etapas do tour para Filtros e Ordenação separados + Drill-down**

Em `src/lib/tours/conversas-tour.ts`, ler a versão atual e:
- Trocar passo "filtros-chip" para apontar para o botão Filtros novo (mesmo data-tour).
- Adicionar passo `data-tour="sorting-chip"` cobrindo o novo botão Ordenação.
- Adicionar passo `data-tour="drill-down"` na primeira chevron-cell da tabela (`data-tour="drill-down"` setado no `<ChevronRight>` da primeira linha).
- Atualizar copy: "Use o botão **Filtros** para combinar regras E/OU. Click no painel de **Ordenação** para combinar critérios em sequência."

- [ ] **Step 15.2: Skip link no page**

Em `page.tsx`, adicionar antes do `<PageShell>`:

```tsx
<a
  href="#conversas-table"
  className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
>
  Pular para a tabela de conversas
</a>
```

E em `<ConversasTable>`, adicionar `id="conversas-table"` no container raiz.

- [ ] **Step 15.3: Commit**

```bash
git add src/lib/tours/conversas-tour.ts src/app/\(protected\)/relatorios/conversas/page.tsx
git commit -m "feat(a11y): tour atualizado + skip link para tabela de conversas"
```

---

## Onda 6 — Versão e release

### Task 16: Bump v0.7.0 → v0.8.0 + CHANGELOG + STATUS + memória

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `STATUS.md`
- Memory: criar `project_v0.8.0_release.md` em `~/.claude/projects/.../memory/`

- [ ] **Step 16.1: Bump version**

Em `package.json`:
```json
"version": "0.8.0"
```

- [ ] **Step 16.2: CHANGELOG entry**

Adicionar no topo de `CHANGELOG.md`:

```markdown
## [v0.8.0] 2026-04-30 — Conversas Poderoso

> Redesign completo da tela `/relatorios/conversas`: query builder com E/OU em grupos, painel de ordenação em cadeia, drill-down inline expansível, sticky toolbar+header, fix de bugs críticos de UX e ordenação.

### Adicionado
- **`<FiltersDialog>` centralizado** — substitui `<FiltersDrawer>`. Modos Simples (paridade com drawer atual + Etiquetas) e Avançado (query builder com E/OU em grupos, 9 campos, 10 operadores).
- **`<SortingDialog>`** — painel de ordenação em cadeia com lista ordenável (↑/↓), Asc/Desc, Adicionar/Remover critério, Aplicar/Limpar.
- **Drill-down inline na tabela** — chevron na primeira coluna; click expande linha mostrando WhatsApp, Documento, Etiquetas full, Atributos completos (até 30, com Ver mais), Tempos e ação Abrir no Chatwoot. Colunas Phone/Doc/Labels/Attrs/Created/LastActivity migradas para o detalhe (toggle continua disponível).
- **Sticky toolbar + sticky thead** — toolbar (filtros/busca/ordenação/chips) e cabeçalho da tabela ficam fixos durante scroll, com z-index disciplinado.
- **Filtro por Etiquetas** — `getLabels(accountId)` em meta-cache; novo grupo "Etiquetas" no FiltersDialog; serializado em URL como `label=`.
- **Tipografia +1 step** — root html bumpado de 16px → 16.25px (≥ 1280px = 16.5px); promoção de `text-xs`→`text-[13px]` em valores tabulares; `text-[10px]`→`text-[11px]` em labels secundárias.
- **Skip link a11y** — "Pular para a tabela de conversas" para usuários de teclado.
- **Tour atualizado** — 11 etapas cobrindo CTAs Filtros e Ordenação separados + drill-down.

### Mudou
- **Status no feminino**: "Em aberto" → **Aberta** (amber, mantido); "Resolvida" → **Resolvida** com cor **azul claro (sky)** (era emerald); "Pendente" mantido (violet); "Adiado" → **Adiada** com cor **cinza claro (slate)** (era zinc).
- **Coluna "Labels" → "Etiquetas"** em toda a UI (interno mantém `labels` por compat).
- **`FilterState`** estende com `labelIds`, `mode: simple|advanced`, `conditionGroup` (serializado em base64url no param `cg`, cap 4kB).
- **`<ConversasTable>`** passa a receber `sortStack`/`onSortStackChange` controlados pelo cliente da página (`<ConversasPageClient>`).

### Corrigido
- **Bug ordenação null** — `nullableNumberCompare` agora trata null como **valor mínimo** simétrico (asc: null primeiro; desc: null último). Antes ia sempre pro fim em asc, contradizendo a semântica de "tracinho = sem dado = melhor estado" em `waiting_seconds`/`open_seconds`/`priority`. Extraído para `src/lib/utils/null-compare.ts` com testes.
- **`<CustomSelect>` intermitente** — substituído handler `mousedown` manual por `Popover` da base-ui. Elimina race em que o próprio click no trigger era detectado como "click outside" antes do state setter propagar (causava dropdown precisar de 2 clicks).
- **`<PeriodPills>` calendário não responde no primeiro click** — `key` do `<PickerPanel>` estabilizada (não remonta em cada render quando range muda).

### Removido
- `<FiltersDrawer>` (substituído por `<FiltersDialog>`).

🤖 Implementado em modo autônomo total — Claude Opus 4.7
```

- [ ] **Step 16.3: STATUS.md**

Adicionar no topo (ou substituir versão atual):

```markdown
# STATUS — Nexus Insights

**Versão atual em produção:** v0.8.0 (Conversas Poderoso) — 2026-04-30
**Ambiente:** Hostinger VPS via Portainer + Docker, Traefik reverse proxy, Postgres + Redis dedicados.

## Última release

v0.8.0 entregou redesign completo da tela `/relatorios/conversas`:
- Query builder centralizado com E/OU em grupos
- Painel de ordenação em cadeia com Apply
- Drill-down inline expansível
- Sticky toolbar + sticky header
- Status no feminino + cores ajustadas (Aberta/Resolvida/Pendente/Adiada)
- Filtro por Etiquetas
- Tipografia +1 step (legibilidade)
- Fix bugs críticos: ordenação null como mínimo, CustomSelect race, PeriodPills calendário.
```

- [ ] **Step 16.4: Memória do release**

Criar `~/.claude/projects/-Users-joaovitorzanini-Developer-Claude-Code-Nexus-AI-Clientes-Matrix-Fitness-Group-Relat-rios-de-Atendimento---Nexus-Chat/memory/project_v0.8.0_release.md`:

```markdown
---
name: Release v0.8.0 deployed — Conversas Poderoso
description: v0.8.0 entregou redesign completo de /relatorios/conversas — query builder E/OU, painel ordenação cadeia, drill-down inline, sticky toolbar+thead, status feminino + sky/slate, etiquetas filtráveis, tipografia +1, fix nullableNumberCompare, fix CustomSelect race, fix PeriodPills calendário
type: project
---

v0.8.0 — 2026-04-30 — implementado em modo autônomo (João liberou full autonomy).

**Why:** João apontou tela de Conversas como ruim/disfuncional na v0.7.0 (filtros engessados, ordenação sem painel, atributos com reticências, header não sticky, status no masculino, dropdowns travando, calendário não respondendo, bug na ordenação dos tracinhos). Pediu "incrível, leve, poderoso".

**How to apply:**
- Spec final em `docs/superpowers/specs/2026-04-30-conversas-poderoso-design.md` (12 requisitos R1-R12).
- Plan em `docs/superpowers/plans/2026-04-30-conversas-poderoso.md`.
- Componentes novos: `<FiltersDialog>`, `<SortingDialog>`, `<ConversaDrillDown>`, `<ConversasPageClient>`.
- Removidos: `<FiltersDrawer>`.
- Bugs fix: `nullableNumberCompare` (null como min, simétrico), `<CustomSelect>` (Popover base-ui), `<PeriodPills>` (key estável).
- Próximas releases: presets/saved views, GroupableTable em Conversas, server-side ConditionGroup quando rows>5k.

**Atual em produção.** Quando João testar, anotar feedback aqui.
```

- [ ] **Step 16.5: Update MEMORY.md**

Adicionar linha no topo de `~/.claude/projects/.../memory/MEMORY.md`:

```markdown
- [Release v0.8.0 deployed](project_v0.8.0_release.md) — Conversas Poderoso (query builder E/OU + painel ordenação + drill-down inline + sticky + fix bugs) — ATUAL EM PRODUÇÃO
```

E **atualizar** a linha do v0.7.0 para tirar "ATUAL EM PRODUÇÃO".

- [ ] **Step 16.6: Build + final tests**

```bash
npm run typecheck
npx jest
npm run build
```
Expected: TUDO PASS.

- [ ] **Step 16.7: Commit final + push**

```bash
git add -A
git commit -m "chore(release): v0.8.0 — Conversas Poderoso

- Spec + Plan completos em docs/superpowers/
- CHANGELOG + STATUS + memory atualizados
- 16 tasks executadas em modo autônomo

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin main
```

- [ ] **Step 16.8: Aguardar GitHub Actions build + deploy via Portainer**

- Verificar `https://github.com/jvzanini/nexus-insights/actions` — workflow build deve ter sucesso.
- No Portainer (Hostinger VPS), na stack `nexus-insights`, fazer "Pull and redeploy" do container `app`.
- Verificar URL produção carregando v0.8.0 (rodapé deve mostrar).

- [ ] **Step 16.9: Smoke manual em produção**

- Abrir `/relatorios/conversas`.
- Verificar: período pills, busca, botões Filtros e Ordenação, sticky ao rolar, drill-down ao clicar linha, status com labels/cores novas, etiquetas filtráveis, ordenação por waiting_seconds asc com tracinhos primeiro.

---

## Self-review (pre-implementação)

### Spec coverage

| R | Tarefa(s) implementadora(s) |
|---|------------------------------|
| R1 — Toolbar reorganizado | Task 12 |
| R2 — FiltersDialog (Simples + Avançado) | Tasks 7, 8 |
| R3 — SortingDialog | Task 9 |
| R4 — Drill-down inline | Task 10 |
| R5 — Sticky toolbar + thead | Task 11 |
| R6 — Fix null compare | Task 1 |
| R7 — Status feminino + cores | Task 2 |
| R8 — Etiquetas filtráveis | Tasks 4, 5, 6 + cabeamento nas Dialogs |
| R9 — Tipografia +1 | Task 3 |
| R10 — Bug fixes UX | Tasks 13, 14 |
| R11 — A11y consolidada | Tasks 9, 10 (aria), 15 (skip link) |
| R12 — Telemetria/testes | Spread em todas (Tasks 1, 2, 5, 7, 9, 10) |

Todos os 12 requisitos têm tasks correspondentes ✓

### Placeholder scan

Sem TBD/TODO/"implement later". Todo step contém código completo ou comando claro ✓

### Type consistency

- `SortRule` definido em `src/components/reports/sorting-dialog.tsx` e reusado em `<AdvancedFilters>` e `<ConversasTable>` ✓
- `FilterState` com `labelIds`, `mode`, `conditionGroup` consistente em filter-state.ts e em todos os consumidores ✓
- `nullableNumberCompare` extraído de inline para `null-compare.ts` — todos os 3 usos em `conversas-table.tsx` apontam para o novo módulo ✓

### Risco residual identificado

- Task 12 envolve refator amplo (`ConversasTable` aceita sortStack como prop em vez de useLocalStorageState interno + criação do `<ConversasPageClient>`). É a maior task. Se travar, pode-se executar em duas tasks (12a: `ConversasPageClient` + cabeamento; 12b: refator de `ConversasTable`).

---

**Plano final.** Pronto para subagent-driven-development.
