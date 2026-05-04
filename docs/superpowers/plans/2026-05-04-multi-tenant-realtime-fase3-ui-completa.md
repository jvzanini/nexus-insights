# Multi-tenant Realtime — Fase 3 (UI completa em 4 abas) Implementation Plan

> **v3 — pente fino #1 (24 achados) e #2 (22 achados) aplicados via Apêndices A e B.**
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar `/bancos-de-dados/[id]` (criado na v0.39) em UI rica de 4 abas (Conexão / Tempo real / Jobs / Saúde) + wizard de onboarding empresa nova de 4 steps. Deixa o super_admin operar todo o ciclo (criar conn → cadastrar empresa → ver eventos webhook ao vivo → diagnosticar lag → testar conn) num lugar só, sem precisar saber URLs de páginas legadas.

**Architecture:** Page server resolve dados base (connection + bindings + audit logs últimas 24h) e passa pra `<ConnectionDetailTabs>` (client) que renderiza Tabs ARIA. Cada tab é um component client autossuficiente que consome Server Actions sob demanda. Stream de eventos webhook usa SSE (já existe `/api/events`) filtrado por connectionId. Wizard usa state local `useReducer` (4 steps) e termina chamando `createNexusChatConnection` + `createCompanyChatBinding`.

**Tech Stack:** Next.js 16 (App Router, Server Components + Client Components), TypeScript, Prisma 7, Postgres, Redis 7, base-ui (Tabs, Dialog, Stepper custom), Tailwind v4, Recharts (line chart), Sonner, Lucide React, Jest + RTL + jest-mock-extended.

**Spec de referência:** `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase3-ui-completa-design.md` (964 linhas, 22 seções + 3 apêndices).

**Versão alvo:** v0.40.0.

**Linha de base (v0.39 LIVE):**
- `/bancos-de-dados` (lista) e `/bancos-de-dados/[id]` (detalhe com `<BindingsTable>` inline) já existem.
- Sidebar tem entry "Bancos de dados". "Jobs de pré-agregação" REMOVED entry; page `/configuracoes/jobs` continua acessível por URL.
- Dialog de Connection sem HMAC (token-only).
- Schema multi-tenant + worker + endpoint webhook + cron 30 min fallback funcionando.

---

## Estrutura de arquivos

### Novos

```
src/components/settings/nexus-chat/connection-detail-tabs.tsx       # Tabs ARIA wrapper
src/components/settings/nexus-chat/tabs/conexao-tab.tsx              # Aba 1: info do banco
src/components/settings/nexus-chat/tabs/tempo-real-tab.tsx           # Aba 2: KPIs + chart + stream
src/components/settings/nexus-chat/tabs/jobs-tab.tsx                 # Aba 3: status + manual trigger + backfill
src/components/settings/nexus-chat/tabs/saude-tab.tsx                # Aba 4: cards lag + audit list
src/components/settings/nexus-chat/wizard/onboarding-wizard.tsx      # Stepper 4 steps + Server Actions

src/lib/actions/nexus-chat/realtime-stream.ts                        # SSE-derivado audit logs últimas N
src/lib/actions/nexus-chat/health-metrics.ts                         # lag/erros agregados
src/lib/actions/nexus-chat/__tests__/realtime-stream.test.ts
src/lib/actions/nexus-chat/__tests__/health-metrics.test.ts

src/components/settings/nexus-chat/__tests__/connection-detail-tabs.test.tsx
src/components/settings/nexus-chat/tabs/__tests__/conexao-tab.test.tsx
src/components/settings/nexus-chat/tabs/__tests__/tempo-real-tab.test.tsx
src/components/settings/nexus-chat/tabs/__tests__/jobs-tab.test.tsx
src/components/settings/nexus-chat/tabs/__tests__/saude-tab.test.tsx
src/components/settings/nexus-chat/wizard/__tests__/onboarding-wizard.test.tsx
```

### Modificados

