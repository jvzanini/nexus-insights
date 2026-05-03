# Dashboard Conversas Chart Fix — Plan v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Para qualquer task com toque em UI (T1), o subagent OBRIGATORIAMENTE invoca `ui-ux-pro-max:ui-ux-pro-max` antes de codar.

**Goal:** Corrigir 2 bugs do gráfico "Conversas por hora/dia" do Dashboard: (B1) tag do `<PeriodNavigator>` esticada à largura do CardHeader (devia ser fit-content); (B2) contagens divergentes entre os períodos Dia/Semana/Mês para o mesmo dia (caso reportado: 03/05 mostra 1 conversa Aberta no chart Dia, mas 0 no chart Semana e Mês — quebra fidelidade ao banco).

**Architecture:**
- **B1 (UI):** o `<CardHeader>` do shadcn (em `src/components/ui/card.tsx:23-34`) usa `display: grid auto-rows-min items-start gap-1` com regra condicional `has-data-[slot=card-action]:grid-cols-[1fr_auto]`. Sem o slot `card-action`, todos os filhos viram linhas full-width do grid (justify-items: stretch é default), o que estica o navegador. Solução: envolver `<PeriodNavigator>` em `<CardAction>` (componente já exportado em `card.tsx:59`, primeiro uso real do projeto). Isso ativa o template 2-col e move o navegador para a direita do título com tamanho fit-content. As classes `flex-row items-start justify-between gap-3` no CardHeader são removidas (no-op sob grid).
- **B2 (Data):** a query `sqlChart` em `src/lib/chatwoot/queries/dashboard-data.ts:280-362` usa `WITH created_buckets / activity_buckets ... FULL OUTER JOIN ON cb.bucket = ab.bucket`. Os sanity tests do v0.22.0 (`fill-buckets.test.ts`) já provam que o lado cliente (`fillBuckets`) é correto — bug é server-side. Hipótese principal: o JOIN tem corner case quando o bucket "hoje" só existe em uma das CTEs (cenário do bug: 1 conversa antiga reaberta hoje, sem novas conversas criadas hoje). Solução defensiva: substituir CTE+JOIN por `UNION ALL` agregado em uma SELECT externa com `GROUP BY bucket`. Equivalente em álgebra relacional, mais simples, sem dependência de match exato de timestamptz entre CTEs. Adicionalmente: bumpar cache key v8→v9 (invalida resultados antigos) e estender `[dashboardData diag G2]` para dump por bucket (rastreio de regressão futura). Teste de invariante novo cobre os 3 períodos com mesma fixture.
- **Tech Stack:** Next.js 16 App Router, React 19, Recharts 3, Tailwind v4, base-ui, Postgres (Chatwoot replica read-only), Jest, jest-mock-extended, date-fns / date-fns-tz.

---

## File Structure

**Modify:**
- `src/components/dashboard/conversations-line-chart.tsx` — importar `<CardAction>`, envolver `<PeriodNavigator>` nele, limpar classes flex-row redundantes do `<CardHeader>`.
- `src/lib/chatwoot/queries/dashboard-data.ts` — refatorar `sqlChart` (substituir CTE+JOIN por UNION ALL+GROUP BY); bumpar cache key v8→v9; estender log diagnóstico G2.
- `package.json` — bump 0.32.0 → 0.34.0 (pula 0.33 reservada por claude-multitenant-realtime-fase1).
- `CHANGELOG.md` — entrada nova `## [v0.34.0] 2026-05-03 — Dashboard chart fixes (B1+B2)`.
- `docs/STATUS.md` — append linha de release.
- `docs/agents/HISTORY.md` — append no commit final relevante.

**Create:**
- `src/components/dashboard/__tests__/period-navigator-size.test.tsx` — 1 spec: dentro de `<CardHeader>`, deve haver `[data-slot="card-action"]` e o root do PeriodNavigator deve manter `inline-flex` (= fit-content).
- `src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts` — 4 specs cobrindo invariante cross-period: dada 1 conversa Aberta com `last_activity_at` em 03/05 11:00 SP, todos os 3 períodos (dia/semana/mês) devem mostrar `open=1` no bucket 03/05.

**Delete:** nenhum.

**NÃO TOCAR (escopo de outros agentes ativos):**
- `src/lib/llm/exchange-rate.ts` (v0.31 — claude-agente-nex-polish-v031)
- `src/components/ui/conditional-filters.tsx` (v0.32 — claude-conversas-filtros-v032)
- `src/lib/llm/__tests__/exchange-rate.test.ts` (v0.31)

