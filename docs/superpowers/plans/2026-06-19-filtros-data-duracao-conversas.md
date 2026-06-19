# Filtros de Data e Duração em Conversas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para implementar task-by-task. Tasks de **lógica/backend** podem ir para subagente; tasks marcadas **[UI — inline]** são executadas na sessão principal invocando `ui-ux-pro-max:ui-ux-pro-max` ANTES de codar (regra do projeto: UI nunca delegada a subagente). Steps usam checkbox `- [ ]`.

**Goal:** Adicionar ao relatório de Conversas dois filtros globais — escolha da coluna de data do período (Criado em / Última atualização em) e filtro por duração (Sem resposta há / Aberta há / Parada há) com modo no mínimo/no máximo/entre, valor livre e unidade.

**Architecture:** `dateField` e `durationFilter` viram propriedades globais do `FilterState`, num bloco fixo no topo do modal (fora do mutex de abas). Data é server-side (`ReportFilters.periodColumn`); duração é client-side (helper `matchDuration` no pipeline da tabela e do export), com `stalled_seconds` materializado de `last_activity_at` usando um `serverNow` para alinhar a base temporal.

**Tech Stack:** Next.js 16 (App Router), TypeScript, base-ui, Jest + jest-mock-extended, Tailwind v4, Lucide.

## Global Constraints

- Português brasileiro em toda copy de UI; acentuação correta. Emojis proibidos em UI.
- base-ui usa prop `render`, **nunca** `asChild`.
- Comparação de duração opera sobre **segundos exatos** (não o rótulo arredondado da coluna).
- **Não alterar** os campos `waiting_seconds`/`open_seconds` já existentes no condition-builder (segundos crus) — evita regressão de presets/URLs `cg`.
- Microcopy de modo: **"no mínimo" / "no máximo" / "entre"** — nunca `≥`/`≤`/"até" isolado.
- Unidades exibidas: minuto, hora, dia, **mês (≈30 dias)**, **ano (≈365 dias)**.
- `last_activity_at`/`created_at` são **string ISO** (ou null) na `ConversaRow` — parsear com `Date.parse`.
- Trabalhar direto na `main`; commits atômicos Conventional Commits; antes de push: `npx tsc --noEmit` + `npm test` da área verdes.

---

### Task 1: Tipos e estado de Data/Duração em `filter-state.ts`

**Files:**
- Modify: `src/lib/reports/filter-state.ts`
- Test: `src/lib/reports/__tests__/filter-state.test.ts` (criar se não existir; senão adicionar describe)

**Interfaces:**
- Produces: `type DateField = "created" | "updated"`; `type DurationIndicator = "waiting" | "open" | "stalled"`; `type DurationMode = "gte" | "lte" | "between"`; `type DurationUnit = "minute" | "hour" | "day" | "month" | "year"`; `interface DurationFilter { indicator; mode; value: number; unit: DurationUnit; valueEnd?: number; unitEnd?: DurationUnit }`; `FilterState` ganha `dateField: DateField` e `durationFilter?: DurationFilter`. Params URL: `date`, `dur`.

- [ ] **Step 1: Escrever testes falhando** (`src/lib/reports/__tests__/filter-state.test.ts`)