```
src/app/(protected)/bancos-de-dados/[id]/page.tsx                    # passa de BindingsTable inline pra <ConnectionDetailTabs>
src/app/(protected)/bancos-de-dados/page.tsx                         # botão "Onboardar empresa" no topo abre Wizard
src/app/(protected)/configuracoes/jobs/page.tsx                      # redirect 308 → /bancos-de-dados (Aba Jobs absorve)
src/components/settings/jobs-panel.tsx                               # adapta pra receber connectionId opcional (se prop, filtra; se não, mostra todos)

CHANGELOG.md
docs/STATUS.md
package.json
docs/agents/HISTORY.md
```

---

## Convenções

- **TDD:** RED test → impl → GREEN → commit.
- **`ui-ux-pro-max:ui-ux-pro-max` obrigatório** em CADA task de UI (todas L0-L5). Subagent invoca skill ANTES de codar.
- **Commits granulares**: 1 commit por task.
- **base-ui** (não shadcn primitivo). Padrão visual Roteador Webhook Meta.
- **Naming:** UI/copy = "Nexus Chat" (nunca "Chatwoot").
- **Push só na release task (T8.1)**.

---

## Lote 0 — Skeleton de Tabs

### Task T0.1: `<ConnectionDetailTabs>` ARIA-compliant

**Files:**
- Create: `src/components/settings/nexus-chat/connection-detail-tabs.tsx`
- Test: `src/components/settings/nexus-chat/__tests__/connection-detail-tabs.test.tsx`

> **Subagent: invoque `ui-ux-pro-max:ui-ux-pro-max` ANTES de codar.** Pergunte: paleta dos tabs ativos/idle, transições entre painels (animação fade vs slide), keyboard nav (setas, Home/End), altura mín do panel pra evitar layout shift, dark/light pareados.

- [ ] **Step 1: Test RED**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { ConnectionDetailTabs } from "../connection-detail-tabs";

describe("<ConnectionDetailTabs />", () => {
  it("renderiza 4 tabs com ARIA roles e default Conexão ativa", () => {
    render(
      <ConnectionDetailTabs
        connectionId="c1"
        connection={{ /* ... */ } as never}
        bindings={[]}
        recentEvents={[]}
        healthSnapshot={null}
        defaultTab="conexao"
      />,
    );
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    const conexao = screen.getByRole("tab", { name: /Conexão/i });
    expect(conexao).toHaveAttribute("aria-selected", "true");
  });

  it("ArrowRight navega para próxima tab", () => {
    render(<ConnectionDetailTabs connectionId="c1" {/* ... */} />);
    const conexao = screen.getByRole("tab", { name: /Conexão/i });
    conexao.focus();
    fireEvent.keyDown(conexao, { key: "ArrowRight" });
    expect(
      screen.getByRole("tab", { name: /Tempo real/i }),
    ).toHaveAttribute("aria-selected", "true");
  });
});
```

- [ ] **Step 2: Implementação**

Use base-ui Tabs (se existir no projeto) ou implementação manual com:
- `<div role="tablist" aria-label="Detalhes da conexão">`
- 4 `<button role="tab" aria-selected aria-controls>`
- 4 `<div role="tabpanel" aria-labelledby tabIndex={0}>`
- Keyboard: ArrowLeft/Right ciclam, Home/End vão pra primeira/última.
- URL state via `?tab=conexao|tempo-real|jobs|saude` (`searchParams` no server, prop default).

Cada panel é renderizado lazy via `<Suspense>` se possível, ou com placeholder Skeleton.

- [ ] **Step 3: Run test → PASS**

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/nexus-chat/connection-detail-tabs.tsx src/components/settings/nexus-chat/__tests__/connection-detail-tabs.test.tsx
git commit -m "feat(nexus-chat): T0.1 v0.40 — <ConnectionDetailTabs> ARIA + URL state ?tab"
```

### Task T0.2: Refator `bancos-de-dados/[id]/page.tsx` para usar Tabs

