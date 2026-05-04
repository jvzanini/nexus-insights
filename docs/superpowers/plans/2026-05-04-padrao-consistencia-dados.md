# Padrão Único de Consistência de Dados Implementation Plan

> **Versão:** v3 (final, consolidada após pente fino #1 e #2 — Apêndices A e B).
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar todas as divergências numéricas entre dashboard, relatórios, gráficos e tabelas, instalando um único padrão canônico de filtro de período, status, "sem resposta" e "aberta há" — válido em toda a plataforma.

**Architecture:** Centralizar a semântica de período em um helper único (`buildBaseFilter` com `periodColumn: "active" | "created"`) e em uma camada normativa de definições (`src/lib/reports/canonical.ts`). Todas as queries (`src/lib/chatwoot/queries/**`) e jobs de pré-agregação (`src/worker/jobs/pre-agregacao/**`) passam a consumir esse helper. Coluna canônica de "atividade" é `COALESCE(c.last_activity_at, c.created_at)`. KPI "Recebidas" continua especial (`c.created_at`). "Sem resposta" e "Aberta há" passam a ser computadas exclusivamente pela função `buildLastPublicMsgCte()`. Inconsistências históricas (8 INC-* mapeadas) são fechadas em commits granulares com TDD.

**Tech Stack:** Next.js 16 (App Router), Postgres + pg, Zod, Jest + jest-mock-extended, BullMQ (worker), Sonner, Lucide.

---

## 0. Glossário Canônico (NORMATIVO — fonte da verdade)

> Este glossário substitui qualquer definição informal espalhada pelo código.
> Toda função/componente/query nova ou modificada deve referenciar uma destas
> entradas no comentário (`@canonical received`, `@canonical active-period`, etc.).

### 0.1 Campos do Chatwoot relevantes

| Campo | Tipo | Significado | Nullable? |
|---|---|---|---|
| `c.created_at` | TIMESTAMP | Quando a conversa nasceu. | NOT NULL |
| `c.last_activity_at` | TIMESTAMP | Último evento (msg, status, etc). Setado na criação; atualiza a cada movimento. | NOT NULL no Chatwoot atual; mas COALESCE defensivo. |
| `c.status` | INT | 0=aberta, 1=resolvida, 2=pendente, 3=adiada. | NOT NULL |
| `m.message_type` | INT | 0=incoming (cliente), 1=outgoing (agente), 2=activity (sistema), 3=template. | NOT NULL |
| `m.private` | BOOL | Mensagem privada (interna entre agentes). | NOT NULL |

### 0.2 Definições canônicas

- **Conversa recebida**: criada na plataforma. Filtro de período: `c.created_at` ∈ [start, end). Independe de status. **Único recorte que filtra por `created_at`**.
- **Conversa aberta**: `c.status = 0`. Quando contada "no período": `COALESCE(c.last_activity_at, c.created_at)` ∈ [start, end). Quando contada "agora": sem filtro de período.
- **Conversa pendente**: `c.status = 2`. Mesma regra de período (`COALESCE(last_activity_at, created_at)`).
- **Conversa resolvida**: `c.status = 1`. Quando contada "no período": `COALESCE(c.last_activity_at, c.created_at)` ∈ [start, end). (`last_activity_at` em conversa resolvida é o instante da resolução em ~100% dos casos no Chatwoot.)
- **Conversa adiada**: `c.status = 3`. Mesma regra de período.
- **Conversa sem resposta** (`waiting`): `c.status = 0` AND a última mensagem **classificadora** tem `message_type = 0` (cliente, pública). Onde "classificadora" = última msg em `(message_type IN (0,1))` ignorando incoming privadas (raras/inexistentes; outgoing privadas CONTAM como "agente movimentou"). Quando filtrada por período: `c.last_activity_at` ∈ [start, end). "Aguardando há": `NOW() - last_incoming_public_msg.created_at`.
- **Conversa "aberta há"** (`open_for`): `c.status = 0` AND a última mensagem **classificadora** tem `message_type = 1` (agente). Inclui mensagens privadas do agente (`private = TRUE`) — atividade interna conta como "agente movimentou". "Aberta há": `NOW() - last_outgoing_any_msg.created_at`.
- **Filtro de período padrão (`active`)**: `c.last_activity_at >= $start AND c.last_activity_at < $end` (sem COALESCE — performance; ver Apêndice A.3). Aplicado em:
  - Listagens (`/relatorios/conversas` e tabelas equivalentes nos drill-downs).
  - KPIs `abertas`, `pendentes`, `resolvidas` "no período".
  - Distribuições por inbox / departamento / atendente / status (recortes que mostram "estado das conversas que tiveram movimento no período").
  - Top atendentes "no período" (quando ranking de movimentação).
- **Filtro de período `created`**: `c.created_at >= $start AND c.created_at < $end`. Aplicado **apenas** em:
  - KPI "Conversas recebidas".
  - Chart "Recebidas" (uma das 4 séries do chart de linha).
  - Pré-agregação `received` (`chatwoot_facts_daily_by_*.received` count).

### 0.3 Convenção de períodos

- Timezone canônica da plataforma: `app_settings.platform.timezone` (default `America/Sao_Paulo`).
- "Hoje": `[startOfDay(now in tz), endOfDay(now in tz))`.
- "Esta semana": ISO week — segunda 00:00 → domingo 23:59:59.999 inclusivo (forma fechada `[seg00, prox-seg00)`). Independente do setting `dashboard.week_starts_on` (decidido nesta versão; setting será deprecado num release posterior). Justificativa: o usuário afirmou textualmente "começa na segunda e termina no domingo, sempre". Comentário no código: setting fica como compat-shim retornando 1.
- "Este mês": `[startOfMonth(now in tz), startOfMonth(now in tz)+1mês)`.
- "Todos": `[1970-01-01T00:00:00Z, now)` — não mais `new Date()` "fim do tempo".
- "Personalizado": `[startOfDay(start), endOfDay(end))` ambos no tz da plataforma; intervalo end-exclusivo.

### 0.4 Matrix IA

- Setting `report.matrix_ia.visibility`: `"all" | "super_admin_only" | "none"`.
- Resolvido em 1 helper único `shouldExcludeMatrixIA(role)` (já existe em `src/lib/reports/exclude-matrix-ia.ts`).
- Aplicação em SQL: 1 helper único `chatwootMatrixIaClause(excludeMatrixIA: boolean): string` retornando `"AND c.inbox_id <> 31"` ou `""`. Substitui literais espalhados.
- Tabelas `chatwoot_facts_daily_by_account` continuam usando LEFT JOIN com `chatwoot_facts_daily_by_inbox` (subtração linha a linha) — não é alterado nesta versão.
- `readFactsHourly` continua sem suporte a excludeMatrixIA (limitação aceita; documentada).

---

## 1. File Structure (criar / modificar)

### 1.1 Novos
- `src/lib/reports/canonical.ts` — exporta:
  - tipos `PeriodColumn = "active" | "created"`,
  - `STATUS_OPEN/RESOLVED/PENDING/SNOOZED`, `MSG_INCOMING/OUTGOING/ACTIVITY/TEMPLATE`,
  - `chatwootMatrixIaClause(excludeMatrixIA: boolean): string`,
  - `chatwootMatrixIaOnlyClause(): string` (helper inverso para `matrix-ia.ts`),
  - `buildActivePeriodClause({ start, end })` → `c.last_activity_at >= $X AND c.last_activity_at < $Y` (sem COALESCE),
  - `buildCreatedPeriodClause({ start, end })` → `c.created_at >= $X AND c.created_at < $Y`,
  - `buildLastClassificationMsgCte()` → CTE `last_classification_msg` com última msg incoming pública OU outgoing (qualquer privacidade),
  - `buildLastIncomingPublicMsgCte()` → CTE `last_incoming_public_msg` (somente `message_type=0 AND private=FALSE`),
  - `buildLastOutgoingAnyMsgCte()` → CTE `last_outgoing_any_msg` (somente `message_type=1`, qualquer privacidade).
- `src/lib/reports/__tests__/canonical.test.ts` — cobertura unitária com snapshot de SQL + parametrização.
- `docs/runbooks/canonical-data-rules.md` — runbook de operação para futuros agentes.

### 1.2 Modificados
- `src/lib/chatwoot/filters.ts` — `buildBaseFilter()` ganha `periodColumn?: PeriodColumn` (default `"active"`). Usa `c.last_activity_at` quando `"active"` (sem COALESCE — A.3). Mantém `c.created_at` quando `"created"`. `excludeMatrixIA` passa a usar `chatwootMatrixIaClause`. Sem mudança em `BuiltFilter`.
- `src/lib/chatwoot/queries/dashboard-data.ts` — usa `periodColumn: "created"` para `sqlReceived` e `sqlResolved` quando coorte de "Recebidas" exige; demais queries (`sqlOpen`, `sqlByTeam`, `sqlByStatus`, `sqlNoResponse`, `sqlTopInboxes`) usam default `"active"`. Cláusulas manuais de `last_activity_at` colocadas inline são removidas e substituídas por `buildBaseFilter({...filters, periodColumn: "active"})`. `sqlNoResponse` migra para `buildLastPublicMsgCte`. Cache key bump v9 → v10.
- `src/lib/chatwoot/queries/dashboard-kpis.ts` — `resolvidasNoPeriodo` consome `buildBaseFilter` com `"active"` (substituindo construção manual de `last_activity_at` em params1). `mensagensNaoRespondidas` consome `buildLastPublicMsgCte` (substituindo `last msg bruta`, fechando INC-004). Cache key bump.
- `src/lib/chatwoot/queries/dashboard-drill-down.ts` — todas as 6 funções consomem `buildBaseFilter` com `"active"`. `getReceivedDrillDown` continua "created". `getResolvedDrillDown` muda para "active" (alinhar com regra canônica). `getOpenDrillDown`, `getNoResponseDrillDown`, `getByTeamDrillDown`, `getResolutionRateDrillDown`: "active". Cache key bump.
- `src/lib/chatwoot/queries/conversas-list.ts` — passa `periodColumn: "active"` em `buildBaseFilter`. Comentários no header referenciam `@canonical active-period`. Tabela passa a refletir conversas com movimentação no período.
- `src/lib/chatwoot/queries/conversas-search.ts` — `"active"`.
- `src/lib/chatwoot/queries/mensagens-nao-respondidas.ts` — passa a aceitar período (deixa de ser "agora" exclusivamente). KPIs no topo da página continuam "agora" (snapshot), mas a lista respeita o período se houver. Justificativa: o usuário pediu consistência; manter "agora" violaria. Substitui o uso de `filtersNoPeriod` por aplicação opcional. CTE migra para `buildLastPublicMsgCte`.
- `src/lib/chatwoot/queries/status-distribution.ts` — `"active"`.
- `src/lib/chatwoot/queries/por-departamento.ts` — `"active"`.
- `src/lib/chatwoot/queries/por-estado.ts` — `"active"`.
- `src/lib/chatwoot/queries/ranking-atendentes.ts` — `"active"`.
- `src/lib/chatwoot/queries/leads-recebidos.ts` — KPI volume "criados" continua "created". Mas distribuições laterais usam "active".
- `src/lib/chatwoot/queries/matrix-ia.ts` — usa `chatwootMatrixIaClause` (override força inbox=31, mas helper aceita esse modo). Inclui período como `"active"` por default; total continua "agora" se filtro vazio.
- `src/lib/chatwoot/queries/tempos-resposta.ts` — filtro de período em `re.created_at` (evento) — não muda. Mas se houver subquery em conversations, usa `"active"`.
- `src/lib/chatwoot/queries/volumetria-dow.ts` / `volumetria-heatmap.ts` — fact-based; sem mudança (são por `bucket_date`).
- `src/lib/chatwoot/queries/home-summary.ts` — `"active"`.
- `src/lib/chatwoot/facts.ts` — sem mudança de assinatura. Apenas comentário canônico (`@canonical received` em `received`, etc.).
- `src/worker/jobs/pre-agregacao/refresh-by-account.ts` — `received` continua filtrando `c.created_at` (correto, é definição canônica). `resolved` passa a filtrar por `COALESCE(last_activity_at, created_at)` (já estava em `last_activity_at`, agora COALESCE para defesa). `messages_in/out` por `m.created_at`. Comentários canônicos.
- `src/worker/jobs/pre-agregacao/refresh-by-inbox.ts`, `refresh-by-team.ts`, `refresh-by-agent.ts` — análogo.
- `src/components/dashboard/dashboard-content.tsx` — sem mudança estrutural. Apenas labels textuais para refletir definições do glossário onde houver ambiguidade ("Atualmente abertas no período" → "Abertas com movimentação no período"). UI revisada com `ui-ux-pro-max`.
- `src/components/dashboard/no-response-card.tsx` — texto "Aguardando resposta agora — no período selecionado" mantido (já está alinhado).
- `src/components/dashboard/status-distribution-card.tsx` — sem mudança (lê dados do KPI canônico).
- `src/components/reports/conversas-table.tsx` — colunas e cálculos não mudam (já consomem `waiting_seconds` e `open_seconds`). Tooltip da coluna "Aberta há" recebe texto canônico definido em `canonical.ts`.
- `src/components/reports/period-selector-url.tsx` — labels "Hoje / Esta semana / Este mês / Todos / Personalizado" preservados; default `weekStartsOn` força 1 (segunda-feira).
- `src/lib/dashboard-period.ts` / `src/lib/datetime-core.ts` — `weekStartsOn` hardcoded em 1; remove leitura de `app_settings.dashboard.week_starts_on` (passa a ser ignorado). Documenta no comentário.
- `src/lib/dashboard-settings.ts` — `weekStartsOn` retorna sempre 1 (compat). Comentário explica deprecação.
- `CLAUDE.md` — adiciona seção §11 "Glossário canônico de dados" com link para `canonical.ts`.
- `CHANGELOG.md` — entrada v0.42.0.
- `docs/STATUS.md` — refletir v0.42.0.
- `docs/runbooks/canonical-data-rules.md` — novo runbook.
- `package.json` — bump v0.42.0.

### 1.3 Documentação a atualizar
- `docs/runbooks/pre-agregacao.md` — apêndice "Definições canônicas" com link para `canonical.ts`.
- `docs/runbooks/polling-delta-sync.md` — apêndice idem.

---

## 2. Tasks

### Task 1: Glossário e helpers canônicos

**Files:**
- Create: `src/lib/reports/canonical.ts`
- Create: `src/lib/reports/__tests__/canonical.test.ts`

- [ ] **Step 1: Escrever os testes (RED)**

```typescript
// src/lib/reports/__tests__/canonical.test.ts
import {
  buildActivePeriodClause,
  buildCreatedPeriodClause,
  buildLastClassificationMsgCte,
  buildLastIncomingPublicMsgCte,
  buildLastOutgoingAnyMsgCte,
  chatwootMatrixIaClause,
  chatwootMatrixIaOnlyClause,
  STATUS_OPEN,
  STATUS_RESOLVED,
  STATUS_PENDING,
  STATUS_SNOOZED,
  MSG_INCOMING,
  MSG_OUTGOING,
  MSG_ACTIVITY,
  MSG_TEMPLATE,
} from "../canonical";

describe("canonical", () => {
  test("status constants", () => {
    expect(STATUS_OPEN).toBe(0);
    expect(STATUS_RESOLVED).toBe(1);
    expect(STATUS_PENDING).toBe(2);
    expect(STATUS_SNOOZED).toBe(3);
  });

  test("message type constants", () => {
    expect(MSG_INCOMING).toBe(0);
    expect(MSG_OUTGOING).toBe(1);
    expect(MSG_ACTIVITY).toBe(2);
    expect(MSG_TEMPLATE).toBe(3);
  });

  test("buildActivePeriodClause uses c.last_activity_at without COALESCE (perf — Apêndice A.3)", () => {
    const r = buildActivePeriodClause({ start: 5, end: 6 });
    expect(r).toContain("c.last_activity_at >= $5");
    expect(r).toContain("c.last_activity_at < $6");
    expect(r).not.toContain("COALESCE");
  });

  test("buildCreatedPeriodClause uses c.created_at", () => {
    const r = buildCreatedPeriodClause({ start: 2, end: 3 });
    expect(r).toContain("c.created_at >= $2");
    expect(r).toContain("c.created_at < $3");
  });

  test("chatwootMatrixIaClause(true) excludes inbox 31", () => {
    expect(chatwootMatrixIaClause(true)).toBe("AND c.inbox_id <> 31");
  });

  test("chatwootMatrixIaClause(false) returns empty", () => {
    expect(chatwootMatrixIaClause(false)).toBe("");
  });

  test("chatwootMatrixIaOnlyClause restricts to inbox 31", () => {
    expect(chatwootMatrixIaOnlyClause()).toBe("AND c.inbox_id = 31");
  });

  test("buildLastClassificationMsgCte: incoming público OR outgoing qualquer privacidade", () => {
    const sql = buildLastClassificationMsgCte();
    expect(sql).toMatch(/WITH\s+last_classification_msg\s+AS/);
    expect(sql).toContain("DISTINCT ON (m.conversation_id)");
    expect(sql).toContain("m.message_type IN (0, 1)");
    expect(sql).toContain("NOT (m.message_type = 0 AND m.private = TRUE)");
    expect(sql).toContain("ORDER BY m.conversation_id, m.created_at DESC");
  });

  test("buildLastIncomingPublicMsgCte: somente incoming + private FALSE", () => {
    const sql = buildLastIncomingPublicMsgCte();
    expect(sql).toMatch(/WITH\s+last_incoming_public_msg\s+AS/);
    expect(sql).toContain("m.message_type = 0");
    expect(sql).toContain("m.private = FALSE");
  });

  test("buildLastOutgoingAnyMsgCte: somente outgoing, qualquer privacidade", () => {
    const sql = buildLastOutgoingAnyMsgCte();
    expect(sql).toMatch(/WITH\s+last_outgoing_any_msg\s+AS/);
    expect(sql).toContain("m.message_type = 1");
    expect(sql).not.toContain("m.private = FALSE");
    expect(sql).not.toContain("m.private = TRUE");
  });
});
```

- [ ] **Step 2: Run test → expected RED (file not found)**

```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat" && npx jest src/lib/reports/__tests__/canonical.test.ts --no-coverage 2>&1 | tail -10
```

Expected: `Cannot find module '../canonical'` ou similar.

- [ ] **Step 3: Implementar `src/lib/reports/canonical.ts`**

```typescript
/**
 * Glossário canônico de dados — única fonte da verdade para semântica de
 * período, status, tipo de mensagem, exclusão de Matrix IA e CTEs comuns.
 *
 * Toda query nova ou alterada DEVE consumir estes helpers. Toda definição
 * informal espalhada (cláusulas inline, message_type filter ad-hoc, literais
 * de inbox 31) é dívida técnica.
 *
 * Regras (ver docs/runbooks/canonical-data-rules.md):
 *  - Filtro de período padrão é "active": c.last_activity_at (sem COALESCE
 *    para preservar índice — Chatwoot atual tem last_activity_at NOT NULL).
 *  - "Recebidas" é o ÚNICO recorte que filtra por created_at.
 *  - "Sem resposta" / "Aberta há" usam CTEs canônicas (last_classification_msg,
 *    last_incoming_public_msg, last_outgoing_any_msg) — nunca subqueries ad-hoc.
 *  - Matrix IA é o inbox id 31; usa apenas helpers chatwootMatrixIa*Clause.
 */

import { MATRIX_IA_INBOX_ID } from "@/lib/constants/matrix-ia";

export type PeriodColumn = "active" | "created";

/** Status enum do Chatwoot (canônico). */
export const STATUS_OPEN = 0;
export const STATUS_RESOLVED = 1;
export const STATUS_PENDING = 2;
export const STATUS_SNOOZED = 3;

/** Tipos de mensagem do Chatwoot (canônico). */
export const MSG_INCOMING = 0;
export const MSG_OUTGOING = 1;
export const MSG_ACTIVITY = 2;
export const MSG_TEMPLATE = 3;

/**
 * Cláusula SQL para "conversas com movimentação no período".
 * Usa coluna pura (sem COALESCE) para preservar índice em last_activity_at.
 * Schema do Chatwoot atual mantém last_activity_at NOT NULL desde a criação.
 * Se algum dia provar-se NULL, abrir issue separada — fix será voltar para
 * COALESCE + criar índice em expressão (requer permissão de escrita no
 * Chatwoot, que hoje não temos).
 */
export function buildActivePeriodClause(params: {
  start: number;
  end: number;
}): string {
  return `c.last_activity_at >= $${params.start} AND c.last_activity_at < $${params.end}`;
}

/** Cláusula SQL para "conversas criadas no período" (apenas KPI Recebidas). */
export function buildCreatedPeriodClause(params: {
  start: number;
  end: number;
}): string {
  return `c.created_at >= $${params.start} AND c.created_at < $${params.end}`;
}

/** Helper para excluir Matrix IA. Default da plataforma. */
export function chatwootMatrixIaClause(excludeMatrixIA: boolean): string {
  return excludeMatrixIA ? `AND c.inbox_id <> ${MATRIX_IA_INBOX_ID}` : "";
}

/** Helper inverso: restringe à Matrix IA (apenas para queries do relatório dedicado). */
export function chatwootMatrixIaOnlyClause(): string {
  return `AND c.inbox_id = ${MATRIX_IA_INBOX_ID}`;
}

/**
 * CTE `last_classification_msg`: última mensagem usada para classificar uma
 * conversa entre "sem resposta" (incoming público) e "aberta há" (outgoing
 * qualquer privacidade).
 *
 * Inclui:
 *  - incoming pública (`message_type=0 AND private=FALSE`) — cliente falou.
 *  - outgoing qualquer privacidade (`message_type=1`) — agente movimentou
 *    (mesmo via nota privada, conta como atividade interna).
 * Exclui:
 *  - incoming privadas (raras/inexistentes; cliente não manda privadas).
 *  - mensagens de sistema (`message_type=2`) e templates outbound puramente
 *    automáticos (`message_type=3`) — não representam movimento humano.
 */
export function buildLastClassificationMsgCte(): string {
  return `
    WITH last_classification_msg AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        m.created_at AS msg_created_at,
        m.message_type,
        m.private
      FROM messages m
      WHERE m.message_type IN (${MSG_INCOMING}, ${MSG_OUTGOING})
        AND NOT (m.message_type = ${MSG_INCOMING} AND m.private = TRUE)
      ORDER BY m.conversation_id, m.created_at DESC
    )
  `;
}

/**
 * CTE `last_incoming_public_msg`: última mensagem do cliente que foi PÚBLICA.
 * Usado para `waiting_seconds = NOW() - last_incoming_public_msg.created_at`.
 */
export function buildLastIncomingPublicMsgCte(): string {
  return `
    WITH last_incoming_public_msg AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        m.created_at AS msg_created_at
      FROM messages m
      WHERE m.message_type = ${MSG_INCOMING}
        AND m.private = FALSE
      ORDER BY m.conversation_id, m.created_at DESC
    )
  `;
}

/**
 * CTE `last_outgoing_any_msg`: última mensagem do agente, pública OU privada.
 * Usado para `open_seconds = NOW() - last_outgoing_any_msg.created_at`.
 */
export function buildLastOutgoingAnyMsgCte(): string {
  return `
    WITH last_outgoing_any_msg AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        m.created_at AS msg_created_at
      FROM messages m
      WHERE m.message_type = ${MSG_OUTGOING}
      ORDER BY m.conversation_id, m.created_at DESC
    )
  `;
}
```

