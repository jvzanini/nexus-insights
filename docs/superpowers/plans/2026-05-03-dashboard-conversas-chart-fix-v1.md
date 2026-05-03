# Dashboard Conversas Chart Fix — Plan v1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Para qualquer task com toque em UI (T1), o subagent OBRIGATORIAMENTE invoca `ui-ux-pro-max:ui-ux-pro-max` antes de codar.

**Goal:** Corrigir 2 bugs críticos do gráfico "Conversas por hora/dia" do Dashboard: (B1) tag do PeriodNavigator com largura fixa enorme; (B2) contagens divergentes entre os períodos diário/semanal/mensal no mesmo dia (daily mostra 1 conversa aberta em 03/05, semanal/mensal mostram 0 — relatório quebrado).

**Architecture:**
- B1 (UI): `<PeriodNavigator>` é renderizado como filho do `<CardHeader>` que internamente usa `display: grid` (não flex). As classes `flex-row items-start justify-between` são no-ops sob grid; o navegador é esticado ao tamanho da célula via `justify-items: stretch`. Solução: posicionar o navegador via `data-slot="card-action"` (que dispara o template `grid-cols-[1fr_auto]` do CardHeader) OU envolver em `<CardAction>`. Resultado: navegador encolhe ao `inline-flex` natural e fica alinhado à direita do título.
- B2 (Data): Suspeita primária — a query SQL atual usa `WITH created_buckets / activity_buckets` + `FULL OUTER JOIN ON cb.bucket = ab.bucket`. Quando uma conversa criada antes do período tem `last_activity_at` no dia atual e nenhuma conversa nova foi criada nesse mesmo dia, o bucket "hoje" só existe em `activity_buckets`. A JOIN deveria coalescer corretamente, mas há indícios (sanity tests G2 do v0.22.0 já documentam que o `fillBuckets` cliente está correto e o bug é server-side) de que existe corner case na agregação. Solução defensiva: refatorar a query para usar `UNION ALL` + agregação única (sem JOIN), eliminando ambiguidade. Plus: adicionar log estruturado por bucket para corroborar root cause em produção e teste de invariante (soma horária = bucket diário do mesmo dia).
- Tech Stack: Next.js 16 App Router, React 19, Recharts 3, Tailwind v4, base-ui, Postgres (Chatwoot replica read-only), Jest, jest-mock-extended, date-fns / date-fns-tz.

---

## File Structure

**Modify:**
- `src/components/dashboard/period-navigator.tsx` — remover classes redundantes; manter inline-flex + adicionar `data-slot="card-action"` OU exportar componente que já vem com slot setado. Decisão tomada na T1.
- `src/components/dashboard/conversations-line-chart.tsx` — wrapper do PeriodNavigator no CardHeader: usar `<CardAction>` ou aplicar `data-slot` direto no `<PeriodNavigator>`. Limpar classes `flex-row items-start justify-between gap-3` do CardHeader (no-op sob grid).
- `src/lib/chatwoot/queries/dashboard-data.ts` — refatorar `sqlChart` (hour e day) substituindo `WITH ... FULL OUTER JOIN` por `WITH unioned AS (...) SELECT bucket, SUM(...) GROUP BY bucket`. Reforçar log diagnóstico G2 incluindo per-bucket dump para granularity=day.
- `package.json` — bump 0.32.0 → 0.34.0 (pula 0.33 reservada por claude-multitenant-realtime-fase1).
- `CHANGELOG.md` — entrada nova.
- `docs/STATUS.md` — entrada release v0.34.0.
- `docs/agents/HISTORY.md` — append no commit final.

**Create:**
- `src/components/dashboard/__tests__/period-navigator-size.test.tsx` — verifica que o componente renderizado dentro de um `<CardHeader>` shadcn tem `data-slot="card-action"` e que sua bounding box não é stretchada.
- `src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts` — teste de invariante: dada uma fixture de conversas em 03/05 (1 open, last_activity_at=11:00), a função `dashboardData()` rodada em modo "dia" deve retornar somatório de open=1 no chart, e rodada em "semana"/"mês" deve retornar bucket de 03/05 com open=1.

**Delete:** nenhum.

---

## Task 0 — Setup

**Files:**
- Modify: `package.json`
- Create: `docs/agents/active/claude-dashboard-conversas-chart-fix.md` (já criado no início da sessão).