```ts
import {
  serializeFilterState,
  deserializeFilterState,
  diffFilterStates,
  EMPTY_FILTER_STATE,
  type FilterState,
} from "../filter-state";

const base: FilterState = { ...EMPTY_FILTER_STATE };

describe("dateField", () => {
  it("default é 'updated' e não serializa", () => {
    expect(EMPTY_FILTER_STATE.dateField).toBe("updated");
    expect(serializeFilterState(base).get("date")).toBeNull();
  });
  it("serializa e deserializa 'created'", () => {
    const p = serializeFilterState({ ...base, dateField: "created" });
    expect(p.get("date")).toBe("created");
    expect(deserializeFilterState(p).dateField).toBe("created");
  });
  it("valor inválido cai em 'updated'", () => {
    const p = new URLSearchParams({ date: "xpto" });
    expect(deserializeFilterState(p).dateField).toBe("updated");
  });
});

describe("durationFilter", () => {
  it("round-trip gte", () => {
    const df = { indicator: "waiting", mode: "gte", value: 10, unit: "minute" } as const;
    const p = serializeFilterState({ ...base, durationFilter: df });
    expect(p.get("dur")).toBe("waiting:gte:10:minute");
    expect(deserializeFilterState(p).durationFilter).toEqual(df);
  });
  it("round-trip between com unitEnd", () => {
    const df = { indicator: "open", mode: "between", value: 5, unit: "minute", valueEnd: 1, unitEnd: "hour" } as const;
    const p = serializeFilterState({ ...base, durationFilter: df });
    expect(p.get("dur")).toBe("open:between:5:minute:1:hour");
    expect(deserializeFilterState(p).durationFilter).toEqual(df);
  });
  it("token inválido → undefined", () => {
    expect(deserializeFilterState(new URLSearchParams({ dur: "lixo:xx" })).durationFilter).toBeUndefined();
  });
  it("value <= 0 → undefined", () => {
    expect(deserializeFilterState(new URLSearchParams({ dur: "waiting:gte:0:minute" })).durationFilter).toBeUndefined();
  });
  it("diffFilterStates conta dateField e durationFilter", () => {
    expect(diffFilterStates(base, { ...base, dateField: "created" })).toBe(1);
    const df = { indicator: "stalled", mode: "lte", value: 2, unit: "day" } as const;
    expect(diffFilterStates(base, { ...base, durationFilter: df })).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/reports/__tests__/filter-state.test.ts`
Expected: FAIL (propriedade `dateField` inexistente / `dur` não serializado).

- [ ] **Step 3: Implementar em `filter-state.ts`**

Adicionar tipos após `DocumentTypeFilter` (linha ~19):
```ts
export type DateField = "created" | "updated";
export type DurationIndicator = "waiting" | "open" | "stalled";
export type DurationMode = "gte" | "lte" | "between";
export type DurationUnit = "minute" | "hour" | "day" | "month" | "year";

export interface DurationFilter {
  indicator: DurationIndicator;
  mode: DurationMode;
  value: number;
  unit: DurationUnit;
  valueEnd?: number;
  unitEnd?: DurationUnit;
}

const INDICATORS: readonly DurationIndicator[] = ["waiting", "open", "stalled"];
const MODES: readonly DurationMode[] = ["gte", "lte", "between"];
const UNITS: readonly DurationUnit[] = ["minute", "hour", "day", "month", "year"];

const isInd = (v: string): v is DurationIndicator => (INDICATORS as readonly string[]).includes(v);
const isMode = (v: string): v is DurationMode => (MODES as readonly string[]).includes(v);
const isUnit = (v: string): v is DurationUnit => (UNITS as readonly string[]).includes(v);

function serializeDuration(d: DurationFilter): string | null {
  if (!Number.isFinite(d.value) || d.value <= 0) return null;
  if (d.mode === "between") {
    if (!d.valueEnd || !Number.isFinite(d.valueEnd) || d.valueEnd <= 0) return null;
    return `${d.indicator}:between:${d.value}:${d.unit}:${d.valueEnd}:${d.unitEnd ?? d.unit}`;
  }
  return `${d.indicator}:${d.mode}:${d.value}:${d.unit}`;
}

function parseDuration(raw: string | null): DurationFilter | undefined {
  if (!raw) return undefined;
  const t = raw.split(":");
  if (t.length < 4) return undefined;
  const [ind, mode, valueStr, unit] = t;
  if (!isInd(ind) || !isMode(mode) || !isUnit(unit)) return undefined;
  const value = Number.parseInt(valueStr, 10);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (mode === "between") {
    if (t.length < 6) return undefined;
    const valueEnd = Number.parseInt(t[4], 10);
    const unitEnd = t[5];
    if (!Number.isFinite(valueEnd) || valueEnd <= 0 || !isUnit(unitEnd)) return undefined;
    return { indicator: ind, mode, value, unit, valueEnd, unitEnd };
  }
  return { indicator: ind, mode, value, unit };
}
```

Em `EMPTY_FILTER_STATE` adicionar `dateField: "updated",`.

Em `serializeFilterState`, antes de `return p;`:
```ts
  if (state.dateField === "created") p.set("date", "created");
  if (state.durationFilter) {
    const dur = serializeDuration(state.durationFilter);
    if (dur) p.set("dur", dur);
  }
```