- [ ] **Step 4: Run test → GREEN**

```bash
npx jest src/lib/reports/__tests__/canonical.test.ts --no-coverage 2>&1 | tail -10
```

Expected: `Tests: 6 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/canonical.ts src/lib/reports/__tests__/canonical.test.ts
git commit -m "feat(canonical): introduce single source of truth for data semantics (status, message types, period clauses, matrix-ia, last-public-msg CTE)"
```

---

### Task 2: Refatorar buildBaseFilter para usar helpers canônicos

**Files:**
- Modify: `src/lib/chatwoot/filters.ts`
- Modify: `src/lib/chatwoot/__tests__/filters.test.ts` (criar se não existir)

- [ ] **Step 1: Escrever testes (RED)**

```typescript
// src/lib/chatwoot/__tests__/filters.test.ts
import { buildBaseFilter } from "../filters";

describe("buildBaseFilter", () => {
  test("default periodColumn is 'active' — uses c.last_activity_at (sem COALESCE)", () => {
    const r = buildBaseFilter(
      { period: { start: new Date("2026-05-01"), end: new Date("2026-05-04") } },
      123,
    );
    expect(r.whereSql).toContain("c.last_activity_at >= $");
    expect(r.whereSql).toContain("c.last_activity_at < $");
    expect(r.whereSql).not.toContain("COALESCE");
    expect(r.whereSql).not.toMatch(/c\.created_at >= \$/);
  });

  test("periodColumn 'created' uses c.created_at", () => {
    const r = buildBaseFilter(
      {
        period: { start: new Date("2026-05-01"), end: new Date("2026-05-04") },
        periodColumn: "created",
      },
      123,
    );
    expect(r.whereSql).toMatch(/c\.created_at >= \$/);
    expect(r.whereSql).toMatch(/c\.created_at < \$/);
    expect(r.whereSql).not.toMatch(/c\.last_activity_at/);
  });

  test("excludeMatrixIA default true via canonical helper", () => {
    const r = buildBaseFilter({}, 123);
    expect(r.whereSql).toContain("c.inbox_id <> 31");
  });

  test("excludeMatrixIA explicit false omits clause", () => {
    const r = buildBaseFilter({ excludeMatrixIA: false }, 123);
    expect(r.whereSql).not.toContain("c.inbox_id <> 31");
  });

  test("account_id is always parametrized as $1", () => {
    const r = buildBaseFilter({}, 999);
    expect(r.whereSql).toContain("c.account_id = $1");
    expect(r.params[0]).toBe(999);
  });

  test("period 'active' params still parametrized correctly", () => {
    const r = buildBaseFilter(
      {
        period: { start: new Date("2026-05-01"), end: new Date("2026-05-04") },
        statuses: [0, 2],
      },
      1,
    );
    // params[0]=accountId, params[1]=statuses[], params[2]=start, params[3]=end
    expect(r.params).toHaveLength(4);
    expect(r.params[0]).toBe(1);
  });
});
```

