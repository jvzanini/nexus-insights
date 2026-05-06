# Dashboard Refresh & Chart Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o erro "too many connections", conectar o intervalo de polling configurável ao dashboard, reconstruir a seção "Atualização" em Configurações removendo o que é obsoleto, e estender os gráficos para mostrar o período completo com slots futuros vazios.

**Architecture:** (1) Retry com backoff em `queryNexusChat` + erro não-destrutivo no dashboard quando há dados stale. (2) `polling.live_seconds` lido no server component do dashboard e passado como prop. (3) Form de configurações reconstruído com apenas o que tem efeito real. (4) Nova função `buildFullPeriodRows` em `conversations-line-chart.tsx` que mantém todos os buckets mas anula valores futuros — mesma lógica aplicada nos drill-down charts.

**Tech Stack:** Next.js 15 App Router, TypeScript, Recharts, pg (node-postgres), Tailwind v4, Sonner toasts

---

## Mapa de arquivos

| Arquivo | Mudança |
|---------|---------|
| `src/lib/nexus-chat/pool.ts` | Retry com backoff em `queryNexusChat` |
| `src/components/dashboard/dashboard-content.tsx` | Aceitar `pollIntervalMs` + `showRefreshButton`; erro não-destrutivo |
| `src/app/(protected)/dashboard/page.tsx` | Ler `polling.live_seconds` + `polling.refresh_button_enabled` e passar como props |
| `src/components/dashboard/dashboard-filters.tsx` | Aceitar `showRefreshButton?: boolean` |
| `src/components/settings/polling-settings-form.tsx` | Remover `historicalSeconds` + `sseEnabled`; atualizar textos |
| `src/app/(protected)/configuracoes/page.tsx` | Remover leitura de `historicalSeconds` + `sseEnabled` do form |
| `src/components/dashboard/conversations-line-chart.tsx` | Nova função `buildFullPeriodRows`; `ChartRow` com nulls; tooltip atualizado |
| `src/components/dashboard/drill-down-contents.tsx` | `ReceivedLineChart` + `ResolvedLineChart` usam mesma lógica |
| `src/components/charts/__tests__/` | Atualizar / criar testes unitários para `buildFullPeriodRows` |

---

## Task 1: Retry com backoff em `queryNexusChat`

**Files:**
- Modify: `src/lib/nexus-chat/pool.ts`

O erro "too many connections for role chatwoot_leitura" ocorre quando o PG rejeita novas conexões. Com retry + backoff, tentativas transitórias se recuperam sem propagar o erro para o usuário.

- [ ] **Step 1: Ler o arquivo atual**

```bash
# Confirmar linha do queryNexusChat
grep -n "queryNexusChat" src/lib/nexus-chat/pool.ts
```

Expected: linhas ~130-137 com a função.

- [ ] **Step 2: Adicionar helper `withRetry` e atualizar `queryNexusChat`**

Em `src/lib/nexus-chat/pool.ts`, antes da função `queryNexusChat`, adicionar:

```typescript
const RETRYABLE_CODES = new Set(["53300", "53200", "08006", "08001", "08P01"]);

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string }).code ?? "";
      if (!RETRYABLE_CODES.has(code)) throw err;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
      }
    }
  }
  throw lastErr;
}
```

Atualizar `queryNexusChat`:

```typescript
export async function queryNexusChat<T extends Record<string, unknown>>(
  connectionId: string,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return withRetry(async () => {
    const pool = await getNexusChatPool(connectionId);
    return pool.query<T>(sql, params);
  });
}
```

- [ ] **Step 3: Commitar**

```bash
git add src/lib/nexus-chat/pool.ts
git commit -m "fix(pool): retry com backoff em queryNexusChat para erros de conexão PG"
```

---

## Task 2: Erro não-destrutivo no dashboard (mostrar stale data)

**Files:**
- Modify: `src/components/dashboard/dashboard-content.tsx`

Quando um re-poll falha mas já há dados carregados, não limpar a tela — apenas mostrar um banner de aviso sutil.

- [ ] **Step 1: Localizar o bloco `if (!data && error)`**

```bash
grep -n "if (!data && error)" src/components/dashboard/dashboard-content.tsx
```

