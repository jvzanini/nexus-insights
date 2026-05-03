# Dashboard Conversas Chart Fix — Plan v3 (final)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Para qualquer task com toque em UI (T1), o subagent OBRIGATORIAMENTE invoca `ui-ux-pro-max:ui-ux-pro-max` antes de codar.

**Goal:** Corrigir 2 bugs do gráfico "Conversas por hora/dia" do Dashboard:
- **B1 (UI):** tag `<PeriodNavigator>` esticada à largura do CardHeader; deve ser fit-content alinhado à direita do título.
- **B2 (Data):** contagens divergentes Dia/Semana/Mês para o mesmo dia (caso reportado: 03/05 mostra 1 conversa Aberta no chart Dia, mas 0 nos buckets 03/05 dos charts Semana e Mês). Quebra fidelidade ao banco.

**Architecture:**
- **B1 (UI):** o `<CardHeader>` do shadcn (em `src/components/ui/card.tsx:23-34`) usa `display: grid auto-rows-min items-start gap-1` com regra condicional `has-data-[slot=card-action]:grid-cols-[1fr_auto]`. Sem o slot `card-action`, todos os filhos viram linhas full-width do grid (justify-items: stretch é default), o que estica o navegador. Solução: envolver `<PeriodNavigator>` em `<CardAction>` (componente já exportado em `card.tsx:59-70` com `col-start-2 row-span-2 row-start-1 self-start justify-self-end`, primeiro uso real do projeto). Isso ativa o template 2-col, move o navegador para a direita do título com tamanho fit-content. As classes `flex-row items-start justify-between gap-3` no CardHeader são removidas (no-op sob grid).
- **B2 (Data):** a query `sqlChart` em `src/lib/chatwoot/queries/dashboard-data.ts:280-362` usa `WITH created_buckets / activity_buckets ... FULL OUTER JOIN ON cb.bucket = ab.bucket`. Os sanity tests do v0.22.0 (`fill-buckets.test.ts`) provam que o lado cliente (`fillBuckets`) é correto — bug é server-side. Hipótese principal: o JOIN tem corner case quando o bucket "hoje" só existe em uma das CTEs (cenário do bug: 1 conversa antiga reaberta hoje, sem novas conversas criadas hoje). Solução defensiva: substituir CTE+JOIN por `UNION ALL` agregado com `GROUP BY bucket`. Equivalente em álgebra relacional, mais simples, sem dependência de match exato de timestamptz entre CTEs. Adicionalmente: bumpar cache key `dashboard-data-v8 → v9` (invalida resultados antigos) e estender log `[dashboardData diag G2]` para dump por bucket. Teste de invariante novo cobre os 3 períodos com mesma fixture.
- **Tech Stack:** Next.js 16 App Router, React 19, Recharts 3, Tailwind v4, base-ui, Postgres (Chatwoot replica read-only), Jest, jest-mock-extended, date-fns / date-fns-tz.

**Coordenação multi-agente (snapshot 2026-05-03 ~21:00):**
- HEAD em produção: `v0.34.0` (commit `2326c14`, Suite Agente Nex Polish v5).
- Working tree: clean. `git status` mostra apenas os 3 untracked deste plan.
- Active files paralelos:
  - `claude-multitenant-realtime-fase1` (v0.33 em curso — L0+L1 completos): escopo `src/lib/nexus-chat/*`, `src/lib/realtime/*`, `src/worker/*`, `prisma/schema.prisma`. **Sem overlap** com dashboard chart.
  - `claude-agente-nex-polish-v031` (release v0.34 já entregue — active file pode estar stale).
- Meu bump: `0.34.0 → 0.35.0`.

---

## File Structure