Em `deserializeFilterState`, no objeto de retorno adicionar:
```ts
    dateField: params.get("date") === "created" ? "created" : "updated",
    durationFilter: parseDuration(params.get("dur")),
```

Em `diffFilterStates`, antes de `return diff;`:
```ts
  if (a.dateField !== b.dateField) diff++;
  if (JSON.stringify(a.durationFilter ?? null) !== JSON.stringify(b.durationFilter ?? null)) diff++;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/reports/__tests__/filter-state.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add src/lib/reports/filter-state.ts src/lib/reports/__tests__/filter-state.test.ts
git commit -m "feat(conversas): estado de dateField e durationFilter (serialização + diff)"
```

---

### Task 2: Helper `match-duration.ts`

**Files:**
- Create: `src/lib/reports/match-duration.ts`
- Test: `src/lib/reports/__tests__/match-duration.test.ts`

**Interfaces:**
- Consumes: `DurationFilter`, `DurationUnit` (Task 1); `ConversaRow` (`@/lib/chatwoot/queries/conversas-list`).
- Produces: `UNIT_SECONDS: Record<DurationUnit, number>`; `deriveStalledSeconds(row: ConversaRow, serverNow: number): number | null`; `matchDuration(rows: ConversaRow[], filter: DurationFilter | undefined, serverNow: number): ConversaRow[]`.

- [ ] **Step 1: Escrever testes falhando**

```ts
import { matchDuration, deriveStalledSeconds, UNIT_SECONDS } from "../match-duration";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const NOW = 1_700_000_000_000; // epoch ms fixo
function row(p: Partial<ConversaRow>): ConversaRow {
  return {
    id: 1, display_id: 1,
    contact: { id: 1, name: null, phone_number: null, identifier: null, additional_attributes: null, country: null, estado: null },
    inbox: { id: 1, name: null }, team: { id: null, name: null }, assignee: { id: null, name: null },
    status: 0, priority: null, created_at: null, last_activity_at: null,
    last_message_type: null, last_message_at: null, last_incoming_at: null, last_outgoing_at: null,
    custom_attributes: null, waiting_seconds: null, open_seconds: null, labels: [],
    ...p,
  };
}

describe("UNIT_SECONDS", () => {
  it("mês=30d, ano=365d", () => {
    expect(UNIT_SECONDS.month).toBe(2_592_000);
    expect(UNIT_SECONDS.year).toBe(31_536_000);
  });
});

describe("deriveStalledSeconds", () => {
  it("parseia ISO e calcula contra serverNow", () => {
    const r = row({ last_activity_at: new Date(NOW - 3600_000).toISOString() });
    expect(deriveStalledSeconds(r, NOW)).toBe(3600);
  });
  it("null/inválido → null", () => {
    expect(deriveStalledSeconds(row({ last_activity_at: null }), NOW)).toBeNull();
    expect(deriveStalledSeconds(row({ last_activity_at: "xx" }), NOW)).toBeNull();
  });
});

describe("matchDuration", () => {
  const rows = [
    row({ id: 1, waiting_seconds: 300 }),   // 5 min
    row({ id: 2, waiting_seconds: 1800 }),  // 30 min
    row({ id: 3, waiting_seconds: null }),  // não se aplica
    row({ id: 4, open_seconds: 7200 }),     // 2h
  ];
  it("filtro undefined → rows inalteradas", () => {
    expect(matchDuration(rows, undefined, NOW)).toBe(rows);
  });
  it("waiting gte 10 min → só id 2", () => {
    const r = matchDuration(rows, { indicator: "waiting", mode: "gte", value: 10, unit: "minute" }, NOW);
    expect(r.map((x) => x.id)).toEqual([2]);
  });
  it("waiting lte 10 min → só id 1 (null não passa)", () => {
    const r = matchDuration(rows, { indicator: "waiting", mode: "lte", value: 10, unit: "minute" }, NOW);
    expect(r.map((x) => x.id)).toEqual([1]);
  });
  it("waiting between 5min e 1h (unitEnd) → id 1 e 2", () => {
    const r = matchDuration(rows, { indicator: "waiting", mode: "between", value: 5, unit: "minute", valueEnd: 1, unitEnd: "hour" }, NOW);
    expect(r.map((x) => x.id)).toEqual([1, 2]);
  });
  it("open gte 1h → só id 4", () => {
    const r = matchDuration(rows, { indicator: "open", mode: "gte", value: 1, unit: "hour" }, NOW);
    expect(r.map((x) => x.id)).toEqual([4]);
  });
  it("stalled usa last_activity_at e serverNow", () => {
    const r = [row({ id: 9, last_activity_at: new Date(NOW - 2 * 86400_000).toISOString() })];
    expect(matchDuration(r, { indicator: "stalled", mode: "gte", value: 1, unit: "day" }, NOW).map((x) => x.id)).toEqual([9]);
    expect(matchDuration(r, { indicator: "stalled", mode: "gte", value: 3, unit: "day" }, NOW)).toEqual([]);
  });
  it("value inválido → rows inalteradas", () => {
    expect(matchDuration(rows, { indicator: "waiting", mode: "gte", value: 0, unit: "minute" }, NOW)).toBe(rows);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/reports/__tests__/match-duration.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `match-duration.ts`**

```ts
/**
 * Filtragem client-side de conversas por duração (Sem resposta há / Aberta há /
 * Parada há). Opera sobre segundos EXATOS — a coluna arredonda só para leitura.
 * `stalled_seconds` é derivado de last_activity_at (ISO) usando serverNow para
 * alinhar a base temporal com waiting/open (calculados no servidor).
 */
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import type { DurationFilter, DurationIndicator, DurationUnit } from "./filter-state";