- [ ] **Step 1: Verificar branch e estado limpo**

```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat"
git status
git fetch origin main
git log --oneline HEAD..origin/main || echo "no remote ahead"
```

Expected: branch `main`, 32 commits ahead de origin (estado conhecido), modificações pendentes `docs/agents/HISTORY.md` e `package.json` (de outras sessões — NÃO STAGEAR).

- [ ] **Step 2: Bumpar versão para 0.34.0**

Edit `package.json`:
```diff
-  "version": "0.32.0",
+  "version": "0.34.0",
```

- [ ] **Step 3: Commit do bump (isolado)**

```bash
git add package.json
git commit -m "chore: bump 0.34.0 (dashboard chart fix B1+B2)"
```

---

## Task 1 — B1: PeriodNavigator size fix (UI)

> **OBRIGATÓRIO:** Antes de codar esta task, invocar `Skill` com `ui-ux-pro-max:ui-ux-pro-max` para validar a abordagem escolhida (CardAction slot vs w-fit vs novo wrapper). Documente em 1 linha a decisão tomada após a invocação.

**Files:**
- Modify: `src/components/dashboard/conversations-line-chart.tsx:289-310` (CardHeader + PeriodNavigator wrapper)
- Modify: `src/components/dashboard/period-navigator.tsx:91-100` (root div — adicionar `data-slot` se necessário)
- Test: `src/components/dashboard/__tests__/period-navigator-size.test.tsx` (criar)

- [ ] **Step 1: Invocar ui-ux-pro-max e validar abordagem**

Invocar `Skill` com `ui-ux-pro-max:ui-ux-pro-max` passando contexto: "Dashboard chart card header tem `<CardTitle>` à esquerda e `<PeriodNavigator>` (tag violet inline-flex com chevrons + label) que precisa ficar alinhado à direita do título; CardHeader do shadcn usa `display: grid auto-rows-min items-start gap-1` com regra `has-data-[slot=card-action]:grid-cols-[1fr_auto]`. Validar: a escolha entre (a) envolver o navegador em `<CardAction>` exportado pelo card.tsx, (b) injetar `data-slot='card-action'` direto no root div do PeriodNavigator, (c) reescrever o CardHeader do chart com display flex. Critério: usar a abordagem que mais segue o pattern shadcn já usado em outros cards do projeto."

Anotar decisão em 1 linha aqui:
```
Decisão UI/UX (preencher após Skill): _____________________________________________
```

- [ ] **Step 2: Escrever teste falhando**

Criar `src/components/dashboard/__tests__/period-navigator-size.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodNavigator } from "../period-navigator";

describe("PeriodNavigator size constraint within CardHeader", () => {
  it("renderiza com data-slot='card-action' (ou wrapper) para fit-content sob CardHeader grid", () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Conversas por hora</CardTitle>
          <PeriodNavigator
            period="dia"
            range={{ start: "2026-05-03T03:00:00.000Z", end: "2026-05-04T02:59:59.999Z" }}
            tz="America/Sao_Paulo"
            weekStartsOn={1}
            referenceDate={null}
            nextAvailable={false}
            onChange={() => {}}
          />
        </CardHeader>
      </Card>,
    );
    // Garante que o navegador está marcado como card-action (faz CardHeader virar grid-cols-[1fr_auto])
    const action = container.querySelector('[data-slot="card-action"]');
    expect(action).not.toBeNull();
    // E que NÃO está com largura full (deve ser inline-flex / w-fit)
    const navRoot = container.querySelector('[role="group"][aria-label^="Navegação"]');
    expect(navRoot).not.toBeNull();
    expect(navRoot!.className).toMatch(/inline-flex|w-fit/);
  });
});
```

- [ ] **Step 3: Rodar teste e ver falhar**

Run:
```bash
npm test -- src/components/dashboard/__tests__/period-navigator-size.test.tsx
```

Expected: FAIL — `[data-slot="card-action"]` é null porque a versão atual não usa o slot.

- [ ] **Step 4: Aplicar fix conforme decisão UI/UX**

Caminho recomendado (dependendo da decisão da Step 1):
**Opção A — usar CardAction wrapper (mais idiomático):**