**Files:**
- Modify: `src/app/(protected)/bancos-de-dados/[id]/page.tsx`

A page server fetches:
- `connection` (já tem)
- `bindings` (já tem)
- `recentEvents`: audit logs `webhook_*` últimas 24h da connection (limit 200)
- `healthSnapshot`: lag dos jobs, erros últimas 24h (via `health-metrics` action — T4.0)

Passa tudo via prop pro `<ConnectionDetailTabs>` que internamente roteia pelas 4 abas.

Lê `searchParams.tab` para saber tab inicial.

Commit: `feat(nexus-chat): T0.2 v0.40 — page detalhe usa <ConnectionDetailTabs>`

---

## Lote 1 — Aba 1: Conexão

### Task T1.1: `<ConexaoTab>` (info do banco)

**Files:**
- Create: `src/components/settings/nexus-chat/tabs/conexao-tab.tsx`
- Test: `src/components/settings/nexus-chat/tabs/__tests__/conexao-tab.test.tsx`

> Subagent: invoque `ui-ux-pro-max:ui-ux-pro-max`. Pergunte: hierarquia visual (header com nome+status, grid 2 colunas com info técnica, bloco webhook destacado), tabular-nums em port/contagem, copy clipboard pattern.

Conteúdo:
1. **Card "Identidade"**: nome, status badge (active/paused/error), data de criação, last_test_at.
2. **Card "Banco Postgres"**: host (masked), porta, banco, usuário, sslMode. Botão "Editar" abre `<ConnectionFormDialog>` existente.
3. **Card "Webhook"**: URL copiável (mesma do Dialog atual) + lista de eventos do Chatwoot + texto explicando token-only auth.
4. **Card "Empresas vinculadas"**: a `<BindingsTable>` que hoje fica inline na page passa pra dentro deste card (mantém função). Botão "Onboardar empresa" abre Wizard.
5. **Card "Ações"**: Testar conexão (botão), Pausar (toggle status active↔paused), Soft delete (com AlertDialog).

Tests: render dos 5 cards, ações dispatchadas corretamente.

Commit: `feat(nexus-chat): T1.1 v0.40 — <ConexaoTab> com 5 cards (identidade/banco/webhook/empresas/ações)`

---

## Lote 2 — Aba 2: Tempo real

### Task T2.1: Server Action `realtime-stream.ts`

**Files:**
- Create: `src/lib/actions/nexus-chat/realtime-stream.ts`
- Test: `src/lib/actions/nexus-chat/__tests__/realtime-stream.test.ts`

```typescript
"use server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface WebhookEvent {
  id: string;
  action: string; // webhook_received | webhook_rejected_hmac | ...
  createdAt: string;
  details: Record<string, unknown>;
}

/** Lista últimos N audit logs `webhook_*` desta connection. */
export async function listRecentWebhookEvents(args: {
  connectionId: string;
  limit?: number;
}): Promise<{ success: boolean; data?: WebhookEvent[]; error?: string }> {
  const user = await getCurrentUser();
  if (!user || user.platformRole !== "super_admin") {
    return { success: false, error: "super_admin required" };
  }

  const limit = Math.min(args.limit ?? 200, 500); // cap 500 anti-DoS

  const rows = await prisma.auditLog.findMany({
    where: {
      action: { startsWith: "webhook_" },
      targetType: "nexus_chat_connection",
      targetId: args.connectionId,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      createdAt: true,
      details: true,
    },
  });

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      action: r.action as string,
      createdAt: r.createdAt.toISOString(),
      details: (r.details as Record<string, unknown>) ?? {},
    })),
  };
}
```

Tests: super_admin obtém lista, admin é rejeitado, limit hard cap 500, ordem desc createdAt.

Commit: `feat(nexus-chat): T2.1 v0.40 — realtime-stream Server Action (audit webhook_* últimos N)`

### Task T2.2: KPI cards (4 cards) + line chart eventos/min últimas 24h