Expected: linha ~249.

- [ ] **Step 2: Adicionar estado `staleError` e banner**

Após a linha `const [isInitialLoad, setIsInitialLoad] = useState(true);`, adicionar:

```typescript
const [staleError, setStaleError] = useState<string | null>(null);
```

No `fetchData`, no bloco `catch` e no bloco `setError`:

```typescript
// troca setError por:
if (result.success && result.data) {
  setData(result.data);
  setError(null);
  setStaleError(null);
} else {
  if (data) {
    // já há dados — não destruir, apenas alertar
    setStaleError(result.error ?? "Erro ao atualizar dados");
  } else {
    setError(result.error ?? "Erro ao carregar dados");
  }
}
// no catch:
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[fetchData] erro ao chamar getDashboardData:", err);
  if (data) {
    setStaleError(`Erro de conexão: ${message}`);
  } else {
    setError(`Erro de conexão: ${message}`);
  }
}
```

Adicionar banner logo abaixo do bloco de greeting (antes dos filtros), visível apenas quando `staleError != null`:

```tsx
{staleError ? (
  <motion.div
    variants={itemVariants}
    className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-400"
  >
    <RefreshCw className="h-3.5 w-3.5 shrink-0" />
    <span>Dados podem estar desatualizados — {staleError}</span>
  </motion.div>
) : null}
```

Garantir que `RefreshCw` está nos imports (já está importado via `lucide-react`).

- [ ] **Step 3: Commitar**

```bash
git add src/components/dashboard/dashboard-content.tsx
git commit -m "fix(dashboard): erro de re-poll não destrói dados existentes — banner stale"
```

---

## Task 3: Ler polling settings no server e conectar ao dashboard

**Files:**
- Modify: `src/app/(protected)/dashboard/page.tsx`
- Modify: `src/components/dashboard/dashboard-content.tsx`
- Modify: `src/components/dashboard/dashboard-filters.tsx`

O dashboard tem `POLL_INTERVAL = 60_000` hardcoded. O usuário configurou 30s em Configurações mas isso não tem efeito. Vamos conectar.

- [ ] **Step 1: Atualizar `DashboardPage` para ler polling settings**

Em `src/app/(protected)/dashboard/page.tsx`, adicionar imports:

```typescript
import { getAllSettings } from "@/lib/actions/settings";
```

Na função `DashboardPage`, adicionar `getAllSettings()` no `Promise.all`:

```typescript
const [activeAccountId, allAccounts, accessibleIds, tz, settingsData] = await Promise.all([
  getActiveAccountId(authUser),
  getKnownAccounts(),
  getAccessibleAccountIds(authUser),
  getPlatformTz(),
  getAllSettings().then((r) => (r.success && r.data ? r.data : {})).catch(() => ({})),
]);
```

Extrair as settings:

```typescript
const pollIntervalMs = Math.max(
  5_000,
  Math.min(300_000, Number(settingsData["polling.live_seconds"] ?? 30) * 1000),
);
const showRefreshButton =
  settingsData["polling.refresh_button_enabled"] !== false &&
  settingsData["polling.refresh_button_enabled"] !== "false";
```

Passar ao `DashboardContent`:

```tsx
<DashboardContent
  userName={user.name}
  initialAccountId={safeAccountId}
  connectionId={connectionId}
  initialAccounts={accounts}
  tz={tz}
  pollIntervalMs={pollIntervalMs}
  showRefreshButton={showRefreshButton}
/>
```

- [ ] **Step 2: Atualizar `DashboardContent` para aceitar as novas props**

Em `src/components/dashboard/dashboard-content.tsx`:

Adicionar ao `DashboardContentProps`:

```typescript
pollIntervalMs?: number;
showRefreshButton?: boolean;
```

Remover `const POLL_INTERVAL = 60_000;` e usar a prop com fallback:

```typescript
const effectivePollInterval = pollIntervalMs ?? 60_000;
```

No `useEffect` e `handleRefresh`, substituir `POLL_INTERVAL` por `effectivePollInterval`.

Passar `showRefreshButton` ao `DashboardFilters`:

```tsx
<DashboardFilters
  selectedPeriod={period}
  isLoading={isLoading}
  onPeriodChange={handlePeriodChange}
  onRefresh={handleRefresh}
  showRefreshButton={showRefreshButton ?? true}
/>
```

- [ ] **Step 3: Atualizar `DashboardFilters`**

Em `src/components/dashboard/dashboard-filters.tsx`:

Adicionar à interface:

```typescript
showRefreshButton?: boolean;
```

Envolver o botão em condição:

```tsx
{(showRefreshButton ?? true) ? (
  <Button ... >
    <RefreshCw ... />
  </Button>
) : null}
```

- [ ] **Step 4: Commitar**

```bash
git add src/app/(protected)/dashboard/page.tsx \
        src/components/dashboard/dashboard-content.tsx \
        src/components/dashboard/dashboard-filters.tsx
git commit -m "feat(dashboard): polling interval e refresh button lidos de settings (30s padrão)"
```

---

## Task 4: Reconstruir seção Atualização em Configurações

**Files:**
- Modify: `src/components/settings/polling-settings-form.tsx`
- Modify: `src/app/(protected)/configuracoes/page.tsx`

Remover `historicalSeconds` (nada lê) e `sseEnabled` (SSE não conectado ao dashboard). Manter apenas o que tem efeito real após Task 3.

- [ ] **Step 1: Atualizar `PollingSettingsFormProps`**

Em `src/components/settings/polling-settings-form.tsx`, remover `historicalSeconds` e `sseEnabled` da interface e do state:

```typescript
interface PollingSettingsFormProps {
  initial: {
    liveSeconds: number;
    refreshButtonEnabled: boolean;
  };
}
```

Remover `const [historicalSeconds, setHistoricalSeconds]` e `const [sseEnabled, setSseEnabled]`.

- [ ] **Step 2: Atualizar `handleSave`**

Manter apenas dois `updateSetting`:

```typescript
const updates = [
  updateSetting({ key: "polling.live_seconds", value: live, category: "polling" }),
  updateSetting({ key: "polling.refresh_button_enabled", value: refreshButtonEnabled, category: "polling" }),
];
```

- [ ] **Step 3: Atualizar JSX**

Remover o grid de dois campos, deixar apenas o campo de intervalo ao vivo com descrição clara do que ele faz, e o toggle do botão de atualização:

```tsx
return (
  <div className="space-y-6">
    <div className="space-y-1.5">
      <Label htmlFor="polling-live">Intervalo de atualização automática (segundos)</Label>
      <Input
        id="polling-live"
        type="number"
        min={LIVE_MIN}
        max={LIVE_MAX}
        value={liveSeconds}
        onChange={(e) => setLiveSeconds(parseInt(e.target.value, 10) || 0)}
        disabled={isPending}
        className="max-w-[200px]"
      />
      <p className="text-xs text-muted-foreground">
        O dashboard busca dados novos automaticamente a cada X segundos ({LIVE_MIN}–{LIVE_MAX}s). Valor atual aplicado: {liveSeconds}s.
      </p>
    </div>

    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/40 p-3.5">
        <div>
          <p className="text-sm font-medium text-foreground">
            Botão &ldquo;Atualizar agora&rdquo;
          </p>
          <p className="text-xs text-muted-foreground">
            Exibir botão de atualização manual no dashboard.
          </p>
        </div>
        <Switch
          checked={refreshButtonEnabled}
          onCheckedChange={setRefreshButtonEnabled}
          disabled={isPending}
        />
      </div>
    </div>

    <div className="flex justify-end">
      <Button onClick={handleSave} disabled={isPending} className="cursor-pointer">
        {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
        Salvar
      </Button>
    </div>
  </div>
);
```

- [ ] **Step 4: Atualizar `configuracoes/page.tsx`**

Remover `historicalSeconds` e `sseEnabled` do objeto `polling`:

```typescript
const polling = {
  liveSeconds: readNumber(data["polling.live_seconds"], 30),
  refreshButtonEnabled: readBoolean(data["polling.refresh_button_enabled"], true),
};
```

Remover imports e variáveis não usados (`Eye`, `VisibilitySettingsForm` se for o caso — verificar). Os imports `Eye` e o Card de Visibilidade são separados e devem ser mantidos.

- [ ] **Step 5: Commitar**