**Modify:**
- `src/components/dashboard/conversations-line-chart.tsx` — importar `<CardAction>`, envolver `<PeriodNavigator>` nele, limpar classes flex-row redundantes do `<CardHeader>`.
- `src/lib/chatwoot/queries/dashboard-data.ts` — refatorar `sqlChart` (CTE+JOIN → UNION ALL+GROUP BY); bumpar cache key v8→v9; estender log G2.
- `package.json` — bump 0.34.0 → 0.35.0.
- `CHANGELOG.md` — entrada `## [v0.35.0] 2026-05-03 — Dashboard chart fixes (B1+B2)`.
- `docs/STATUS.md` — append linha de release.
- `docs/agents/HISTORY.md` — append no commit final relevante.

**Create:**
- `src/components/dashboard/__tests__/period-navigator-card-action.test.tsx` — 1 spec: ao renderizar `<ConversationsLineChart>`, o DOM deve conter `[data-slot="card-action"]` envolvendo o `<PeriodNavigator>` (regression guard de B1).
- `src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts` — 4 specs cobrindo invariante cross-period: 1 conversa Aberta com `last_activity_at` em 03/05 11:00 SP, todos os 3 períodos devem mostrar `open=1` no bucket 03/05.

**Delete:** nenhum.

**NÃO TOCAR (escopo de outros agentes ativos):**
- `src/lib/nexus-chat/*`, `src/lib/realtime/*`, `src/worker/*`, `prisma/schema.prisma` (claude-multitenant-realtime-fase1, v0.33).

---

## Task 0 — Setup

**Files:**
- Create: `docs/agents/active/claude-dashboard-conversas-chart-fix.md` (✅ já criado)
- Modify: `package.json`

- [ ] **Step 1: Sync e check concorrência**

```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat"
git fetch origin main
git status
git show HEAD:package.json | grep '"version"'
ls docs/agents/active/
tail -10 docs/agents/HISTORY.md
gh run list --limit 5
```

Critério OK:
- Branch `main`, working tree clean (apenas meus untracked).
- HEAD package.json em 0.34.0.
- Nenhum CI run em `in_progress` ou `queued` de outro agente.

Se algum critério falhar (ex: `git status` mostra mods não-minhas, ou versão != 0.34.0): **PARAR** e reanalizar antes de prosseguir.

- [ ] **Step 2: Bumpar versão para 0.35.0**

Em `package.json`:
```diff
-  "version": "0.34.0",
+  "version": "0.35.0",
```

- [ ] **Step 3: Commit isolado do bump**

```bash
git add package.json
git commit -m "chore: bump 0.35.0 (dashboard chart fix B1+B2)"
```

---

## Task 1 — B1: PeriodNavigator size via `<CardAction>`

> **OBRIGATÓRIO PRIMEIRO PASSO:** Invocar `Skill` com `ui-ux-pro-max:ui-ux-pro-max`. A decisão arquitetural já está definida: usar `<CardAction>` wrapper (pattern shadcn idiomático). Skill confirma a escolha contra padrões de design.

**Files:**
- Modify: `src/components/dashboard/conversations-line-chart.tsx`
- Create: `src/components/dashboard/__tests__/period-navigator-card-action.test.tsx`

- [ ] **Step 1: Invocar `ui-ux-pro-max:ui-ux-pro-max`**

Skill prompt (texto exato a passar):

> Card do dashboard `<ConversationsLineChart>` tem `<CardTitle>Conversas por hora</CardTitle>` à esquerda + tag-chevron `<PeriodNavigator>` (atualmente abaixo do título, esticada). CardHeader do shadcn (`src/components/ui/card.tsx:23-34`) usa `display: grid auto-rows-min items-start gap-1` com regra `has-data-[slot=card-action]:grid-cols-[1fr_auto]`. O `<CardAction>` exportado em `card.tsx:59-70` tem classes `col-start-2 row-span-2 row-start-1 self-start justify-self-end` e injeta `data-slot="card-action"`. Validar que envolver `<PeriodNavigator>` em `<CardAction>` é o pattern shadcn correto e produz: navegador à direita do título, fit-content (sem stretch), alinhamento topo. Tema dark, paleta violet (`bg-violet-500/5 border-violet-500/30`).

