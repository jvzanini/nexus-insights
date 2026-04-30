# Dashboard v0.10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever o dashboard de operação Nexus Insights para que KPIs, gráficos e drill-downs sejam coerentes com o filtro de período, gráficos clicáveis substituam listas de baixo valor, drill-downs abram em modal central, timezone respeite a plataforma e o seletor de conta seja exclusivo do sidebar.

**Architecture:** Server queries reescritas (mesma coorte para Recebidas/Resolvidas/Abertas/Taxa, novo endpoint de "sem resposta", `byTeam` com bucket "Sem departamento", `byStatus` no período). UI client-side substitui side-sheet por `<DrillDownDialog>` centrado, adiciona `<ChartTypeToggle>` (bar/donut com persistência localStorage), `<NoResponseCard>` hero, e cards de distribuição (Departamento, Inbox, Status) clicáveis. Timezone passa server→client via prop (`tz`) e formatter usa `Intl.DateTimeFormat({ timeZone: tz })` em vez de `toLocaleString` puro.

**Tech Stack:** Next.js 16 (App Router) · React 19 · Tailwind v4 · base-ui (Dialog primitive) · Recharts 3 · Framer Motion · date-fns + date-fns-tz · Jest + ts-jest · pg (read-only contra Chatwoot DB).

---

## File Structure

### Novos
- `src/lib/utils/format-bucket.ts` — formatter TZ-aware para labels de hora/dia.
- `src/components/ui/drill-down-dialog.tsx` — Dialog centralizado.
- `src/components/dashboard/chart-type-toggle.tsx` — segmented bar/donut.
- `src/components/dashboard/no-response-card.tsx` — card hero.
- `src/components/dashboard/department-distribution-card.tsx`
- `src/components/dashboard/inbox-distribution-card.tsx`
- `src/components/dashboard/status-distribution-card.tsx`
- `src/components/dashboard/no-response-drill-down.tsx`
- `src/components/dashboard/team-drill-down.tsx`
- `src/lib/utils/__tests__/format-bucket.test.ts`

### Alterados
- `src/lib/chatwoot/queries/dashboard-data.ts` — novas coortes, `byTeam`, `byStatus`, `noResponse`, cache key v2.
- `src/lib/chatwoot/queries/dashboard-drill-down.ts` — novos endpoints (`getNoResponseDrillDown`, `getByTeamDrillDown`), ajustes de coortes nos existentes.
- `src/lib/actions/dashboard.ts` — expor novos campos na action.
- `src/lib/actions/dashboard-drill-down.ts` — wrap dos novos endpoints.
- `src/components/dashboard/dashboard-content.tsx` — novo layout, novos componentes, prop `tz`.
- `src/components/dashboard/dashboard-filters.tsx` — remove seletor de conta.
- `src/components/dashboard/conversations-line-chart.tsx` — toggle line/bar, formatter TZ-aware.
- `src/components/dashboard/drill-down-contents.tsx` — usar `DrillDownDialog` (não `DrillDownSheet`), refletir novas coortes.
- `src/components/dashboard/recent-conversations-table.tsx` — sem mudança visual, mas formatter TZ-aware se aplicável.
- `src/lib/tours/dashboard-tour.ts` — etapas para sem-resposta, departamentos, drill-down central.
- `src/app/(protected)/dashboard/page.tsx` — passa `tz` para `<DashboardContent>`.
- `CHANGELOG.md` — entry v0.10.0.
- `design-system/nexus-insights/MASTER.md` — atualização das mudanças.

---

## Order

1. **Task 1**: Formatter TZ-aware + tests (base p/ resto da UI).
2. **Task 2**: Backend `dashboard-data.ts` — novas coortes + `byTeam` + `byStatus` + `noResponse`. Cache bump.
3. **Task 3**: Backend `dashboard-drill-down.ts` — `getNoResponseDrillDown`, `getByTeamDrillDown` + ajustes.
4. **Task 4**: Server actions — expor novos campos.
5. **Task 5**: UI primitive `<DrillDownDialog>`.
6. **Task 6**: UI primitive `<ChartTypeToggle>`.
7. **Task 7**: `<NoResponseCard>`.
8. **Task 8**: `<DepartmentDistributionCard>`, `<InboxDistributionCard>`, `<StatusDistributionCard>`.
9. **Task 9**: Drill-down contents (`NoResponseDrillDownContent`, `TeamDrillDownContent`).
10. **Task 10**: Migra drill-downs existentes para `DrillDownDialog`.
11. **Task 11**: Atualiza `<DashboardFilters>` (remove account selector).
12. **Task 12**: Atualiza `<ConversationsLineChart>` (toggle line/bar, TZ-aware).
13. **Task 13**: Reescreve `<DashboardContent>` com novo layout.
14. **Task 14**: Atualiza tour.
15. **Task 15**: `page.tsx` passa `tz`.
16. **Task 16**: Verificação completa (typecheck, lint, jest, smoke manual).
17. **Task 17**: Docs (CHANGELOG, MASTER, memory).
18. **Task 18**: Commit + push.

---

## Task 1: Formatter TZ-aware (`format-bucket.ts`)

**Files:**
- Create: `src/lib/utils/format-bucket.ts`
- Create: `src/lib/utils/__tests__/format-bucket.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/lib/utils/__tests__/format-bucket.test.ts
import { formatBucketLabel } from "@/lib/utils/format-bucket";

describe("formatBucketLabel", () => {
  it("formata hora em America/Sao_Paulo independente da TZ do runtime", () => {
    // 2026-04-30T16:00:00Z = 13:00 BRT (UTC-3)
    const iso = "2026-04-30T16:00:00.000Z";
    expect(formatBucketLabel(iso, "hour", "America/Sao_Paulo")).toBe("13:00");
  });

  it("formata dia em America/Sao_Paulo", () => {
    const iso = "2026-04-30T03:00:00.000Z"; // 00:00 BRT do dia 30
    expect(formatBucketLabel(iso, "day", "America/Sao_Paulo")).toBe("30/04");
  });

  it("usa fallback America/Sao_Paulo quando tz vazio", () => {
    const iso = "2026-04-30T16:00:00.000Z";
    expect(formatBucketLabel(iso, "hour", "")).toBe("13:00");
  });
});
```

- [ ] **Step 2: Run test — must fail**

```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat"
npx jest src/lib/utils/__tests__/format-bucket.test.ts
```

Expected: `Cannot find module '@/lib/utils/format-bucket'`.

- [ ] **Step 3: Implement**