```bash
git add src/components/settings/polling-settings-form.tsx \
        src/app/(protected)/configuracoes/page.tsx
git commit -m "refactor(settings): seção Atualização simplificada — remove obsoletos historical/sse"
```

---

## Task 5: Gráfico com período completo (full-period chart)

**Files:**
- Modify: `src/components/dashboard/conversations-line-chart.tsx`

Mostrar todos os buckets do período (24h para diário, todos os dias para semanal/mensal). Buckets futuros ficam com valores `null` (sem linha, sem tooltip).

- [ ] **Step 1: Estender o tipo `ChartRow` para aceitar nulls**

Em `conversations-line-chart.tsx`, alterar a interface `ChartRow`:

```typescript
interface ChartRow {
  label: string;
  windowLabel?: string;
  bucketIso: string;
  received: number | null;
  open: number | null;
  resolved: number | null;
  pending: number | null;
  /** true para slots futuros — tooltip não deve disparar. */
  isFuture?: boolean;
}
```

- [ ] **Step 2: Adicionar a função `buildFullPeriodRows` (exportada para testes)**

Logo após `truncateToNow`, adicionar:

```typescript
/**
 * Combina dados passados (cumulativos, até agora) com todos os buckets do
 * período, marcando slots futuros com null. Resultado: X-axis completo,
 * linha termina no presente, slots futuros não renderizam linha nem tooltip.
 */
export function buildFullPeriodRows(
  pastRows: ChartRow[],
  allRawBuckets: ChartRow[],
): ChartRow[] {
  const nowIso = new Date().toISOString();
  const pastByBucket = new Map(pastRows.map((r) => [r.bucketIso, r]));

  return allRawBuckets.map((slot) => {
    const isFuture = slot.bucketIso > nowIso;
    if (isFuture) {
      return {
        label: slot.label,
        windowLabel: slot.windowLabel,
        bucketIso: slot.bucketIso,
        received: null,
        open: null,
        resolved: null,
        pending: null,
        isFuture: true,
      };
    }
    const past = pastByBucket.get(slot.bucketIso);
    if (past) return past;
    // bucket passado mas sem dado (carry-forward do último ponto conhecido)
    const lastPast = pastRows[pastRows.length - 1];
    return {
      label: slot.label,
      windowLabel: slot.windowLabel,
      bucketIso: slot.bucketIso,
      received: lastPast?.received ?? 0,
      open: lastPast?.open ?? 0,
      resolved: lastPast?.resolved ?? 0,
      pending: lastPast?.pending ?? 0,
      isFuture: false,
    };
  });
}
```

- [ ] **Step 3: Atualizar `CustomTooltip` para ignorar slots futuros**

```typescript
function CustomTooltip(props: TooltipContentProps<ValueType, NameType>) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  const isFuture = (payload[0]?.payload as { isFuture?: boolean } | undefined)?.isFuture;
  if (isFuture) return null;
  // ... resto igual
}
```

- [ ] **Step 4: Trocar `chartData` para usar `buildFullPeriodRows`**

```typescript
const chartData = useMemo(
  () => buildFullPeriodRows(
    truncateToNow(toCumulative(rawChartData)),
    rawChartData,
  ),
  [rawChartData],
);
```

- [ ] **Step 5: Adicionar `connectNulls={false}` em cada `<Line>`**

```tsx
<Line
  key={s.key}
  type="monotone"
  dataKey={s.key}
  name={s.label}
  stroke={s.color}
  strokeWidth={2.5}
  dot={false}
  activeDot={{ r: 5, strokeWidth: 0 }}
  connectNulls={false}
/>
```

- [ ] **Step 6: Atualizar `isEmpty` para usar apenas slots não-futuros**

```typescript
const isEmpty = rawChartData
  .filter((p) => p.bucketIso <= new Date().toISOString())
  .every((p) => p.received === 0 && p.open === 0 && p.resolved === 0 && p.pending === 0);
```

- [ ] **Step 7: Escrever testes unitários para `buildFullPeriodRows`**

Em `src/components/charts/__tests__/` (ou criar `src/components/dashboard/__tests__/full-period-rows.test.ts`):