Output esperado: ✓ confirma `<CardAction>`.

Anotar 1 linha após Skill (preencher):
```
Decisão UI/UX: __________________________________________________________
```

- [ ] **Step 2: Escrever teste falhando (RED) — guard de regressão**

Criar `src/components/dashboard/__tests__/period-navigator-card-action.test.tsx`:

```tsx
/**
 * v0.35 B1 regression guard: <PeriodNavigator> dentro do <ConversationsLineChart>
 * deve estar envelopado em <CardAction> (data-slot="card-action") para que o
 * CardHeader vire grid-cols-[1fr_auto] e o navegador fique fit-content à
 * direita do título (não esticado full-width).
 */
import { render } from "@testing-library/react";
import { ConversationsLineChart } from "../conversations-line-chart";

// recharts ResponsiveContainer precisa de width/height para renderizar; em
// jsdom funciona ok porque definimos width="100%" + height={350} e o LineChart
// é aninhado em <div style={{ width: "100%", height: 350 }}>.

describe("ConversationsLineChart — B1 PeriodNavigator wrapped in <CardAction> (v0.35)", () => {
  it("DOM contém [data-slot='card-action'] envolvendo <PeriodNavigator>", () => {
    const { container } = render(
      <ConversationsLineChart
        data={[]}
        granularity="hour"
        tz="America/Sao_Paulo"
        range={{
          start: "2026-05-03T03:00:00.000Z",
          end: "2026-05-04T02:59:59.999Z",
        }}
        period="dia"
        weekStartsOn={1}
        referenceDate={null}
        nextAvailable={false}
        onReferenceDateChange={() => {}}
      />,
    );
    const action = container.querySelector('[data-slot="card-action"]');
    expect(action).not.toBeNull();
    // O CardAction deve conter o group do PeriodNavigator
    const navInsideAction = action!.querySelector(
      '[role="group"][aria-label^="Navegação"]',
    );
    expect(navInsideAction).not.toBeNull();
    // Garante que o navegador mantém inline-flex (sem stretch)
    expect(navInsideAction!.className).toMatch(/inline-flex/);
  });
});
```

- [ ] **Step 3: Rodar teste e ver falhar (RED)**

```bash
npm test -- src/components/dashboard/__tests__/period-navigator-card-action.test.tsx
```

Expected: **FAIL** — querySelector retorna `null` para `[data-slot="card-action"]` porque a versão atual do `conversations-line-chart.tsx` não usa `<CardAction>`.

- [ ] **Step 4: Aplicar fix em `conversations-line-chart.tsx`**

Editar o arquivo. Atualizar import:

```diff
-import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
```

E o JSX do CardHeader (procurar por `<CardHeader className="pb-3 flex-row items-start justify-between gap-3">`):

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

> **Não tocar** em `period-navigator.tsx` — o componente já tem `inline-flex` correto. Toda a fix B1 é estrutural no parent.

- [ ] **Step 5: Rodar teste (GREEN) + typecheck**

```bash
npm test -- src/components/dashboard/__tests__/period-navigator-card-action.test.tsx
npm run typecheck
```

Expected: **PASS** no test, 0 erros no typecheck.

- [ ] **Step 6: Smoke visual no dev**

```bash
npm run dev
```

Abrir `http://localhost:3000/dashboard`. Validar nos 3 períodos:

| Período | Critério visual |
|---------|----------------|
| Dia | Tag `< 03/05 >` à direita do título "Conversas por hora", largura ~110-130px, hover muda border para violet-500/60 |
| Semana | Tag `< 27/04 — 03/05 >` à direita, largura ~190-220px, hover ok |
| Mês | Tag `< MAI/26 >` à direita, largura ~110-130px, hover ok |

Sucesso = tag à direita + fit-content + hover funcional + chevrons clicáveis nos 3 modos.