**Files:**
- Create: `src/components/settings/nexus-chat/tabs/tempo-real-tab.tsx`
- Test: `src/components/settings/nexus-chat/tabs/__tests__/tempo-real-tab.test.tsx`

> Subagent: invoque `ui-ux-pro-max:ui-ux-pro-max`. Pergunte: paleta KPI (sucesso emerald, alerta amber, falha rose, info violet), Recharts axis style consistente com `<volumetria-content>`, line chart altura, tooltip near-mouse.

KPIs (Cards):
1. **Eventos último 1h** (count audit `webhook_received` últimas 1h).
2. **Latência média** (avg `details.durationMs` últimas 1h).
3. **Erros HMAC** (count `webhook_rejected_hmac` 24h — em produção é zero, mas KPI mostra histórico).
4. **Última heartbeat** (formatDistanceToNow(connection.lastWebhookAt)).

Line chart Recharts: bucket de 5 min nas últimas 24h, eixo Y = count.

Stream virtualizado: usa virtualizer (já existe no projeto pra tabela conversas) com lista de eventos filtrável.

Filtros: por evento (multi-select), por accountId.

Pause/play do stream (auto-refresh 5s polling — não SSE pra simplificar Fase 3; SSE é evolução Fase 3.5).

Tests: render KPIs com dados mock, filtros funcionam.

Commit: `feat(nexus-chat): T2.2 v0.40 — <TempoRealTab> com 4 KPIs + line chart + stream filtrado`

---

## Lote 3 — Aba 3: Jobs

### Task T3.1: `<JobsTab>` (absorve JobsPanel existente)

**Files:**
- Create: `src/components/settings/nexus-chat/tabs/jobs-tab.tsx`
- Modify: `src/components/settings/jobs-panel.tsx` (aceita `connectionId?: string` opcional)

> Subagent: invoque `ui-ux-pro-max:ui-ux-pro-max`. Pergunte: confirmação visual da continuidade com a Fase 1 (mantém status colors), copy do "disparo manual", placement do botão backfill.

`<JobsTab>` recebe `connectionId` e renderiza `<JobsPanel connectionId={...}/>`. Internamente, `<JobsPanel>` filtra status/disparos pra essa connection.

Quando `<JobsPanel>` é usado em `/configuracoes/jobs` (URL legada por enquanto), `connectionId` é undefined → mostra todos os jobs (comportamento atual).

Tests: render + filtro por connectionId.

Commit: `feat(nexus-chat): T3.1 v0.40 — <JobsTab> reutiliza JobsPanel filtrado`

### Task T3.2: Redirect `/configuracoes/jobs` → `/bancos-de-dados`

**Files:**
- Modify: `src/app/(protected)/configuracoes/jobs/page.tsx`

```typescript
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function Page() {
  redirect("/bancos-de-dados");
}
```

Commit: `feat(nexus-chat): T3.2 v0.40 — /configuracoes/jobs redirect 302 → /bancos-de-dados (absorbed by Aba Jobs)`

---

## Lote 4 — Aba 4: Saúde

### Task T4.0: Server Action `health-metrics.ts`

**Files:**
- Create: `src/lib/actions/nexus-chat/health-metrics.ts`
- Test: `src/lib/actions/nexus-chat/__tests__/health-metrics.test.ts`