```ts
// src/lib/utils/format-bucket.ts
import { DEFAULT_TZ } from "@/lib/datetime-core";

export type BucketGranularity = "hour" | "day";

export function formatBucketLabel(
  iso: string,
  granularity: BucketGranularity,
  tz: string,
): string {
  const date = new Date(iso);
  const timeZone = tz && tz.length > 0 ? tz : DEFAULT_TZ;

  if (granularity === "hour") {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(date);
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
  }).format(date);
}
```

- [ ] **Step 4: Run test — must pass**

```bash
npx jest src/lib/utils/__tests__/format-bucket.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/format-bucket.ts src/lib/utils/__tests__/format-bucket.test.ts
git commit -m "feat(utils): TZ-aware bucket formatter for chart labels"
```

---

## Task 2: Backend — `dashboard-data.ts` (novas coortes + `byTeam` + `byStatus` + `noResponse`)

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-data.ts`
- Test: integração simples via shape (sem mock pg pesado).

> Cuidado: este arquivo é grande. Modifique seções em ordem; mantenha cache pull-through e resilience.

- [ ] **Step 1: Atualizar interfaces exportadas**

No topo do arquivo (após `DashboardComparison`), substituir/adicionar:

```ts
export interface DashboardByTeam {
  /** id null representa o bucket "Sem departamento" (team_id IS NULL). */
  id: number | null;
  name: string;
  count: number;
}

export interface DashboardByStatus {
  status: 0 | 1 | 2 | 3;
  label: "Aberto" | "Resolvido" | "Pendente" | "Adiado";
  count: number;
}

export interface DashboardNoResponseItem {
  id: number;
  displayId: number;
  contactName: string | null;
  inboxName: string | null;
  assigneeName: string | null;
  waitingSeconds: number;
  lastIncomingAt: string;
}

export interface DashboardNoResponse {
  total: number;
  oldestSeconds: number;
  preview: DashboardNoResponseItem[];
}
```

E na interface `DashboardData`, **substituir** `topTeams` por `byTeam` e adicionar `byStatus` + `noResponse`:

```ts
export interface DashboardData {
  stats: DashboardStats;
  chart: DashboardChartPoint[];
  topAgents: DashboardTopAgent[];
  topInboxes: DashboardTopInbox[];
  byTeam: DashboardByTeam[];
  byStatus: DashboardByStatus[];
  noResponse: DashboardNoResponse;
  recent: DashboardRecentItem[];
  granularity: "hour" | "day";
}
```

Remover `topTeams` da interface. Manter `DashboardTopTeam` exportada por compatibilidade temporária (a remoção definitiva fica pra v0.11).

- [ ] **Step 2: Bump cache key**

Localizar o uso de `cacheKey(...)` neste arquivo. Adicionar prefixo `v2:` no key, ex.:

```ts
const cacheTag = cacheKey(
  "dashboard:v2", // bumped from "dashboard"
  String(args.accountId),
  hashFilters({ ... }),
);
```

(Use o nome exato da chave atual; mantém demais argumentos.)

- [ ] **Step 3: SQL — `sqlOpen` agora é coorte do período**

Substituir o trecho que define `sqlOpen` (snapshot global) por:

```ts
const sqlOpen = `
  SELECT COUNT(*)::bigint AS total
  FROM conversations c
  WHERE c.account_id = $1
    AND c.created_at >= $2
    AND c.created_at < $3
    AND c.status = 0
    ${matrixClause}
`;
```

E ajustar a chamada `pool.query(sqlOpen, [args.accountId])` para passar também `args.period.start` e `args.period.end`.

- [ ] **Step 4: SQL — `sqlResolved` na mesma coorte**

Substituir `sqlResolved` (que usa `last_activity_at`) por:

```ts
const sqlResolved = `
  SELECT COUNT(*)::bigint AS total
  FROM conversations c
  WHERE c.account_id = $1
    AND c.created_at >= $2
    AND c.created_at < $3
    AND c.status = 1
    ${matrixClause}
`;
```

E `sqlResolvedPrev` segue mesma mudança (já usa `args.prevPeriod`). Ajuste para apontar para `sqlResolved`.

- [ ] **Step 5: SQL — `sqlTopInboxes` agora também respeita período**

Substituir:

```ts
const sqlTopInboxes = `
  SELECT i.id, i.name, COUNT(c.id)::bigint AS total
  FROM conversations c
  JOIN inboxes i ON i.id = c.inbox_id
  WHERE c.account_id = $1
    AND c.created_at >= $2
    AND c.created_at < $3
    AND c.status = 0
    ${matrixClause}
  GROUP BY i.id, i.name
  ORDER BY total DESC
  LIMIT 10
`;
```

E na chamada passar `args.period.start`, `args.period.end`.

- [ ] **Step 6: SQL — substituir `sqlTopTeams` por `sqlByTeam` (incluindo bucket "Sem departamento")**

```ts
const sqlByTeam = `
  SELECT
    t.id,
    COALESCE(NULLIF(TRIM(t.name), ''), 'Sem departamento') AS name,
    COUNT(c.id)::bigint AS total
  FROM conversations c
  LEFT JOIN teams t ON t.id = c.team_id
  WHERE c.account_id = $1
    AND c.created_at >= $2
    AND c.created_at < $3
    AND c.status IN (0, 2, 3)
    ${matrixClause}
  GROUP BY t.id, t.name
  ORDER BY total DESC
`;
```

> O `LEFT JOIN` permite que conversas sem `team_id` apareçam (`t.id IS NULL`). O `COALESCE` rotula esse bucket como "Sem departamento".

- [ ] **Step 7: SQL — `sqlByStatus`**

```ts
const sqlByStatus = `
  SELECT
    c.status::int AS status,
    COUNT(*)::bigint AS total
  FROM conversations c
  WHERE c.account_id = $1
    AND c.created_at >= $2
    AND c.created_at < $3
    ${matrixClause}
  GROUP BY c.status
`;
```

- [ ] **Step 8: SQL — `sqlNoResponse` (lista preview + agg)**

```ts
const sqlNoResponse = `
  WITH last_msg AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.created_at,
      m.message_type
    FROM messages m
    ORDER BY m.conversation_id, m.created_at DESC
  )
  SELECT
    c.id,
    c.display_id,
    ct.name AS contact_name,
    ix.name AS inbox_name,
    u.name AS assignee_name,
    EXTRACT(EPOCH FROM (NOW() - lm.created_at))::int AS waiting_seconds,
    lm.created_at AS last_incoming_at
  FROM conversations c
  JOIN last_msg lm
    ON lm.conversation_id = c.id
   AND lm.message_type = 0
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  LEFT JOIN inboxes ix ON ix.id = c.inbox_id
  LEFT JOIN users u ON u.id = c.assignee_id
  WHERE c.account_id = $1
    AND c.created_at >= $2
    AND c.created_at < $3
    AND c.status = 0
    ${matrixClause}
  ORDER BY waiting_seconds DESC
  LIMIT 5
`;