- [ ] **Step 7: Commit B1**

```bash
git add src/components/dashboard/conversations-line-chart.tsx src/components/dashboard/__tests__/period-navigator-card-action.test.tsx
git commit -m "fix(dashboard): T1 v0.35 — PeriodNavigator fit-content via <CardAction> (B1)"
```

---

## Task 2 — B2: Diagnostic logging por bucket

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-data.ts` (substituir bloco `[dashboardData diag G2]`)

- [ ] **Step 1: Estender log G2 com dump por bucket**

Localizar o bloco `if (process.env.NODE_ENV !== "test") { console.log("[dashboardData diag G2]" ...` (no final da função `dashboardData`, dentro do fetcher) e substituir por:

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
    // Dump por bucket (max 35 entries cobre janela mensal)
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
git commit -m "chore(dashboard): T2 v0.35 — diag G2 v2 dump por bucket (B2 telemetria)"
```

---

## Task 3 — B2: Teste de invariante cross-period (RED)

**Files:**
- Create: `src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts`

- [ ] **Step 1: Estratégia de mock**

`dashboardData` faz 14 queries em paralelo (`Promise.all`). Mock pool retorna rows determinísticas detectando a query por **marcadores estáveis**:
- `sqlChart` (T4 refatorada) → contém `WITH unioned AS` (literal exclusivo)
- KPI counts → contém `SELECT COUNT(*)::bigint AS total`
- demais (top-agents, by-team, no-response, recent, etc) → `{ rows: [] }`

Antes de T4 a SQL atual usa `WITH created_buckets`. Como o mock detecta `WITH unioned AS` (não existe ainda), o chart cai em `{ rows: [] }` → asserts falham → **RED**.

- [ ] **Step 2: Escrever teste falhando**

Criar `src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts`:

```ts
/**
 * v0.35 B2 invariante: para a mesma conversa Aberta com last_activity_at em
 * 03/05 11:00 SP (= 14:00 UTC), os 3 períodos (dia/semana/mês) devem mostrar
 * open=1 no bucket 03/05.
 *
 * Mock pool detecta queries por marcadores estáveis (substring exclusivo):
 *  - sqlChart (T4 refatorada): contém "WITH unioned AS"
 *  - KPI counts: contém "SELECT COUNT(*)::bigint AS total"
 *  - demais queries: irrelevantes ao invariante, retornam rows vazias.
 *
 * Antes de T4 (sqlChart ainda usa "WITH created_buckets") os tests falham —
 * é o estado RED da TDD.
 */
import { dashboardData } from "../dashboard-data";
import { fromZonedTime } from "date-fns-tz";

const mockQuery = jest.fn();

jest.mock("../../pool", () => ({
  getChatwootPool: () => ({
    query: (...args: unknown[]) => mockQuery(...args),
  }),
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
  // Cenário: 1 conversa status=0 com last_activity_at = 03/05 14:00 UTC
  // (= 11:00 SP). Criada antes do período ⇒ received=0, resolved=0, open=1.
  mockQuery.mockImplementation((sql: string) => {
    // KPI counts
    if (sql.includes("SELECT COUNT(*)::bigint AS total")) {
      // received OR resolved (filtra por created_at): 0
      if (
        sql.includes("c.created_at >=") &&
        !sql.includes("c.last_activity_at")
      ) {
        return Promise.resolve({ rows: [{ total: "0" }] });
      }
      // open (filtra por last_activity_at + status=0): 1
      if (
        sql.includes("c.last_activity_at >=") &&
        sql.includes("c.status = 0")
      ) {
        return Promise.resolve({ rows: [{ total: "1" }] });
      }
      return Promise.resolve({ rows: [{ total: "0" }] });
    }
    // sqlChart refatorada (T4) — UNION ALL
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
    // Demais queries (top-agents, top-inboxes, by-team, by-status,
    // no-response, recent) — irrelevantes ao invariante.
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

describe("dashboardData chart invariant cross-period (v0.35 B2)", () => {
  beforeEach(() => mockQuery.mockReset());

  it("DIA 03/05 (granularity=hour) retorna soma open=1 no chart", async () => {
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

  it("SEMANA 27/04—03/05 (granularity=day) retorna open=1 no bucket 03/05", async () => {
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

  it("MÊS 01/05—31/05 (granularity=day) retorna open=1 no bucket 03/05", async () => {
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

  it("CONSISTÊNCIA: dia(soma)=semana(bucket-03/05)=mês(bucket-03/05)=1", async () => {
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
    const bucketSemana = semana.chart.find((r) =>
      r.bucket.startsWith("2026-05-03"),
    )!.open;
    const bucketMes = mes.chart.find((r) =>
      r.bucket.startsWith("2026-05-03"),
    )!.open;
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

Expected: **4 tests FAIL** — chart vazio (mock não detecta `WITH unioned AS` que ainda não existe), asserts caem.

- [ ] **Step 4: Commit RED**

```bash
git add src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts
git commit -m "test(dashboard): T3 v0.35 — invariante chart cross-period RED (B2)"
```

---

## Task 4 — B2: Refactor SQL para UNION ALL + GROUP BY (GREEN)

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-data.ts`

- [ ] **Step 1: Substituir bloco `sqlChart`**

Localizar `// ---------- 5. Chart bucketed (4 séries) ----------` (em torno da linha 280) e o `const sqlChart = granularity === "hour" ? \`...\` : \`...\``. Substituir TODO o bloco (do comentário até o fechamento da template string day) por:

```ts
// ---------- 5. Chart bucketed (4 séries) — v0.35 B2 fix ----------
//
// Refactor: WITH ... FULL OUTER JOIN → UNION ALL + GROUP BY
//  - Recebidas/Resolvidas: bucket por created_at (filtra created_at no período).
//  - Abertas/Pendentes: bucket por last_activity_at (filtra last_activity_at).
//  - Linhas viram união, agregação final via SUM por bucket.
//
// Por quê: o JOIN dependia de match exato de timestamptz entre 2 CTEs. No
// cenário "1 conversa antiga reaberta hoje + 0 conversas criadas hoje", o
// bucket "hoje" só existia em activity_buckets. COALESCE deveria coalescer,
// mas observamos divergência empírica em produção (KPI Open=1 mas chart
// bucket Open=0 em Semana/Mês). UNION ALL elimina a dependência do JOIN.
//
// `truncUnit` é constante derivada de granularity (hard-coded "hour"|"day"),
// sem risco de SQL injection.
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

Mesmo arquivo, localizar `name: "dashboard-data-v8"` e mudar:
```diff
-    name: "dashboard-data-v8",
+    name: "dashboard-data-v9",
```

> Garante que após o deploy nenhum cliente leia cache antigo da query buggy v8.

- [ ] **Step 3: Rodar invariante (GREEN)**

```bash
npm test -- src/lib/chatwoot/queries/__tests__/dashboard-data-chart-invariant.test.ts
```

Expected: **4 tests PASS**.

- [ ] **Step 4: Rodar suite dashboard + queries + typecheck**

```bash
npm test -- src/lib/chatwoot/queries
npm test -- src/components/dashboard
npm run typecheck
```

Expected: nenhum test pré-existente quebra; 0 erros typecheck.

- [ ] **Step 5: Commit GREEN**

```bash
git add src/lib/chatwoot/queries/dashboard-data.ts
git commit -m "fix(dashboard): T4 v0.35 — sqlChart UNION ALL + cache v9 (B2 fix)"
```

---

## Task 5 — Verificação manual full-stack

**Files:** nenhum (smoke test).

- [ ] **Step 1: Smoke dev — B1+B2 cruzado**

```bash
npm run dev
```

Em `http://localhost:3000/dashboard`, fazer screenshot de cada período e preencher tabela:

| Período | KPI Abertas | Σ chart Open | Bucket 03/05 Open | Match? |
|---------|-------------|--------------|-------------------|--------|
| Dia (03/05) | __ | __ | (mesmo bucket) __ | __ |
| Semana (27/04—03/05) | __ | __ | __ | __ |
| Mês (MAI/26) | __ | __ | __ | __ |

**Critério de sucesso B2:** KPI Abertas == Σ chart Open == Bucket 03/05 Open em **todos os 3 períodos**.

**Critério de sucesso B1:** tag `<PeriodNavigator>` à direita do título, fit-content, hover violet, chevrons clicáveis.

- [ ] **Step 2: Test suite full + lint**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: tudo verde.

- [ ] **Step 3: Fallback se B2 ainda divergir**

> Se a tabela do Step 1 ainda mostrar divergência em algum período:
>
> 1. **NÃO fazer release.** Inspecionar logs `[dashboardData diag G2 v2]` no console do `npm run dev`.
> 2. Comparar `chartBuckets` per period — onde está o bucket discrepante?
> 3. Se a SQL UNION ALL ainda retorna divergência → bug está fora da SQL. Investigar:
>    - `withCache` em `src/lib/cache/pull-through.ts` (TTL não respeitado?).
>    - `revalidate` ou `force-dynamic` em `src/app/(protected)/dashboard/page.tsx`.
>    - Layer de fetch caching do Next.js.
> 4. Documentar findings em `docs/agents/active/claude-dashboard-conversas-chart-fix.md` na seção `## Bloqueios` e PARAR.

---

## Task 6 — Release v0.35.0

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/agents/HISTORY.md`

- [ ] **Step 1: CHANGELOG**

Append no topo (acima da entrada `## [v0.34.0]`):

```markdown
## [v0.35.0] 2026-05-03 — Dashboard chart fixes (PeriodNavigator size + cross-period sync)

> 2 bugs do gráfico "Conversas por hora/dia" do menu Dashboard. Workflow rigoroso (plan v1→v2→v3 com 16+ achados em 2 pentes-finos REAIS · subagent-driven-development com TDD · ui-ux-pro-max em T1).

### Fixes

- **B1 — PeriodNavigator esticado:** o `<CardHeader>` do shadcn é grid com regra `has-data-[slot=card-action]:grid-cols-[1fr_auto]`. Sem o slot, filhos viraram linhas full-width — tag de período do gráfico ficava com largura fixa enorme. Solução: envolver `<PeriodNavigator>` em `<CardAction>` (primeiro uso real do componente exportado em `card.tsx`). Fit-content + alinhamento direito do título.
- **B2 — Contagens divergentes Dia/Semana/Mês:** chart Dia mostrava 1 conversa Aberta no dia 03/05 (correto), mas chart Semana e Mês mostravam 0 no mesmo bucket. Fonte: `sqlChart` usava `WITH created_buckets / activity_buckets ... FULL OUTER JOIN ON cb.bucket = ab.bucket`. Em cenário "1 conversa antiga reaberta hoje sem novas conversas criadas hoje", o bucket "hoje" só existia em uma CTE — embora COALESCE devesse coalescer, observamos divergência empírica. Refator: `UNION ALL + GROUP BY bucket`, equivalente em álgebra relacional, sem dependência de match exato de timestamptz. Cache key v8→v9 para invalidar resultados antigos.

### Tests

- `period-navigator-card-action.test.tsx`: 1 spec garante `data-slot="card-action"` envolvendo o PeriodNavigator no `<ConversationsLineChart>`.
- `dashboard-data-chart-invariant.test.ts`: 4 specs cobrindo invariante cross-period (Dia open=1, Semana bucket 03/05 open=1, Mês bucket 03/05 open=1, consistência entre os 3).

### Diagnostics

- `[dashboardData diag G2 v2]`: log estendido com dump por bucket (max 35 entries) — facilita debug de regressão futura.
```

- [ ] **Step 2: docs/STATUS.md**

Append no topo:
```markdown
- 2026-05-03 — v0.35.0 — Dashboard: PeriodNavigator fit-content via <CardAction> (B1) + sqlChart UNION ALL fix da divergência cross-period (B2).
```

- [ ] **Step 3: HISTORY.md**

Append linha (substituir `<HH:MM>` e `<short>` no commit final):
```
2026-05-03 <HH:MM> | agent=claude-dashboard-conversas-chart-fix | commit=<short> | scope=fix | summary=Dashboard chart B1 (PeriodNavigator <CardAction> fit-content) + B2 (sqlChart UNION ALL aggregate + cache v9 + invariante cross-period 4 tests).
```

- [ ] **Step 4: Stage só do que é meu + commit release**

```bash
git status
```

Verificar que só CHANGELOG.md, docs/STATUS.md, docs/agents/HISTORY.md modificados. Se houver algo a mais (não-meu): NÃO STAGEAR.

```bash
git add CHANGELOG.md docs/STATUS.md docs/agents/HISTORY.md
git commit -m "chore(release): v0.35 — dashboard chart fixes (B1 size + B2 cross-period)"
```

- [ ] **Step 5: Re-checar fila CI antes do push**

```bash
gh run list --limit 5
git fetch origin main
git log --oneline HEAD..origin/main
```

Critério OK: nenhum CI run em curso de outro agente; nenhum commit remoto novo desde meu fetch.

Se houver commit remoto novo → `git pull --rebase origin main` → resolver conflitos manualmente → re-rodar `npm test` + `npm run typecheck` antes do push.

- [ ] **Step 6: Push**

```bash
git push origin main
```

- [ ] **Step 7: Acompanhar deploy**

```bash
gh run watch
```

Expected: build verde, Portainer redeploy success, dashboard live com fix.

- [ ] **Step 8: Smoke produção**

URL produção: deduzida do label Traefik no `docker-compose.yml` (campo `Host(...)` em `traefik.http.routers.app.rule`). Pedir ao João se necessário.

Validar B1+B2 nos 3 períodos repetindo a tabela de Step 1 da T5 com valores de produção. Cache key v9 garante que o resultado vem da SQL nova (não há janela de espera por TTL).

- [ ] **Step 9: Cleanup active file**

```bash
rm docs/agents/active/claude-dashboard-conversas-chart-fix.md
git add docs/agents/active/claude-dashboard-conversas-chart-fix.md
git commit -m "chore(agents): close active file v0.35 dashboard chart fix"
git push origin main
```

---

## Notas para o implementador

- **OBRIGATÓRIO** invocar `Skill ui-ux-pro-max:ui-ux-pro-max` ANTES da T1 Step 2 — qualquer toque em UI exige a skill no controlador E no subagent (CLAUDE.md §2.2). Sem rationalização.
- **OBRIGATÓRIO** invocar `superpowers:test-driven-development` mentalmente em cada task: red → green → commit. T1 e T3+T4 já estão estruturados em RED/GREEN explícitos.
- **OBRIGATÓRIO** rodar `npm run typecheck` após cada task que toca código TS/TSX.
- Não amendar commits — sempre `git commit` novo.
- Não usar `git add -A` ou `git add .` — sempre stage explícito por arquivo (regra coordenação multi-agente).
- Coordenar com `claude-multitenant-realtime-fase1` (v0.33 ativo, escopo `src/lib/nexus-chat/*`, `src/worker/*`, `prisma/schema.prisma`). Sem overlap com dashboard chart, mas verificar `git status` e `git fetch` antes de cada commit.
- Se `git status` mostrar arquivos modificados que não são deste plan: NÃO STAGEAR. Deixar pro dono.
- Skip versão 0.34 já lançada. Bump 0.34 → 0.35.