Em `src/components/dashboard/conversations-line-chart.tsx`:
```diff
-import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
...
-      <CardHeader className="pb-3 flex-row items-start justify-between gap-3">
+      <CardHeader className="pb-3">
         <div>
           <CardTitle ...>{title}</CardTitle>
           <p className="mt-1 text-xs text-muted-foreground">
             Selecione abaixo as séries que deseja ver no gráfico.
           </p>
         </div>
-        <PeriodNavigator
+        <CardAction>
+          <PeriodNavigator
             period={period}
             range={range}
             tz={tz}
             weekStartsOn={weekStartsOn}
             referenceDate={referenceDate}
             nextAvailable={nextAvailable}
             onChange={onReferenceDateChange}
-        />
+          />
+        </CardAction>
       </CardHeader>
```

**Opção B — só injetar data-slot no PeriodNavigator (menos refactor):**

Em `src/components/dashboard/period-navigator.tsx`:
```diff
   return (
     <div
+      data-slot="card-action"
       className={cn(
         "inline-flex items-center gap-1 rounded-lg border bg-violet-500/5 px-2 py-1.5",
         "border-violet-500/30 transition-all duration-150",
         "hover:border-violet-500/60 hover:bg-violet-500/10",
+        "w-fit",
       )}
       role="group"
       ...
```

E em `conversations-line-chart.tsx` remover as classes flex-row do CardHeader (que são no-op):
```diff
-      <CardHeader className="pb-3 flex-row items-start justify-between gap-3">
+      <CardHeader className="pb-3">
```

A Step 1 indica qual escolher. Aplicar **uma única opção**.

- [ ] **Step 5: Rodar teste e ver passar**

Run:
```bash
npm test -- src/components/dashboard/__tests__/period-navigator-size.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Smoke test visual no dev**

```bash
npm run dev
# Abrir http://localhost:3000/dashboard
# Verificar nos 3 períodos (Dia/Semana/Mês):
#   - Tag fica à direita do título "Conversas por hora/dia"
#   - Largura é fit-content (não estica)
#   - Hover ainda funciona (border-violet-500/60)
```

Expected: ✓ visual correto nos 3 períodos.

- [ ] **Step 7: Commit B1**

```bash
git add src/components/dashboard/period-navigator.tsx src/components/dashboard/conversations-line-chart.tsx src/components/dashboard/__tests__/period-navigator-size.test.tsx
git commit -m "fix(dashboard): T1 v0.34 — PeriodNavigator fit-content via CardAction slot (B1)"
```

---

## Task 2 — B2: Diagnostic logging detalhado por bucket

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-data.ts:684-705` (bloco `[dashboardData diag G2]`)

- [ ] **Step 1: Estender o log diagnóstico G2**

Em `src/lib/chatwoot/queries/dashboard-data.ts`, substituir o bloco de log atual por uma versão que dumpa cada bucket:

```diff
           if (process.env.NODE_ENV !== "test") {
-            console.log("[dashboardData diag G2]", {
-              accountId: args.accountId,
-              granularity,
-              rangeStart: args.period.start.toISOString(),
-              rangeEnd: args.period.end.toISOString(),
-              chartLen: data.chart.length,
-              chartFirstBucket: data.chart[0]?.bucket,
-              chartLastBucket: data.chart[data.chart.length - 1]?.bucket,
-              chartTotalReceived: data.chart.reduce(
-                (acc, r) => acc + r.received,
-                0,
-              ),
-              kpiReceived: received,
-            });
+            console.log("[dashboardData diag G2 v2]", {
+              accountId: args.accountId,
+              granularity,
+              rangeStart: args.period.start.toISOString(),
+              rangeEnd: args.period.end.toISOString(),
+              chartLen: data.chart.length,
+              kpiReceived: received,
+              kpiOpen: open,
+              kpiResolved: resolved,
+              chartTotalReceived: data.chart.reduce((a, r) => a + r.received, 0),
+              chartTotalOpen: data.chart.reduce((a, r) => a + r.open, 0),
+              chartTotalResolved: data.chart.reduce((a, r) => a + r.resolved, 0),
+              chartTotalPending: data.chart.reduce((a, r) => a + r.pending, 0),
+              // Dump por bucket (max 35 entries — janela mensal cabe)
+              chartBuckets: data.chart.slice(0, 35).map((b) => ({
+                bucket: b.bucket,
+                received: b.received,
+                open: b.open,
+                resolved: b.resolved,
+                pending: b.pending,
+              })),
+            });
           }
```

- [ ] **Step 2: Rodar typecheck**

```bash
npm run typecheck
```