const sqlNoResponseAgg = `
  WITH last_msg AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.created_at,
      m.message_type
    FROM messages m
    ORDER BY m.conversation_id, m.created_at DESC
  )
  SELECT
    COUNT(*)::int AS total,
    COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - lm.created_at))), 0)::int AS oldest_seconds
  FROM conversations c
  JOIN last_msg lm
    ON lm.conversation_id = c.id
   AND lm.message_type = 0
  WHERE c.account_id = $1
    AND c.created_at >= $2
    AND c.created_at < $3
    AND c.status = 0
    ${matrixClause}
`;
```

- [ ] **Step 9: Atualizar `Promise.all` com novas queries**

Adicionar `sqlByTeam`, `sqlByStatus`, `sqlNoResponse`, `sqlNoResponseAgg` no `Promise.all`. Remover `sqlTopTeams`. Ajustar nomes das variáveis de resultado.

- [ ] **Step 10: Mapear resultados no objeto `data`**

Substituir `topTeams` por `byTeam` e adicionar `byStatus` + `noResponse`:

```ts
const STATUS_LABELS: Record<number, DashboardByStatus["label"]> = {
  0: "Aberto",
  1: "Resolvido",
  2: "Pendente",
  3: "Adiado",
};

const data: DashboardData = {
  // ... outros campos mantidos
  byTeam: byTeamRes.rows.map((r) => ({
    id: r.id ?? null,
    name: r.name,
    count: Number(r.total ?? 0),
  })),
  byStatus: ([0, 1, 2, 3] as const).map((status) => {
    const found = byStatusRes.rows.find((r) => Number(r.status) === status);
    return {
      status,
      label: STATUS_LABELS[status]!,
      count: found ? Number(found.total ?? 0) : 0,
    };
  }),
  noResponse: {
    total: Number(noResponseAggRes.rows[0]?.total ?? 0),
    oldestSeconds: Number(noResponseAggRes.rows[0]?.oldest_seconds ?? 0),
    preview: noResponseRes.rows.map((r) => ({
      id: r.id,
      displayId: r.display_id,
      contactName: r.contact_name,
      inboxName: r.inbox_name,
      assigneeName: r.assignee_name,
      waitingSeconds: Number(r.waiting_seconds ?? 0),
      lastIncomingAt:
        r.last_incoming_at instanceof Date
          ? r.last_incoming_at.toISOString()
          : String(r.last_incoming_at),
    })),
  },
  // ...
};
```

Adicione tipos `RowByTeam`, `RowByStatus`, `RowNoResponse`, `RowNoResponseAgg` (declarados no topo do arquivo, próximo aos demais `RowX`).

- [ ] **Step 11: Resolution rate sanity**

Garante que `resolutionRate = received > 0 ? (resolved / received) * 100 : null` continua válido (já é). Como `resolved` agora é coorte de criação, `resolutionRate ≤ 100%` sempre. Adicione um clamp defensivo:

```ts
const resolutionRate =
  received > 0
    ? Math.min(100, (resolved / received) * 100)
    : null;
```

- [ ] **Step 12: Typecheck e ajustes**

```bash
npm run typecheck
```

Corrigir qualquer breakage (provavelmente em `dashboard-content.tsx`, `drill-down-contents.tsx`, `dashboard.ts` action). Tasks subsequentes vão tocar nesses arquivos; aqui basta deixar o backend compilando isolado se possível, ou pular ajustes nos consumers até as tasks específicas.

- [ ] **Step 13: Commit**

```bash
git add src/lib/chatwoot/queries/dashboard-data.ts
git commit -m "feat(dashboard): novas coortes + byTeam/byStatus/noResponse + cache v2"
```

---

## Task 3: Backend — `dashboard-drill-down.ts`

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-drill-down.ts`

- [ ] **Step 1: Acrescentar tipos**

```ts
export interface NoResponseDrillDownItem {
  id: number;
  displayId: number;
  contactName: string | null;
  inboxName: string | null;
  assigneeName: string | null;
  waitingSeconds: number;
  lastIncomingAt: string;
  snippet: string | null;
}

export interface NoResponseDrillDownData {
  total: number;
  items: NoResponseDrillDownItem[];
  byInbox: Array<{ id: number; name: string; count: number }>;
  byAssignee: Array<{ id: number | null; name: string; count: number }>;
}

export interface ByTeamDrillDownItem {
  id: number;
  displayId: number;
  contactName: string | null;
  inboxName: string | null;
  assigneeName: string | null;
  status: number;
  lastActivityAt: string;
}

export interface ByTeamDrillDownData {
  teamName: string;
  total: number;
  items: ByTeamDrillDownItem[];
  byStatus: Array<{ status: number; label: string; count: number }>;
}
```

- [ ] **Step 2: Implementar `getNoResponseDrillDown`**

```ts
export async function getNoResponseDrillDown(args: {
  accountId: number;
  period: { start: Date; end: Date };
  excludeMatrixIA?: boolean;
}): Promise<NoResponseDrillDownData> {
  // Reuso do CTE last_msg + filtros do dashboard-data.ts
  // SELECT lista (LIMIT 100), agg byInbox e byAssignee.
  // ... similar ao padrão de outros drill-downs (cache pull-through, withChatwootResilience).
}
```

Detalhes:
- Lista: usa o mesmo CTE de `mensagens-nao-respondidas.ts`, ordena `waiting_seconds DESC`, limite 100.
- `byInbox`: `GROUP BY i.id, i.name` da mesma WHERE.
- `byAssignee`: `GROUP BY u.id, u.name` (NULL = "Sem atendente").
- Cache key: `dashboard:v2:no-response:<accountId>:<period-hash>`, TTL 30s.

- [ ] **Step 3: Implementar `getByTeamDrillDown`**

```ts
export async function getByTeamDrillDown(args: {
  accountId: number;
  period: { start: Date; end: Date };
  /** null = bucket "Sem departamento" */
  teamId: number | null;
  excludeMatrixIA?: boolean;
}): Promise<ByTeamDrillDownData> {
  // Lista: c.team_id IS NULL ou c.team_id = $teamId
  // Filtro de status: IN (0, 2, 3) — mesmo recorte do card
  // byStatus: contagem por status
}
```

WHERE clause:

```sql
AND (
  $4::int IS NULL AND c.team_id IS NULL
  OR c.team_id = $4::int
)
```

(use cast adequado conforme convenção do arquivo).