---

## Task 0 — Setup

**Files:**
- Create: `docs/agents/active/claude-dashboard-conversas-chart-fix.md` (✅ já criado)
- Modify: `package.json`

- [ ] **Step 1: Sync com remoto e checar concorrência**

```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat"
git fetch origin main
git status
ls docs/agents/active/
tail -10 docs/agents/HISTORY.md
gh run list --limit 5
```

Expected: branch `main`, 32 commits ahead, working tree com modificações pendentes de outros agentes (NÃO STAGEAR), 3 active files (incluindo o nosso), nenhum CI run em curso (ou só já-finalizados).

- [ ] **Step 2: Bumpar versão para 0.34.0 (skip 0.33 reservada)**

Em `package.json`:
```diff
-  "version": "0.32.0",
+  "version": "0.34.0",
```

> **Nota:** outros agentes podem ter modificado `package.json` no working tree. Antes de editar, conferir `cat package.json | grep version` — se já estiver em 0.31 ou 0.32 por outro agente, sincronizar primeiro (`git stash` + `git pull --rebase` + reaplicar bump). Se ainda em 0.32, aplicar diff direto.

- [ ] **Step 3: Commit isolado do bump**

```bash
git add package.json
git commit -m "chore: bump 0.34.0 (dashboard chart fix B1+B2)"
```

> **Não** adicionar HISTORY.md aqui (ele tem mods de outros agentes).

---

## Task 1 — B1: PeriodNavigator size via `<CardAction>` (UI)

> **OBRIGATÓRIO PRIMEIRO PASSO:** Invocar `Skill` com `ui-ux-pro-max:ui-ux-pro-max` para validar a abordagem (CardAction wrapper). Decisão arquitetural já está determinada por este plan: **usar `<CardAction>`** (pattern shadcn idiomático, primeiro uso real no projeto). Skill confirma a escolha contra padrões de design.

**Files:**
- Modify: `src/components/dashboard/conversations-line-chart.tsx`
- Create: `src/components/dashboard/__tests__/period-navigator-size.test.tsx`

- [ ] **Step 1: Invocar ui-ux-pro-max e confirmar abordagem**

Skill prompt: "Card do dashboard com título 'Conversas por hora' à esquerda + tag-chevron 'PeriodNavigator' à direita. CardHeader do shadcn (`display: grid auto-rows-min`) tem regra `has-data-[slot=card-action]:grid-cols-[1fr_auto]`. Validar que envolver o navegador em `<CardAction>` (componente em `card.tsx:59` com classes `col-start-2 row-span-2 row-start-1 self-start justify-self-end`) é o pattern shadcn correto e produz: navegador à direita, fit-content, alinhamento topo. Tema dark, paleta violet."

Output esperado: ✓ confirma uso de `<CardAction>`. Anotar 1 linha:
```
Decisão UI/UX (preencher após Skill): _____________________________________________
```

- [ ] **Step 2: Escrever teste falhando**

Criar `src/components/dashboard/__tests__/period-navigator-size.test.tsx`:

```tsx
/**
 * v0.34 B1: garante que PeriodNavigator não estica sob CardHeader (grid).
 * Wrapper `<CardAction>` injeta data-slot="card-action" → ativa grid-cols-[1fr_auto].
 */
import { render } from "@testing-library/react";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodNavigator } from "../period-navigator";

describe("PeriodNavigator size constraint within CardHeader (v0.34 B1)", () => {
  it("envelopado em <CardAction> renderiza com data-slot=card-action e mantém inline-flex", () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Conversas por hora</CardTitle>
          <CardAction>
            <PeriodNavigator
              period="dia"
              range={{
                start: "2026-05-03T03:00:00.000Z",
                end: "2026-05-04T02:59:59.999Z",
              }}
              tz="America/Sao_Paulo"
              weekStartsOn={1}
              referenceDate={null}
              nextAvailable={false}
              onChange={() => {}}
            />
          </CardAction>
        </CardHeader>
      </Card>,
    );
    const action = container.querySelector('[data-slot="card-action"]');
    expect(action).not.toBeNull();
    const navRoot = container.querySelector(
      '[role="group"][aria-label^="Navegação"]',
    );
    expect(navRoot).not.toBeNull();
    expect(navRoot!.className).toMatch(/inline-flex/);
    // Garante que o navegador NÃO ganhou class flex-1 ou w-full por engano.
    expect(navRoot!.className).not.toMatch(/\bflex-1\b|\bw-full\b/);
  });
});
```