```typescript
"use server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface ConnectionHealthSnapshot {
  connectionId: string;
  lastWebhookAt: string | null;
  lastWebhookLagMinutes: number | null;
  webhooksLast24h: number;
  errorsLast24h: number;
  jobErrorsLast24h: number;
}

export async function getConnectionHealthSnapshot(
  connectionId: string,
): Promise<{ success: boolean; data?: ConnectionHealthSnapshot; error?: string }> {
  const user = await getCurrentUser();
  if (!user || user.platformRole !== "super_admin") {
    return { success: false, error: "super_admin required" };
  }

  const conn = await prisma.nexusChatConnection.findUnique({
    where: { id: connectionId, deletedAt: null },
    select: { id: true, lastWebhookAt: true },
  });
  if (!conn) return { success: false, error: "connection not found" };

  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 3600_000);

  const [webhooks24h, errors24h, jobErrors] = await Promise.all([
    prisma.auditLog.count({
      where: {
        action: "webhook_received",
        targetType: "nexus_chat_connection",
        targetId: connectionId,
        createdAt: { gte: last24h },
      },
    }),
    prisma.auditLog.count({
      where: {
        action: { in: ["webhook_rejected_hmac", "webhook_rejected_rate_limit"] },
        targetType: "nexus_chat_connection",
        targetId: connectionId,
        createdAt: { gte: last24h },
      },
    }),
    prisma.chatwootFactsMeta.count({
      where: {
        connectionId,
        lastError: { not: null },
        updatedAt: { gte: last24h },
      },
    }),
  ]);

  const lagMs = conn.lastWebhookAt
    ? now.getTime() - conn.lastWebhookAt.getTime()
    : null;
  const lagMin = lagMs !== null ? Math.max(0, Math.floor(lagMs / 60_000)) : null;

  return {
    success: true,
    data: {
      connectionId: conn.id,
      lastWebhookAt: conn.lastWebhookAt?.toISOString() ?? null,
      lastWebhookLagMinutes: lagMin,
      webhooksLast24h: webhooks24h,
      errorsLast24h: errors24h,
      jobErrorsLast24h: jobErrors,
    },
  };
}
```

Tests: super_admin OK, admin rejeitado, lag calc correto, 0 quando nunca recebeu webhook.

Commit: `feat(nexus-chat): T4.0 v0.40 — health-metrics Server Action (lag/erros agregados)`

### Task T4.1: `<SaudeTab>`

**Files:**
- Create: `src/components/settings/nexus-chat/tabs/saude-tab.tsx`
- Test: `src/components/settings/nexus-chat/tabs/__tests__/saude-tab.test.tsx`

> Subagent: invoque `ui-ux-pro-max:ui-ux-pro-max`. Pergunte: paleta heartbeat (verde se < 1h lag, âmbar 1-6h, rose > 6h), card layout, audit log list pattern (igual /usuarios audit table).

Conteúdo:
1. **Card "Heartbeat"**: lag desde último webhook + cor semântica.
2. **Card "Eventos 24h"**: webhooksLast24h + sparkline.
3. **Card "Erros 24h"**: errorsLast24h + cor (rose se > 0).
4. **Card "Jobs com erro"**: jobErrorsLast24h.
5. **Lista audit log** últimas 50 entradas (action + timestamp + details preview).

Tests: render com snapshot, cores semânticas baseadas em thresholds.

Commit: `feat(nexus-chat): T4.1 v0.40 — <SaudeTab> com 4 cards heartbeat + audit list`

---

## Lote 5 — Wizard onboarding empresa

### Task T5.1: `<OnboardingWizard>` Stepper 4 steps

**Files:**
- Create: `src/components/settings/nexus-chat/wizard/onboarding-wizard.tsx`
- Test: `src/components/settings/nexus-chat/wizard/__tests__/onboarding-wizard.test.tsx`

> Subagent: invoque `ui-ux-pro-max:ui-ux-pro-max`. Pergunte: stepper visual (linha de progresso vs dots), animação entre steps, responsivo mobile (números only no stepper), back button comportamento.

Steps:
1. **Escolher connection** existente OU criar nova (link pra Dialog ConnectionForm). Combobox se >20 connections.
2. **Identidade da empresa**: form com `chatwootAccountId` (number) + `displayName` (text).
3. **Webhook**: mostra URL+token da connection escolhida + lista de eventos. Botão "Já cadastrei no painel do Nexus Chat".
4. **Conclusão**: confirma sucesso + link pra `/usuarios` (liberar acesso) + link pra `/bancos-de-dados/[id]?tab=tempo-real` (ver eventos chegando).

State via `useReducer` (steps + form data + errors).