```typescript
import { buildFullPeriodRows } from "../conversations-line-chart";

describe("buildFullPeriodRows", () => {
  const PAST = "2026-05-06T10:00:00.000Z";
  const FUTURE = "2099-01-01T00:00:00.000Z";

  function makeSlot(bucketIso: string, overrides?: Partial<typeof baseSlot>) {
    const baseSlot = {
      label: bucketIso.slice(11, 16),
      bucketIso,
      received: 0, open: 0, resolved: 0, pending: 0,
    };
    return { ...baseSlot, ...overrides };
  }

  it("slots futuros têm valores null e isFuture=true", () => {
    const allBuckets = [makeSlot(PAST), makeSlot(FUTURE)];
    const pastRows = [{ ...makeSlot(PAST), received: 5, open: 3, resolved: 2, pending: 1 }];
    const result = buildFullPeriodRows(pastRows, allBuckets);
    expect(result[0]?.received).toBe(5);
    expect(result[1]?.received).toBeNull();
    expect(result[1]?.isFuture).toBe(true);
  });

  it("slots passados sem dado fazem carry-forward do último ponto", () => {
    const P1 = "2026-05-06T08:00:00.000Z";
    const P2 = "2026-05-06T09:00:00.000Z";
    const allBuckets = [makeSlot(P1), makeSlot(P2)];
    const pastRows = [{ ...makeSlot(P1), received: 10, open: 2, resolved: 1, pending: 0 }];
    const result = buildFullPeriodRows(pastRows, allBuckets);
    expect(result[1]?.received).toBe(10); // carry-forward
    expect(result[1]?.isFuture).toBeFalsy();
  });
});
```

Run: `npx jest --testPathPattern="full-period-rows" --no-coverage`
Expected: PASS (2 testes)

- [ ] **Step 8: Commitar**

```bash
git add src/components/dashboard/conversations-line-chart.tsx \
        src/components/dashboard/__tests__/full-period-rows.test.ts
git commit -m "feat(chart): gráfico mostra período completo — buckets futuros com null sem tooltip"
```

---

## Task 6: Aplicar full-period chart nos drill-down charts

**Files:**
- Modify: `src/components/dashboard/drill-down-contents.tsx`

`ReceivedLineChart` e `ResolvedLineChart` usam `truncateToNow(toCumulative(filled))` — aplicar `buildFullPeriodRows`.

- [ ] **Step 1: Atualizar imports em `drill-down-contents.tsx`**

```typescript
import { fillBuckets, toCumulative, truncateToNow, buildFullPeriodRows } from "./conversations-line-chart";
```

- [ ] **Step 2: Atualizar `ReceivedLineChart`**

```typescript
const chartData = useMemo(() => {
  const filled = fillBuckets(
    data.chart.map((p) => ({ ...p, open: 0, pending: 0 })),
    data.granularity,
    data.tz,
    data.range,
  );
  const past = truncateToNow(toCumulative(filled));
  return buildFullPeriodRows(past, filled).map((r) => ({
    label: r.label,
    windowLabel: r.windowLabel,
    isFuture: r.isFuture,
    Novas: r.received,
  }));
}, [data.chart, data.granularity, data.tz, data.range]);

const isEmpty = chartData
  .filter((p) => !p.isFuture)
  .every((p) => p.Novas === 0 || p.Novas === null);
```

Atualizar `ReceivedTooltip` para ignorar slots futuros:

```typescript
function ReceivedTooltip(props: ...) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  const isFuture = (payload[0]?.payload as { isFuture?: boolean } | undefined)?.isFuture;
  if (isFuture) return null;
  // ... resto igual
}
```

Adicionar `connectNulls={false}` ao `<Line dataKey="Novas" ... connectNulls={false} />`.

- [ ] **Step 3: Atualizar `ResolvedLineChart` com o mesmo padrão**

```typescript
const chartData = useMemo(() => {
  const filled = fillBuckets(
    data.chart.map((p) => ({ ...p, open: 0, pending: 0 })),
    data.granularity,
    data.tz,
    data.range,
  );
  const past = truncateToNow(toCumulative(filled));
  return buildFullPeriodRows(past, filled).map((r) => ({
    label: r.label,
    windowLabel: r.windowLabel,
    isFuture: r.isFuture,
    Resolvidas: r.resolved,
  }));
}, [data.chart, data.granularity, data.tz, data.range]);

const isEmpty = chartData
  .filter((p) => !p.isFuture)
  .every((p) => p.Resolvidas === 0 || p.Resolvidas === null);
```