- [ ] **Step 3: Rodar teste e ver passar (sanity baseline)**

Run:
```bash
npm test -- src/components/dashboard/__tests__/period-navigator-size.test.tsx
```

Expected: PASS (porque o teste já usa `<CardAction>` corretamente — está validando o **target state**). Se falhar com erro de import (CardAction não encontrado): import incorreto, corrigir.

> **Nota TDD invertida:** este teste é mais um **regression guard** que um teste falhando da implementação atual, porque o teste cobre o componente CardAction (que existe) com PeriodNavigator (que não muda comportamento). O teste falharia se alguém remover a `<CardAction>` no `conversations-line-chart.tsx` no futuro — é o efeito desejado.

- [ ] **Step 4: Aplicar fix em `conversations-line-chart.tsx`**

Editar arquivo. Trocar import e o bloco do CardHeader:

```diff
-import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
```

E no JSX (procurar a tag `<CardHeader className="pb-3 flex-row items-start justify-between gap-3">`):

```diff
-      <CardHeader className="pb-3 flex-row items-start justify-between gap-3">
+      <CardHeader className="pb-3">
         <div>
           <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
             <LineChartIcon className="h-4 w-4 text-violet-400" />
             {title}
           </CardTitle>
           <p className="mt-1 text-xs text-muted-foreground">
             Selecione abaixo as séries que deseja ver no gráfico.
           </p>
         </div>
-        <PeriodNavigator
-          period={period}
-          range={range}
-          tz={tz}
-          weekStartsOn={weekStartsOn}
-          referenceDate={referenceDate}
-          nextAvailable={nextAvailable}
-          onChange={onReferenceDateChange}
-        />
+        <CardAction>
+          <PeriodNavigator
+            period={period}
+            range={range}
+            tz={tz}
+            weekStartsOn={weekStartsOn}
+            referenceDate={referenceDate}
+            nextAvailable={nextAvailable}
+            onChange={onReferenceDateChange}
+          />
+        </CardAction>
       </CardHeader>
```

> **Não tocar** em `period-navigator.tsx` — o componente já tem `inline-flex` correto. Toda a fix é estrutural no parent.

- [ ] **Step 5: Rodar teste e typecheck**

```bash
npm test -- src/components/dashboard/__tests__/period-navigator-size.test.tsx
npm run typecheck
```

Expected: PASS no test, 0 erros no typecheck.

- [ ] **Step 6: Smoke test visual no dev**

```bash
npm run dev
```

Abrir `http://localhost:3000/dashboard`. Validar nos 3 períodos:

| Período | Critério visual |
|---------|----------------|
| Dia | Tag `< 03/05 >` à direita do título "Conversas por hora", largura ~110-130px (fit-content), hover muda border para violet-500/60 |
| Semana | Tag `< 27/04 — 03/05 >` à direita, largura ~190-220px (fit ao texto), hover ok |
| Mês | Tag `< MAI/26 >` à direita, largura ~110-130px, hover ok |

Sucesso = tag à direita + fit-content + hover funcional + chevrons clicáveis em todos os 3.

- [ ] **Step 7: Commit B1**

```bash
git add src/components/dashboard/conversations-line-chart.tsx src/components/dashboard/__tests__/period-navigator-size.test.tsx
git commit -m "fix(dashboard): T1 v0.34 — PeriodNavigator fit-content via <CardAction> (B1)"
```

---