Validação por step:
- Step 1: connection selecionada (não null).
- Step 2: accountId number positivo + displayName não vazio.
- Step 3: confirmação manual (checkbox "marquei no painel").
- Step 4: cleanup state ao fechar.

Submit final no step 3 chama `createCompanyChatBinding`.

Tests: navegação entre steps, validação, submit.

Commit: `feat(nexus-chat): T5.1 v0.40 — <OnboardingWizard> 4 steps (connection→identidade→webhook→conclusão)`

### Task T5.2: Botão "Onboardar empresa" em `/bancos-de-dados`

**Files:**
- Modify: `src/app/(protected)/bancos-de-dados/page.tsx`

Adiciona CTA "Onboardar empresa" no topo (super_admin only, nível page) que abre `<OnboardingWizard>` em modal.

Commit: `feat(nexus-chat): T5.2 v0.40 — botão Onboardar empresa em /bancos-de-dados`

---

## Lote 6 — Tests + a11y

### Task T6.1: Suite a11y checklist

**Files:** todos componentes novos.

Checklist (spec §14):
- Tabs ARIA `tablist/tab/tabpanel` com `aria-selected`, `aria-controls`, `aria-labelledby`.
- Keyboard nav (setas, Home/End).
- Focus management (foco no panel ao trocar tab).
- Loading states com Skeleton (mesma altura do content final pra evitar shift).
- Empty states com icon + texto + CTA.
- Toast Sonner em cada action (sucesso/erro).
- aria-live="polite" em alertas de status.
- Touch target ≥ 44pt.

Tests automatizados: usar `axe-core` (se disponível) ou snapshot dos roles.

Commit: `feat(nexus-chat): T6.1 v0.40 — a11y checklist (axe-core ou roles)`

---

## Lote 7 — Performance + smoke test

### Task T7.1: Code splitting por aba

**Files:** `connection-detail-tabs.tsx`

Importar cada Tab via `dynamic()` do Next.js para reduzir bundle inicial:

```typescript
const ConexaoTab = dynamic(() => import("./tabs/conexao-tab").then(m => m.ConexaoTab));
const TempoRealTab = dynamic(() => import("./tabs/tempo-real-tab").then(m => m.TempoRealTab));
// ...
```

Benefício: bundle inicial só carrega tab ativa (default `conexao`); Recharts (Aba 2) só baixa quando user clicar.

Commit: `feat(nexus-chat): T7.1 v0.40 — code splitting por aba via dynamic()`

---

## Lote 8 — Release v0.40.0

### Task T8.1: Release

- [ ] Bump `package.json` 0.39.0 → 0.40.0.
- [ ] CHANGELOG entry.
- [ ] STATUS.md entry.
- [ ] Push origin main → CI Build+Push.
- [ ] `gh workflow run portainer-fix.yml --field app_version=v0.40.0`.
- [ ] Validar `/api/health version=v0.40.0`.
- [ ] Smoke test manual: super_admin abre `/bancos-de-dados/<seed>?tab=tempo-real` → vê eventos.
- [ ] Append `docs/agents/HISTORY.md`.
- [ ] Deletar active file controlador.

Commit: `chore(release): v0.40.0 — Multi-tenant Realtime Fase 3 (UI completa em 4 abas + wizard)`

---

## Critérios de aceitação

- [ ] `/bancos-de-dados/<id>` mostra 4 tabs: Conexão / Tempo real / Jobs / Saúde.
- [ ] URL state `?tab=...` preserva tab ativa em refresh/back.
- [ ] Keyboard nav nos tabs (ArrowLeft/Right/Home/End).
- [ ] `<ConexaoTab>` mostra 5 cards (identidade/banco/webhook/empresas/ações).
- [ ] `<TempoRealTab>` mostra 4 KPIs + line chart 24h + stream filtrado.
- [ ] `<JobsTab>` reutiliza `<JobsPanel>` filtrado por connection.
- [ ] `<SaudeTab>` mostra heartbeat, eventos 24h, erros 24h, jobs com erro, audit list.
- [ ] `<OnboardingWizard>` 4 steps funciona end-to-end (cria binding novo).
- [ ] `/configuracoes/jobs` redirect 302 → `/bancos-de-dados`.
- [ ] `/api/health version=v0.40.0`.
- [ ] Suite verde (typecheck 0).