- [ ] **Step 4: Atualizar drill-downs existentes**

`getReceivedDrillDown`, `getResolvedDrillDown`, `getOpenDrillDown`, `getResolutionRateDrillDown` — onde fizerem sentido, ajuste para usar mesma coorte (created_at no período) que dashboard-data.ts. Em particular:

- `getOpenDrillDown` deve aceitar e usar `period` (criadas no período + status=0), não snapshot global. Atualize a tipagem.
- `getResolvedDrillDown` mantém `created_at ∈ período AND status=1`.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Corrigir consumers (action wrappers, componentes drill-down). Tasks 4 e 9 finalizam.

- [ ] **Step 6: Commit**

```bash
git add src/lib/chatwoot/queries/dashboard-drill-down.ts
git commit -m "feat(dashboard): drill-down getNoResponse + getByTeam + ajusta coortes"
```

---

## Task 4: Server actions — expor novos campos

**Files:**
- Modify: `src/lib/actions/dashboard.ts`
- Modify: `src/lib/actions/dashboard-drill-down.ts`

- [ ] **Step 1: `dashboard.ts` — propagar novos campos**

Reexportar tipos atualizados (`DashboardData`, `DashboardByTeam`, `DashboardByStatus`, `DashboardNoResponse`). Garante que `getDashboardData` continua retornando o objeto completo (a query já retorna).

- [ ] **Step 2: `dashboard-drill-down.ts` — actions novas**

```ts
"use server";

export async function getNoResponseDrillDownAction(input: {
  accountId: number;
  period: DashboardPeriod;
}): Promise<ActionResult<NoResponseDrillDownData>> {
  // assertCompanyAccess + resolvePeriod + getNoResponseDrillDown
}

export async function getByTeamDrillDownAction(input: {
  accountId: number;
  period: DashboardPeriod;
  teamId: number | null;
}): Promise<ActionResult<ByTeamDrillDownData>> {
  // mesmo padrão
}
```

Use o padrão dos demais drill-down actions no mesmo arquivo (assert + try/catch + cache wrapper).

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck
git add src/lib/actions/dashboard.ts src/lib/actions/dashboard-drill-down.ts
git commit -m "feat(dashboard-actions): expõe noResponse/byTeam para o cliente"
```

---

## Task 5: UI primitive `<DrillDownDialog>` (modal central)

**Files:**
- Create: `src/components/ui/drill-down-dialog.tsx`

- [ ] **Step 1: Implementar**

Reutilize a estrutura do `DrillDownSheet` mas mude o posicionamento para central. Mobile: full-screen (top-down), sem drag-handle.

```tsx
"use client";
import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { LucideIcon } from "lucide-react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const SIZE_MAP = {
  md: "md:max-w-3xl",
  lg: "md:max-w-5xl",
  xl: "md:max-w-6xl",
} as const;

export interface DrillDownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  children: React.ReactNode;
  size?: keyof typeof SIZE_MAP;
  headerExtra?: React.ReactNode;
  closeLabel?: string;
}

export function DrillDownDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  icon: Icon,
  iconColor = "text-violet-400",
  iconBg = "bg-violet-500/10",
  children,
  size = "xl",
  headerExtra,
  closeLabel = "Fechar",
}: DrillDownDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm",
            "duration-200 motion-reduce:duration-0",
            "data-open:animate-in data-open:fade-in-0",
            "data-closed:animate-out data-closed:fade-out-0",
          )}
        />
        <DialogPrimitive.Popup
          data-slot="drill-down-dialog"
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-0 top-0 z-50 flex h-[100dvh] w-full flex-col",
            "bg-card text-foreground outline-none",
            "md:left-1/2 md:top-1/2 md:inset-x-auto md:h-auto md:max-h-[90dvh]",
            "md:-translate-x-1/2 md:-translate-y-1/2 md:w-[calc(100vw-2rem)]",
            "md:rounded-2xl md:border md:border-border md:shadow-2xl md:shadow-black/40",
            SIZE_MAP[size],
            "duration-260 motion-reduce:duration-0",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 md:px-6 md:py-5">
            <div className="flex min-w-0 items-start gap-3">
              {Icon ? (
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    iconBg,
                  )}
                >
                  <Icon className={cn("h-5 w-5", iconColor)} aria-hidden />
                </div>
              ) : null}
              <div className="min-w-0">
                <DialogPrimitive.Title className="truncate font-heading text-base font-semibold leading-snug text-foreground md:text-lg">
                  {title}
                </DialogPrimitive.Title>
                {subtitle ? (
                  <DialogPrimitive.Description className="mt-0.5 line-clamp-2 text-xs text-muted-foreground md:text-sm">
                    {subtitle}
                  </DialogPrimitive.Description>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {headerExtra}
              <DialogPrimitive.Close
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 cursor-pointer rounded-full text-muted-foreground transition-all hover:text-foreground"
                  />
                }
                aria-label={closeLabel}
              >
                <XIcon className="h-5 w-5" aria-hidden />
                <span className="sr-only">{closeLabel}</span>
              </DialogPrimitive.Close>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-6">
            {children}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// Reuso de DrillDownSection e DrillDownSkeleton — re-exportar do drill-down-sheet
export {
  DrillDownSection,
  DrillDownSkeleton,
} from "@/components/ui/drill-down-sheet";
```

- [ ] **Step 2: Smoke test (Storybook? Manual? Teste de import)**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/drill-down-dialog.tsx
git commit -m "feat(ui): DrillDownDialog central modal (substitui side-sheet no dashboard)"
```

---

## Task 6: UI primitive `<ChartTypeToggle>`

**Files:**
- Create: `src/components/dashboard/chart-type-toggle.tsx`

- [ ] **Step 1: Implementar segmented control**

```tsx
"use client";
import * as React from "react";
import { BarChart3, PieChart } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChartType = "bar" | "donut";

export interface ChartTypeToggleProps {
  value: ChartType;
  onChange: (next: ChartType) => void;
  /** Desabilita "donut" se houver muitas categorias. */
  donutDisabled?: boolean;
  donutDisabledHint?: string;
  ariaLabel?: string;
}

export function ChartTypeToggle({
  value,
  onChange,
  donutDisabled = false,
  donutDisabledHint = "Disponível para ≤ 6 categorias",
  ariaLabel = "Tipo de gráfico",
}: ChartTypeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-lg border border-border bg-card/80 p-0.5"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === "bar"}
        onClick={() => onChange("bar")}
        className={cn(
          "flex h-7 w-8 items-center justify-center rounded-md transition-all duration-200 cursor-pointer",
          value === "bar"
            ? "bg-violet-600 text-white shadow-[0_0_8px_rgba(124,58,237,0.3)]"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        )}
        aria-label="Gráfico de barras"
      >
        <BarChart3 className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "donut"}
        onClick={() => !donutDisabled && onChange("donut")}
        disabled={donutDisabled}
        title={donutDisabled ? donutDisabledHint : undefined}
        className={cn(
          "flex h-7 w-8 items-center justify-center rounded-md transition-all duration-200 cursor-pointer",
          value === "donut" && !donutDisabled
            ? "bg-violet-600 text-white shadow-[0_0_8px_rgba(124,58,237,0.3)]"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
          donutDisabled && "opacity-50 cursor-not-allowed",
        )}
        aria-label="Gráfico de pizza/donut"
      >
        <PieChart className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function useChartTypeStorage(
  key: string,
  defaultValue: ChartType = "bar",
): [ChartType, (next: ChartType) => void] {
  const [value, setValue] = React.useState<ChartType>(defaultValue);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === "bar" || stored === "donut") setValue(stored);
    } catch {
      // localStorage indisponível — mantém default.
    }
  }, [key]);

  const update = React.useCallback(
    (next: ChartType) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // ignora
      }
    },
    [key],
  );

  return [value, update];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/chart-type-toggle.tsx
git commit -m "feat(dashboard): ChartTypeToggle bar/donut com persistência localStorage"
```

---

## Task 7: `<NoResponseCard>` (hero)

**Files:**
- Create: `src/components/dashboard/no-response-card.tsx`

- [ ] **Step 1: Implementar card**

```tsx
"use client";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardNoResponse } from "@/lib/chatwoot/queries/dashboard-data";

function formatWaiting(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hrs}h ${mins}min` : `${hrs}h`;
}