Atualizar `ResolvedTooltip` com `if (isFuture) return null;`.

Adicionar `connectNulls={false}` ao `<Line dataKey="Resolvidas" ... connectNulls={false} />`.

- [ ] **Step 4: Commitar**

```bash
git add src/components/dashboard/drill-down-contents.tsx
git commit -m "feat(drill-down): charts Novas e Resolvidas mostram período completo com slots futuros vazios"
```

---

## Task 7: Verificação final

- [ ] **Step 1: Rodar a suíte de testes**

```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat"
npx jest --no-coverage 2>&1 | tail -20
```

Expected: todos os testes passando (sem regressões nos testes de dashboard-data-chart-invariant, fill-buckets, etc.).

- [ ] **Step 2: Build de produção**

```bash
npx next build 2>&1 | tail -30
```

Expected: Build successful sem erros TypeScript.

- [ ] **Step 3: Commitar agente e atualizar HISTORY.md**

```bash
echo "$(date '+%Y-%m-%d %H:%M') | agent=claude-dashboard-v051-refresh-chart | commit=$(git rev-parse --short HEAD) | scope=release | summary=v0.51.0 — retry backoff no pool, stale-data banner, polling interval de settings (30s), seção Atualização reconstruída, gráficos full-period com slots futuros vazios" >> docs/agents/HISTORY.md
git add docs/agents/HISTORY.md
git commit -m "docs: HISTORY.md v0.51.0"
```

---

## Self-Review

### Cobertura de requisitos

| Requisito | Task |
|-----------|------|
| Erro "not possible to load dashboard" corrigido | Task 1 (retry) + Task 2 (stale banner) |
| Polling interval lê setting (30s) em vez de 60s hardcoded | Task 3 |
| Seção Atualização reconstruída sem obsoletos | Task 4 |
| Gráfico diário mostra 0-23h com futuro vazio | Task 5 |
| Gráficos semanal/mensal mostram todos os dias | Task 5 |
| Drill-down charts (Novas/Resolvidas) com mesmo padrão | Task 6 |
| Refresh button toggle wired up | Task 3 + Task 4 |

### Placeholder scan
— Nenhum placeholder detectado. Todos os blocos de código estão completos.

### Type consistency
- `ChartRow.received: number | null` introduzido em Task 5 é consistente com o uso em `buildFullPeriodRows` e nos maps das Tasks 5 e 6.
- `isFuture?: boolean` usado consistentemente em `CustomTooltip`, `ReceivedTooltip`, `ResolvedTooltip`.
- `buildFullPeriodRows` exportado em Task 5 e importado em Task 6 com mesmo nome.
- `DashboardContentProps.pollIntervalMs?: number` + `showRefreshButton?: boolean` definidos em Task 3 e consumidos corretamente.
- `getAllSettings()` retorna `ActionResult<Record<string,unknown>>` com `.success` e `.data` — o acesso em DashboardPage usa `.then(r => r.success && r.data ? r.data : {})` para segurança.

### Riscos / edge cases
- `buildFullPeriodRows` faz carry-forward para slots passados sem dado: intencionalmente replicando o comportamento de `toCumulative`. O slot "passado mas sem dado no Map" pode acontecer se `pastRows` não cobrir todos os slots passados (ex.: hora que ainda não começou ficou no rawChartData como zero mas não entrou no pastRows porque `truncateToNow` cortou na hora atual). Verificar: `truncateToNow` corta APÓS toCumulative, então pastRows tem exatamente os slots passados. O Map terá todos os slots passados. O caso de carry-forward no `buildFullPeriodRows` ocorre quando `allRawBuckets` tem mais slots passados que `pastRows` — isso não deveria acontecer com a lógica atual, mas o fallback é defensivo.
- `getAllSettings` pode falhar no server (rede/Redis down): o `.catch(() => ({}))` garante que o dashboard ainda carrega com fallbacks (60s, refresh=true).