---

## Roteiro de execução (controlador)

1. **L0** — sequencial.
2. **L1, L2, L3, L4** — paralelos (4 subagents, escopos disjuntos: cada Tab é arquivo único). Cada subagent invoca `ui-ux-pro-max` antes.
3. **L5** — sequencial após L0.
4. **L6** — sequencial pós-L1-L5.
5. **L7** — sequencial.
6. **L8** — release.

---

## Apêndice A — Pente fino #1 (24 achados aplicados)

| # | Achado | Severidade | Resolução |
|---|---|---|---|
| P1 | Spec menciona `/configuracoes/conexoes`. Já movido pra `/bancos-de-dados` na v0.39. | Crítico | Plan usa rota nova. |
| P2 | Sidebar reorg (§5 da spec) já parcialmente feito na v0.39. | Confirmado | Plan só cobre redirect 308 de `/configuracoes/jobs` (T3.2). |
| P3 | "Jobs de pré-agregação" entry já removida do sidebar. | Confirmado | OK. |
| P4 | Stream da Aba 2: SSE seria ideal mas complexo na Fase 3. | Crítico | Plan usa **polling 5s** com toggle pause/play. SSE evolução Fase 3.5. |
| P5 | Recharts é dependência grande — code splitting necessário. | Performance | T7.1 cobre via `dynamic()`. |
| P6 | Wizard "criar nova connection" abre Dialog do `<ConnectionFormDialog>` — modal-em-modal? | UX | Step 1 do wizard mostra link "Criar nova" que fecha wizard, abre Dialog, ao salvar reabre wizard com a connection nova selecionada. Detalhe em T5.1 implementação. |
| P7 | Hard limit listRecentWebhookEvents 500. | OK | Implementado. |
| P8 | Health metrics `chatwootFactsMeta.count` precisa do schema atualizado (Fase 1 já adicionou). | OK | Schema OK. |
| P9 | Audit list em SaudeTab: 50 últimas, sem paginação. | UX | Aceitável Fase 3. Paginação pode vir em hotfix. |
| P10 | Tabs com keyboard nav — implementação manual ou via base-ui. | Importante | Plan usa base-ui se existir; senão manual com `role/aria-*`. |
| P11 | URL state `?tab=...` — fallback se valor inválido. | Importante | Default "conexao" se param desconhecido. |
| P12 | Dialog edit existente reutilizado em ConexaoTab. | OK | Sem duplicação. |
| P13 | BindingsTable já existe na v0.39 — só reusada. | OK. |
| P14 | Wizard onboarding — confirmação "Já cadastrei no painel" é honor system. | Aceitável | Não há como verificar API-side. |
| P15 | Onboardar empresa CTA: nível page (não nível connection). | Importante | T5.2 coloca em `/bancos-de-dados` (lista raiz). |
| P16 | Aba Jobs: filtro por connection + comportamento `/configuracoes/jobs` (sem filtro). | Importante | `<JobsPanel connectionId?>`. |
| P17 | Cores heartbeat: thresholds < 1h verde / 1-6h âmbar / > 6h rose. | Importante | T4.1 implementa. |
| P18 | Empty state pages (sem connections): mostrar CTA pra criar. | UX | T1.1 cobre via `<ConexaoTab>` (já tem fallback). |
| P19 | Loading states: Skeleton com altura do final. | A11y | T6.1 cobre. |
| P20 | Toast Sonner em todas actions. | Padrão. | OK. |
| P21 | Code splitting por aba via `dynamic()`. | Perf | T7.1. |
| P22 | Tabs label-by-label keyboard accessibility. | A11y | T0.1. |
| P23 | Wizard back button — ouvir beforeunload nos steps 1-2 com dados não salvos? | UX | Não nesta fase (pode ser hotfix). |
| P24 | Mobile (`< lg`) layout — tabs com scroll horizontal. | Responsivo | T0.1 inclui via overflow-x. |