- [ ] **Step 2: Run test → RED**

```bash
npx jest src/lib/chatwoot/__tests__/filters.test.ts --no-coverage 2>&1 | tail -15
```

Expected: failures because `periodColumn` doesn't exist yet.

- [ ] **Step 3: Modificar `filters.ts`**

```typescript
// src/lib/chatwoot/filters.ts
import {
  buildActivePeriodClause,
  buildCreatedPeriodClause,
  chatwootMatrixIaClause,
  type PeriodColumn,
} from "@/lib/reports/canonical";

export interface ReportFilters {
  inboxIds?: number[];
  teamIds?: number[];
  assigneeIds?: number[];
  statuses?: number[];
  priorities?: number[];
  labelIds?: number[];
  period?: { start: Date; end: Date };
  /**
   * Coluna de tempo usada para filtrar período.
   * - `"active"` (default): `COALESCE(last_activity_at, created_at)`.
   *   Use para listas, KPIs "abertas/pendentes/resolvidas no período",
   *   distribuições, drill-downs.
   * - `"created"`: `created_at`. Use APENAS para KPI "Recebidas" e chart
   *   da série Recebidas.
   * @canonical see src/lib/reports/canonical.ts
   */
  periodColumn?: PeriodColumn;
  excludeMatrixIA?: boolean;
  search?: string;
}

export interface BuiltFilter {
  whereSql: string;
  params: unknown[];
}

export function buildBaseFilter(
  filters: ReportFilters,
  accountId: number,
): BuiltFilter {
  const parts: string[] = [];
  const params: unknown[] = [];
  let p = 0;

  parts.push(`c.account_id = $${++p}`);
  params.push(accountId);

  const matrixClause = chatwootMatrixIaClause(filters.excludeMatrixIA !== false);
  if (matrixClause) {
    // helper retorna "AND c.inbox_id <> 31"; remover prefixo "AND " porque o
    // join externo já adiciona AND entre parts.
    parts.push(matrixClause.replace(/^AND\s+/, ""));
  }

  if (filters.inboxIds?.length) {
    parts.push(`c.inbox_id = ANY($${++p})`);
    params.push(filters.inboxIds);
  }
  if (filters.teamIds?.length) {
    parts.push(`c.team_id = ANY($${++p})`);
    params.push(filters.teamIds);
  }
  if (filters.assigneeIds?.length) {
    parts.push(`c.assignee_id = ANY($${++p})`);
    params.push(filters.assigneeIds);
  }
  if (filters.statuses?.length) {
    parts.push(`c.status = ANY($${++p})`);
    params.push(filters.statuses);
  }
  if (filters.priorities?.length) {
    parts.push(`c.priority = ANY($${++p})`);
    params.push(filters.priorities);
  }

  if (filters.period?.start && filters.period?.end) {
    const startIdx = ++p;
    const endIdx = ++p;
    params.push(filters.period.start, filters.period.end);
    const periodColumn = filters.periodColumn ?? "active";
    parts.push(
      periodColumn === "created"
        ? buildCreatedPeriodClause({ start: startIdx, end: endIdx })
        : buildActivePeriodClause({ start: startIdx, end: endIdx }),
    );
  } else if (filters.period?.start) {
    const periodColumn = filters.periodColumn ?? "active";
    const col = periodColumn === "created" ? "c.created_at" : "c.last_activity_at";
    parts.push(`${col} >= $${++p}`);
    params.push(filters.period.start);
  } else if (filters.period?.end) {
    const periodColumn = filters.periodColumn ?? "active";
    const col = periodColumn === "created" ? "c.created_at" : "c.last_activity_at";
    parts.push(`${col} < $${++p}`);
    params.push(filters.period.end);
  }

  if (filters.labelIds?.length) {
    parts.push(
      `EXISTS (
        SELECT 1 FROM taggings t
        WHERE t.taggable_id = c.id
          AND t.taggable_type = 'Conversation'
          AND t.tag_id = ANY($${++p})
      )`,
    );
    params.push(filters.labelIds);
  }

  return { whereSql: parts.join(" AND "), params };
}
```

- [ ] **Step 4: Run test → GREEN**

```bash
npx jest src/lib/chatwoot/__tests__/filters.test.ts --no-coverage 2>&1 | tail -15
```

Expected: 6 passed.

- [ ] **Step 5: typecheck filtrado**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "src/lib/chatwoot/filters.ts\|src/lib/reports/canonical.ts" | head
```

Expected: zero erros nos arquivos modificados.

- [ ] **Step 6: Commit**

```bash
git add src/lib/chatwoot/filters.ts src/lib/chatwoot/__tests__/filters.test.ts
git commit -m "feat(filters): buildBaseFilter aceita periodColumn ('active'|'created'); default 'active' aplica COALESCE(last_activity_at, created_at)"
```

---

### Subagent Brief Pattern (reusar em todas as Tasks 3+)

Todo subagent despachado para Tasks 3+ DEVE receber este briefing antes da task específica:

```
Você está implementando o "Padrão Único de Consistência de Dados" v0.42 do Nexus Insights.
ANTES de começar:
1. Leia src/lib/reports/canonical.ts (helpers normativos: buildActivePeriodClause,
   buildCreatedPeriodClause, chatwootMatrixIaClause, chatwootMatrixIaOnlyClause,
   3 CTEs, STATUS_*, MSG_*).
2. Leia src/lib/chatwoot/filters.ts (buildBaseFilter aceita periodColumn).
3. Leia docs/superpowers/plans/2026-05-04-padrao-consistencia-dados.md (esta task específica).
4. Leia o Apêndice A e B do plan (referências cruzadas em decisões críticas).

REGRAS ABSOLUTAS:
- TDD: teste RED antes de qualquer mudança de produção; teste GREEN antes de commit.
- Nunca usar COALESCE no filtro de período (Apêndice A.3 explica).
- Toda query refatorada renomeia o `name` da cache key anexando "-canonical-v0.42"
  (ex.: 'dashboard-data-v9' → 'dashboard-data-canonical-v0.42';
        'status-distribution' → 'status-distribution-canonical-v0.42').
- Testes de SQL devem ter DUAS asserções complementares:
  (a) contém o helper canônico (string ou padrão);
  (b) NÃO contém o padrão antigo (ex.: `c.created_at` onde a mudança é p/ active).
  Isso impede falso GREEN por colisão de strings.
- Toda mudança visual exige invocar Skill ui-ux-pro-max:ui-ux-pro-max ANTES de codar.
- Commits granulares com prefixo Conventional (feat / refactor / fix / test).
- Multi-agente: NUNCA git add -A; sempre git add <arquivos específicos>.
- typecheck filtrado nos arquivos modificados deve sair zero antes do commit final.
- 20 testes em src/lib/integrations/power-bi/__tests__ falham por motivos pré-existentes
  (escopo distinto). NÃO corrigir. Foco apenas no escopo da task.
- Tempo-alvo por task: 15–25 min. Se passar de 30 min sem progresso, reportar bloqueio
  ao controlador em vez de continuar.
```

### Diagrama de dependências (ordem de execução)

```
Tasks 1, 2 (canonical.ts + filters.ts) — em SÉRIE pelo controlador
                                    │
        ┌──────────────────────────┴───────────────────────────┐
        │                                                       │
   Tasks 3a → 3b (mesmo arquivo, série)        Tasks 4..13 em PARALELO
        │                                                       │
        └──────────────────────────┬───────────────────────────┘
                                   ▼
                      Task 14 (docs canônica)
                                   │
                                   ▼
                  Task 15 (verificação + smoke numérico)
                                   │
                                   ▼
                       Task 16 (release v0.42.0)
```

---

### Task 3a: Migrar `dashboard-data.ts` (parte 1 — helpers + sqlReceived/Resolved/Open + sqlChart)

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-data.ts`
- Modify: `src/lib/chatwoot/queries/__tests__/dashboard-data.test.ts` (atualizar snapshots se houver)

**Escopo desta task** (parte 1 do arquivo de 720 linhas):
- `sqlReceived` (linha ~246): mantém `periodColumn: "created"`.
- `sqlResolved` (linha ~256): muda para `"active"`.
- `sqlOpen` (linha ~270): aplica helper canônico via `buildBaseFilter({ ..., periodColumn: "active" })`.
- `sqlChart` (linha ~287): bucket "Recebidas" usa `created_at`; "Resolvidas/Abertas/Pendentes" usam `last_activity_at` (sem COALESCE).
- Cache key bump: `dashboard-data-v9` → `dashboard-data-canonical-v0.42`.