export const UNIT_SECONDS: Record<DurationUnit, number> = {
  minute: 60,
  hour: 3_600,
  day: 86_400,
  month: 2_592_000, // ≈30 dias
  year: 31_536_000, // ≈365 dias
};

export function deriveStalledSeconds(row: ConversaRow, serverNow: number): number | null {
  if (!row.last_activity_at) return null;
  const t = Date.parse(row.last_activity_at);
  if (Number.isNaN(t)) return null;
  return Math.floor((serverNow - t) / 1000);
}

function resolveSeconds(row: ConversaRow, indicator: DurationIndicator, serverNow: number): number | null {
  if (indicator === "waiting") return row.waiting_seconds;
  if (indicator === "open") return row.open_seconds;
  return deriveStalledSeconds(row, serverNow);
}

function isValid(f: DurationFilter): boolean {
  if (!Number.isFinite(f.value) || f.value <= 0) return false;
  if (f.mode === "between" && (!f.valueEnd || !Number.isFinite(f.valueEnd) || f.valueEnd <= 0)) return false;
  return true;
}

export function matchDuration(
  rows: ConversaRow[],
  filter: DurationFilter | undefined,
  serverNow: number,
): ConversaRow[] {
  if (!filter || !isValid(filter)) return rows;
  const a = filter.value * UNIT_SECONDS[filter.unit];
  const b = filter.mode === "between"
    ? (filter.valueEnd ?? 0) * UNIT_SECONDS[filter.unitEnd ?? filter.unit]
    : 0;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return rows.filter((r) => {
    const s = resolveSeconds(r, filter.indicator, serverNow);
    if (s == null) return false;
    if (filter.mode === "gte") return s >= a;
    if (filter.mode === "lte") return s <= a;
    return s >= lo && s <= hi;
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/reports/__tests__/match-duration.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add src/lib/reports/match-duration.ts src/lib/reports/__tests__/match-duration.test.ts
git commit -m "feat(conversas): helper matchDuration + deriveStalledSeconds (segundos exatos)"
```

---

### Task 3: Cabeamento server-side em `page.tsx` (dateField → periodColumn + serverNow)

> **Executar Task 3 + Task 4 como UM único checkpoint** (mesmo subagente, mesmo commit). A Task 3 passa props que só existem no componente após a Task 4; o `tsc`/commit só fecham ao final da Task 4. Não validar/commitar a Task 3 isolada.

**Files:**
- Modify: `src/app/(protected)/relatorios/conversas/page.tsx`

**Interfaces:**
- Consumes: `FilterState.dateField`, `FilterState.durationFilter` (Task 1).
- Produces: prop `serverNow: number` e `durationFilter?: DurationFilter` para `ConversasPageClient`; `ReportFilters.periodColumn` setado.

- [ ] **Step 1: Ler page.tsx e localizar a montagem de `reportFilters` e o render de `<ConversasPageClient>`.**

Run: `npx jest --version >/dev/null; sed -n '40,170p' "src/app/(protected)/relatorios/conversas/page.tsx"` (apenas leitura mental; não há teste unitário de page server component).

- [ ] **Step 2: Adicionar `periodColumn` ao objeto `reportFilters`.**

No objeto `ReportFilters` montado, adicionar a propriedade:
```ts
    periodColumn: filterState.dateField === "created" ? "created" : "active",
```
(Confirma que `import { ... }` de `ReportFilters` já existe; `periodColumn` é campo válido — `src/lib/chatwoot/filters.ts:44`.)

- [ ] **Step 3: Capturar `serverNow` e passar props ao client.**

Antes do return JSX:
```ts
  const serverNow = Date.now();
```
No `<ConversasPageClient ... />` adicionar props:
```tsx
        serverNow={serverNow}
        durationFilter={filterState.durationFilter}
```
(Se `ConversasPageClient` ainda não aceita essas props, isso quebra o tsc — corrigido na Task 4.)

- [ ] **Step 4: Verificação (após Task 4).**

Run: `npx tsc --noEmit`
Expected: PASS depois que Task 4 adiciona as props no componente. Commit conjunto na Task 4.

---

### Task 4: Aplicar `matchDuration` no pipeline da tabela + `title` exato **[UI — inline]**

**Files:**
- Modify: `src/components/reports/conversas-table.tsx`
- Modify: `src/components/reports/conversas-page-client.tsx` (repassar `serverNow`/`durationFilter`)
- Test: `src/components/reports/__tests__/conversas-table-duration.test.tsx` (render mínimo do pipeline) — opcional se já houver harness; senão cobrir via match-duration (Task 2).

**Interfaces:**
- Consumes: `matchDuration`, `deriveStalledSeconds` (Task 2); props `serverNow`, `durationFilter`.
- Produces: pipeline com estágio de duração; props propagadas `ConversasPageClient → ConversasTable`.

- [ ] **Step 1:** Invocar `ui-ux-pro-max:ui-ux-pro-max` (a célula ganha `title`; manter padrão tabular/tones existentes).

- [ ] **Step 2:** Em `conversas-page-client.tsx`, aceitar e repassar `serverNow: number` e `durationFilter?: DurationFilter` até `<ConversasTable>` (e ao `<ExportButton>` na Task 6).

- [ ] **Step 3a (materialização):** Em `conversas-table.tsx`, importar `matchDuration` e `deriveStalledSeconds`. Antes de `searchedRows` (linha ~652), criar `enrichedRows` e **trocar a entrada do pipeline**:
```ts
  const enrichedRows = useMemo(
    () => rows.map((r) => ({ ...r, stalled_seconds: deriveStalledSeconds(r, serverNow) })),
    [rows, serverNow],
  );
```
Trocar `matchSearchClient(rows, searchClient)` → `matchSearchClient(enrichedRows, searchClient)` na linha ~653. Adicionar `stalled_seconds?: number | null` à interface `ConversaRow` (`conversas-list.ts`) — campo opcional client-side; o mapper raw→row não precisa setá-lo.

- [ ] **Step 3b (filtro):** Inserir estágio após `filteredRows` (linha ~679), antes de `sortedRows`:
```ts
  const durationFilteredRows = useMemo(
    () => matchDuration(filteredRows, durationFilter, serverNow),
    [filteredRows, durationFilter, serverNow],
  );
```
E trocar a dep de `sortedRows`/`totalFiltered` de `filteredRows` para `durationFilteredRows`.

- [ ] **Step 4:** No `render` das colunas `waiting_seconds`/`open_seconds` (linhas ~447-487) adicionar `title` com o valor exato. Ex.:
```tsx
        <span title={`${row.waiting_seconds} s`} className={...}>{formatDuration(row.waiting_seconds)}</span>
```
(Idem `open_seconds`.) **Decisão:** não adicionar coluna "Parada há" nova nesta feature (fora de escopo §2 da spec); só `title` nas duas colunas existentes.

- [ ] **Step 5:** Verificar.

Run: `npx tsc --noEmit && npx jest src/components/reports/__tests__/`
Expected: PASS.

- [ ] **Step 6:** Commit (junto com Task 3).

```bash
git add "src/app/(protected)/relatorios/conversas/page.tsx" src/components/reports/conversas-page-client.tsx src/components/reports/conversas-table.tsx src/lib/chatwoot/queries/conversas-list.ts
git commit -m "feat(conversas): aplica filtro de duração no pipeline + dateField→periodColumn + serverNow"
```

---

### Task 5: Export XLSX reflete duração

**Files:**
- Modify: `src/lib/actions/reports/conversas-export.ts`
- Modify: `src/components/reports/export-button.tsx`
- Test: `src/lib/actions/reports/__tests__/conversas-export.test.ts` (se existir harness; senão validar via tsc + e2e)

**Interfaces:**
- Consumes: `matchDuration` (Task 2); `DurationFilter` (Task 1).
- Produces: `ExportConversasInput.durationFilter?: DurationFilter`; prop `durationFilter` em `<ExportButton>`.

- [ ] **Step 1:** Em `conversas-export.ts`, adicionar a `ExportConversasInput`:
```ts
  /** v0.57 — filtro de duração (Sem resposta/Aberta/Parada há). Replica matchDuration. */
  durationFilter?: import("@/lib/reports/filter-state").DurationFilter;
```

- [ ] **Step 2:** No pipeline do export, materializar `stalled_seconds` **antes** de `applyConditions` (senão o campo `stalled_seconds` do condition-builder do Avançado fica `undefined` e a planilha diverge da tela), e aplicar `matchDuration` após `matchLocation`. Importar `matchDuration` e `deriveStalledSeconds` no topo. Usar UM único `serverNow`:
```ts
  const serverNow = Date.now();
  // materializa stalled p/ o caminho do condition-builder (applyConditions lê row[field])
  rows = rows.map((r) => ({ ...r, stalled_seconds: deriveStalledSeconds(r, serverNow) }));
  // ... matchSearchClient → applyConditions(conditionGroup) → matchDocumentTypes → matchLocation ...
  // após matchLocation, antes de sortConversasByStack:
  rows = matchDuration(rows, input.durationFilter, serverNow);
```
(`stalled_seconds` não aparece no XLSX: `conversas-xlsx.ts` usa colunas fixas + `custom_attributes`, nunca `Object.keys(row)`.)

- [ ] **Step 3:** Em `export-button.tsx`, aceitar prop `durationFilter?: DurationFilter` e incluí-la no `ExportConversasInput` enviado à action.

- [ ] **Step 4:** Verificar.

Run: `npx tsc --noEmit && npx jest src/lib/actions/reports/__tests__/`
Expected: PASS.

- [ ] **Step 5:** Commit.

```bash
git add src/lib/actions/reports/conversas-export.ts src/components/reports/export-button.tsx
git commit -m "feat(conversas): export XLSX aplica filtro de duração"
```

---

### Task 6: Contadores, resets e campo `stalled_seconds` no builder **[UI — inline]**

**Files:**
- Modify: `src/components/reports/advanced-filters.tsx`
- Modify: `src/components/reports/filters-dialog.tsx` (campo `stalled_seconds` no `buildFields`)

**Interfaces:**
- Consumes: `diffFilterStates` (Task 1, já conta os novos campos); `durationFilter` do estado.
- Produces: `appliedCount` inclui Data/Duração; resets limpam novos campos; `<ExportButton>` recebe `durationFilter`; campo `stalled_seconds` no builder do Avançado.

- [ ] **Step 1:** Invocar `ui-ux-pro-max:ui-ux-pro-max`.

- [ ] **Step 2:** No memo `appliedCount` (~L224-240): somar `+1` se `applied.dateField === "created"` e `applied.period !== "todos"`, e `+1` se `applied.durationFilter`.

- [ ] **Step 3:** Nos handlers de reset (`handleReset`/`handleResetFiltersOnly`, ~L284-310): incluir `dateField: "updated"` e `durationFilter: undefined`.

- [ ] **Step 4:** Passar `durationFilter={applied.durationFilter}` ao `<ExportButton>` (e propagar `serverNow` se o ExportButton precisar — não precisa: serverNow é gerado server-side no export).

- [ ] **Step 5:** Adicionar o campo `stalled_seconds` ao **condition-builder**, em `filters-dialog.tsx` → `buildFields` (~L175-183, ao lado de `waiting_seconds`/`open_seconds`): `{ key: "stalled_seconds", label: "Tempo parada (s)", type: "number" }`. A materialização de `stalled_seconds` nas rows já é feita pelo `enrichedRows` da Task 4 (Step 3a) e, no export, pela Task 5 (Step 2). **Não** mexer em `SORT_OPTIONS` (advanced-filters.tsx:76-89 é ordenação; fora de escopo). **Não** alterar os campos `waiting_seconds`/`open_seconds` existentes (segundos crus — evita regressão de presets/`cg`).

- [ ] **Step 6:** Verificar.

Run: `npx tsc --noEmit && npx jest src/components/reports/`
Expected: PASS.

- [ ] **Step 7:** Commit.

```bash
git add src/components/reports/advanced-filters.tsx src/components/reports/filters-dialog.tsx
git commit -m "feat(conversas): contadores/resets de Data+Duração e campo Parada há no builder"
```

---

### Task 7: UI do bloco fixo no modal (Data + Filtrar por tempo) **[UI — inline]**

**Files:**
- Modify: `src/components/reports/filters-dialog.tsx`
- Create: `src/lib/reports/duration-copy.ts` (microcopy/descrições reaproveitáveis)

**Interfaces:**
- Consumes: `dateField`/`durationFilter` do `draft`; setters do dialog.
- Produces: bloco fixo no topo do modal (acima das `Tabs`), válido em ambas as abas.

- [ ] **Step 1:** Invocar `ui-ux-pro-max:ui-ux-pro-max` (segmented control, accordion-like, avisos inline, ícone relógio; base-ui `render`).

- [ ] **Step 2:** Criar `duration-copy.ts` com as descrições/labels (verbatim da spec §3.1/§3.2/§3.3):
```ts
export const DATE_FIELD_LABELS = { created: "Criado em", updated: "Última atualização em" } as const;
export const DATE_FIELD_HELP = {
  created: "Filtra pela data em que a conversa foi criada. Mostra apenas as que começaram no período, mesmo sem atividade depois.",
  updated: "Filtra pela data da última movimentação. Mostra tudo que teve atividade no período, mesmo conversas antigas.",
} as const;
export const INDICATOR_LABELS = { waiting: "Sem resposta há", open: "Aberta há", stalled: "Parada há" } as const;
export const INDICATOR_HELP = {
  waiting: "Tempo desde a última mensagem do cliente sem o atendente responder. Só conversas não resolvidas em que o cliente foi o último a falar. Uma nota interna do atendente também encerra essa contagem.",
  open: "Tempo desde a última ação do atendente numa conversa ainda aberta. Normalmente aguardando retorno do cliente ou sem fechamento.",
  stalled: "Tempo desde a última movimentação, seja de quem for. Encontra conversas estagnadas/esquecidas, independente do status.",
} as const;
export const MODE_LABELS = { gte: "no mínimo", lte: "no máximo", between: "entre" } as const;
export const UNIT_LABELS = { minute: "minuto", hour: "hora", day: "dia", month: "mês (≈30 dias)", year: "ano (≈365 dias)" } as const;
export const EXACT_TIME_NOTE = "O filtro usa o tempo exato da conversa; a coluna mostra um valor arredondado para leitura.";
export const RESOLVED_WARN = "'Sem resposta há' e 'Aberta há' só existem em conversas não resolvidas — conversas resolvidas não aparecem com este filtro.";
```

- [ ] **Step 3:** Renderizar o bloco fixo ANTES de `<Tabs>` no `FiltersDialog`:
  - Linha "Data": segmented control `created`/`updated` (default destacado em `updated`), ícone de ajuda com `DATE_FIELD_HELP`. **Desabilitado** quando `draft.period === "todos"` com tooltip "A escolha de data só afeta Hoje/Semana/Mês/Personalizado".
  - Bloco "Filtrar por tempo" (ícone relógio, subtítulo): selects de indicador (com `INDICATOR_HELP`), modo (`MODE_LABELS`), input valor (min 1) + select unidade (`UNIT_LABELS`); em `between`, segundo par valor+unidade. Frase-exemplo viva montada de `INDICATOR_LABELS`+`MODE_LABELS`+valor+`UNIT_LABELS`. Aviso inline `RESOLVED_WARN` quando indicador ∈ {waiting, open}. Botão "limpar bloco" → `durationFilter: undefined`.
  - Atualiza `draft.dateField`/`draft.durationFilter` (o footer "Aplicar" existente faz o `pushUrl`).

- [ ] **Step 4:** Atualizar o texto do `AlertDialog` de troca de aba: deixar claro que Data e Duração **são preservados** (só as dimensões da aba são descartadas).

- [ ] **Step 5:** Verificar.

Run: `npx tsc --noEmit && npx jest src/components/reports/`
Expected: PASS.

- [ ] **Step 6:** Commit.

```bash
git add src/components/reports/filters-dialog.tsx src/lib/reports/duration-copy.ts
git commit -m "feat(conversas): UI do bloco Data + Filtrar por tempo no modal de filtros"
```

---

### Task 8: Chips de Data e Duração **[UI — inline]**

**Files:**
- Modify: `src/components/reports/applied-filters-chips.tsx`

**Interfaces:**
- Consumes: `dateField`/`durationFilter` do estado aplicado; `duration-copy.ts` (Task 7); callbacks de remoção.
- Produces: chips com remoção individual que zeram o respectivo campo.

- [ ] **Step 1:** Invocar `ui-ux-pro-max:ui-ux-pro-max`.

- [ ] **Step 2:** Adicionar ramo novo (objeto/enum não cabem no esquema id-array atual):
  - Chip Data: texto `Data: ${DATE_FIELD_LABELS[dateField]}` — **só** quando `dateField === "created"` **e** `period !== "todos"`. Remoção → `dateField: "updated"`.
  - Chip Duração: texto `${INDICATOR_LABELS[i]}: ${MODE_LABELS[m]} ${value} ${unitShort}` (e `entre A e B` no between). Sem `≥`. Remoção → `durationFilter: undefined`.

- [ ] **Step 3:** Verificar.

Run: `npx tsc --noEmit && npx jest src/components/reports/`
Expected: PASS.

- [ ] **Step 4:** Commit.

```bash
git add src/components/reports/applied-filters-chips.tsx
git commit -m "feat(conversas): chips de Data e Duração com remoção individual"
```

---

## Verificação final (antes do release)

- [ ] `npx tsc --noEmit` verde.
- [ ] `npm test` (suites de reports/components tocadas) verde.
- [ ] E2E manual contra dado real (`agente up`/dev na main): "Criado em + Este mês" reduz a lista; "Sem resposta há: no mínimo 10 min" bate com a coluna; "Parada há: no mínimo 7 dias"; "entre" com unidades distintas; export XLSX reflete a tela; chips/contadores/URL/presets ok; URLs antigas seguem funcionando.
- [ ] Release: bump versão, `CHANGELOG.md` + `STATUS.md` + `docs/agents/HISTORY.md`; push main; aguardar build; `gh workflow run portainer-fix.yml -f app_version=vX.Y.Z -f fix_worker_cmd=false`; validar `/api/health`.

## Self-review (preencher após escrever)

- Cobertura da spec: §3.1→T1/T3; §3.2/§3.4→T2/T4; §3.3→T2/T7; §4.1→T3; §4.2→T2/T4; §4.3→T6/T7; §4.4→T4/T5; §5→T7; §6→T1/T6; §7→T7/T8; §8→Verificação. OK.
- Placeholders: nenhum "TBD". Código real nos steps de lógica; UI com estrutura + microcopy verbatim.
- Consistência de tipos: `DurationFilter`/`DurationUnit`/`DurationIndicator`/`DurationMode` definidos em T1 e consumidos por T2/T4/T5/T7/T8; `matchDuration(rows, filter, serverNow)` e `deriveStalledSeconds(row, serverNow)` idênticos em T2 e usos; `ConversaRow.stalled_seconds?` opcional adicionado em T6.