Expected: 0 erros.

- [ ] **Step 3: Commit log diagnóstico**

```bash
git add src/lib/chatwoot/queries/dashboard-data.ts
git commit -m "chore(dashboard): T2 v0.34 — diag G2 v2 dump por bucket (rastrear B2)"
```

---

## Task 3 — B2: Teste de invariante SQL (RED)

**Files:**
- Create: `src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts`

- [ ] **Step 1: Mapear contrato esperado**

Invariante a provar:
> Dada uma única conversa C com `created_at = 2026-05-03 14:00 UTC` (= 11:00 SP) e `last_activity_at = 2026-05-03 14:00 UTC`, status=0:
> - `dashboardData(period: dia=03/05, granularity=hour)` retorna chart com 1 bucket onde open=1 (hora 11 SP).
> - `dashboardData(period: semana=27/04—03/05, granularity=day)` retorna chart com bucket 03/05 onde open=1.
> - `dashboardData(period: mês=01/05—31/05, granularity=day)` retorna chart com bucket 03/05 onde open=1.
> - Soma de open no chart "dia" == open do bucket 03/05 do chart "semana" == open do bucket 03/05 do chart "mês".

- [ ] **Step 2: Escrever teste de invariante (mock pg + facts)**

Criar `src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts`:

```ts
/**
 * Invariante v0.34 (B2 fix): para a mesma conversa, soma do chart no período
 * "dia" deve igualar valor do bucket diário no período "semana" e "mês".
 *
 * Esta suite usa mock do `getChatwootPool()` que devolve linhas pré-calculadas
 * por SQL — testando o COMPORTAMENTO observável do `dashboardData()` end-to-end.
 */
import { dashboardData } from "../dashboard-data";

jest.mock("../../pool", () => {
  const mockQuery = jest.fn();
  return {
    getChatwootPool: () => ({ query: mockQuery }),
    __mockQuery: mockQuery,
  };
});
jest.mock("../../resilience", () => ({
  withChatwootResilience: <T>(fn: () => Promise<T>) => fn(),
}));
jest.mock("@/lib/cache/pull-through", () => ({
  withCache: <T>(opts: { fetcher: () => Promise<T> }) => opts.fetcher(),
}));
jest.mock("@/lib/cache/keys", () => ({
  cacheKey: () => "test-key",
  hashFilters: () => "hash",
}));
jest.mock("@/lib/datetime", () => ({
  getPlatformTz: async () => "America/Sao_Paulo",
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __mockQuery } = require("../../pool") as { __mockQuery: jest.Mock };

interface Convo {
  account_id: number;
  created_at: Date;
  last_activity_at: Date;
  status: number;
  inbox_id: number;
}

function setupSingleOpenConvo(convo: Convo) {
  // Simula a SQL: dada a tabela de 1 conversa, retorna o que cada query veria.
  __mockQuery.mockImplementation((sql: string, params: unknown[]) => {
    const start = params[1] as Date;
    const end = params[2] as Date;
    const inRangeCreated =
      convo.created_at >= start && convo.created_at < end;
    const inRangeActivity =
      convo.last_activity_at >= start && convo.last_activity_at < end;
    const isOpen = convo.status === 0;
    const tz = (params[3] as string) ?? "America/Sao_Paulo";

    if (sql.includes("FROM conversations c\n            WHERE c.account_id = $1\n              AND c.created_at >=")) {
      // received / resolved KPI
      const total = inRangeCreated ? 1 : 0;
      return Promise.resolve({ rows: [{ total: String(sql.includes("AND c.status = 1") ? (convo.status === 1 ? 1 : 0) : total) }] });
    }
    if (sql.includes("c.last_activity_at >=") && sql.includes("AND c.status = 0\n              ${matrixClause}".replace("${matrixClause}", "")) ) {
      // open KPI
      return Promise.resolve({ rows: [{ total: String(inRangeActivity && isOpen ? 1 : 0) }] });
    }
    // Default: empty
    return Promise.resolve({ rows: [] });
  });
}

describe("dashboardData chart invariant (v0.34 B2)", () => {
  beforeEach(() => __mockQuery.mockReset());

  it.todo(
    "Conversa única open com last_activity_at em 03/05 11:00 SP aparece em todos os 3 períodos",
  );
  // Implementação completa após T4 (refactor SQL) garantir o mock determinístico.
});
```