(Tasks 3a e 3b modificam o mesmo arquivo — execução em **série**, não em paralelo.)

- [ ] **Step 2: Escrever testes para os SQLs alterados (RED parcial)**

Adicionar/atualizar em `__tests__/dashboard-data.test.ts`:

```typescript
describe("dashboard-data canonical", () => {
  test("sqlResolved usa COALESCE(last_activity_at, created_at)", () => {
    const result = buildSqlResolvedForTest({
      accountId: 1,
      period: { start: new Date("2026-05-01"), end: new Date("2026-05-04") },
    });
    expect(result.sql).toContain("COALESCE(c.last_activity_at, c.created_at)");
    expect(result.sql).not.toMatch(/AND c\.created_at >= \$/);
  });

  test("sqlReceived continua usando c.created_at (KPI exceção)", () => {
    const result = buildSqlReceivedForTest({
      accountId: 1,
      period: { start: new Date("2026-05-01"), end: new Date("2026-05-04") },
    });
    expect(result.sql).toMatch(/c\.created_at >= \$/);
  });

  test("sqlByStatus filtra todos os status pelo helper 'active'", () => {
    const result = buildSqlByStatusForTest({ accountId: 1, period: {...} });
    // Não deve haver bifurcação por status para coluna de tempo
    expect(result.sql.match(/COALESCE\(c\.last_activity_at, c\.created_at\)/g)?.length).toBeGreaterThanOrEqual(1);
    expect(result.sql).not.toMatch(/CASE.*c\.status.*c\.created_at/);
  });

  test("sqlNoResponse usa CTE last_public_msg (não last_msg ad-hoc)", () => {
    const result = buildSqlNoResponseForTest({...});
    expect(result.sql).toContain("last_public_msg");
    expect(result.sql).toContain("message_type IN (0, 1)");
    expect(result.sql).toContain("private = FALSE");
  });
});
```

> Se `dashboard-data.ts` não exporta os builders individualmente, refatorar minimamente para exportá-los como `__internalBuilders` (`if (process.env.NODE_ENV === "test")`) ou extrair para `dashboard-data.builders.ts`. Decisão final em implementação.

- [ ] **Step 3: Run test → RED**

```bash
npx jest src/lib/chatwoot/queries/__tests__/dashboard-data.test.ts --no-coverage 2>&1 | tail -20
```

- [ ] **Step 4: Refatorar `dashboard-data.ts`**

Substituições principais:
- Removar variável `matrixClause` literal — usar `chatwootMatrixIaClause(excludeMatrixIA)`.
- `sqlReceived`: `buildBaseFilter({ ...filters, periodColumn: "created" }, accountId)` (sem manual COUNT period clause).
- `sqlResolved`: `buildBaseFilter({ ...filters, periodColumn: "active", statuses: [STATUS_RESOLVED] }, accountId)`.
- `sqlOpen`: `buildBaseFilter({ ...filters, periodColumn: "active", statuses: [STATUS_OPEN] }, accountId)`.
- `sqlByStatus`: 1 query única que retorna `c.status, COUNT(*)` agrupada, com `buildBaseFilter` em `"active"`. Sem CASE por status na coluna de tempo.
- `sqlNoResponse`: prefixar com `buildLastPublicMsgCte()` (substituir CTE inline). Manter filtro `c.status = 0 AND lpm.message_type = 0`.
- Cache key bump: `dashboard-data-v9` → `dashboard-data-v10`.

(Código completo da task será escrito durante execução. Plan mantém pseudocódigo aqui para evitar inflação.)

- [ ] **Step 5: Run test → GREEN**

- [ ] **Step 6: typecheck filtrado**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "queries/dashboard-data.ts" | head
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/chatwoot/queries/dashboard-data.ts src/lib/chatwoot/queries/__tests__/dashboard-data.test.ts
git commit -m "refactor(dashboard-data 3a): sqlReceived/Resolved/Open/Chart usam helpers canônicos; cache key canonical-v0.42"
```

---

### Task 3b: Migrar `dashboard-data.ts` (parte 2 — sqlByStatus/Team/NoResponse/TopInboxes)

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-data.ts`
- Modify: `src/lib/chatwoot/queries/__tests__/dashboard-data.test.ts`

**Escopo desta task** (resto do arquivo):
- `sqlTopInboxes` (linha ~358): aplica `periodColumn: "active"`.
- `sqlByTeam` (linha ~373): `"active"`.
- `sqlByStatus` (linha ~392): UMA query única por `"active"` para os 4 status (sem CASE bifurcando por status). Era inconsistente: status=1 usava `created_at`, demais usavam `last_activity_at`. Agora todos usam `last_activity_at`.
- `sqlNoResponse` (linha ~425): prefixar com `buildLastClassificationMsgCte()` + filtro `c.status = 0 AND lcm.message_type = 0`. Período `"active"`.
- `sqlTopAgents` (linha ~338): filtro `re.created_at` (evento) **mantém**.
- `sqlRecent` (linha ~484): sem mudança.

**Steps**: análogo aos de 3a (RED → impl → GREEN → typecheck → commit).

```bash
git commit -m "refactor(dashboard-data 3b): sqlByStatus/Team/TopInboxes usam 'active'; sqlNoResponse usa CTE canônica last_classification_msg"
```

---

### Task 4: Migrar `dashboard-kpis.ts`

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-kpis.ts`
- Modify: `src/lib/chatwoot/queries/__tests__/dashboard-kpis.test.ts`

- [ ] **Step 1: Escrever testes (RED) — `resolvidasNoPeriodo` usa `"active"`; `mensagensNaoRespondidas` usa CTE canônica.**

```typescript
test("resolvidasNoPeriodo filtra por c.last_activity_at (sem COALESCE)", () => {
  const sql = buildResolvidasSql({...});
  expect(sql).toContain("c.last_activity_at >= $");
  expect(sql).not.toContain("COALESCE");
});

test("mensagensNaoRespondidas usa last_classification_msg CTE", () => {
  const sql = buildMensagensNaoRespondidasSql({...});
  expect(sql).toContain("last_classification_msg");
  expect(sql).not.toMatch(/SELECT m\.message_type FROM messages.*ORDER BY.*LIMIT 1/);
});
```

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Refatorar — `buildBaseFilter({ ..., periodColumn: "active" })`. Substituir subquery por JOIN com CTE `last_classification_msg`. Bump cache key.**

- [ ] **Step 4: Run GREEN**

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(dashboard-kpis): resolvidasNoPeriodo usa periodColumn 'active'; mensagensNaoRespondidas usa last_classification_msg CTE; cache key canonical-v0.42"
```

---

### Task 5: Migrar `dashboard-drill-down.ts`

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-drill-down.ts`
- Modify: `src/lib/chatwoot/queries/__tests__/dashboard-drill-down.test.ts` (criar se não existir)

- [ ] **Step 1: Escrever testes para cada uma das 6 funções (RED)**

```typescript
test("getReceivedDrillDown usa periodColumn 'created'", ...);
test("getResolvedDrillDown usa periodColumn 'active'", ...);
test("getOpenDrillDown usa periodColumn 'active'", ...);
test("getResolutionRateDrillDown usa 'active' tanto em recebidas quanto resolvidas no período", ...);
//   ^^^ Notar: "Taxa de resolução = Resolvidas / Recebidas". Por canonicidade,
//   ambas precisam ser na MESMA coluna de tempo. Optamos por "active" — taxa
//   reflete movimento no período. Recebidas separado continua "created".
test("getNoResponseDrillDown usa 'active' + last_public_msg CTE", ...);
test("getByTeamDrillDown usa 'active'", ...);
```

> **Decisão crítica em pente fino #1**: Taxa de resolução. Dois cenários:
> - (a) Numerador e denominador na mesma janela "active": semanticamente "% das conversas movimentadas que estão resolvidas no fim do período". Pode dar >100% improvável; mais frequente, taxa baixa porque inclui conversas antigas reabertas.
> - (b) Mantida a coorte original (received=created, resolved=created): "% das conversas criadas no período que foram resolvidas até o fim do período". Pode dar até 100% (cohort fechada).
>
> Pivotar para (a) seria contra-intuitivo. Decisão v1: manter (b) — Resolvidas no contexto da TAXA filtra `created_at`. Só o KPI grande "Resolvidas" e a lista de drill-down "Resolvidas" usam `"active"`. Documentar isso explicitamente.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Refatorar — passar `periodColumn` correto em cada função; substituir cláusulas manuais.**

- [ ] **Step 4: Run GREEN**

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(dashboard-drill-down): aplica padrão canônico nas 6 funções; getResolutionRate usa coorte 'created' para coerência da taxa"
```

---

### Task 6: Migrar `conversas-list.ts` e `conversas-search.ts`

**Files:**
- Modify: `src/lib/chatwoot/queries/conversas-list.ts`
- Modify: `src/lib/chatwoot/queries/conversas-search.ts`
- Modify: `src/lib/chatwoot/queries/__tests__/conversas-list.test.ts`
- Modify: `src/lib/chatwoot/queries/__tests__/conversas-search.test.ts`

- [ ] **Step 1: Escrever testes (RED) — listas filtram por `"active"` por default; `waiting_seconds`/`open_seconds` calculados via 3 CTEs canônicas.**

```typescript
test("waiting_seconds = NOW() - last_incoming_public_msg.msg_created_at quando classificação=incoming", ...);
test("open_seconds = NOW() - last_outgoing_any_msg.msg_created_at quando classificação=outgoing", ...);
test("classificação usa last_classification_msg CTE", ...);
test("status=1 (resolvida) zera waiting/open", ...);
```

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Refatorar**:
- `buildBaseFilter({ ..., periodColumn: "active" })`.
- Prefixar SQL com 3 CTEs canônicas concatenadas (helper `buildAllMsgCtes()` opcional em `canonical.ts` retornando as 3 com vírgulas — adicionar à Task 1 se decidir).
- Substituir CTE `last_msg` ad-hoc pelos JOINs nas CTEs canônicas:
  - `LEFT JOIN last_classification_msg lcm ON lcm.conversation_id = c.id` para classificação.
  - `LEFT JOIN last_incoming_public_msg lipm ON lipm.conversation_id = c.id` para `waiting_seconds`.
  - `LEFT JOIN last_outgoing_any_msg loam ON loam.conversation_id = c.id` para `open_seconds`.
- `waiting_seconds = CASE WHEN c.status=1 THEN NULL WHEN lcm.message_type=0 THEN EXTRACT(EPOCH FROM (NOW() - lipm.msg_created_at)) ELSE NULL END`.
- `open_seconds = CASE WHEN c.status=1 THEN NULL WHEN lcm.message_type=1 THEN EXTRACT(EPOCH FROM (NOW() - loam.msg_created_at)) ELSE NULL END`.