---

## Apêndice B — Pente fino #2 (22 achados aplicados)

| # | Achado | Severidade | Resolução |
|---|---|---|---|
| Q1 | Animação fade entre tabs vs slide. | UX | Fade é mais conservador (motion-reduce default). |
| Q2 | Stream polling 5s — carga? | Perf | 12 req/min/super_admin. Negligível. Cache HTTP via `revalidate=5`. |
| Q3 | Wizard Step 3: confirmação manual — adicionar timer "Esperando primeiro webhook" com retry. | UX | Pode ser polish hotfix. Step 3 simplificado nesta fase. |
| Q4 | KPI cards loading state. | A11y | Skeleton 4 cards mesma altura final. T6.1. |
| Q5 | line chart sem dados (nova connection): empty state ou linha vazia? | UX | "Sem eventos nas últimas 24h. Cadastre o webhook no Chatwoot." |
| Q6 | Wizard cleanup state ao fechar. | UX | useReducer reset on unmount. |
| Q7 | `<JobsPanel>` precisa adaptar copy — "esta connection" vs "todas as connections". | UX | Prop opcional `connectionId` controla. |
| Q8 | health-metrics: jobErrorsLast24h usa `lastError IS NOT NULL` mas sample dimensiona não tem `connection_id` ainda em todas as rows. | Fase 1 | OK — `connection_id` foi adicionada e backfilled. |
| Q9 | URL state interferência com router.refresh() em Suspense. | Importante | Usar searchParams via `useSearchParams` no client. |
| Q10 | Recharts dark mode pareado. | UX | Tailwind v4 + theme. |
| Q11 | Audit log details preview: pode ter dados sensíveis? | Segurança | `logAudit` nunca grava password (Fase 1 garante). OK. |
| Q12 | Stream filtros multi-select por evento. | UX | Combobox base-ui ou checkbox group. |
| Q13 | Wizard Step 4 — link pra `/usuarios` ou pra `/bancos-de-dados/<id>?tab=tempo-real`. | UX | Ambos como CTAs lado-a-lado. |
| Q14 | Page server fetches recentes — cache? | Perf | `dynamic = "force-dynamic"`, sem cache. Cada visita é fresh. |
| Q15 | Mobile breakpoint < lg: tabs viram dropdown? | UX | Não — scroll horizontal é melhor. |
| Q16 | a11y: foco no panel ao trocar tab. | A11y | tabIndex={0} no panel. |
| Q17 | Erro de carregamento da page: ErrorBoundary. | Resiliência | Next.js 16 error.tsx fallback. |
| Q18 | Wizard combobox connections quando >20. | UX | Implementação base-ui. |
| Q19 | Webhook URL em wizard Step 3 — copy e validar que user copiou. | UX | Honor system + texto claro. |
| Q20 | Stream pause/play — preservar buffer de eventos pendentes. | UX | Estado local: paused buffer cresce; resume drena buffer + retoma polling. |
| Q21 | health-metrics Server Action: cache 30s? | Perf | Sem cache — métricas precisam ser frescas. |
| Q22 | Sidebar entry "Bancos de dados" entre Configurações e Perfil. | UX | Já implementado v0.39. |

---

## Apêndice C — Convenções de naming

| Camada | Padrão | Exemplo |
|---|---|---|
| Tab component | `<XxxTab>` PascalCase | `<ConexaoTab>`, `<TempoRealTab>` |
| Wizard step state | snake_case | `step_1_connection`, `step_2_identity` |
| Server Action | camelCase verbo | `listRecentWebhookEvents`, `getConnectionHealthSnapshot` |
| URL search param | kebab-case | `?tab=tempo-real` |
| Audit action | já existe (Fase 1+2) | `webhook_received` |