> **Nota crítica:** este teste é RED como esqueleto. A implementação completa depende de T4 ter rewriten a SQL para um shape previsível. Vamos preencher os `it.todo` em T5 com `it(...)` reais. O propósito agora é deixar o arquivo criado e o invariante documentado.

- [ ] **Step 3: Rodar (vai dar pending todo)**

```bash
npm test -- src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts
```

Expected: 1 todo + 0 fail. Suite passa com pending.

- [ ] **Step 4: Commit invariante esqueleto**

```bash
git add src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts
git commit -m "test(dashboard): T3 v0.34 — esqueleto invariante chart cross-period (B2 RED)"
```

---

## Task 4 — B2: Refactor SQL (UNION ALL aggregate, sem FULL OUTER JOIN)

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-data.ts:280-362` (sqlChart hour + day)

- [ ] **Step 1: Substituir sqlChart por versão UNION ALL**

Em `src/lib/chatwoot/queries/dashboard-data.ts`, trocar o bloco `const sqlChart = granularity === "hour" ? ... : ...` por:

```ts
const truncUnit = granularity === "hour" ? "hour" : "day";
const sqlChart = `
  WITH unioned AS (
    -- received + resolved metrics: bucket por created_at
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
    -- open + pending metrics: bucket por last_activity_at
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

> **Por quê:** A `FULL OUTER JOIN ON cb.bucket = ab.bucket` depende de que os timestamptz produzidos pelas duas CTEs colidam EXATAMENTE. Em casos onde só uma das CTEs tem o bucket "hoje" (cenário do bug: 1 conversa antiga com last_activity_at = hoje, e nenhuma conversa criada hoje), o COALESCE deveria funcionar — mas a hipótese mais defensiva é eliminar o JOIN. UNION ALL + GROUP BY é equivalente em álgebra relacional, mais simples, e não tem corner case de comparação de timestamptz.

- [ ] **Step 2: Bumpar cache key (invalidar v8)**

Mesmo arquivo, linha do cache:
```diff
-    name: "dashboard-data-v8",
+    name: "dashboard-data-v9",
```

> Garante que após o deploy nenhum cliente leia cache antigo da query buggy.

- [ ] **Step 3: Rodar testes existentes do dashboard**

```bash
npm test -- src/lib/chatwoot/queries
npm test -- src/components/dashboard
```

Expected: nenhum test pré-existente quebra.

- [ ] **Step 4: Rodar typecheck**

```bash
npm run typecheck
```

Expected: 0 erros.

- [ ] **Step 5: Commit refactor SQL**

```bash
git add src/lib/chatwoot/queries/dashboard-data.ts
git commit -m "fix(dashboard): T4 v0.34 — sqlChart UNION ALL + cache v9 (B2 fix)"
```

---

## Task 5 — B2: Implementar invariante completo (GREEN)

**Files:**
- Modify: `src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts`

- [ ] **Step 1: Substituir `it.todo` por casos reais**

Reescrever o arquivo de teste com mocks que devolvem rows compatíveis com a nova SQL UNION ALL:

```ts
// (Reescrita completa do arquivo criado em T3 com casos reais.)
import { dashboardData } from "../dashboard-data";
import { fromZonedTime } from "date-fns-tz";