- [ ] **Step 4: Run GREEN**

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(conversas-list,search): periodColumn 'active'; waiting/open seconds via 3 CTEs canônicas (fecha gap de classificação com nota privada)"
```

---

### Task 7: Migrar `mensagens-nao-respondidas.ts`

**Files:**
- Modify: `src/lib/chatwoot/queries/mensagens-nao-respondidas.ts`
- Modify: `src/app/(protected)/relatorios/mensagens-nao-respondidas/page.tsx`
- Modify: `src/lib/actions/reports/mensagens-nao-respondidas.ts`
- Modify: `src/lib/chatwoot/queries/__tests__/mensagens-nao-respondidas.test.ts`

- [ ] **Step 1: Escrever testes (RED) — query passa a aceitar `period` opcional; CTE canônica.**

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Refatorar (TUDO respeita período — Apêndice A.4)**

- Filtro `c.last_activity_at` ∈ período obrigatório quando `filters.period` definido (regra canônica). Se "Todos", filtra desde 1970.
- Substituir CTE ad-hoc por `buildLastClassificationMsgCte()` (filtro `lcm.message_type = 0` identifica "sem resposta").
- Server Action `fetchMensagensNaoRespondidas` deixa de forçar `filtersNoPeriod` — passa `period` resolvido pela URL.
- Página mostra:
  - **KPIs do topo + tabela**: TODOS derivados da mesma cohort (status=0 + classification=incoming + active no período).
  - Texto canônico: "Conversas aguardando resposta · com movimento no período".
- Invocar `ui-ux-pro-max:ui-ux-pro-max` antes de qualquer ajuste visual.

- [ ] **Step 4: Run GREEN**

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(mensagens-nao-respondidas): respeita período (active) em KPIs e tabela; CTE canônica last_classification_msg"
```

---

### Task 8: Migrar `status-distribution.ts`, `por-departamento.ts`, `por-estado.ts`, `ranking-atendentes.ts`, `home-summary.ts`, `leads-recebidos.ts`

**Files:**
- Modify: cada uma das 6 queries.
- Modify: testes correspondentes (criar se faltar).

- [ ] **Step 1: Para cada uma — testes RED → refatorar → GREEN.**

Critério (default `"active"` aplica automaticamente via `buildBaseFilter`):
- `status-distribution.ts`: bumpa cache key (era `kpi/status-distribution/...`).
- `por-departamento.ts`: bumpa cache key.
- `por-estado.ts`: bumpa cache key.
- `ranking-atendentes.ts`: bumpa cache key.
- `home-summary.ts`: bumpa cache key. **Cuidado**: já usa janelas rolling fixas (`now() - interval '24 hours'`) em algumas subqueries — manter, são intencionais (Apêndice A.9).
- `leads-recebidos.ts`: KPI volume "leads criados" → `"created"` (definição: leads = criados). Sem `"active"` aqui (Apêndice A.7).

- [ ] **Step 2: Commit por query (commits granulares).**

```bash
git commit -m "refactor(status-distribution): periodColumn 'active' default; cache key canonical-v0.42"
git commit -m "refactor(por-departamento): periodColumn 'active' default; cache key canonical-v0.42"
git commit -m "refactor(por-estado): periodColumn 'active' default; cache key canonical-v0.42"
git commit -m "refactor(ranking-atendentes): periodColumn 'active' default; cache key canonical-v0.42"
git commit -m "refactor(home-summary): periodColumn 'active' default; janelas rolling 24h preservadas; cache key canonical-v0.42"
git commit -m "refactor(leads-recebidos): periodColumn 'created' (definição leads); cache key canonical-v0.42"
```

---

### Task 9: Migrar `matrix-ia.ts` e `tempos-resposta.ts`

**Files:**
- Modify: `src/lib/chatwoot/queries/matrix-ia.ts`
- Modify: `src/lib/chatwoot/queries/tempos-resposta.ts`
- Modify: testes correspondentes.

- [ ] **Step 1: matrix-ia — não usar `buildBaseFilter` (default exclui inbox 31, oposto do que queremos). Construir cláusula direto com `chatwootMatrixIaOnlyClause()` (Apêndice B.13). Aplicar `buildActivePeriodClause` manualmente em todas as queries de conversations (`sqlTotal`, `sqlSemResposta`, `sqlTransferidas`). `sqlTempos` mantém filtro em `re.created_at`. Usar CTE `last_classification_msg` em `sqlSemResposta`.**

- [ ] **Step 2: tempos-resposta — filtro principal continua em `re.created_at` (evento). Quando há filtros team/assignee, **construir subquery JOIN com conversations e aplicar `buildBaseFilter({ ..., periodColumn: 'active' })`** para coerência com KPI Resolvidas.**

- [ ] **Step 3: Run tests + Commits**

```bash
git commit -m "refactor(matrix-ia): chatwootMatrixIaOnlyClause + active-period; CTE last_classification_msg em sqlSemResposta; cache key canonical-v0.42"
git commit -m "refactor(tempos-resposta): subqueries em conversations com filtro team/assignee usam periodColumn 'active'; cache key canonical-v0.42"
```

---

### Task 9.1: Migrar `sla.ts` e `csat.ts`

**Files:**
- Modify: `src/lib/chatwoot/queries/sla.ts` (se existir e tocar conversations)
- Modify: `src/lib/chatwoot/queries/csat.ts` (idem)
- Modify: testes correspondentes.

- [ ] **Step 1: Subagent lê os 2 arquivos primeiro. Se filtram conversations por período (`c.created_at` ou similar), aplicar `"active"`. Se filtram apenas eventos (`csat_survey_responses.created_at` etc.), manter — eventos têm semântica própria.**

- [ ] **Step 2: TDD + commit por arquivo**.

```bash
git commit -m "refactor(sla): subqueries em conversations usam periodColumn 'active'; cache key canonical-v0.42"
git commit -m "refactor(csat): subqueries em conversations usam periodColumn 'active'; cache key canonical-v0.42"
```

---

### Task 10: Pré-agregação — comentários canônicos + COALESCE defensivo

**Files:**
- Modify: `src/worker/jobs/pre-agregacao/refresh-by-account.ts`
- Modify: `src/worker/jobs/pre-agregacao/refresh-by-inbox.ts`
- Modify: `src/worker/jobs/pre-agregacao/refresh-by-team.ts`
- Modify: `src/worker/jobs/pre-agregacao/refresh-by-agent.ts`
- Modify: testes (atualizar snapshots se houver).

- [ ] **Step 1: Em cada job, mudanças mínimas:**

- `received` count: filtra `c.created_at` no dia. **Mantém** (definição canônica).
- `resolved` count: filtra `c.last_activity_at` no dia. **Atualizar** para `COALESCE(c.last_activity_at, c.created_at)` (defensivo). Atualizar comentário canônico.
- `messages_in/out`: filtra `m.created_at`. **Mantém**.
- `unique_contacts`: continua coorte de criação. **Mantém**.
- FRT/RT: continua via `reporting_events.created_at`. **Mantém**.
- Snapshot `open_at_eod` / `pending_at_eod`: sem mudança.

> **Decisão**: pré-agregação não recebe coluna nova "active count" nesta versão. Agentes que precisam de "ativas no dia" continuam consultando direto via `queryNexusChat`. Adicionar `chatwoot_facts_daily_by_*.active_count` é trabalho de v0.43+ (custo: migration + backfill 90 dias).

- [ ] **Step 2: Run tests existentes (snapshot-style) e ajustar se ler SQL textual.**

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(pre-agregacao): COALESCE defensivo em resolved; comentários canônicos referenciando canonical.ts"
```

---

### Task 11: `dashboard-period.ts` — semana sempre segunda→domingo + mode 'current' fixo

**Files:**
- Modify: `src/lib/dashboard-period.ts`
- Modify: `src/lib/dashboard-settings.ts`
- Modify: `src/lib/datetime-core.ts`
- Modify: `src/lib/__tests__/dashboard-period.test.ts`
- Modify: `src/lib/__tests__/datetime-core.test.ts` (criar se faltar)

- [ ] **Step 1: Testes parametrizados (Apêndice B.11) — 6 datas-pivot:**

```typescript
const PIVOTS = [
  { name: "virada de ano", now: "2026-01-01T05:00:00Z" },           // 02:00 BRT do dia 1
  { name: "virada de mês", now: "2026-03-01T05:00:00Z" },
  { name: "segunda 00:00 BRT", now: "2026-04-27T03:00:00Z" },        // 00:00 BRT
  { name: "domingo 23:59 BRT", now: "2026-05-04T02:59:59Z" },        // 23:59 BRT do dia 3
  { name: "atual", now: "2026-05-04T14:00:00Z" },
  { name: "fim de ano", now: "2026-12-31T23:00:00Z" },
];
test.each(PIVOTS)("getCanonicalPeriod 'semana' em $name → seg 00:00 BRT a próx-seg 00:00 BRT", ({ now }) => {
  const r = getCanonicalPeriod({ label: "semana", tz: "America/Sao_Paulo", refIso: now });
  // segunda da semana de `now` em BRT, e próxima segunda em BRT
  expect(r.start.getDay()).toBe(1); // segunda em UTC pode variar; testar contra TZ
  // ...asserções específicas por pivot
});
test.each(PIVOTS)("getCanonicalPeriod 'mes' em $name → primeiro do mês a primeiro do mês seguinte", ...);
```

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Refatorar — Apêndices B.1 + B.2:**

- Criar helper único `getCanonicalPeriod({ label, tz, refIso?, customStart?, customEnd? })` em `src/lib/datetime-core.ts` (ou novo `src/lib/canonical-period.ts`).
- `getDashboardPeriod` reescrito como wrapper de `getCanonicalPeriod`. Aceita `mode: "current" | "rolling"` mas IGNORA: sempre usa "current" (deprecação silenciosa).
- `getPeriodInTz` reescrito como wrapper.
- `getDashboardSettings` retorna `{ weekStartsOn: 1, weekMode: "current", monthMode: "current" }` independente do DB. Settings persistidos ficam ignorados; log warning na primeira leitura por boot.
- `datetime-core.ts` mantém `weekStartsOn: 1` hardcoded (já está; só atualizar comentário).

- [ ] **Step 4: Run GREEN**

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(period): getCanonicalPeriod único; semana sempre seg→dom; mode 'current' fixo (settings week_mode/month_mode/week_starts_on deprecados em compat shim)"
```

---

### Task 12: Componentes do Dashboard — labels e tooltips canônicos

**Files:**
- Modify: `src/components/dashboard/dashboard-content.tsx`
- Modify: `src/components/dashboard/no-response-card.tsx`
- Modify: `src/components/dashboard/status-distribution-card.tsx`
- Modify: `src/components/dashboard/department-distribution-card.tsx`
- Modify: `src/components/dashboard/inbox-distribution-card.tsx`
- Modify: `src/components/dashboard/conversations-line-chart.tsx`

- [ ] **Step 1: Invocar `ui-ux-pro-max:ui-ux-pro-max` ANTES de qualquer mudança visual.**

- [ ] **Step 2: Ajustes textuais (sem mudança de layout):**
- KPI "Abertas": tooltip `"Conversas que tiveram movimento no período (status aberto agora)"`.
- KPI "Resolvidas": tooltip `"Resolvidas com atividade no período"`.
- KPI "Recebidas": tooltip `"Conversas criadas no período"`.
- Card "Conversas sem resposta": subtitle `"Aguardando resposta agora · respeita filtro de período"`.
- Status pie: legenda `"Aberto / Pendente / Adiado: por movimentação no período · Resolvido: por última atividade no período"`.

- [ ] **Step 3: Tests — sanity tests para presença das labels.**

- [ ] **Step 4: Run GREEN**

- [ ] **Step 5: Commit**

```bash
git commit -m "ui(dashboard): labels e tooltips refletem glossário canônico"
```

---

### Task 13: Componentes de Relatórios — labels canônicos

**Files:**
- Modify: `src/components/reports/conversas-table.tsx` (header tooltip)
- Modify: `src/components/reports/period-selector-url.tsx` (descrição da semana)
- Modify: `src/app/(protected)/relatorios/visao-geral/page.tsx` (subtítulo "Status no período" muda para "Status das conversas com movimento no período")
- Modify: `src/app/(protected)/relatorios/distribuicao/page.tsx` (idem)
- Modify: `src/app/(protected)/relatorios/equipe/page.tsx`
- Modify: `src/app/(protected)/relatorios/mensagens-nao-respondidas/page.tsx`