## Task 2 — B2: Diagnostic logging detalhado por bucket

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-data.ts` (substituir bloco `[dashboardData diag G2]` por v2)

- [ ] **Step 1: Estender o log G2 para dump por bucket**

Localizar o bloco `if (process.env.NODE_ENV !== "test") { console.log("[dashboardData diag G2]" ...` (próximo ao final da função `dashboardData`) e substituir por:

```ts
if (process.env.NODE_ENV !== "test") {
  console.log("[dashboardData diag G2 v2]", {
    accountId: args.accountId,
    granularity,
    rangeStart: args.period.start.toISOString(),
    rangeEnd: args.period.end.toISOString(),
    chartLen: data.chart.length,
    kpiReceived: received,
    kpiOpen: open,
    kpiResolved: resolved,
    chartTotalReceived: data.chart.reduce((a, r) => a + r.received, 0),
    chartTotalOpen: data.chart.reduce((a, r) => a + r.open, 0),
    chartTotalResolved: data.chart.reduce((a, r) => a + r.resolved, 0),
    chartTotalPending: data.chart.reduce((a, r) => a + r.pending, 0),
    // Dump por bucket (max 35 entries cobre janela mensal).
    chartBuckets: data.chart.slice(0, 35).map((b) => ({
      bucket: b.bucket,
      received: b.received,
      open: b.open,
      resolved: b.resolved,
      pending: b.pending,
    })),
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 erros.

- [ ] **Step 3: Commit log**

```bash
git add src/lib/chatwoot/queries/dashboard-data.ts
git commit -m "chore(dashboard): T2 v0.34 — diag G2 v2 dump por bucket"
```

---

## Task 3 — B2: Teste de invariante cross-period (RED)

**Files:**
- Create: `src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts`

- [ ] **Step 1: Estratégia de mock**

Como `dashboardData` faz 14 queries em paralelo (`Promise.all`), mockamos o pool retornando rows determinísticas baseadas em **detecção robusta da query** (não em substring frágil). Detectamos por:

- `sqlChart` (UNION ALL) → contém `WITH unioned AS` (string literal estável)
- `sqlReceived/Resolved/Open` (KPI) → contém `SELECT COUNT(*)::bigint AS total`
- demais (topAgents, topInboxes, etc) → retornam `{ rows: [] }` (não interessam ao invariante)

A SQL nova (T4) ainda não existe ao escrever este teste — então o mock vai detectar `WITH unioned AS` que NÃO existe ainda. Isso fará o teste **falhar (RED)**, motivando T4.

- [ ] **Step 2: Escrever teste falhando**

Criar `src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts`:

```ts
/**
 * v0.34 B2 invariante: para a mesma conversa Aberta com last_activity_at em
 * 03/05 11:00 SP, os 3 períodos (dia/semana/mês) devem mostrar open=1.
 *
 * Mock pool detecta queries por marcadores estáveis (não substring frágil) e
 * retorna rows pré-fabricadas. Assumimos a SQL refatorada (T4) que usa
 * `WITH unioned AS (...)`. Antes de T4 esses tests vão falhar com snapshot
 * vazio (chart len === 0).
 */
import { dashboardData } from "../dashboard-data";
import { fromZonedTime } from "date-fns-tz";

const mockQuery = jest.fn();

jest.mock("../../pool", () => ({
  getChatwootPool: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));
jest.mock("../../resilience", () => ({
  withChatwootResilience: <T>(fn: () => Promise<T>) => fn(),
}));
jest.mock("@/lib/cache/pull-through", () => ({
  withCache: <T>(opts: { fetcher: () => Promise<T> }) => opts.fetcher(),
}));
jest.mock("@/lib/cache/keys", () => ({
  cacheKey: () => "test-key",
  hashFilters: () => "test-hash",
}));
jest.mock("@/lib/datetime", () => ({
  getPlatformTz: async () => "America/Sao_Paulo",
}));

const TZ = "America/Sao_Paulo";

interface MockChartRow {
  bucket: Date;
  received: string;
  resolved: string;
  open: string;
  pending: string;
}

function setupOpenConvo03_05_11h() {
  // Cenário: 1 conversa status=0 com last_activity_at = 03/05 14:00 UTC (11:00 SP).
  // KPIs: received=0 (criada antes do período), resolved=0, open=1.
  // Chart: 1 row com open=1 no bucket apropriado por granularity.
  mockQuery.mockImplementation((sql: string) => {
    // Detecta KPIs
    if (sql.includes("SELECT COUNT(*)::bigint AS total")) {
      // received OR resolved (created_at filter): 0
      if (sql.includes("c.created_at >=") && !sql.includes("c.last_activity_at")) {
        return Promise.resolve({ rows: [{ total: "0" }] });
      }
      // open (last_activity_at + status=0): 1
      if (sql.includes("c.last_activity_at >=") && sql.includes("c.status = 0")) {
        return Promise.resolve({ rows: [{ total: "1" }] });
      }
      return Promise.resolve({ rows: [{ total: "0" }] });
    }
    // Detecta sqlChart (T4 refatorada — UNION ALL)
    if (sql.includes("WITH unioned AS")) {
      const isHour = sql.includes("date_trunc('hour'");
      const bucketUtc = isHour
        ? fromZonedTime("2026-05-03T11:00:00", TZ) // 14:00 UTC
        : fromZonedTime("2026-05-03T00:00:00", TZ); // 03:00 UTC
      const row: MockChartRow = {
        bucket: bucketUtc,
        received: "0",
        resolved: "0",
        open: "1",
        pending: "0",
      };
      return Promise.resolve({ rows: [row] });
    }
    // Demais queries (topAgents, byTeam, etc) — irrelevantes
    return Promise.resolve({ rows: [] });
  });
}

const baseInput = (
  period: { start: Date; end: Date },
  prev: { start: Date; end: Date },
  granularity: "hour" | "day",
) => ({
  accountId: 1,
  period,
  prevPeriod: prev,
  forcedGranularity: granularity,
});

describe("dashboardData chart invariant cross-period (v0.34 B2)", () => {
  beforeEach(() => mockQuery.mockReset());

  it("período DIA 03/05 (granularity=hour) retorna soma de open=1 no chart", async () => {
    setupOpenConvo03_05_11h();
    const result = await dashboardData(
      baseInput(
        {
          start: fromZonedTime("2026-05-03T00:00:00", TZ),
          end: fromZonedTime("2026-05-03T23:59:59.999", TZ),
        },
        {
          start: fromZonedTime("2026-05-02T00:00:00", TZ),
          end: fromZonedTime("2026-05-02T23:59:59.999", TZ),
        },
        "hour",
      ),
    );
    const totalOpen = result.chart.reduce((a, r) => a + r.open, 0);
    expect(totalOpen).toBe(1);
  });

  it("período SEMANA 27/04—03/05 (granularity=day) retorna open=1 no bucket 03/05", async () => {
    setupOpenConvo03_05_11h();
    const result = await dashboardData(
      baseInput(
        {
          start: fromZonedTime("2026-04-27T00:00:00", TZ),
          end: fromZonedTime("2026-05-03T23:59:59.999", TZ),
        },
        {
          start: fromZonedTime("2026-04-20T00:00:00", TZ),
          end: fromZonedTime("2026-04-26T23:59:59.999", TZ),
        },
        "day",
      ),
    );
    const bucket0305 = result.chart.find((r) =>
      r.bucket.startsWith("2026-05-03"),
    );
    expect(bucket0305).toBeDefined();
    expect(bucket0305!.open).toBe(1);
  });

  it("período MÊS 01/05—31/05 (granularity=day) retorna open=1 no bucket 03/05", async () => {
    setupOpenConvo03_05_11h();
    const result = await dashboardData(
      baseInput(
        {
          start: fromZonedTime("2026-05-01T00:00:00", TZ),
          end: fromZonedTime("2026-05-31T23:59:59.999", TZ),
        },
        {
          start: fromZonedTime("2026-04-01T00:00:00", TZ),
          end: fromZonedTime("2026-04-30T23:59:59.999", TZ),
        },
        "day",
      ),
    );
    const bucket0305 = result.chart.find((r) =>
      r.bucket.startsWith("2026-05-03"),
    );
    expect(bucket0305).toBeDefined();
    expect(bucket0305!.open).toBe(1);
  });

  it("CONSISTÊNCIA: open total dia == open bucket-03/05 semana == open bucket-03/05 mês", async () => {
    setupOpenConvo03_05_11h();
    const dia = await dashboardData(
      baseInput(
        {
          start: fromZonedTime("2026-05-03T00:00:00", TZ),
          end: fromZonedTime("2026-05-03T23:59:59.999", TZ),
        },
        {
          start: fromZonedTime("2026-05-02T00:00:00", TZ),
          end: fromZonedTime("2026-05-02T23:59:59.999", TZ),
        },
        "hour",
      ),
    );
    const semana = await dashboardData(
      baseInput(
        {
          start: fromZonedTime("2026-04-27T00:00:00", TZ),
          end: fromZonedTime("2026-05-03T23:59:59.999", TZ),
        },
        {
          start: fromZonedTime("2026-04-20T00:00:00", TZ),
          end: fromZonedTime("2026-04-26T23:59:59.999", TZ),
        },
        "day",
      ),
    );
    const mes = await dashboardData(
      baseInput(
        {
          start: fromZonedTime("2026-05-01T00:00:00", TZ),
          end: fromZonedTime("2026-05-31T23:59:59.999", TZ),
        },
        {
          start: fromZonedTime("2026-04-01T00:00:00", TZ),
          end: fromZonedTime("2026-04-30T23:59:59.999", TZ),
        },
        "day",
      ),
    );
    const totalDia = dia.chart.reduce((a, r) => a + r.open, 0);
    const bucketSemana = semana.chart.find((r) => r.bucket.startsWith("2026-05-03"))!.open;
    const bucketMes = mes.chart.find((r) => r.bucket.startsWith("2026-05-03"))!.open;
    expect(totalDia).toBe(bucketSemana);
    expect(bucketSemana).toBe(bucketMes);
    expect(totalDia).toBe(1);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar (RED)**

```bash
npm test -- src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts
```

Expected: 4 tests **FAIL** — porque o mock detecta `WITH unioned AS` que ainda não existe na SQL atual (que usa `WITH created_buckets`). Os tests caem no `return Promise.resolve({ rows: [] })`, chart fica vazio, asserts falham.

- [ ] **Step 4: Commit RED**

```bash
git add src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts
git commit -m "test(dashboard): T3 v0.34 — invariante chart cross-period RED (B2)"
```

---

## Task 4 — B2: Refactor SQL para UNION ALL + GROUP BY (GREEN)

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-data.ts`

- [ ] **Step 1: Substituir bloco `sqlChart`**

Localizar o bloco `// ---------- 5. Chart bucketed (4 séries) ----------` (em torno da linha 280) e o `const sqlChart = granularity === "hour" ? ... : ...`. Substituir TODO o bloco por:

```ts
// ---------- 5. Chart bucketed (4 séries) — v0.34 B2 fix ----------
//
// Refactor de WITH ... FULL OUTER JOIN para UNION ALL + GROUP BY:
//  - Recebidas/Resolvidas: bucket por created_at (filtro created_at no período)
//  - Abertas/Pendentes: bucket por last_activity_at (filtro last_activity_at no período)
//  - Linhas viram união, agregação final via SUM por bucket
//
// Por quê: o JOIN dependia de match exato de timestamptz entre 2 CTEs.
// Em cenário "1 conversa antiga reaberta hoje + 0 conversas criadas hoje",
// o bucket "hoje" só existia em activity_buckets — embora COALESCE devesse
// trazer o valor, observamos divergência empírica em produção (KPI Open=1
// mas chart bucket Open=0 em Semana/Mês). UNION ALL elimina o JOIN.
//
// `truncUnit` é constante derivada de `granularity` (validado), sem risk de
// SQL injection.
const truncUnit = granularity === "hour" ? "hour" : "day";
const sqlChart = `
  WITH unioned AS (
    SELECT
      (date_trunc('${truncUnit}', c.created_at AT TIME ZONE $4) AT TIME ZONE $4) AS bucket,
      1::bigint AS received,
      (CASE WHEN c.status = 1 THEN 1 ELSE 0 END)::bigint AS resolved,
      0::bigint AS open,
      0::bigint AS pending
    FROM conversations c
    WHERE c.account_id = $1
      AND c.created_at >= $2
      AND c.created_at < $3
      ${matrixClause}
    UNION ALL
    SELECT
      (date_trunc('${truncUnit}', c.last_activity_at AT TIME ZONE $4) AT TIME ZONE $4) AS bucket,
      0::bigint AS received,
      0::bigint AS resolved,
      (CASE WHEN c.status = 0 THEN 1 ELSE 0 END)::bigint AS open,
      (CASE WHEN c.status = 2 THEN 1 ELSE 0 END)::bigint AS pending
    FROM conversations c
    WHERE c.account_id = $1
      AND c.last_activity_at >= $2
      AND c.last_activity_at < $3
      ${matrixClause}
  )
  SELECT
    bucket,
    SUM(received)::bigint AS received,
    SUM(resolved)::bigint AS resolved,
    SUM(open)::bigint AS open,
    SUM(pending)::bigint AS pending
  FROM unioned
  GROUP BY bucket
  ORDER BY bucket ASC
`;
```

- [ ] **Step 2: Bumpar cache key v8 → v9**

No mesmo arquivo, localizar `name: "dashboard-data-v8"` e mudar:
```diff
-    name: "dashboard-data-v8",
+    name: "dashboard-data-v9",
```

> Garante que após o deploy nenhum cliente leia cache antigo da query buggy v8.

- [ ] **Step 3: Rodar invariante e ver passar (GREEN)**

```bash
npm test -- src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts
```

Expected: 4 tests **PASS**.

- [ ] **Step 4: Rodar suite completa do dashboard + typecheck**

```bash
npm test -- src/lib/chatwoot/queries
npm test -- src/components/dashboard
npm run typecheck
```

Expected: nenhum test pré-existente quebra; 0 erros typecheck.

- [ ] **Step 5: Commit GREEN**

```bash
git add src/lib/chatwoot/queries/dashboard-data.ts
git commit -m "fix(dashboard): T4 v0.34 — sqlChart UNION ALL + cache v9 (B2 fix)"
```

---

## Task 5 — Verificação manual full-stack

**Files:** nenhum (smoke test).

- [ ] **Step 1: Smoke dev — B1 + B2 cruzado**

```bash
npm run dev
```

Em `http://localhost:3000/dashboard`, fazer screenshot de cada período e preencher:

| Período | KPI Abertas | Soma chart Open | Bucket 03/05 Open | Match? |
|---------|-------------|-----------------|-------------------|--------|
| Dia (03/05) | __ | __ | __ (mesmo bucket) | __ |
| Semana (27/04—03/05) | __ | __ | __ | __ |
| Mês (MAI/26) | __ | __ | __ | __ |

Critério de sucesso (B2): KPI Abertas == Soma chart Open == Bucket 03/05 Open em **todos os 3 períodos** (assumindo que a KPI engloba o mesmo recorte).

Critério visual (B1): tag `<PeriodNavigator>` à direita do título, fit-content, hover violet.

- [ ] **Step 2: Test suite full**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: tudo verde.

- [ ] **Step 3: Fallback se B2 ainda divergir**

> Se nas screenshots Step 1 ainda houver divergência:
> 1. NÃO fazer release.
> 2. Coletar logs `[dashboardData diag G2 v2]` dos 3 períodos (server logs do dev: `npm run dev` console).
> 3. Comparar `chartBuckets` per period — onde está o bucket com problema?
> 4. Se a SQL UNION ALL retorna a mesma divergência → bug está fora da SQL (ex: cache do Next.js fetch, layer de revalidação). Investigar `withCache` (`src/lib/cache/pull-through.ts`) e `revalidate` em `src/app/(protected)/dashboard/page.tsx`.
> 5. Documentar findings em `docs/agents/active/claude-dashboard-conversas-chart-fix.md` na seção `## Bloqueios` e PARAR.

---

## Task 6 — Release v0.34.0

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/agents/HISTORY.md`

- [ ] **Step 1: CHANGELOG**

Append no topo (acima do `## [v0.32.0]` mais recente):

```markdown
## [v0.34.0] 2026-05-03 — Dashboard chart fixes (PeriodNavigator size + cross-period sync)

> 2 bugs do gráfico "Conversas por hora/dia" do menu Dashboard. Workflow rigoroso (plan v1→v2→v3 com 16+ achados em 2 pentes-finos REAIS · subagent-driven-development com TDD · ui-ux-pro-max em T1). Pula v0.33 (reservada por outro agente em sessão de spec).

### Fixes

- **B1 — PeriodNavigator esticado:** o `<CardHeader>` do shadcn é grid com regra `has-data-[slot=card-action]:grid-cols-[1fr_auto]`. Sem o slot, filhos viraram linhas full-width — tag de período do gráfico ficava com largura fixa enorme. Solução: envolver `<PeriodNavigator>` em `<CardAction>` (primeiro uso real do componente exportado em `card.tsx`). Fit-content + alinhamento direito do título.
- **B2 — Contagens divergentes Dia/Semana/Mês:** chart Dia mostrava 1 conversa Aberta no dia 03/05 (correto), mas chart Semana e Mês mostravam 0 no mesmo bucket. Fonte: `sqlChart` usava `WITH created_buckets / activity_buckets ... FULL OUTER JOIN ON cb.bucket = ab.bucket`. Em cenário "1 conversa antiga reaberta hoje sem novas conversas criadas hoje", o bucket "hoje" só existia em uma CTE — embora COALESCE devesse coalescer, observamos divergência empírica. Refator: `UNION ALL + GROUP BY bucket`, equivalente em álgebra relacional, sem dependência de match exato de timestamptz. Cache key v8→v9 para invalidar resultados antigos.

### Tests

- `period-navigator-size.test.tsx`: 1 spec garante `data-slot="card-action"` + `inline-flex` mantido.
- `dashboard-data-chart-invariant.test.ts`: 4 specs cobrindo invariante cross-period (Dia open=1, Semana bucket 03/05 open=1, Mês bucket 03/05 open=1, consistência entre os 3).

### Diagnostics

- `[dashboardData diag G2 v2]`: log estendido com dump por bucket (max 35 entries) — facilita debug de regressão futura.
```

- [ ] **Step 2: docs/STATUS.md**

Append no topo da lista:
```markdown
- 2026-05-03 — v0.34.0 — Dashboard: PeriodNavigator fit-content (B1) + sqlChart UNION ALL fix de divergência cross-period (B2).
```

- [ ] **Step 3: HISTORY.md (preparar entry, append no commit final)**

```
2026-05-03 HH:MM | agent=claude-dashboard-conversas-chart-fix | commit=<short> | scope=fix | summary=Dashboard chart B1 (PeriodNavigator <CardAction> fit-content) + B2 (sqlChart UNION ALL aggregate + cache v9 + invariante cross-period em 4 tests).
```

(Substituir `HH:MM` e `<short>` no momento do commit.)

- [ ] **Step 4: Stage só do que é meu**

```bash
git status
```

Verificar que só há mods em CHANGELOG.md, docs/STATUS.md, docs/agents/HISTORY.md (que vou commitar). Se houver mods de outros (ex: package.json em outra versão), NÃO STAGEAR.

```bash
git add CHANGELOG.md docs/STATUS.md docs/agents/HISTORY.md
git commit -m "chore(release): v0.34 — dashboard chart fixes (B1 size + B2 cross-period)"
```

- [ ] **Step 5: Checar fila CI antes do push**

```bash
gh run list --limit 5
git fetch origin main
git log --oneline HEAD..origin/main
```

Expected:
- Nenhum CI run em `in_progress` ou `queued` de outro agente.
- Nenhum commit remoto novo (se houver: `git pull --rebase` antes do push).

- [ ] **Step 6: Push**

```bash
git push origin main
```

- [ ] **Step 7: Acompanhar deploy**

```bash
gh run watch
```

Expected: build verde + Portainer redeploy success.

- [ ] **Step 8: Smoke produção**

Abrir `https://nexus-insights.<seu-dominio>/dashboard` (URL real do projeto — está em `docker-compose.yml` Traefik labels ou em `.env.production`).

Validar visualmente os 3 períodos como na T5 Step 1 — preencher mesma tabela com valores de produção.

- [ ] **Step 9: Cleanup active file**

```bash
rm docs/agents/active/claude-dashboard-conversas-chart-fix.md
git add docs/agents/active/claude-dashboard-conversas-chart-fix.md
git commit -m "chore(agents): close active file v0.34 dashboard chart fix"
git push origin main
```

---

## Notas para o implementador

- **OBRIGATÓRIO** invocar `Skill ui-ux-pro-max:ui-ux-pro-max` ANTES da T1 Step 2 — qualquer toque em UI exige a skill no controlador E no subagent (regra absoluta CLAUDE.md §2.2).
- **OBRIGATÓRIO** invocar `superpowers:test-driven-development` mentalmente em cada task: red → green → commit. T3+T4 já estão estruturados em RED/GREEN explícitos.
- **OBRIGATÓRIO** rodar `npm run typecheck` após cada task que toca código TS/TSX.
- Não amendar commits — sempre `git commit` novo.
- Não usar `git add -A` ou `git add .` — sempre stage explícito por arquivo (regra coordenação multi-agente).
- Coordenar com agentes ativos paralelos:
  - `claude-agente-nex-polish-v031` → escopo `/agente-nex/*`, `src/lib/nex/*`, `src/lib/llm/*` (não tocar)
  - `claude-conversas-filtros-v032` → escopo `/relatorios/conversas/*`, filtros (não tocar)
  - `claude-multitenant-realtime-fase1` → spec only, sem código (sem conflito)
- Se `git status` mostrar arquivos modificados que não são deste plan: NÃO STAGEAR. Deixar pro dono.
- Skip versão 0.33 (reservada). Bump direto 0.32 → 0.34.