jest.mock("../../pool", () => {
  const mockQuery = jest.fn();
  return {
    getChatwootPool: () => ({ query: mockQuery }),
    __mockQuery: mockQuery,
  };
});
jest.mock("../../resilience", () => ({
  withChatwootResilience: <T>(fn: () => Promise<T>) => fn(),
}));
jest.mock("@/lib/cache/pull-through", () => ({
  withCache: <T>(opts: { fetcher: () => Promise<T> }) => opts.fetcher(),
}));
jest.mock("@/lib/cache/keys", () => ({
  cacheKey: () => "test-key",
  hashFilters: () => "hash",
}));
jest.mock("@/lib/datetime", () => ({
  getPlatformTz: async () => "America/Sao_Paulo",
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __mockQuery } = require("../../pool") as { __mockQuery: jest.Mock };

const TZ = "America/Sao_Paulo";

function chartRowFor(bucketUtc: string, open: number) {
  return {
    bucket: new Date(bucketUtc),
    received: "0",
    resolved: "0",
    open: String(open),
    pending: "0",
  };
}

function setupMocksForOpenConvoOn03_05_11h() {
  // KPI received: 0 (a conversa NÃO foi criada no período de 03/05).
  // KPI resolved: 0
  // KPI open: 1 (last_activity_at em 03/05)
  // Chart: 1 row no bucket 03/05 11h SP (= 14:00 UTC) para hour, ou 03/05 00:00 SP (03:00 UTC) para day.
  __mockQuery.mockImplementation((sql: string, params: unknown[]) => {
    const isCount = sql.includes("SELECT COUNT(*)::bigint AS total");
    if (isCount) {
      // Detecta qual count é (received vs resolved vs open) por filtros do SQL.
      if (sql.includes("AND c.status = 1")) return Promise.resolve({ rows: [{ total: "0" }] }); // resolved
      if (sql.includes("AND c.status = 0\n              ${matrixClause}".replace("${matrixClause}", "")) ||
          sql.includes("c.last_activity_at >=") && sql.includes("AND c.status = 0")) {
        return Promise.resolve({ rows: [{ total: "1" }] }); // open
      }
      return Promise.resolve({ rows: [{ total: "0" }] }); // received
    }
    if (sql.includes("WITH unioned AS")) {
      const isHour = sql.includes("date_trunc('hour'");
      const bucket = isHour
        ? fromZonedTime("2026-05-03T11:00:00", TZ).toISOString() // 14:00 UTC
        : fromZonedTime("2026-05-03T00:00:00", TZ).toISOString(); // 03:00 UTC
      return Promise.resolve({ rows: [chartRowFor(bucket, 1)] });
    }
    return Promise.resolve({ rows: [] });
  });
}

describe("dashboardData chart invariant (v0.34 B2)", () => {
  beforeEach(() => __mockQuery.mockReset());

  it("período DIA 03/05 retorna chart com open=1 no bucket 11h SP", async () => {
    setupMocksForOpenConvoOn03_05_11h();
    const result = await dashboardData({
      accountId: 1,
      period: {
        start: fromZonedTime("2026-05-03T00:00:00", TZ),
        end: fromZonedTime("2026-05-03T23:59:59.999", TZ),
      },
      prevPeriod: {
        start: fromZonedTime("2026-05-02T00:00:00", TZ),
        end: fromZonedTime("2026-05-02T23:59:59.999", TZ),
      },
      forcedGranularity: "hour",
    });
    const totalOpen = result.chart.reduce((a, r) => a + r.open, 0);
    expect(totalOpen).toBe(1);
  });

  it("período SEMANA 27/04—03/05 retorna chart com open=1 no bucket 03/05", async () => {
    setupMocksForOpenConvoOn03_05_11h();
    const result = await dashboardData({
      accountId: 1,
      period: {
        start: fromZonedTime("2026-04-27T00:00:00", TZ),
        end: fromZonedTime("2026-05-03T23:59:59.999", TZ),
      },
      prevPeriod: {
        start: fromZonedTime("2026-04-20T00:00:00", TZ),
        end: fromZonedTime("2026-04-26T23:59:59.999", TZ),
      },
      forcedGranularity: "day",
    });
    const bucket0305 = result.chart.find((r) =>
      r.bucket.startsWith("2026-05-03"),
    );
    expect(bucket0305).toBeDefined();
    expect(bucket0305!.open).toBe(1);
  });

  it("período MÊS 01/05—31/05 retorna chart com open=1 no bucket 03/05", async () => {
    setupMocksForOpenConvoOn03_05_11h();
    const result = await dashboardData({
      accountId: 1,
      period: {
        start: fromZonedTime("2026-05-01T00:00:00", TZ),
        end: fromZonedTime("2026-05-31T23:59:59.999", TZ),
      },
      prevPeriod: {
        start: fromZonedTime("2026-04-01T00:00:00", TZ),
        end: fromZonedTime("2026-04-30T23:59:59.999", TZ),
      },
      forcedGranularity: "day",
    });
    const bucket0305 = result.chart.find((r) =>
      r.bucket.startsWith("2026-05-03"),
    );
    expect(bucket0305).toBeDefined();
    expect(bucket0305!.open).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar suite e verificar verde**

```bash
npm test -- src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 3: Commit invariante green**

```bash
git add src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts
git commit -m "test(dashboard): T5 v0.34 — invariante chart cross-period GREEN (B2)"
```

---

## Task 6 — Verificação manual + smoke

**Files:** nenhum.

- [ ] **Step 1: Rodar dev e validar B1+B2 visualmente**

```bash
npm run dev
# http://localhost:3000/dashboard
# - Trocar entre Dia / Semana / Mês
# - Em cada período, hover no bucket de 03/05 (ou data de hoje) e validar que open bate com o que o KPI "Abertas" mostra
# - PeriodNavigator deve estar à direita do título e tamanho fit-content
```

Anotar contagens observadas:
```
Dia 03/05 — KPI Abertas: ___, soma chart open: ___
Semana 27/04-03/05 — bucket 03/05 open: ___
Mês MAI/26 — bucket 03/05 open: ___
Esperado: TODOS BATEM.
```

- [ ] **Step 2: Rodar test suite full**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: tudo passando.

---

## Task 7 — Release

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/agents/HISTORY.md`

- [ ] **Step 1: Entrada CHANGELOG**

Append no topo (sob `## [Unreleased]` ou criar `## [0.34.0] — 2026-05-03`):

```markdown
## [0.34.0] — 2026-05-03

### Fixed
- Dashboard `/dashboard`: PeriodNavigator do gráfico "Conversas por hora/dia" deixou de esticar à largura da célula do CardHeader; agora fit-content via slot `card-action` (B1).
- Dashboard `/dashboard`: contagens divergentes entre Dia/Semana/Mês corrigidas; SQL `sqlChart` refatorada de `WITH ... FULL OUTER JOIN` para `UNION ALL + GROUP BY` (mais simples e sem corner case de match de timestamptz). Cache key bumpada para `dashboard-data-v9` para invalidar entradas antigas (B2).

### Tests
- `period-navigator-size.test.tsx`: garante data-slot card-action sob CardHeader.
- `dashboard-data-chart-invariant.test.ts`: invariante de que open=1 aparece nos 3 períodos para a mesma conversa (regressão do B2).
```

- [ ] **Step 2: docs/STATUS.md — entrada de release**

Append linha:
```markdown
- 2026-05-03 — v0.34.0 — Dashboard chart fixes (B1 PeriodNavigator size + B2 cross-period inconsistency).
```

- [ ] **Step 3: docs/agents/HISTORY.md — append no commit final**

```
2026-05-03 HH:MM | agent=claude-dashboard-conversas-chart-fix | commit=<short> | scope=fix | summary=Dashboard chart B1 (PeriodNavigator fit-content) + B2 (sqlChart UNION ALL + cache v9 + invariante cross-period).
```

- [ ] **Step 4: Commit release final**

```bash
git add CHANGELOG.md docs/STATUS.md docs/agents/HISTORY.md
git commit -m "chore(release): v0.34 — dashboard chart fixes (B1 size + B2 cross-period)"
```

- [ ] **Step 5: Verificar fila de CI antes do push**

```bash
gh run list --limit 5
```

Se algum build de outro agente em curso → aguardar ou confirmar que não conflita.

- [ ] **Step 6: Push**

```bash
git push origin main
```

- [ ] **Step 7: Acompanhar deploy**

```bash
gh run watch
```

Expected: build verde, Portainer redeploy success, dashboard live com fix.

- [ ] **Step 8: Smoke produção + cleanup active file**

```bash
curl https://<prod-url>/api/health
# Abrir prod /dashboard, validar B1+B2 nos 3 períodos
rm docs/agents/active/claude-dashboard-conversas-chart-fix.md
git add docs/agents/active/claude-dashboard-conversas-chart-fix.md
git commit -m "chore(agents): close active file v0.34"
git push origin main
```

---

## Notas para o implementador

- **OBRIGATÓRIO** invocar `ui-ux-pro-max:ui-ux-pro-max` antes da T1 (qualquer toque em UI).
- **OBRIGATÓRIO** invocar `superpowers:test-driven-development` mentalmente em cada task (red → green → commit).
- **OBRIGATÓRIO** rodar typecheck + jest após cada task que toca código.
- Não amendar commits — sempre commit novo.
- Não usar `git add -A` ou `git add .` — stage explícito por arquivo.
- Coordenar com `claude-agente-nex-polish-v031` (v0.31) e `claude-conversas-filtros-v032` (v0.32) — escopos disjuntos, mas verificar `git status` antes de cada commit.
- Em caso de dúvida sobre algum arquivo modificado pelo agente alheio: NÃO STAGEAR. Deixar para o dono.