- [ ] **Step 1: Invocar `ui-ux-pro-max:ui-ux-pro-max`.**

- [ ] **Step 2: Aplicar labels do glossário com tooltips em colunas/cards-chave.**

- [ ] **Step 3: Tests + Commit**

```bash
git commit -m "ui(relatorios): labels e tooltips canônicos; subtítulos refletem padrão active-period"
```

---

### Task 14: Documentação canônica

**Files:**
- Create: `docs/runbooks/canonical-data-rules.md`
- Modify: `CLAUDE.md` (§11 nova seção)
- Modify: `docs/runbooks/pre-agregacao.md` (apêndice)
- Modify: `docs/runbooks/polling-delta-sync.md` (apêndice)

- [ ] **Step 1: Escrever runbook completo (definições, exemplos SQL, casos de exceção).**

- [ ] **Step 2: Atualizar CLAUDE.md §11.**

- [ ] **Step 3: Commit**

```bash
git commit -m "docs(canonical): runbook canonical-data-rules.md + CLAUDE.md §11 + apêndices runbooks"
```

---

### Task 15: Verificação de regressão

- [ ] **Step 1: typecheck full**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: zero erros (ou mantém os 20 falhas pré-existentes documentadas).

- [ ] **Step 2: jest full**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: tudo verde no escopo modificado; manter falhas pré-existentes power-bi.

- [ ] **Step 3: Smoke local — `npm run dev` e validar:**
- 4 KPIs do dashboard + 6 drill-downs.
- 7 páginas de relatório (visao-geral, conversas, distribuicao, equipe, mensagens-nao-respondidas, origem-ia, performance).
- 5 períodos (Hoje / Esta semana / Este mês / Todos / Personalizado) em cada superfície.

- [ ] **Step 4: Smoke de regressão NUMÉRICA (Apêndice A.19)**:
- Selecionar 1 conta de produção em ambiente local.
- Período "Hoje": rodar SQL canônico direto no Postgres do Chatwoot:
  ```sql
  SELECT COUNT(*) FROM conversations c
  WHERE c.account_id = <id> AND c.status = 0
    AND c.last_activity_at >= '<hoje 00:00 BRT em UTC>'
    AND c.last_activity_at <  '<amanhã 00:00 BRT em UTC>'
    AND c.inbox_id <> 31;
  ```
- Comparar com KPI "Abertas" do /dashboard. Diferença ≤ 1 (arredondamento de TZ) = OK; > 1 = bloquear release e investigar.
- Repetir para `received` (`c.created_at` no lugar de `c.last_activity_at`, sem filtro de status).
- Repetir para `resolved` (status=1).
- Repetir para `pendentes` (status=2).

- [ ] **Step 5: Smoke cruzado (Apêndice B.10)**:
- KPI "Conversas sem resposta" no /dashboard (período "Hoje").
- COUNT em /relatorios/mensagens-nao-respondidas (mesmo período).
- Devem ser iguais. Diferença > 0 = bloquear release.

- [ ] **Step 6: EXPLAIN ANALYZE no banco do Chatwoot (Apêndice B.24)**:
- Rodar a query mais pesada da refatoração (`conversas-list` com 3 CTEs):
  ```sql
  EXPLAIN ANALYZE
  SELECT c.id FROM conversations c
  WHERE c.account_id = <id>
    AND c.last_activity_at >= now() - interval '7 days'
  LIMIT 1000;
  ```
- Verificar uso de `Index Scan` em `conversations(last_activity_at)`. Se aparecer `Seq Scan`: NÃO bloquear release (risco aceitável), mas abrir issue para infra do Chatwoot pedir índice.

> Esta task aplica `superpowers:verification-before-completion` antes de qualquer release.

---

### Task 16: Release v0.42.0

**Files:**
- Modify: `package.json` (bump 0.41.1 → 0.42.0)
- Modify: `CHANGELOG.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/agents/HISTORY.md` (entrada de release)
- Create: `~/.claude/projects/.../memory/project_v0.42_consistencia.md`
- Modify: `~/.claude/projects/.../memory/MEMORY.md` (adicionar linha)

- [ ] **Step 1: Verificar `gh run list --limit 5` — sem builds pendentes.**

- [ ] **Step 2: Bump versão + CHANGELOG (template Apêndice B.20):**

```markdown
## v0.42.0 — Padrão Único de Consistência de Dados (2026-05-04)

⚠️ **MUDANÇAS DE INTERPRETAÇÃO** (números podem mudar visivelmente):
- KPIs "Abertas/Pendentes/Resolvidas no período" agora refletem conversas com
  movimento (`last_activity_at`) no período, não apenas as criadas.
- /relatorios/visao-geral Status Pie usa mesma regra (antes: created_at).
- /relatorios/conversas tabela: linhas listadas têm movimento no período
  (antes: criadas no período).
- /relatorios/mensagens-nao-respondidas respeita o filtro de período.
- Coluna "Aberta há" passa a considerar mensagens privadas do agente.
- Semana sempre começa segunda e termina domingo (settings antigos ignorados).

✓ **ADIÇÕES**:
- Novo módulo `src/lib/reports/canonical.ts` (helpers SQL + constantes).
- Documentação em `docs/runbooks/canonical-data-rules.md`.
- Glossário canônico em `CLAUDE.md §11`.
```

- [ ] **Step 2.1: Atualizar STATUS.md + criar/atualizar memória:**

- `~/.claude/projects/-Users.../memory/project_v0.42_consistencia.md`: descrever release.
- `~/.claude/projects/-Users.../memory/MEMORY.md`: adicionar linha
  `- [Release v0.42.0 LIVE — Padrão Único Consistência de Dados](project_v0.42_consistencia.md) — periodColumn 'active' default, last_activity_at único filtro de período, 3 CTEs canônicas para "sem resposta"/"aberta há"`.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(release): v0.42.0 — Padrão Único de Consistência de Dados (glossário canônico, periodColumn 'active' default, last_public_msg CTE, 8 inconsistências fechadas)"