export interface NoResponseCardProps {
  data: DashboardNoResponse;
  onSeeAll: () => void;
}

export function NoResponseCard({ data, onSeeAll }: NoResponseCardProps) {
  const hasItems = data.total > 0;
  const oldestLabel =
    data.oldestSeconds > 0 ? formatWaiting(data.oldestSeconds) : null;

  return (
    <Card
      className={cn(
        "h-full bg-card border rounded-xl",
        hasItems
          ? "border-amber-500/40 shadow-[0_0_24px_rgba(245,158,11,0.08)]"
          : "border-border",
      )}
      data-tour="dashboard-no-response"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg",
              hasItems ? "bg-amber-500/10" : "bg-emerald-500/10",
            )}
            aria-hidden
          >
            {hasItems ? (
              <AlertCircle className="h-4 w-4 text-amber-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            )}
          </span>
          <span>Conversas sem resposta</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasItems ? (
          <>
            <div className="flex items-baseline gap-2">
              <motion.span
                key={data.total}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="text-3xl font-bold tabular-nums text-foreground"
              >
                {data.total.toLocaleString("pt-BR")}
              </motion.span>
              <span className="text-xs text-muted-foreground">
                aguardando resposta
              </span>
            </div>
            {oldestLabel ? (
              <p className="mt-1 text-xs text-amber-400">
                Mais antiga há <span className="font-semibold">{oldestLabel}</span>
              </p>
            ) : null}
            <ul className="mt-4 divide-y divide-border/60">
              {data.preview.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.contactName ?? "(sem nome)"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.inboxName ?? "—"}
                      {item.assigneeName ? ` · ${item.assigneeName}` : " · sem atendente"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-amber-400">
                    {formatWaiting(item.waitingSeconds)}
                  </span>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              onClick={onSeeAll}
              className="mt-4 w-full cursor-pointer"
            >
              Ver todas ({data.total})
            </Button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" aria-hidden />
            <p className="text-sm text-foreground">Tudo respondido.</p>
            <p className="text-xs text-muted-foreground">
              Nenhuma conversa aguardando resposta.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/no-response-card.tsx
git commit -m "feat(dashboard): NoResponseCard hero com preview e CTA drill-down"
```

---

## Task 8: Cards de distribuição (Departamento, Inbox, Status)

**Files:**
- Create: `src/components/dashboard/department-distribution-card.tsx`
- Create: `src/components/dashboard/inbox-distribution-card.tsx`
- Create: `src/components/dashboard/status-distribution-card.tsx`

- [ ] **Step 1: `<DepartmentDistributionCard>`**

```tsx
"use client";
import * as React from "react";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InteractiveBarChart,
  InteractivePieChart,
  type BarChartSeries,
} from "@/components/charts";
import { CHART_COLORS, getColorByIndex } from "@/lib/charts/colors";
import {
  ChartTypeToggle,
  useChartTypeStorage,
} from "./chart-type-toggle";
import type { DashboardByTeam } from "@/lib/chatwoot/queries/dashboard-data";

export interface DepartmentDistributionCardProps {
  data: DashboardByTeam[];
  onSelect: (team: { id: number | null; name: string }) => void;
}

export function DepartmentDistributionCard({
  data,
  onSelect,
}: DepartmentDistributionCardProps) {
  const [type, setType] = useChartTypeStorage(
    "dashboard.chartType.byTeam",
    "bar",
  );
  const donutDisabled = data.length > 6;
  const effectiveType = donutDisabled && type === "donut" ? "bar" : type;

  return (
    <Card className="h-full bg-card border border-border rounded-xl">
      <CardHeader className="pb-2 flex-row items-start justify-between">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10" aria-hidden>
            <Users className="h-4 w-4 text-emerald-400" />
          </span>
          <span className="flex flex-col">
            <span className="leading-none">Departamentos em aberto</span>
            <span className="mt-1 text-xs font-normal text-muted-foreground">
              Aberto + pendente + adiado, no período
            </span>
          </span>
        </CardTitle>
        <ChartTypeToggle
          value={effectiveType}
          onChange={setType}
          donutDisabled={donutDisabled}
        />
      </CardHeader>
      <CardContent>
        {effectiveType === "bar" ? (
          <InteractiveBarChart
            data={data.map((d) => ({ name: d.name, Conversas: d.count }))}
            series={[
              {
                key: "Conversas",
                label: "Conversas",
                color: CHART_COLORS.emerald,
              } satisfies BarChartSeries,
            ]}
            layout="horizontal"
            height={Math.max(220, data.length * 36 + 40)}
            showLegend={false}
            yAxisWidth={140}
            emptyMessage="Sem conversas em aberto no período"
            onBarClick={(name) => {
              const found = data.find((d) => d.name === name);
              if (found) onSelect({ id: found.id, name: found.name });
            }}
          />
        ) : (
          <InteractivePieChart
            data={data.map((d, idx) => ({
              name: d.name,
              value: d.count,
              color: getColorByIndex(idx),
            }))}
            height={280}
            emptyMessage="Sem conversas em aberto no período"
            onSliceClick={(name) => {
              const found = data.find((d) => d.name === name);
              if (found) onSelect({ id: found.id, name: found.name });
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
```

> **Importante:** `InteractiveBarChart` e `InteractivePieChart` precisam aceitar `onBarClick`/`onSliceClick`. Se os componentes existentes não suportarem, **estenda-os** primeiro nesta task — adicione a prop opcional e passe-a para o `<Bar onClick>` / `<Pie onClick>` do Recharts.

Verifique antes:

```bash
grep -n "onBarClick\|onClick" src/components/charts/bar-chart.tsx src/components/charts/pie-chart.tsx
```

Se faltar, adicione a prop opcional `onBarClick?: (name: string) => void` em `InteractiveBarChart` e `onSliceClick?: (name: string) => void` em `InteractivePieChart`. Use o `onClick` do elemento Recharts e leia `payload.name` do evento.

- [ ] **Step 2: `<InboxDistributionCard>`**

Mesma estrutura do anterior, ícone `Inbox` âmbar, label "Inboxes em aberto", subtítulo "Status aberto, no período". Recebe `data: DashboardTopInbox[]`. `onSelect` recebe `{ id, name }`. Chave de localStorage `dashboard.chartType.byInbox`. Drill-down direciona para drill-down de "Open" filtrado pelo inbox.

- [ ] **Step 3: `<StatusDistributionCard>`**

Donut puro (sem toggle). Usa `DonutWithCenter` existente. Cores:
- Aberto (status 0) → âmbar
- Pendente (status 2) → violeta
- Adiado (status 3) → slate
- Resolvido (status 1) → esmeralda

Click em fatia → drill-down do status correspondente. Centro do donut: total de conversas.

```tsx
const STATUS_COLORS: Record<number, string> = {
  0: CHART_COLORS.amber,
  1: CHART_COLORS.emerald,
  2: CHART_COLORS.violet,
  3: CHART_COLORS.slate,
};
```

- [ ] **Step 4: Typecheck + commit**

```bash
npm run typecheck
git add src/components/dashboard/department-distribution-card.tsx src/components/dashboard/inbox-distribution-card.tsx src/components/dashboard/status-distribution-card.tsx src/components/charts/bar-chart.tsx src/components/charts/pie-chart.tsx
git commit -m "feat(dashboard): cards de distribuição clicáveis com toggle bar/donut"
```

---

## Task 9: Drill-down contents (NoResponse, Team)

**Files:**
- Create: `src/components/dashboard/no-response-drill-down.tsx`
- Create: `src/components/dashboard/team-drill-down.tsx`
- Modify: `src/components/dashboard/drill-down-contents.tsx` (atualiza coortes)

- [ ] **Step 1: `<NoResponseDrillDownContent>`**

Padrão: useEffect dispara fetch via action quando `enabled`, skeleton, ErrorState, render do conteúdo. Conteúdo:
- Cabeçalho com total + tempo da mais antiga.
- Filtro inline: "Por inbox" | "Por atendente" (radio segmented).
- Bar chart horizontal por inbox/atendente conforme escolha.
- Tabela completa (até 100 linhas) com snippet, espera, "abrir conversa" link.

- [ ] **Step 2: `<TeamDrillDownContent>`**

Recebe `accountId`, `period`, `teamId`, `enabled`, `teamName` (display).
- Donut por status (0/2/3 — resolvidos não fazem parte do recorte).
- Tabela completa.

- [ ] **Step 3: Atualizar `drill-down-contents.tsx`**

- Os existentes (Received, Resolved, Open, Rate) precisam:
  - Usar `formatBucketLabel(iso, granularity, tz)` em vez de `formatBucket` local. Adicione prop `tz` em cada componente.
  - Refletir as novas coortes (Open agora é período-aware → drill-down recebe `period`).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/no-response-drill-down.tsx src/components/dashboard/team-drill-down.tsx src/components/dashboard/drill-down-contents.tsx
git commit -m "feat(dashboard): drill-down contents (sem-resposta, departamento, TZ-aware)"
```

---

## Task 10: Migra drill-downs existentes para `DrillDownDialog`

**Files:**
- Modify: `src/components/dashboard/dashboard-content.tsx` (substitui `DrillDownSheet` por `DrillDownDialog` apenas no dashboard).

> Esta task é um find-and-replace mecânico: trocar `<DrillDownSheet>` por `<DrillDownDialog>` em `dashboard-content.tsx`. Outros relatórios (Conversas, Atendentes, etc.) continuam com `DrillDownSheet` — não tocamos.

- [ ] **Step 1: Substituir imports**

No topo de `dashboard-content.tsx`:

```ts
- import { DrillDownSheet } from "@/components/ui/drill-down-sheet";
+ import { DrillDownDialog } from "@/components/ui/drill-down-dialog";
```

- [ ] **Step 2: Substituir tags JSX**

`<DrillDownSheet ...>` → `<DrillDownDialog ...>` em todos os 4 usos.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/dashboard-content.tsx
git commit -m "refactor(dashboard): drill-downs usam DrillDownDialog central"
```

---

## Task 11: `<DashboardFilters>` — remove account selector

**Files:**
- Modify: `src/components/dashboard/dashboard-filters.tsx`
- Modify: `src/components/dashboard/dashboard-content.tsx` (remove prop)

- [ ] **Step 1: Limpar componente**

Remover `accounts`, `selectedAccountId`, `onAccountChange` da `DashboardFiltersProps`. Remover o `<CustomSelect>` do JSX.

- [ ] **Step 2: Remover do consumer**

Em `dashboard-content.tsx`, remover `<DashboardFilters accounts={initialAccounts} selectedAccountId={accountId} onAccountChange={...}>`. Remover também `handleAccountChange`, `switchAccount` import, e `initialAccounts` se não for mais usado.

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck
git add src/components/dashboard/dashboard-filters.tsx src/components/dashboard/dashboard-content.tsx
git commit -m "refactor(dashboard): remove seletor de conta do filtro (mora no sidebar)"
```

---

## Task 12: `<ConversationsLineChart>` — toggle line/bar + TZ-aware

**Files:**
- Modify: `src/components/dashboard/conversations-line-chart.tsx`

- [ ] **Step 1: Importar formatter e ChartTypeToggle**

```ts
import { formatBucketLabel } from "@/lib/utils/format-bucket";
import { ChartTypeToggle, useChartTypeStorage } from "./chart-type-toggle";
```

- [ ] **Step 2: Receber prop `tz`**

```ts
interface ConversationsLineChartProps {
  data: DashboardChartPoint[];
  granularity: "hour" | "day";
  tz: string;
}
```

- [ ] **Step 3: Adicionar toggle line/bar**

Renomear o componente para suportar ambos os tipos. Substituir `formatLabel` por `formatBucketLabel(iso, granularity, tz)`. No CardHeader:

```tsx
<ChartTypeToggle value={effectiveType} onChange={setType} />
```

> Donut **não se aplica** aqui — `ChartTypeToggle` precisa suportar bar/line nesse contexto. **Atenção:** este toggle é um caso especial. Para evitar criar um segundo componente, **adicione um `mode?: "bar-donut" | "bar-line"`** na `ChartTypeToggle` da Task 6 e ajuste os ícones e os valores válidos. Alternativa: criar `ChartLineBarToggle` separado. **Decisão**: criar variante.

Edite `chart-type-toggle.tsx` para exportar também:

```ts
export type LineBarChartType = "line" | "bar";

export function ChartLineBarToggle({
  value,
  onChange,
}: {
  value: LineBarChartType;
  onChange: (v: LineBarChartType) => void;
}) { /* análogo, com ícones LineChart e BarChart3 */ }

export function useLineBarStorage(key: string, def: LineBarChartType = "line"): [LineBarChartType, (v: LineBarChartType) => void] { /* idêntico */ }
```

- [ ] **Step 4: Renderizar `BarChart` quando `type === "bar"`**

```tsx
{effectiveType === "line" ? (
  <ResponsiveContainer> <LineChart>...</LineChart> </ResponsiveContainer>
) : (
  <ResponsiveContainer> <BarChart>...</BarChart> </ResponsiveContainer>
)}
```

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/components/dashboard/chart-type-toggle.tsx src/components/dashboard/conversations-line-chart.tsx
git commit -m "feat(dashboard): line/bar toggle no chart de conversas e formatter TZ-aware"
```

---

## Task 13: `<DashboardContent>` — novo layout

**Files:**
- Modify: `src/components/dashboard/dashboard-content.tsx`

- [ ] **Step 1: Receber prop `tz`**

```ts
interface DashboardContentProps {
  userName: string;
  initialAccountId: number;
  tz: string;
}
```

(Não precisa mais de `initialAccounts`.)

- [ ] **Step 2: Wire `<NoResponseCard>`, `<DepartmentDistributionCard>`, `<InboxDistributionCard>`, `<StatusDistributionCard>`**

Layout (substitui o atual):

```tsx
return (
  <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-8">
    {/* Greeting */}
    <motion.div variants={itemVariants} className="flex items-start justify-between gap-3">
      ...
    </motion.div>

    {/* Filtros */}
    <motion.div variants={itemVariants} data-tour="dashboard-filters">
      <DashboardFilters
        selectedPeriod={period}
        isLoading={isLoading}
        onPeriodChange={handlePeriodChange}
        onRefresh={handleRefresh}
      />
    </motion.div>

    {/* KPIs */}
    <motion.div
      variants={itemVariants}
      data-tour="dashboard-kpis"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
    >
      <KpiClickableCard ... onClick={() => setDrillDown("received")} />
      <KpiClickableCard ... onClick={() => setDrillDown("resolved")} />
      <KpiClickableCard
        icon={MessageSquare}
        ...
        label="Abertas"
        sublabel="(no período)"
        ...
        onClick={() => setDrillDown("open")}
      />
      <KpiClickableCard ... onClick={() => setDrillDown("rate")} />
    </motion.div>

    {/* Sem resposta + Atendentes mais rápidos */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      <motion.div variants={itemVariants} className="lg:col-span-2">
        <NoResponseCard
          data={data.noResponse}
          onSeeAll={() => setDrillDown("noResponse")}
        />
      </motion.div>
      <motion.div variants={itemVariants}>
        <Top5ListCard
          icon={TrendingUp}
          iconColor="text-violet-400"
          iconBg="bg-violet-500/10"
          title="Atendentes mais rápidos"
          subtitle="Tempo médio de 1ª resposta"
          items={topAgents.map((a) => ({ name: a.name, value: formatDuration(a.avgSeconds) }))}
          emptyMessage="Sem first response no período."
        />
      </motion.div>
    </div>

    {/* Chart por hora */}
    <motion.div variants={itemVariants} data-tour="dashboard-chart">
      <ConversationsLineChart data={chart} granularity={granularity} tz={tz} />
    </motion.div>

    {/* Distribuições */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6" data-tour="dashboard-distributions">
      <motion.div variants={itemVariants}>
        <InboxDistributionCard
          data={data.topInboxes}
          onSelect={(inbox) => setDrillDown({ kind: "inbox", id: inbox.id })}
        />
      </motion.div>
      <motion.div variants={itemVariants}>
        <DepartmentDistributionCard
          data={data.byTeam}
          onSelect={(team) => setDrillDown({ kind: "team", id: team.id, name: team.name })}
        />
      </motion.div>
    </div>

    <motion.div variants={itemVariants} data-tour="dashboard-status">
      <StatusDistributionCard
        data={data.byStatus}
        onSelect={(status) => setDrillDown({ kind: "status", status })}
      />
    </motion.div>

    {/* Conversas recentes */}
    <motion.div variants={itemVariants} data-tour="dashboard-recent">
      <RecentConversationsTable items={recent} />
    </motion.div>

    {/* Drill-down dialogs */}
    <DrillDownDialog open={drillDown === "received"} ... />
    <DrillDownDialog open={drillDown === "resolved"} ... />
    <DrillDownDialog open={drillDown === "open"} ... />
    <DrillDownDialog open={drillDown === "rate"} ... />
    <DrillDownDialog open={drillDown === "noResponse"} ... >
      <NoResponseDrillDownContent ... />
    </DrillDownDialog>
    <DrillDownDialog open={drillDown && typeof drillDown === "object" && drillDown.kind === "team"} ... >
      <TeamDrillDownContent ... />
    </DrillDownDialog>
    {/* idem inbox/status */}
  </motion.div>
);
```

> O state `drillDown` precisa virar uma união discriminada: `null | "received" | "resolved" | "open" | "rate" | "noResponse" | { kind: "team"; id: number | null; name: string } | { kind: "inbox"; id: number; name: string } | { kind: "status"; status: number }`. Refator e tipagem cuidadosa.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Corrigir tudo que vier.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/dashboard-content.tsx
git commit -m "feat(dashboard): novo layout — sem-resposta hero + distribuições clicáveis + drill central"
```

---

## Task 14: Tour update

**Files:**
- Modify: `src/lib/tours/dashboard-tour.ts`

- [ ] **Step 1: Atualizar etapas**

Adicione passos para os novos targets:
- `[data-tour="dashboard-no-response"]` — "Conversas que estão aguardando resposta agora."
- `[data-tour="dashboard-distributions"]` — "Distribuição por inbox e departamento. Clique para ver detalhes."
- `[data-tour="dashboard-status"]` — "Distribuição por status no período."

Mantenha os existentes (filtros, kpis, chart, recent) coerentes com o novo layout.

- [ ] **Step 2: Smoke (manual ou snapshot)**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/tours/dashboard-tour.ts
git commit -m "docs(tour): atualiza etapas do dashboard para v0.10"
```

---

## Task 15: `page.tsx` — passa `tz`

**Files:**
- Modify: `src/app/(protected)/dashboard/page.tsx`

- [ ] **Step 1: Buscar tz e passar**

```tsx
import { getPlatformTz } from "@/lib/datetime";
// ...
const [activeAccountId, allAccounts, accessibleIds, tz] = await Promise.all([
  getActiveAccountId(),
  getKnownAccounts(),
  getAccessibleAccountIds(authUser),
  getPlatformTz(),
]);

return (
  <PageShell variant="wide">
    <DashboardContent
      userName={user.name}
      initialAccountId={safeAccountId}
      tz={tz}
    />
  </PageShell>
);
```

(Remover prop `initialAccounts` se não for mais usado.)

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck
git add src/app/(protected)/dashboard/page.tsx
git commit -m "feat(dashboard-page): propaga timezone da plataforma para o cliente"
```

---

## Task 16: Verificação completa

- [ ] **Step 1: Lint**

```bash
npm run lint
```

Corrigir warnings novos.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Tests**

```bash
npm test
```

Esperado: passes (nenhum teste antigo quebrado).

- [ ] **Step 4: Build**

```bash
npm run build
```

Esperado: build sem erros.

- [ ] **Step 5: Smoke manual (opcional — se ambiente local viável)**

```bash
npm run dev
```

Validar:
- KPI "Abertas" com Hoje mostra valor pequeno (não 1.475).
- Taxa ≤ 100%.
- Chart "Conversas por hora" mostra horários BRT corretos.
- Sem seletor de conta no dashboard.
- Card "Sem resposta" mostra contagem ou empty state.
- Click em barra de departamento abre modal central.
- Drill-downs centralizados, não laterais.

---

## Task 17: Docs

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `design-system/nexus-insights/MASTER.md` (se existir; ou criar entry)
- Modify: `package.json` (bump version 0.9.0 → 0.10.0)

- [ ] **Step 1: CHANGELOG**

```md
## [0.10.0] - 2026-04-30

### Added
- Card hero "Conversas sem resposta" amarrado ao filtro de período.
- Distribuição por departamento (open+pending+snoozed) com bucket "Sem departamento".
- Distribuição por inbox e por status (donut) clicáveis.
- Toggle bar/donut nos cards de distribuição (persistência localStorage).
- Toggle line/bar no chart de "Conversas por hora".
- Drill-down central (`DrillDownDialog`) substituindo side-sheet no dashboard.

### Changed
- KPIs "Resolvidas", "Abertas" e "Taxa de resolução" agora respeitam o filtro de período (mesma coorte de "Recebidas") — taxa nunca mais excede 100%.
- Chart de hora usa `Intl.DateTimeFormat` com `timeZone` da plataforma — mostra horários BRT corretos independente da TZ do navegador.
- Seletor de conta removido do dashboard (era duplicado do sidebar).
- Cache key bumped para `dashboard:v2:*`.

### Fixed
- Avatares "?" em listas top-5 de departamentos (substituído por gráfico).
- Open count snapshot global (era 1.475 com Hoje selecionado).
- Resolution rate > 100% (coortes diferentes para numerador/denominador).
```

- [ ] **Step 2: Bump version**

```json
"version": "0.10.0",
```

- [ ] **Step 3: MASTER design system (se existir)**

Adicionar entry sobre `DrillDownDialog` central, `ChartTypeToggle`, padrão de bar/donut clicável.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md package.json design-system/nexus-insights/MASTER.md
git commit -m "docs(v0.10.0): CHANGELOG + design system"
```

---

## Task 18: Atualiza memória + Push

- [ ] **Step 1: Memória**

Criar `~/.claude/projects/.../memory/project_v0.10.0_release.md` com:
- Resumo das mudanças (KPIs coorte única, sem-resposta, drill central, TZ fix).
- Cache bump v2.
- Pendências (migrar dashboard p/ facts em v0.11).

Atualizar `MEMORY.md` index.

- [ ] **Step 2: Push final**

```bash
git push origin main
```

GitHub Actions dispara build → push para ghcr.io → Portainer redeploy automático.

- [ ] **Step 3: Aviso ao João**

Mensagem final: "v0.10.0 deployed. Pode testar."

---

## Self-Review

**Spec coverage:**

| Spec § | Atendido em |
|--------|-------------|
| KPI semântico | Task 2 (steps 3–5, 11) |
| Card "Sem resposta" | Task 7 |
| Departamento (open+pending+snoozed) | Task 2 step 6, Task 8 step 1 |
| Inbox em aberto | Task 2 step 5, Task 8 step 2 |
| Status distribution | Task 2 step 7, Task 8 step 3 |
| Drill-down central | Task 5, Task 10 |
| Toggle bar/donut | Task 6, Task 8 |
| Toggle line/bar (chart) | Task 12 |
| TZ fix | Task 1, Task 12, Task 15, Task 9 step 3 |
| Account selector removido | Task 11 |
| Tour atualizado | Task 14 |
| Bucket "Sem departamento" | Task 2 step 6 |
| Drill-down "Sem resposta" | Task 3 step 2, Task 9 step 1 |
| Drill-down departamento | Task 3 step 3, Task 9 step 2 |
| Cache bump v2 | Task 2 step 2 |
| CHANGELOG/version/memory | Task 17, Task 18 |
| "?" icons | resolvido naturalmente em Task 8 (lista vira chart) |

**Placeholder scan:** Sem TBD/TODO/etc. Steps grandes (Task 8, 9, 13) referenciam código completo. Variantes em Tasks 8 e 12 deixam decisões locais para o subagent (estender bar-chart/pie-chart com onClick), mas com contexto suficiente.

**Type consistency:** `DashboardByTeam`, `DashboardByStatus`, `DashboardNoResponse`, `NoResponseDrillDownData`, `ByTeamDrillDownData` — todos definidos em Task 2/3 e referenciados consistentemente em Tasks 4–13.