```

- [ ] **Step 4: Push para main.**

```bash
git push origin main
```

- [ ] **Step 5: Disparar workflow `portainer-fix` para trocar APP_VERSION (ou aguardar auto-redeploy).**

- [ ] **Step 6: Validar `/api/health` → version=v0.42.0.**

- [ ] **Step 7: Smoke prod**:
- Carregar /dashboard com período "Hoje", "Semana", "Mês".
- Verificar que KPI "Abertas" reflete a tabela `/relatorios/conversas` (status=aberto + período "Hoje" = mesmo número).
- Carregar /relatorios/visao-geral, /relatorios/distribuicao, /relatorios/equipe, /relatorios/mensagens-nao-respondidas, /relatorios/origem-ia, /relatorios/performance, /relatorios/conversas — nenhum 500.

- [ ] **Step 8: Atualizar HISTORY.md + deletar `docs/agents/active/claude-padrao-consistencia-dados.md`.**

- [ ] **Step 9: Chamar usuário para validação visual.**

### Plano de Rollback (Apêndice A.20)

Critérios de rollback automático/manual:
- `/api/health` retorna `status != "ok"` ≥ 2 vezes em 5 min pós-deploy.
- Qualquer KPI do dashboard varia > 50% face ao mesmo período no dia anterior.
- Sentry/Vercel logs com error rate > 1% nas rotas `/dashboard` ou `/relatorios/*`.

Procedimento (5–10 min):
1. `git log --oneline -20` — identificar SHA do release v0.42.0 e commits subsequentes.
2. `git revert <sha-release>` (sem `-no-edit`; manter branch limpa).
3. `git push origin main`.
4. Disparar workflow `portainer-fix` para forçar APP_VERSION → v0.41.1.
5. Validar `/api/health` → version=v0.41.1 + status=ok.
6. Atualizar HISTORY.md com entrada `scope=revert`.
7. Anunciar ao usuário; abrir issue para diagnóstico.

---

## 3. Auto-revisão (checklist mínima)

- [ ] Cobertura de spec: cada definição do glossário tem task que a implementa.
- [ ] Sem placeholders TBD/TODO no código produzido.
- [ ] Type-consistency: `PeriodColumn`, `STATUS_*`, `MSG_*` usados consistentemente.
- [ ] Cache keys bumped onde a query muda (v9 → v10 em dashboard-data; outras queries com cache versionado também).
- [ ] Testes existentes adaptados (snapshot SQL, mocks).
- [ ] Documentação canônica criada e linkada.
- [ ] UI revisada com `ui-ux-pro-max` em todas as tasks que tocam UI.
- [ ] Multi-agente: `docs/agents/active/<id>.md` mantido durante toda a sessão; deletado no fim.

---

## Apêndice A — Pente Fino #1 (achados aplicados em v2)

> Análise crítica realizada em 2026-05-04. Cada achado foi reaplicado nas seções
> 0–2. Lista preservada para auditoria (decisões e razões).

### A.1 CTE `last_public_msg` cobre mal o caso "agente fez nota privada"
**Achado**: Filtro `private = FALSE` da CTE original do plan v1 cortaria mensagens privadas do agente. Mas o usuário definiu que **"Aberta há"** considera mensagens outgoing (mesmo privadas). Categorização ficaria errada para conversas com somente nota privada após incoming público.
**Correção aplicada**: Substituir helper único por **três CTEs auxiliares** em `canonical.ts`:
- `buildLastClassificationMsgCte()`: última msg incoming pública OU outgoing (qualquer privacidade). Usado para classificar "sem resposta" vs "aberta há".
- `buildLastIncomingPublicMsgCte()`: última msg incoming pública (`message_type=0 AND private=FALSE`). Usado para `last_incoming_at` → `waiting_seconds`.
- `buildLastOutgoingAnyMsgCte()`: última msg outgoing (`message_type=1`, qualquer `private`). Usado para `last_outgoing_at` → `open_seconds`.

### A.2 Taxa de Resolução com coortes distintas pode ultrapassar 100%
**Achado**: Recebidas (`created`) e Resolvidas (`active`) operam em coortes diferentes. Taxa de resolução pode passar 100% quando a equipe trabalha o backlog num período em que poucas conversas novas chegam.
**Correção aplicada**: Manter o sistema de **uma única semântica por KPI** (Recebidas=created, Resolvidas=active). Taxa permanece "Resolvidas / Recebidas" e é **clamada para 100%** no front (já é hoje em `dashboard-data.ts:587`). Tooltip do KPI Taxa explicita: "Pode atingir 100% mesmo quando há mais resolvidas que recebidas no período (equipe trabalhando backlog)". Sem KPI duplicado.

### A.3 Performance — `COALESCE(last_activity_at, created_at)` invalida índices
**Achado**: Expressão `COALESCE` em WHERE força Postgres a fazer sequential scan se não houver índice em expressão. O banco do Chatwoot é **read-only** — não podemos criar índice. Em períodos de "Mês" sobre dezenas de milhares de conversas, isso seria 5+ segundos.
**Correção aplicada**: Helper canônico `buildActivePeriodClause` retorna `c.last_activity_at >= $X AND c.last_activity_at < $Y` (**sem COALESCE**). Justificativa documentada: `last_activity_at` é NOT NULL em todas as instalações Chatwoot conhecidas (setado na criação, atualizado em qualquer evento). Comentário no `canonical.ts`: "Se em alguma instalação `last_activity_at` for NULL, abrir issue separada — ajuste será reverter para COALESCE + criar índice em expressão (requer acordo de escrita no Chatwoot)."

### A.4 `mensagens-nao-respondidas` deve respeitar período
**Achado**: O usuário disse explicitamente que **TODOS** os relatórios respeitam o filtro de período. Mas KPIs do topo da página são intrinsecamente "agora" (snapshot live).
**Correção aplicada**: **Tudo** respeita período. Quando o usuário filtra "Hoje", a página mostra "conversas com status=0 + última msg incoming + atividade hoje". KPIs do topo continuam derivados dessa lista (não são snapshot global). Texto do header reflete: "Conversas que tiveram movimento no período".

### A.5 `por-departamento.ts`/`por-estado.ts`/`ranking-atendentes.ts`/`status-distribution.ts` consomem `buildBaseFilter` direto
**Achado** (confirmação): Validei lendo os arquivos. Nenhum desses lê `chatwoot_facts_*`. Todos usam `queryNexusChat` + `buildBaseFilter`. Refatorar `buildBaseFilter` propaga automaticamente.
**Correção aplicada**: Tasks 8–9 simplificadas — basta passar default `"active"` (já default no helper) e bumpar cache keys.

### A.6 Pré-agregação não recebe coluna nova nesta versão
**Achado**: `chatwoot_facts_daily_by_*.received` é `created_at`-based; `resolved` é `last_activity_at`-based. Não há `active_count`. Para queries que leem `readFactsDaily` (volumetria-dow, volumetria-heatmap), o filtro segue `bucket_date` (que é `created_at`). Trocar para "active" exige nova coluna + migration + backfill.
**Correção aplicada**: Pré-agregação inalterada. Volumetria DOW/heatmap continuam mostrando "volume de conversas criadas por dia/hora" (semântica histórica). Adicionar comentário UI: "Volume de conversas criadas no período". Em v0.43+, decidir se faz sentido coluna nova `active_count`.

### A.7 `volumetria-dow.ts` lê facts; `volumetria-heatmap.ts` lê queryNexusChat
**Achado**: Confirmado em `grep`. `volumetria-heatmap.ts` faz query direta. **Pode** seguir o padrão "active" se quisermos.
**Correção aplicada**: `volumetria-heatmap` continua filtrando por `created_at` (semantic: "volume de conversas criadas por hora do dia"). Mudar para "active" não faz sentido aqui — é uma análise de quando conversas chegam. Documentar.

### A.8 `tempos-resposta.ts` filtra `re.created_at` (evento)
**Achado**: Filtro de período atua sobre o **evento** `first_response`/`conversation_resolved`, não sobre conversation. Se usuário filtra "esta semana", queremos eventos da semana — não conversas com movimento na semana.
**Correção aplicada**: Manter filtro em `re.created_at`. Subqueries opcionais em `conversations` (quando filtros team/assignee) usam `"active"`. Documentar.

### A.9 `home-summary.ts` mistura janela rolling 24h com base filter
**Achado**: Várias subqueries usam `c.last_activity_at >= now() - interval '24 hours'` (window fixa, não filtro do usuário). Não muda com o helper.
**Correção aplicada**: Mantém. Documentar que home-summary tem janelas rolling fixas (independente do filtro do usuário) — é design intencional do card "Resumo".

### A.10 `open_at_eod` / `pending_at_eod` no pré-agregado é só "hoje"
**Achado**: Snapshot só é gravado para o dia atual. Para dias passados, valor=0. Se o front lê `chatwoot_facts_daily_by_account.open_at_eod` num período histórico, retorna 0 (errado).
**Correção aplicada**: Verificar se algum componente faz isso. Mapeamento mostrou que `dashboard-data.ts` NÃO usa esses campos para "Abertas no período" — usa `queryNexusChat` direto sobre `conversations` filtrando `last_activity_at`. OK. `home-summary.ts`, `por-departamento`, `por-estado`, `ranking-atendentes`, `status-distribution` também usam direto. **Apenas `volumetria-dow.ts` e dimensões agregadas via `readFactsDaily`** consomem. E elas não pedem `open_at_eod`. Alívio: nenhuma migração de leitura necessária.

### A.11 Cache keys precisam bump em TODAS as queries afetadas
**Achado**: Plan v1 cita só `dashboard-data v9 → v10`. Mas `dashboard-kpis`, `dashboard-drill-down`, `conversas-list`, `mensagens-nao-respondidas`, `status-distribution`, `por-departamento`, `por-estado`, `ranking-atendentes`, `home-summary`, `leads-recebidos` também têm cache. Se não bumpar, cache stale serve resultados antigos.
**Correção aplicada**: Adicionar **sufixo `-canonical-v0.42`** em **todas** as cache keys das queries refatoradas. Plan v2 lista cada uma.

### A.12 Subagent para `dashboard-data.ts` pode ser muito grande
**Achado**: Arquivo de 720 linhas com 9 sub-queries. Um único subagent talvez não consiga manter TDD discipline.
**Correção aplicada**: **Dividir** Task 3 em **Task 3a** (helpers + sqlReceived/Resolved/Open + sqlChart) e **Task 3b** (sqlByStatus + sqlByTeam + sqlNoResponse + sqlTopInboxes + sqlTopAgents + sqlRecent).

### A.13 `weekStartsOn` setting persistido em DB
**Achado**: Se há usuários com setting `dashboard.week_starts_on = 0` (domingo), eles esperam semana começando domingo. Forçar segunda quebra essa expectativa.
**Correção aplicada**: O usuário **explicitamente pediu** segunda→domingo. Plan v2 mantém hardcoded em 1. Adicionar warning em log no boot do app: "Setting dashboard.week_starts_on=X é ignorado a partir da v0.42 (canonical: segunda-feira)". Setting permanece no DB para compat shim mas não é lido.

### A.14 Resilience timeout
**Achado**: `withChatwootResilience` envolve queries individuais com timeout. Se queries ficarem mais lentas (improvável, A.3 evita), pode estourar.
**Correção aplicada**: Pelo helper canônico ser SQL idêntico (sem COALESCE), performance será **igual ou melhor** que hoje. Sem mudança em timeout.

### A.15 Testes legados precisam de atualização
**Achado**: Vários `__tests__/dashboard-data.test.ts`, `dashboard-kpis.test.ts` etc. validam SQL textual via snapshot. Mudar SQL = atualizar.
**Correção aplicada**: Cada Task 3+ inclui step explícito "atualizar testes existentes que validem SQL textualmente; manter testes de comportamento (mock + retorno) intactos".

### A.16 KPI vs Drill-down: alinhamento explícito
**Achado**: Drill-down deve mostrar a mesma cohort que o KPI. Se KPI "Abertas" usa `"active"`, drill-down `getOpenDrillDown` também. Plan v1 já registra isso.
**Correção aplicada**: Reforçar no Task 5: "asserir nos testes que o filtro do drill-down usa o mesmo `periodColumn` do KPI correspondente".

### A.17 `/relatorios/visao-geral` Status Pie altera números
**Achado**: Hoje filtra `c.created_at`. Após mudança = `c.last_activity_at`. Números mudam visivelmente.
**Correção aplicada**: CHANGELOG explícito: "BREAKING (UX): números do Pie de Status em /relatorios/visao-geral agora refletem conversas com **movimento** no período (antes: criadas)". Comentário no card: tooltip canônico.

### A.18 Plan v1 enxuto em SQL real
**Achado**: Maioria das tasks tem pseudocódigo. Subagentes podem precisar de mais código.
**Correção aplicada**: Plan v2 mantém formato (subagents são instruídos a ler `canonical.ts` + `filters.ts` antes de cada task). SQL completo apenas em Task 1 e 2 (helpers, único momento que precisa estar certo no plan; resto é aplicação mecânica do helper).

### A.19 Smoke test de regressão concreto
**Achado**: Verificação na Task 15 era genérica. Falta comparar números antes/depois.
**Correção aplicada**: Adicionar Task 15 step: "selecionar 1 conta de produção; rodar SQL canônico direto no banco do Chatwoot e comparar com KPI exibido no /dashboard. Diferença ≤ 1 (arredondamento de TZ) = OK; >1 = bloquear release e investigar."

### A.20 Rollback plan
**Achado**: Plan v1 não menciona rollback.
**Correção aplicada**: Adicionar Task 16 step "Plano de rollback: se /api/health falhar pós-deploy ou números dispararem >50% para qualquer KPI, executar `git revert HEAD~N` (N = commits do release) + push + portainer-fix workflow. Tempo estimado: 5–10 min."

### A.21 `BuiltFilter` interface
**Achado**: Caller `ranking-atendentes.ts` faz `params.length + 1` — funciona, mas frágil.
**Correção aplicada**: Sem mudança nesta versão (não introduzir refatoração além do escopo).

### A.22 Multi-agente — ordem das tasks
**Achado**: Tasks 1+2 modificam `canonical.ts` e `filters.ts` — arquivos shared. Tasks 3+ leem desses dois.
**Correção aplicada**: Plan v2 explicita: **Tasks 1+2 em série** (controlador). **Tasks 3a, 3b, 4, 5, 6, 7, 8, 9 em paralelo** (subagents podem rodar concorrentemente; arquivos de query são disjoint).

### A.23 Subagent prompt mandates
**Achado**: Subagents precisam de instrução explícita sobre canonical.ts + ui-ux-pro-max.
**Correção aplicada**: Plan v2 define "Subagent Brief Pattern" reusável em todas as tasks: ler canonical.ts antes; invocar ui-ux-pro-max antes de qualquer mudança visual; commit granular.

### A.24 Indicador de progresso de migration
**Achado**: Como saber que tudo migrou? Falta marcador.
**Correção aplicada**: Cada query refatorada adiciona comentário no header `@canonical periodColumn=active|created`. Grep `grep -rn "@canonical" src/lib/chatwoot/queries/` deve listar todas.

### A.25 CLAUDE.md §11 — checagem de seções existentes
**Achado**: Devo ler CLAUDE.md antes de adicionar §11 para evitar conflito de numeração.
**Correção aplicada**: Plan v2 Task 14 inclui leitura prévia de CLAUDE.md e ajuste numérico se necessário (ex.: §10 já existe; vai pra §11).

---

## Apêndice B — Pente Fino #2 (mais minucioso)

> Análise feita com olhar de SRE + reviewer adversarial. Achados que escaparam
> ao pente #1 e correções aplicadas no corpo do plan v3.

### B.1 `dashboard.week_mode` e `dashboard.month_mode` ainda lidos
**Achado**: Apêndice A.13 deprecou só `week_starts_on`. Mas `getDashboardPeriod` aceita `mode: "current" | "rolling"` controlado por `dashboard.week_mode`/`dashboard.month_mode`. Se um usuário tiver `rolling` setado, "Esta semana" = `now-7d..now` (não segunda→domingo). **Quebra a regra do usuário** ("começa na segunda e termina no domingo, sempre").
**Correção aplicada**: Plan v3 — Task 11 deprecia AMBOS os settings (`week_mode` e `month_mode`). Hardcoded `mode: "current"`. Compat shim em `dashboard-settings.ts` retorna `"current"`. Log warning no boot.

### B.2 Divergência entre `getDashboardPeriod` e `getPeriodInTz`
**Achado**: Duas funções diferentes calculam períodos. Dashboard usa `getDashboardPeriod` (com modo rolling); páginas de relatório usam `getPeriodInTz` (sem modo rolling). Se uma página usa uma e outra, e o usuário compara — divergência.
**Correção aplicada**: Plan v3 — Task 11.1 nova: alinhar para que **ambas** retornem o mesmo range para "Hoje" / "Esta semana" / "Este mês". `getDashboardPeriod` passa a chamar internamente `getPeriodInTz` quando possível, ou ambas viram thin wrappers de um helper único `getCanonicalPeriod(label: 'hoje'|'semana'|'mes'|'todos'|'custom', tz, customStart?, customEnd?)`. Adicionar testes.

### B.3 Conversas reabertas (cobertura semântica)
**Achado**: Conversa criada antes do período mas reaberta dentro do período → `last_activity_at` está dentro → entra em "Abertas no período" (correto, pelo glossário). **Mas** se a mesma conversa foi criada e resolvida antes do período, depois reaberta no período: `last_activity_at` está dentro → entra em "Abertas". Recebidas conta `created_at` (fora do período) → não entra. **Coorte de Taxa de Resolução fica desbalanceada**. Apêndice A.2 já trata: clamp 100%. OK.
**Confirmação**: comportamento desejado. Documentar em runbook.

### B.4 Conversa com `last_activity_at = created_at`
**Achado**: Caso de borda — conversa nasceu, ninguém mexeu, `last_activity_at = created_at`. Filtro `last_activity_at >= start` pega corretamente.
**Confirmação**: nenhuma correção necessária.

### B.5 Snapshot tests podem invalidar
**Achado**: Alguns `__tests__/*.test.ts` usam `toMatchSnapshot()` em SQL. Após mudanças, snapshots antigos quebram.
**Correção aplicada**: Plan v3 — instruir subagents a rodar `npx jest -u` (update snapshot) **somente** após confirmar que SQL gerado está correto. Cuidado: nunca rodar `-u` cego.

### B.6 Performance das 3 CTEs em `conversas-list`
**Achado**: 3 CTEs fazendo `DISTINCT ON` em `messages` (potencialmente milhões de linhas). Custo ~3x atual.
**Correção aplicada**: Plan v3 — Task 6 inclui step "rodar EXPLAIN ANALYZE da query refatorada em ambiente local com volume de produção; se p99 > 2s, criar índice composto sugerido em `messages(conversation_id, message_type, private, created_at)` (ou aceitar limitação se Chatwoot já tem índice equivalente)". Como o banco é read-only, índice fica como recomendação para o time de infra.
**Mitigação**: O JOIN externo `c.id IN <conversas no período>` (filtrado por `last_activity_at`) reduz drasticamente o set. Pg planner usa nested loop. Risco baixo.

### B.7 `tempos-resposta.ts` com filtro de team/assignee
**Achado**: Quando o usuário filtra por team/assignee, a query faz JOIN em `conversations`. Subquery precisa filtrar por `"active"` para coerência.
**Correção aplicada**: Plan v3 — Task 9 step explícito: "se houver `team_id`/`assignee_id` nos filters, fazer JOIN com conversations + `buildBaseFilter({ ..., periodColumn: 'active' })` na sub-cláusula".

### B.8 `/relatorios/performance/sla` e `/csat`
**Achado**: Mapeei superficialmente. Verificar se afetadas.
**Correção aplicada**: Plan v3 — Task 9.1 nova: ler queries SLA e CSAT (provavelmente em `src/lib/chatwoot/queries/sla.ts` e `csat.ts`). Se filtram conversations por período, aplicar `"active"`. Se filtram eventos, manter. Subagent deve verificar antes de tocar.

### B.9 `matrix-ia.ts` filtros de período
**Achado**: Mapeamento diz que filtra `c.created_at`. Plan v1 disse "active onde aplicável". Vagueza.
**Correção aplicada**: Plan v3 — Task 9 step explícito: "matrix-ia.ts queries `sqlTotal`, `sqlSemResposta`, `sqlTransferidas` aplicam `periodColumn: 'active'` via buildBaseFilter (com chatwootMatrixIaOnlyClause em vez de chatwootMatrixIaClause). `sqlTempos` mantém `re.created_at`."

### B.10 Comparação entre KPI dashboard e relatório
**Achado**: KPI "Conversas sem resposta = 14" no dashboard deve igualar lista em `/relatorios/mensagens-nao-respondidas` no mesmo período. Apêndice A.4 trata, mas falta teste explícito.
**Correção aplicada**: Plan v3 — Task 15 step 4 adicional: "comparar KPI sem resposta no dashboard com count na página de relatório no mesmo período. Diferença > 0 = bloquear release".

### B.11 `dashboard-period.ts` calculations não testadas exhaustively
**Achado**: Edge cases — virada de mês (00:00 do dia 1), virada de semana (segunda 00:00 BRT, equivalente a domingo 03:00 UTC), DST (Brasil não tem mais, mas defensivo).
**Correção aplicada**: Plan v3 — Task 11 inclui testes parametrizados para 6 datas-pivot: 2026-01-01 (virada de ano), 2026-03-01 (virada de mês), 2026-04-27 segunda (start of week), 2026-05-03 domingo (end of week), 2026-05-04 11:00 BRT (now), 2026-12-31 (fim do ano). Cada caso valida start/end ISO e ranges de span.

### B.12 Settings de `report.matrix_ia.visibility` afetam super_admin
**Achado**: `shouldExcludeMatrixIA(role)` usa visibility do DB. Se super_admin tiver visibility "all" mas role "viewer" tiver "none", a refatoração não muda. ✓
**Confirmação**: nenhuma correção.

### B.13 Default `excludeMatrixIA` em `buildBaseFilter` quando não informado
**Achado**: Helper retorna `excludeMatrixIA !== false` → default true. Mas algumas queries (matrix-ia.ts) querem o oposto: incluir só inbox 31. Plan v1 sugeriu `chatwootMatrixIaOnlyClause`. Mas dentro do `buildBaseFilter` default exclui. Conflito.
**Correção aplicada**: Plan v3 — `matrix-ia.ts` constrói cláusula direto (sem `buildBaseFilter`) ou passa `excludeMatrixIA: false` + appenda `chatwootMatrixIaOnlyClause()` manualmente. Documentar nota no comentário do helper.

### B.14 CLAUDE.md já tem seção §10
**Achado**: CLAUDE.md (raiz do projeto) tem seções §1 a §10. §11 é a próxima livre.
**Confirmação**: Task 14 OK; numeração §11.

### B.15 MEMORY.md atualização
**Achado**: Plan v1/v2 não menciona atualizar MEMORY.md.
**Correção aplicada**: Plan v3 — Task 16 step "atualizar MEMORY.md com `[Release v0.42.0 LIVE - Padrão Único de Consistência](project_v0.42_consistencia.md)` + criar arquivo `project_v0.42_consistencia.md`".

### B.16 Falhas pré-existentes do test suite
**Achado**: 20 testes Power-BI falham desde antes. Plan v3 deve avisar subagentes pra não tentarem corrigi-los (fora do escopo).
**Correção aplicada**: Plan v3 — Subagent Brief Pattern adicionado: "20 testes em src/lib/integrations/power-bi/__tests__ falham por motivos pré-existentes (escopo distinto). Não corrigir. Foco apenas no escopo da task."

### B.17 Coordenação Tasks 3a → 3b
**Achado**: Mesmo arquivo. Subagentes paralelos quebrariam. Plan v2 já diz "execução em série" mas pode ser mais explícito.
**Correção aplicada**: Plan v3 — diagrama de dependências:
```
1 (canonical.ts) ───┐
                    ├──> 3a ──> 3b ──┐
2 (filters.ts) ─────┤                │
                    ├──> 4           │
                    ├──> 5           │
                    ├──> 6           │
                    ├──> 7           │
                    ├──> 8a..f       │
                    ├──> 9, 9.1      │
                    ├──> 10          │
                    └──> 11, 11.1 ───┤
                    ├──> 12, 13 ─────┤
                                     ▼
                                    14 (docs) ──> 15 ──> 16 (release)
```

### B.18 Sufixo de cache key — formato exato
**Achado**: Plan v2 diz "adicionar sufixo `-canonical-v0.42`". Mas cache keys hoje seguem formato `${scope}/${name}/${accountId}/${filtersHash}`. Onde adicionar?
**Correção aplicada**: Plan v3 — Especifica: "no campo `name` da cache key, anexar `-canonical-v0.42`. Ex.: `dashboard-data-v9` → `dashboard-data-canonical-v0.42`. Para queries sem versioning hoje (ex.: `kpi/status-distribution/...`), trocar `name: 'status-distribution'` por `name: 'status-distribution-canonical-v0.42'`."

### B.19 `leads-recebidos` distribuição "por dia da semana"
**Achado**: Plan v2 disse "manter created". Mas mapa diz que tem distribuição "por dia da semana". Se a contagem é "leads criados em segunda/terça/...", semântica fica em `created`. Sem mudança.
**Confirmação**: Task 8 mantém `created`. Documentar.

### B.20 Comunicação ao usuário do impacto numérico
**Achado**: O CHANGELOG deve listar pontos onde números **mudam visivelmente**.
**Correção aplicada**: Plan v3 — Task 16 inclui template de CHANGELOG explícito:
```
v0.42.0 — Padrão Único de Consistência de Dados

⚠️ MUDANÇAS DE INTERPRETAÇÃO (números podem mudar):
- KPIs "Abertas/Pendentes/Resolvidas no período" agora refletem conversas com
  movimento (`last_activity_at`) no período, não apenas as criadas.
- /relatorios/visao-geral Status Pie usa mesma regra (antes: created_at).
- /relatorios/conversas tabela: linhas listadas têm movimento no período
  (antes: criadas no período).
- /relatorios/mensagens-nao-respondidas respeita o filtro de período.
- Coluna "Aberta há" passa a considerar mensagens privadas do agente.
- Semana sempre começa segunda e termina domingo (settings antigos ignorados).

✓ ADIÇÕES:
- Novo módulo canonical.ts (helpers SQL + constantes).
- Documentação em docs/runbooks/canonical-data-rules.md.
```

### B.21 Limite de tempo por subagent
**Achado**: Subagent rodando muito tempo pode estourar context window.
**Correção aplicada**: Plan v3 — Subagent Brief Pattern adicionado: "Cada task tem alvo de 15–25 min. Se passar de 30 min, reportar bloqueio e voltar ao controlador."

### B.22 Verificar testes contra falsos positivos
**Achado**: Algum subagent pode escrever teste que `expect(sql).toContain("c.last_activity_at")` mas a query já tinha esse texto antes (parametrização diferente). Falso GREEN.
**Correção aplicada**: Plan v3 — testes devem usar **2 asserções complementares**: contém o helper canônico (pelo nome ou conteúdo) **AND** não contém o padrão antigo (`c.created_at` em queries onde mudou).

### B.23 `home-summary.ts` janelas rolling fixas
**Achado**: Subqueries usam `c.last_activity_at >= now() - interval '24 hours'` (janela rolling, não filtro do usuário). Apêndice A.9 cobre.
**Confirmação**: sem mudança.

### B.24 Index check no Chatwoot (read-only — sem ação)
**Achado**: Plan v2 (Apêndice A.3) confia que existe índice em `conversations(last_activity_at)`. Se não houver, performance degrada.
**Correção aplicada**: Plan v3 — Task 15 inclui step "rodar `EXPLAIN ANALYZE SELECT * FROM conversations WHERE last_activity_at BETWEEN '...' AND '...' LIMIT 1000` direto no banco do Chatwoot. Confirmar uso de Index Scan, não Seq Scan. Se Seq Scan: NÃO bloquear release (já está deployed conceptually em outras queries existentes), mas abrir issue e pedir ao time de infra do Chatwoot pra adicionar índice."

### B.25 Memória: criar `project_v0.42_consistencia.md`
**Correção aplicada**: Plan v3 — Task 16 step "criar `~/.claude/projects/.../memory/project_v0.42_consistencia.md` com descrição da release; adicionar linha em MEMORY.md."



