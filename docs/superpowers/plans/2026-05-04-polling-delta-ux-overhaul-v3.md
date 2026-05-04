# Polling Delta + UX Overhaul Implementation Plan (v3 — final consolidado)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking. Each subagent UI task MUST invoke `ui-ux-pro-max:ui-ux-pro-max` BEFORE writing/editing UI code.

> **v3 consolida v1 + delta v2 + correções review-1 + correções review-2.**
> Histórico em `2026-05-04-polling-delta-ux-overhaul-review-1.md` e `-review-2.md`.

## ⚠️ ATENÇÃO MOCK SHAPE (regra global pra TODOS subagents)

Cada subagent que mexer em testes que mockam `prisma.nexusChatConnection.findUnique`/`findMany` **DEVE** atualizar o shape do mock:
- **Remover:** `webhookToken`, `lastWebhookAt`, `webhookSecretEnc`
- **Adicionar:** `pollingIntervalSeconds: 30`, `lastSyncAt: null` (defaults)

## Decisões Arquitetônicas (justificativas)

- **J-1 — `pollingIntervalSeconds` per-connection (não per-binding):** intervalo afeta carga no banco do Chatwoot, compartilhado entre todas as accounts daquela connection. Per-binding daria controle granular mas com complexidade alta de scheduler. Per-connection é o ponto mais simples que faz sentido.
- **J-2 — Sweep diário 03:00 BRT:** menor tráfego no Chatwoot (academias fechadas).
- **J-3 — Sample 1/100 em audit `polling_sync_completed`:** com 30s tick × 24h = 2880 runs/dia/conn. 100% audit = 86k rows/mês/conn (explosão). 1/100 = ~860 rows/mês (manejável). Erros sempre 100% (raros).
- **J-4 — Polling delta DISPARA pré-agregação (não a substitui):** `runDeltaSync` detecta mudança e enfileira `refresh-by-*` jobs já existentes. Pré-agregação rebaixada de cron 5min → 30min como fallback. Latência fim-a-fim ≤ pollingIntervalSeconds + ~5-10s pré-agregação (≤45s p99 com default 30s).

**Goal:** Substituir o webhook event-driven (v0.38-v0.40) por polling delta universal direto no banco Postgres do Chatwoot (default 30s, mín 20s, configurável), e fazer overhaul completo de UX em `/bancos-de-dados` (lista clicável, dialog limpo, wizard sem webhook, abas Conexão/Sincronização/Jobs/Saúde com dados reais e tour interativo em todas).

**Architecture:** Worker BullMQ `chatwoot-sync-delta` por conexão executa a cada N segundos (config per-connection). Para cada (connection × account × tabela alvo), faz `SELECT * WHERE updated_at > cursor.last_synced_at LIMIT 5000`, faz upsert no nosso banco interno (camada `chatwoot_facts_*`), avança cursor, publica `facts:refreshed` no Redis Pub/Sub se houve mudança. Sweep full diário (03:00 BRT) detecta deletes. Frontend (`useFactsRealtime`) não muda — continua escutando `facts:refreshed`. Toda infraestrutura de webhook é apagada.

**Tech Stack:** Next.js 16 App Router · TypeScript · Prisma 7 · Postgres · BullMQ · ioredis · React Testing Library · Jest · jest-mock-extended · Tailwind v4 · base-ui (Tabs/Dialog) · Lucide · Sonner · Recharts (futuro) · TourProvider próprio.

---

## File Structure

### Created (NEW)
- `prisma/migrations/<ts>_polling_delta_schema/migration.sql` — DDL completo
- `src/lib/chatwoot/sync/cursor.ts` — get/upsert cursor por (connectionId, accountId, tableName)
- `src/lib/chatwoot/sync/types.ts` — tipos compartilhados (TableSyncResult, SyncRunSummary)
- `src/lib/chatwoot/sync/table-syncs/conversations.ts` — sync delta de conversations
- `src/lib/chatwoot/sync/table-syncs/messages.ts`
- `src/lib/chatwoot/sync/table-syncs/inboxes.ts`
- `src/lib/chatwoot/sync/table-syncs/teams.ts`
- `src/lib/chatwoot/sync/table-syncs/team-members.ts`
- `src/lib/chatwoot/sync/table-syncs/users.ts`
- `src/lib/chatwoot/sync/table-syncs/account-users.ts`
- `src/lib/chatwoot/sync/table-syncs/contacts.ts`
- `src/lib/chatwoot/sync/table-syncs/reporting-events.ts`
- `src/lib/chatwoot/sync/table-syncs/taggings.ts`
- `src/lib/chatwoot/sync/table-syncs/index.ts` — registry de todos os table-syncs
- `src/lib/chatwoot/sync/run-delta-sync.ts` — orquestrador (1 connection × N tabelas × M accounts)
- `src/lib/chatwoot/sync/run-full-sweep.ts` — DELETE handling (1x/dia)
- `src/lib/chatwoot/sync/__tests__/cursor.test.ts`
- `src/lib/chatwoot/sync/__tests__/run-delta-sync.test.ts`
- `src/lib/chatwoot/sync/__tests__/run-full-sweep.test.ts`
- `src/worker/jobs/chatwoot-sync/delta-sync.ts` — BullMQ processor
- `src/worker/jobs/chatwoot-sync/full-sweep.ts` — BullMQ processor
- `src/worker/jobs/chatwoot-sync/scheduler.ts` — tick 5s que enfileira por connection
- `src/worker/jobs/chatwoot-sync/__tests__/delta-sync.test.ts`
- `src/worker/jobs/chatwoot-sync/__tests__/scheduler.test.ts`
- `src/lib/actions/nexus-chat/sync-stream.ts` — `listRecentSyncRuns` server action
- `src/lib/actions/nexus-chat/__tests__/sync-stream.test.ts`
- `src/components/settings/nexus-chat/tabs/sincronizacao-tab.tsx` — Aba 2 reescrita
- `src/components/settings/nexus-chat/__tests__/sincronizacao-tab.test.tsx`
- `src/components/tour/tour-trigger-button.tsx` — botão "?" reutilizável
- `src/components/tour/tours/bancos-de-dados/lista.ts` — config tour da lista
- `src/components/tour/tours/bancos-de-dados/conexao.ts` — config tour Aba Conexão
- `src/components/tour/tours/bancos-de-dados/sincronizacao.ts` — config tour Aba Sincronização
- `src/components/tour/tours/bancos-de-dados/jobs.ts` — config tour Aba Jobs
- `src/components/tour/tours/bancos-de-dados/saude.ts` — config tour Aba Saúde
- `docs/runbooks/polling-delta-sync.md` — runbook novo

### Modified
- `prisma/schema.prisma` — remove `NexusChatConnection.webhookToken/webhookSecretEnc/lastWebhookAt`; add `pollingIntervalSeconds`/`lastSyncAt`; remove 6 valores `AuditAction` `webhook_*`; add 6 valores `polling_*`; add modelo `ChatwootSyncCursor`
- `src/lib/actions/nexus-chat/connections.ts` — remove `regenerateConnectionWebhookToken`, remove geração de `webhookToken` em `createNexusChatConnection`; add `updateConnectionPollingInterval`
- `src/lib/actions/nexus-chat/__tests__/connections.test.ts` — remove testes webhook, add teste polling
- `src/lib/actions/nexus-chat/health-metrics.ts` — refactor: troca contadores `webhook_*` por `polling_*`, adiciona `lastSyncAt`/`syncRunsLast24h`/`syncErrorsLast24h`
- `src/lib/actions/nexus-chat/__tests__/health-metrics.test.ts` — adapta
- `src/instrumentation.ts` — sem mudanças (listener `connection:*` permanece). Adicionar comentário removendo menção a webhook.
- `src/worker/index.ts` — remove menção webhook (se houver), registra `chatwoot-sync-delta` + `chatwoot-sync-sweep` queues
- `src/components/settings/nexus-chat/connection-list.tsx` — reescreve card como linha clicável inteira, ícones novos, tag empresas
- `src/components/settings/nexus-chat/connection-form-dialog.tsx` — remove `WebhookSection` + `CopyableCode`; remove constante `CHATWOOT_WEBHOOK_EVENTS`; add campo "Intervalo de sincronização (segundos)" com validação min=20
- `src/components/settings/nexus-chat/__tests__/connection-form-dialog.test.tsx` — remove testes webhook, add testes intervalo
- `src/components/settings/nexus-chat/wizard/onboarding-wizard.tsx` — remove `StepWebhook`; remove `CHATWOOT_WEBHOOK_EVENTS`; rebalanceia steps para `Conexão → Identidade → Conclusão` (3 steps); aceita prop `prefilledConnectionId` que pula Step 1
- `src/components/settings/nexus-chat/wizard/__tests__/onboarding-wizard.test.tsx` — adapta
- `src/components/settings/nexus-chat/wizard/onboarding-wizard-launcher.tsx` — só para uso dentro de `/bancos-de-dados/[id]` agora; remove uso na página raiz
- `src/components/settings/nexus-chat/connection-detail-tabs.tsx` — renomeia chave `tempo-real` → `sincronizacao` + label "Sincronização"; importa `SincronizacaoTab` em vez de `TempoRealTab`
- `src/components/settings/nexus-chat/tabs/conexao-tab.tsx` — adiciona linha "Intervalo de sincronização: Ns" no header
- `src/components/settings/nexus-chat/tabs/jobs-tab.tsx` — substitui placeholder por `<JobsPanel connectionId>`
- `src/components/settings/nexus-chat/tabs/saude-tab.tsx` — recontextualiza para polling (heartbeat = lastSyncAt; eventos 24h = sync runs 24h; erros 24h = polling failures 24h; jobs com erro 24h continua igual)
- `src/components/settings/jobs-panel.tsx` — aceita prop opcional `connectionId` filtrando rows e ações por essa conn
- `src/lib/actions/jobs.ts` — `getJobsStatus`/`triggerRefresh`/`triggerBackfill` aceitam `connectionId?` opcional
- `src/app/(protected)/bancos-de-dados/page.tsx` — remove `<OnboardingWizardLauncher>` do header
- `src/app/(protected)/bancos-de-dados/[id]/page.tsx` — adiciona `<OnboardingWizardLauncher prefilledConnectionId>` em algum lugar adequado da página detalhe (botão na Aba Conexão dentro de `<BindingsTable>`)
- `src/app/(protected)/layout.tsx` — sem mudanças (TourProvider já está)
- `package.json` — bump `0.40.0` → `0.41.0`
- `CHANGELOG.md` — entrada v0.41.0
- `CLAUDE.md` — §4.1 reescrita (sem webhook, com polling delta)
- `docs/runbooks/pre-agregacao.md` — adiciona seção "Relação com polling delta"

### Deleted
- `src/app/api/webhooks/nexus-chat/[token]/route.ts`
- `src/app/api/webhooks/nexus-chat/[token]/__tests__/route.test.ts`
- `src/app/api/webhooks/` (diretório vazio)
- `src/lib/nexus-chat/webhook-credentials.ts` (gera token)
- `src/lib/nexus-chat/__tests__/webhook-credentials.test.ts`
- `src/lib/actions/nexus-chat/realtime-stream.ts` (substituído por sync-stream)
- `src/lib/actions/nexus-chat/__tests__/realtime-stream.test.ts`
- `src/components/settings/nexus-chat/tabs/tempo-real-tab.tsx` (substituído por sincronizacao-tab)
- `docs/runbooks/webhook-nexus-chat.md`

---

## Decisões fixadas (não negociáveis no plan)

- **Tabelas Chatwoot a sincronizar (10):** `conversations`, `messages`, `inboxes`, `teams`, `team_members`, `users`, `account_users`, `contacts`, `reporting_events`, `taggings`. (Tags por valor de lookup é dim mas pequena — não sincroniza, lê on-demand via `chatwoot/queries/meta-cache.ts`. Vamos manter.)
- **Cursor strategy:** primário por `updated_at > last_synced_at`. Fallback `id > last_synced_id` quando `updated_at` não existir na tabela (verificar via INFORMATION_SCHEMA na implementação). `taggings` não tem `updated_at` — usa `id`.
- **`pollingIntervalSeconds`:** default 30, min 20, max ilimitado. Validado em `updateNexusChatConnection` (Server Action, não confiar só na UI).
- **Scheduler tick:** 5s. Cada tick, query `SELECT id FROM nexus_chat_connections WHERE deletedAt IS NULL AND status = 'active' AND (last_sync_at IS NULL OR last_sync_at + (polling_interval_seconds * INTERVAL '1 second') <= NOW())`. Para cada row, enfileira job `chatwoot-sync-delta:{connectionId}` com `jobId` determinístico (idempotente).
- **Pub/Sub:** worker publica `facts:refreshed` no canal `realtime-events` com `{ type: "facts:refreshed", connectionId, accountId }` quando ≥1 row afetada na sync. Frontend `useFactsRealtime` continua igual.
- **Full sweep:** BullMQ JobScheduler `chatwoot-sync-sweep` cron `0 3 * * *` America/Sao_Paulo. Para cada conn × table: lista IDs no nosso banco e no Chatwoot, calcula diff, deleta IDs sumidos.
- **Audit actions removidas:** `webhook_received`, `webhook_rejected_hmac`, `webhook_rejected_rate_limit`, `webhook_no_binding`, `webhook_token_regenerated`, `webhook_secret_regenerated`.
- **Audit actions adicionadas:** `polling_sync_started`, `polling_sync_completed`, `polling_sync_failed`, `polling_full_sweep_started`, `polling_full_sweep_completed`, `polling_interval_updated`.
- **Audit logging policy:** sample 1/100 para `polling_sync_started`/`polling_sync_completed` (volume alto). 100% para `polling_sync_failed`, `polling_full_sweep_*`, `polling_interval_updated`.

---

# Tasks

## Fase A — Schema (preparação)

### Task A1: Migration — add `ChatwootSyncCursor` + connection fields novos

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<auto-ts>_polling_delta_schema/migration.sql`

- [ ] **Step 1: Editar `prisma/schema.prisma` — adicionar campos novos em `NexusChatConnection`**

Localize o modelo (~linha 480) e adicione **antes** de `createdAt`:

```prisma
  /// Intervalo (segundos) entre cada execução do polling delta para esta
  /// conexão. Default 30s; mínimo 20s validado em Server Action e migration.
  pollingIntervalSeconds Int @default(30) @map("polling_interval_seconds")

  /// Timestamp da última execução bem-sucedida do polling delta.
  /// Atualizado por src/worker/jobs/chatwoot-sync/delta-sync.ts.
  lastSyncAt DateTime? @map("last_sync_at")
```

- [ ] **Step 2: Editar `prisma/schema.prisma` — adicionar modelo `ChatwootSyncCursor`**

Após o modelo `CompanyChatBinding`, adicione:

```prisma
/// Cursor de polling delta por (connection × account × tabela do Chatwoot).
/// Worker `chatwoot-sync-delta` lê o cursor, busca rows com updated_at > lastSyncedAt
/// (ou id > lastSyncedId se a tabela alvo não tiver updated_at), faz upsert no
/// nosso banco interno e avança o cursor.
///
/// Por que `lastSyncedId` em vez de só timestamp? Algumas tabelas do Chatwoot
/// (ex: taggings) não têm `updated_at`; nessas usamos `id > X` como cursor.
/// Para tabelas com updated_at, lastSyncedId fica null.
model ChatwootSyncCursor {
  id            String              @id @default(uuid()) @db.Uuid
  connectionId  String              @map("connection_id") @db.Uuid
  connection    NexusChatConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  accountId     Int                 @map("account_id")
  tableName     String              @map("table_name")
  lastSyncedAt  DateTime?           @map("last_synced_at")
  lastSyncedId  BigInt?             @map("last_synced_id")
  rowsSynced    BigInt              @default(0) @map("rows_synced")
  lastRunMs     Int?                @map("last_run_ms")
  lastError     String?             @map("last_error") @db.Text
  lastErrorAt   DateTime?           @map("last_error_at")
  createdAt     DateTime            @default(now()) @map("created_at")
  updatedAt     DateTime            @updatedAt @map("updated_at")

  @@unique([connectionId, accountId, tableName])
  @@index([connectionId])
  @@index([connectionId, accountId])
  @@map("chatwoot_sync_cursors")
}
```

E adicione no modelo `NexusChatConnection`:

```prisma
  cursors ChatwootSyncCursor[]
```

- [ ] **Step 3: Gerar migration**

```bash
DATABASE_URL=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"') npx prisma migrate dev --name polling_delta_schema --create-only
```

Expected: cria pasta `prisma/migrations/<ts>_polling_delta_schema/` com `migration.sql`.

- [ ] **Step 4: Inspecionar `migration.sql` gerado e validar**

Abra o arquivo gerado e confirme que contém **apenas** os ADDs (não DROP webhook ainda — isso é A2):

```sql
ALTER TABLE "nexus_chat_connections" ADD COLUMN "polling_interval_seconds" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "nexus_chat_connections" ADD COLUMN "last_sync_at" TIMESTAMP(3);

CREATE TABLE "chatwoot_sync_cursors" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "account_id" INTEGER NOT NULL,
    "table_name" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3),
    "last_synced_id" BIGINT,
    "rows_synced" BIGINT NOT NULL DEFAULT 0,
    "last_run_ms" INTEGER,
    "last_error" TEXT,
    "last_error_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chatwoot_sync_cursors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chatwoot_sync_cursors_connection_id_account_id_table_name_key" ON "chatwoot_sync_cursors"("connection_id", "account_id", "table_name");
CREATE INDEX "chatwoot_sync_cursors_connection_id_idx" ON "chatwoot_sync_cursors"("connection_id");
CREATE INDEX "chatwoot_sync_cursors_connection_id_account_id_idx" ON "chatwoot_sync_cursors"("connection_id", "account_id");
ALTER TABLE "chatwoot_sync_cursors" ADD CONSTRAINT "chatwoot_sync_cursors_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "nexus_chat_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Adicione **manualmente** no final (constraint mínimo 20s):

```sql
ALTER TABLE "nexus_chat_connections" ADD CONSTRAINT "polling_interval_min_20s" CHECK ("polling_interval_seconds" >= 20);
```

- [ ] **Step 5: Aplicar migration localmente**

```bash
npx prisma migrate dev
```

Expected: `Database is now in sync with your schema.` Sem erros.

- [ ] **Step 6: Regenerar Prisma Client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client (...) to ./src/generated/prisma/client`.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/generated/prisma
git commit -m "feat(schema): A1 v0.41 — add ChatwootSyncCursor + polling_interval_seconds/last_sync_at em NexusChatConnection (mín 20s via CHECK)"
```

---

### Task A2: Migration — drop webhook fields + AuditAction enum changes

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<auto-ts>_drop_webhook_add_polling_audit/migration.sql`

- [ ] **Step 1: Editar `prisma/schema.prisma` — remover campos webhook em `NexusChatConnection`**

Localize e **delete** estas três linhas (e o comentário acima):

```prisma
  // Webhook é por instalação. Fase 1 deixa null; Fase 2 popula.
  webhookToken     String?   @unique @map("webhook_token")
  webhookSecretEnc String?   @map("webhook_secret_enc")
  // ...
  // Fase 2: timestamp do último webhook recebido (populado pelo endpoint
  // /api/webhooks/nexus-chat/[token]). Usado para detectar webhook quieto.
  lastWebhookAt    DateTime? @map("last_webhook_at")
```

- [ ] **Step 2: Editar `prisma/schema.prisma` — atualizar enum `AuditAction`**

Localize o enum `AuditAction`. **Remova** os 6 valores webhook:

```diff
-  webhook_received
-  webhook_rejected_hmac
-  webhook_rejected_rate_limit
-  webhook_no_binding
-  webhook_token_regenerated
-  webhook_secret_regenerated
```

E **adicione** os 6 valores polling:

```prisma
  polling_sync_started
  polling_sync_completed
  polling_sync_failed
  polling_full_sweep_started
  polling_full_sweep_completed
  polling_interval_updated
```

- [ ] **Step 3: Gerar migration**

```bash
npx prisma migrate dev --name drop_webhook_add_polling_audit --create-only
```

- [ ] **Step 4: Inspecionar e validar `migration.sql`**

Confirme que contém:

```sql
-- DropIndex
DROP INDEX IF EXISTS "nexus_chat_connections_webhook_token_key";

-- AlterTable
ALTER TABLE "nexus_chat_connections" DROP COLUMN "webhook_token",
DROP COLUMN "webhook_secret_enc",
DROP COLUMN "last_webhook_at";

-- AlterEnum (estratégia recomendada Postgres: drop e recriar com valores novos)
-- Prisma vai gerar automaticamente os ALTER TYPE necessários
```

Se a Prisma gerar enum migration de outra forma (ex: criando enum novo), revise para garantir:
1. Antes do drop dos valores antigos, audit_logs não pode ter rows com action `webhook_*` que vão dar conflito.
2. Adicione **antes** do ALTER TYPE/DROP:
   ```sql
   -- Cleanup: audit logs órfãos da fase webhook (deveriam ter expirado, mas garantir)
   DELETE FROM "audit_logs" WHERE "action"::text IN (
     'webhook_received',
     'webhook_rejected_hmac',
     'webhook_rejected_rate_limit',
     'webhook_no_binding',
     'webhook_token_regenerated',
     'webhook_secret_regenerated'
   );
   ```

- [ ] **Step 5: Aplicar migration localmente**

```bash
npx prisma migrate dev
```

Expected: aplica sem erro. Audit logs antigos da fase webhook são removidos.

- [ ] **Step 6: Regenerar Prisma Client**

```bash
npx prisma generate
```

- [ ] **Step 7: Validar typecheck (esperado quebrar nos consumers que vamos refatorar)**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: erros em `connections.ts`, `health-metrics.ts`, `realtime-stream.ts`, `connection-form-dialog.tsx`, `tempo-real-tab.tsx`, `saude-tab.tsx` referenciando `webhookToken`, `webhookSecretEnc`, `lastWebhookAt` ou enum values removidos. **Esses serão consertados nas fases seguintes — typecheck verde só ao final da Fase E.**

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/generated/prisma
git commit -m "feat(schema): A2 v0.41 — drop webhook_token/webhook_secret_enc/last_webhook_at e 6 valores AuditAction webhook_* + add 6 valores AuditAction polling_*"
```

---

## Fase B — Polling Delta (camada lib + worker)

### Task B1: `cursor.ts` — get/upsert cursor

**Files:**
- Create: `src/lib/chatwoot/sync/cursor.ts`
- Test: `src/lib/chatwoot/sync/__tests__/cursor.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// src/lib/chatwoot/sync/__tests__/cursor.test.ts
import { mockDeep, mockReset } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "@/lib/prisma";
import { getOrCreateCursor, advanceCursor, recordCursorError } from "../cursor";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => mockReset(prismaMock));

describe("getOrCreateCursor", () => {
  it("retorna cursor existente quando encontrado", async () => {
    prismaMock.chatwootSyncCursor.findUnique.mockResolvedValue({
      id: "uuid-1",
      connectionId: "conn-1",
      accountId: 9,
      tableName: "conversations",
      lastSyncedAt: new Date("2026-05-04T00:00:00Z"),
      lastSyncedId: null,
      rowsSynced: 1234n,
      lastRunMs: 50,
      lastError: null,
      lastErrorAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const c = await getOrCreateCursor("conn-1", 9, "conversations");
    expect(c.lastSyncedAt).toEqual(new Date("2026-05-04T00:00:00Z"));
    expect(prismaMock.chatwootSyncCursor.create).not.toHaveBeenCalled();
  });

  it("cria cursor zero quando não existe", async () => {
    prismaMock.chatwootSyncCursor.findUnique.mockResolvedValue(null);
    prismaMock.chatwootSyncCursor.create.mockResolvedValue({
      id: "new-uuid",
      connectionId: "conn-1",
      accountId: 9,
      tableName: "conversations",
      lastSyncedAt: null,
      lastSyncedId: null,
      rowsSynced: 0n,
      lastRunMs: null,
      lastError: null,
      lastErrorAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const c = await getOrCreateCursor("conn-1", 9, "conversations");
    expect(c.lastSyncedAt).toBeNull();
    expect(c.rowsSynced).toBe(0n);
    expect(prismaMock.chatwootSyncCursor.create).toHaveBeenCalledWith({
      data: {
        connectionId: "conn-1",
        accountId: 9,
        tableName: "conversations",
      },
    });
  });
});

describe("advanceCursor", () => {
  it("atualiza lastSyncedAt + rowsSynced + lastRunMs", async () => {
    prismaMock.chatwootSyncCursor.update.mockResolvedValue({} as never);

    await advanceCursor("conn-1", 9, "conversations", {
      lastSyncedAt: new Date("2026-05-04T01:00:00Z"),
      rowsAffected: 42,
      runMs: 120,
    });

    expect(prismaMock.chatwootSyncCursor.update).toHaveBeenCalledWith({
      where: {
        connectionId_accountId_tableName: {
          connectionId: "conn-1",
          accountId: 9,
          tableName: "conversations",
        },
      },
      data: {
        lastSyncedAt: new Date("2026-05-04T01:00:00Z"),
        rowsSynced: { increment: 42n },
        lastRunMs: 120,
        lastError: null,
        lastErrorAt: null,
      },
    });
  });

  it("também aceita lastSyncedId pra cursor id-based", async () => {
    prismaMock.chatwootSyncCursor.update.mockResolvedValue({} as never);

    await advanceCursor("conn-1", 9, "taggings", {
      lastSyncedId: 99999n,
      rowsAffected: 5,
      runMs: 30,
    });

    expect(prismaMock.chatwootSyncCursor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastSyncedId: 99999n,
          rowsSynced: { increment: 5n },
        }),
      }),
    );
  });
});

describe("recordCursorError", () => {
  it("grava lastError + lastErrorAt sem perder lastSyncedAt", async () => {
    prismaMock.chatwootSyncCursor.update.mockResolvedValue({} as never);

    const err = new Error("connection refused");
    await recordCursorError("conn-1", 9, "conversations", err, 250);

    expect(prismaMock.chatwootSyncCursor.update).toHaveBeenCalledWith({
      where: {
        connectionId_accountId_tableName: {
          connectionId: "conn-1",
          accountId: 9,
          tableName: "conversations",
        },
      },
      data: {
        lastError: "connection refused",
        lastErrorAt: expect.any(Date),
        lastRunMs: 250,
      },
    });
  });

  it("trunca lastError em 1000 chars (defesa contra blob enormes)", async () => {
    prismaMock.chatwootSyncCursor.update.mockResolvedValue({} as never);

    const longMsg = "x".repeat(5000);
    await recordCursorError("conn-1", 9, "conversations", new Error(longMsg), 250);

    const call = prismaMock.chatwootSyncCursor.update.mock.calls[0]?.[0];
    expect(typeof call?.data.lastError).toBe("string");
    expect((call?.data.lastError as string).length).toBeLessThanOrEqual(1000);
  });
});
```

- [ ] **Step 2: Rodar teste — esperado falhar**

```bash
npm test -- src/lib/chatwoot/sync/__tests__/cursor.test.ts
```

Expected: FAIL — `Cannot find module '../cursor'`.

- [ ] **Step 3: Implementar `cursor.ts`**

```typescript
// src/lib/chatwoot/sync/cursor.ts

import { prisma } from "@/lib/prisma";

export interface SyncCursor {
  id: string;
  connectionId: string;
  accountId: number;
  tableName: string;
  lastSyncedAt: Date | null;
  lastSyncedId: bigint | null;
  rowsSynced: bigint;
  lastRunMs: number | null;
  lastError: string | null;
  lastErrorAt: Date | null;
}

interface AdvanceArgs {
  lastSyncedAt?: Date;
  lastSyncedId?: bigint;
  rowsAffected: number;
  runMs: number;
}

const MAX_ERROR_LEN = 1000;

/**
 * Lê cursor `(connectionId, accountId, tableName)`. Se não existir, cria
 * com tudo null (delta-sync vai tratar null como "primeira execução" e
 * fazer backfill do horizonte definido pelo orquestrador).
 *
 * Usado por `run-delta-sync.ts` antes de cada tabela.
 */
export async function getOrCreateCursor(
  connectionId: string,
  accountId: number,
  tableName: string,
): Promise<SyncCursor> {
  const existing = await prisma.chatwootSyncCursor.findUnique({
    where: {
      connectionId_accountId_tableName: { connectionId, accountId, tableName },
    },
  });
  if (existing) return existing;

  return prisma.chatwootSyncCursor.create({
    data: { connectionId, accountId, tableName },
  });
}

/**
 * Avança cursor após sync bem-sucedido. Limpa lastError/lastErrorAt.
 * `lastSyncedAt` ou `lastSyncedId` (uma das duas; updated_at-based ou id-based).
 */
export async function advanceCursor(
  connectionId: string,
  accountId: number,
  tableName: string,
  args: AdvanceArgs,
): Promise<void> {
  const data: Record<string, unknown> = {
    rowsSynced: { increment: BigInt(args.rowsAffected) },
    lastRunMs: args.runMs,
    lastError: null,
    lastErrorAt: null,
  };
  if (args.lastSyncedAt) data.lastSyncedAt = args.lastSyncedAt;
  if (args.lastSyncedId) data.lastSyncedId = args.lastSyncedId;

  await prisma.chatwootSyncCursor.update({
    where: {
      connectionId_accountId_tableName: { connectionId, accountId, tableName },
    },
    data,
  });
}

/**
 * Grava erro no cursor sem perder estado de sucesso anterior.
 * Trunca mensagem em MAX_ERROR_LEN para evitar TEXT enormes.
 */
export async function recordCursorError(
  connectionId: string,
  accountId: number,
  tableName: string,
  error: unknown,
  runMs: number,
): Promise<void> {
  const msg =
    error instanceof Error ? error.message : String(error);
  const truncated = msg.length > MAX_ERROR_LEN ? msg.slice(0, MAX_ERROR_LEN) : msg;

  await prisma.chatwootSyncCursor.update({
    where: {
      connectionId_accountId_tableName: { connectionId, accountId, tableName },
    },
    data: {
      lastError: truncated,
      lastErrorAt: new Date(),
      lastRunMs: runMs,
    },
  });
}
```

- [ ] **Step 4: Rodar teste — esperado passar**

```bash
npm test -- src/lib/chatwoot/sync/__tests__/cursor.test.ts
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chatwoot/sync/cursor.ts src/lib/chatwoot/sync/__tests__/cursor.test.ts
git commit -m "feat(sync): B1 v0.41 — cursor.ts (getOrCreate/advance/recordError) com 5 tests"
```

---

### Task B2: `types.ts` — tipos compartilhados

**Files:**
- Create: `src/lib/chatwoot/sync/types.ts`

- [ ] **Step 1: Implementar tipos (sem teste — tipos são validados via tsc)**

```typescript
// src/lib/chatwoot/sync/types.ts

/**
 * Resultado de sincronizar 1 tabela.
 *
 * Por que separar `rowsAffected` (delta) de `nextCursor`? Quando sincronizamos
 * em batches de 5000, podemos terminar com cursor avançado mesmo se o batch
 * mais recente teve 0 rows efetivamente novos no nosso lado (ex: já estavam
 * lá via outro caminho).
 */
export interface TableSyncResult {
  /** Nome da tabela alvo no Chatwoot. */
  tableName: string;
  /** Quantas rows foram lidas do Chatwoot neste run. */
  rowsRead: number;
  /** Quantas rows foram efetivamente alteradas (insert + update) no nosso lado. */
  rowsAffected: number;
  /** Próximo valor de cursor (timestamp ou id). */
  nextCursor:
    | { kind: "timestamp"; value: Date }
    | { kind: "id"; value: bigint }
    | { kind: "none" };
  /** Duração em ms do sync desta tabela. */
  durationMs: number;
}

/**
 * Sumário de uma execução completa de delta-sync (1 connection × N tabelas × M accounts).
 */
export interface SyncRunSummary {
  connectionId: string;
  startedAt: Date;
  finishedAt: Date;
  totalDurationMs: number;
  perTable: TableSyncResult[];
  errors: Array<{ tableName: string; accountId: number; error: string }>;
  /** True se ≥1 row foi alterada → publicar facts:refreshed. */
  hadChanges: boolean;
}

/**
 * Estratégia de cursor por tabela.
 *
 * - "updated_at": tabelas que atualizam updated_at em UPDATE (conversations,
 *   messages, contacts, etc).
 * - "id": tabelas append-only sem updated_at (taggings).
 *
 * Determinada na implementação de cada table-sync, hardcoded.
 */
export type CursorStrategy = "updated_at" | "id";

/**
 * Interface que toda table-sync deve implementar.
 */
export interface TableSync {
  tableName: string;
  cursorStrategy: CursorStrategy;
  run: (args: TableSyncArgs) => Promise<TableSyncResult>;
}

export interface TableSyncArgs {
  connectionId: string;
  accountId: number;
  /** Limite de rows por batch (default 5000). Implementação pode ignorar. */
  batchLimit?: number;
}
```

- [ ] **Step 2: Validar typecheck**

```bash
npx tsc --noEmit src/lib/chatwoot/sync/types.ts 2>&1 | head -10
```

Expected: zero erros (lembrando que erros pré-existentes em outros arquivos da fase anterior continuam — é OK).

- [ ] **Step 3: Commit**

```bash
git add src/lib/chatwoot/sync/types.ts
git commit -m "feat(sync): B2 v0.41 — types.ts (TableSyncResult, SyncRunSummary, TableSync interface)"
```

---

### Task B3: table-sync `conversations`

**Files:**
- Create: `src/lib/chatwoot/sync/table-syncs/conversations.ts`
- Test: `src/lib/chatwoot/sync/table-syncs/__tests__/conversations.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// src/lib/chatwoot/sync/table-syncs/__tests__/conversations.test.ts
import { mockDeep, mockReset } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const queryNexusChatMock = jest.fn();
jest.mock("@/lib/nexus-chat/pool", () => ({
  queryNexusChat: queryNexusChatMock,
}));

const cursorMock = {
  getOrCreateCursor: jest.fn(),
};
jest.mock("../../cursor", () => cursorMock);

import { conversationsSync } from "../conversations";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("conversationsSync", () => {
  it("usa cursor null = ISO 1970 e busca primeiro batch", async () => {
    cursorMock.getOrCreateCursor.mockResolvedValue({
      lastSyncedAt: null,
      lastSyncedId: null,
    });
    queryNexusChatMock.mockResolvedValue({
      rows: [
        {
          id: 1,
          account_id: 9,
          status: 0,
          updated_at: new Date("2026-05-04T01:00:00Z"),
        },
      ],
    });

    const result = await conversationsSync.run({ connectionId: "conn-1", accountId: 9 });

    expect(queryNexusChatMock).toHaveBeenCalledWith(
      "conn-1",
      expect.stringContaining("FROM conversations"),
      expect.arrayContaining([9, expect.any(Date)]),
    );
    expect(result.tableName).toBe("conversations");
    expect(result.rowsRead).toBe(1);
    expect(result.nextCursor).toEqual({
      kind: "timestamp",
      value: new Date("2026-05-04T01:00:00Z"),
    });
  });

  it("retorna nextCursor.kind=none quando 0 rows", async () => {
    cursorMock.getOrCreateCursor.mockResolvedValue({
      lastSyncedAt: new Date("2026-05-04T00:00:00Z"),
      lastSyncedId: null,
    });
    queryNexusChatMock.mockResolvedValue({ rows: [] });

    const result = await conversationsSync.run({ connectionId: "conn-1", accountId: 9 });

    expect(result.rowsRead).toBe(0);
    expect(result.rowsAffected).toBe(0);
    expect(result.nextCursor).toEqual({ kind: "none" });
  });

  it("respeita batchLimit", async () => {
    cursorMock.getOrCreateCursor.mockResolvedValue({
      lastSyncedAt: new Date("2026-05-04T00:00:00Z"),
      lastSyncedId: null,
    });
    queryNexusChatMock.mockResolvedValue({ rows: [] });

    await conversationsSync.run({
      connectionId: "conn-1",
      accountId: 9,
      batchLimit: 100,
    });

    expect(queryNexusChatMock).toHaveBeenCalledWith(
      "conn-1",
      expect.stringContaining("LIMIT 100"),
      expect.any(Array),
    );
  });
});
```

- [ ] **Step 2: Rodar teste — esperado falhar**

```bash
npm test -- src/lib/chatwoot/sync/table-syncs/__tests__/conversations.test.ts
```

Expected: FAIL — `Cannot find module '../conversations'`.

- [ ] **Step 3: Implementar**

```typescript
// src/lib/chatwoot/sync/table-syncs/conversations.ts

import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { getOrCreateCursor } from "../cursor";
import type { TableSync, TableSyncArgs, TableSyncResult } from "../types";

const DEFAULT_BATCH_LIMIT = 5000;
const EPOCH = new Date(0);

/**
 * Sync delta de `conversations` do Chatwoot.
 *
 * Cursor: `updated_at`. Tabela `conversations` no Chatwoot atualiza updated_at
 * em qualquer mudança de status, assignee, team, custom_attributes, etc.
 *
 * O upsert efetivo no nosso banco interno acontece via camada de pré-agregação
 * (chatwoot_facts_*) — esta função apenas detecta as mudanças e dispara
 * o refresh via worker BullMQ. Esta função não escreve em chatwoot_facts_*
 * diretamente; apenas valida que há mudança e retorna `rowsRead`.
 *
 * Por design, `rowsAffected` aqui = `rowsRead` (assumimos que tudo lido é
 * mudança nova, dado que filtramos por updated_at > cursor).
 */
async function run({
  connectionId,
  accountId,
  batchLimit = DEFAULT_BATCH_LIMIT,
}: TableSyncArgs): Promise<TableSyncResult> {
  const t0 = Date.now();
  const cursor = await getOrCreateCursor(connectionId, accountId, "conversations");
  const since = cursor.lastSyncedAt ?? EPOCH;

  const sql = `
    SELECT id, account_id, status, updated_at
    FROM conversations
    WHERE account_id = $1
      AND updated_at > $2
    ORDER BY updated_at ASC
    LIMIT ${Number(batchLimit)}
  `;

  const result = await queryNexusChat<{
    id: number;
    account_id: number;
    status: number;
    updated_at: Date;
  }>(connectionId, sql, [accountId, since]);

  const rows = result.rows;
  const rowsRead = rows.length;
  const durationMs = Date.now() - t0;

  if (rowsRead === 0) {
    return {
      tableName: "conversations",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs,
    };
  }

  const last = rows[rows.length - 1]!;
  const nextTs = new Date(last.updated_at);

  return {
    tableName: "conversations",
    rowsRead,
    rowsAffected: rowsRead,
    nextCursor: { kind: "timestamp", value: nextTs },
    durationMs,
  };
}

export const conversationsSync: TableSync = {
  tableName: "conversations",
  cursorStrategy: "updated_at",
  run,
};
```

- [ ] **Step 4: Rodar teste — esperado passar**

```bash
npm test -- src/lib/chatwoot/sync/table-syncs/__tests__/conversations.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chatwoot/sync/table-syncs/conversations.ts src/lib/chatwoot/sync/table-syncs/__tests__/conversations.test.ts
git commit -m "feat(sync): B3 v0.41 — conversationsSync (cursor updated_at, LIMIT 5000) com 3 tests"
```

---

### Tasks B4-B11: table-syncs restantes

**Pattern:** repetir a estrutura da Task B3 para cada uma das 9 tabelas restantes. Cada uma é uma task separada com 1 commit, mas a estrutura é idêntica — apenas mudam: `tableName`, colunas no SELECT, e estratégia de cursor (`updated_at` ou `id`).

**Apêndice A** no final deste plano lista **a query SQL exata** de cada uma e **a estratégia de cursor** confirmada.

Para cada tabela, o subagente deve:
1. Escrever teste (3 cenários: cursor null, cursor com data, batchLimit) — usar B3 como template literal.
2. Rodar teste (FAIL).
3. Implementar usando o template B3 trocando apenas SQL e nome.
4. Rodar teste (PASS).
5. Commit `feat(sync): B<N> v0.41 — <tableName>Sync com 3 tests`.

Ordem dos commits:
- **B4:** `messagesSync` — cursor updated_at, JOIN com conversations.account_id
- **B5:** `inboxesSync` — cursor updated_at, account_id
- **B6:** `teamsSync` — cursor updated_at, account_id
- **B7:** `teamMembersSync` — cursor id, JOIN teams.account_id
- **B8:** `usersSync` — cursor updated_at, JOIN account_users.account_id
- **B9:** `accountUsersSync` — cursor updated_at, account_id
- **B10:** `contactsSync` — cursor updated_at, account_id
- **B11:** `reportingEventsSync` — cursor updated_at, account_id
- **B12:** `taggingsSync` — cursor id, JOIN tags

(SQL exato de cada uma listado no Apêndice A.)

---

### Task B13: `index.ts` — registry de table-syncs

**Files:**
- Create: `src/lib/chatwoot/sync/table-syncs/index.ts`

- [ ] **Step 1: Implementar**

```typescript
// src/lib/chatwoot/sync/table-syncs/index.ts

import { accountUsersSync } from "./account-users";
import { contactsSync } from "./contacts";
import { conversationsSync } from "./conversations";
import { inboxesSync } from "./inboxes";
import { messagesSync } from "./messages";
import { reportingEventsSync } from "./reporting-events";
import { taggingsSync } from "./taggings";
import { teamMembersSync } from "./team-members";
import { teamsSync } from "./teams";
import { usersSync } from "./users";
import type { TableSync } from "../types";

/**
 * Registry de todas as tabelas que o polling delta sincroniza.
 *
 * Ordem importa: tabelas que outras dependem ficam antes
 * (ex: inboxes antes de conversations; teams antes de team_members).
 *
 * Para adicionar uma tabela nova: criar arquivo em ./<table-name>.ts,
 * importar acima, adicionar no array.
 */
export const TABLE_SYNCS: readonly TableSync[] = [
  inboxesSync,
  teamsSync,
  teamMembersSync,
  usersSync,
  accountUsersSync,
  contactsSync,
  conversationsSync,
  messagesSync,
  reportingEventsSync,
  taggingsSync,
];
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/chatwoot/sync/table-syncs/index.ts
git commit -m "feat(sync): B13 v0.41 — registry index.ts ordenado de 10 table-syncs"
```

---

### Task B14: `run-delta-sync.ts` — orquestrador 1 conn × N tables × M accounts

**Files:**
- Create: `src/lib/chatwoot/sync/run-delta-sync.ts`
- Test: `src/lib/chatwoot/sync/__tests__/run-delta-sync.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// src/lib/chatwoot/sync/__tests__/run-delta-sync.test.ts
import { mockDeep, mockReset } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const advanceCursorMock = jest.fn();
const recordCursorErrorMock = jest.fn();
jest.mock("../cursor", () => ({
  advanceCursor: advanceCursorMock,
  recordCursorError: recordCursorErrorMock,
  getOrCreateCursor: jest.fn(),
}));

const publishMock = jest.fn();
jest.mock("@/lib/realtime", () => ({
  publishRealtimeEvent: publishMock,
  CHANNEL: "realtime-events",
}));

const tableSync1 = {
  tableName: "conversations",
  cursorStrategy: "updated_at" as const,
  run: jest.fn(),
};
const tableSync2 = {
  tableName: "messages",
  cursorStrategy: "updated_at" as const,
  run: jest.fn(),
};
jest.mock("../table-syncs", () => ({
  TABLE_SYNCS: [tableSync1, tableSync2],
}));

import { prisma } from "@/lib/prisma";
import { runDeltaSync } from "../run-delta-sync";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

describe("runDeltaSync", () => {
  it("itera por todas tabelas × accounts e publica facts:refreshed se hadChanges", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([
      { chatwootAccountId: 9, displayName: "Matrix" },
      { chatwootAccountId: 2, displayName: "Invest" },
    ] as never);

    tableSync1.run.mockResolvedValue({
      tableName: "conversations",
      rowsRead: 5,
      rowsAffected: 5,
      nextCursor: { kind: "timestamp", value: new Date("2026-05-04T01:00:00Z") },
      durationMs: 120,
    });
    tableSync2.run.mockResolvedValue({
      tableName: "messages",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs: 30,
    });

    const summary = await runDeltaSync("conn-1");

    // 2 tables × 2 accounts = 4 chamadas de table-sync.run
    expect(tableSync1.run).toHaveBeenCalledTimes(2);
    expect(tableSync2.run).toHaveBeenCalledTimes(2);

    // advanceCursor chamado para cada (account × table) com rowsRead > 0
    expect(advanceCursorMock).toHaveBeenCalledTimes(2); // só conversations, 2 accounts
    // (messages teve nextCursor.kind=none, então não avança)

    // facts:refreshed publicado por account com mudança
    expect(publishMock).toHaveBeenCalledTimes(2); // 1 por account
    expect(publishMock).toHaveBeenCalledWith({
      type: "facts:refreshed",
      connectionId: "conn-1",
      accountId: 9,
    });

    expect(summary.hadChanges).toBe(true);
    expect(summary.errors).toEqual([]);
  });

  it("não publica facts:refreshed quando 0 rows", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([
      { chatwootAccountId: 9, displayName: "Matrix" },
    ] as never);

    tableSync1.run.mockResolvedValue({
      tableName: "conversations",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs: 5,
    });
    tableSync2.run.mockResolvedValue({
      tableName: "messages",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs: 4,
    });

    const summary = await runDeltaSync("conn-1");

    expect(publishMock).not.toHaveBeenCalled();
    expect(summary.hadChanges).toBe(false);
  });

  it("captura erro por table-sync sem abortar o run inteiro", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([
      { chatwootAccountId: 9, displayName: "Matrix" },
    ] as never);

    tableSync1.run.mockRejectedValue(new Error("connection refused"));
    tableSync2.run.mockResolvedValue({
      tableName: "messages",
      rowsRead: 3,
      rowsAffected: 3,
      nextCursor: { kind: "timestamp", value: new Date() },
      durationMs: 10,
    });

    const summary = await runDeltaSync("conn-1");

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toEqual({
      tableName: "conversations",
      accountId: 9,
      error: "connection refused",
    });
    expect(recordCursorErrorMock).toHaveBeenCalledTimes(1);
    // messages continua processada
    expect(advanceCursorMock).toHaveBeenCalledTimes(1);
  });

  it("retorna early se connection não tem bindings enabled", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([] as never);

    const summary = await runDeltaSync("conn-1");

    expect(tableSync1.run).not.toHaveBeenCalled();
    expect(summary.perTable).toEqual([]);
    expect(summary.hadChanges).toBe(false);
  });

  it("atualiza connection.lastSyncAt ao final", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([
      { chatwootAccountId: 9, displayName: "Matrix" },
    ] as never);
    tableSync1.run.mockResolvedValue({
      tableName: "conversations",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs: 5,
    });
    tableSync2.run.mockResolvedValue({
      tableName: "messages",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs: 5,
    });

    await runDeltaSync("conn-1");

    expect(prismaMock.nexusChatConnection.update).toHaveBeenCalledWith({
      where: { id: "conn-1" },
      data: { lastSyncAt: expect.any(Date) },
    });
  });
});
```

- [ ] **Step 2: Rodar teste — esperado falhar**

```bash
npm test -- src/lib/chatwoot/sync/__tests__/run-delta-sync.test.ts
```

Expected: FAIL — `Cannot find module '../run-delta-sync'`.

- [ ] **Step 3: Implementar**

```typescript
// src/lib/chatwoot/sync/run-delta-sync.ts

import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime";
import { advanceCursor, recordCursorError } from "./cursor";
import { TABLE_SYNCS } from "./table-syncs";
import type { SyncRunSummary, TableSyncResult } from "./types";

/**
 * Executa polling delta sync para 1 conexão.
 *
 * Para cada (account × tabela alvo no registry), chama table-sync.run().
 * Avança cursor em sucesso. Grava erro em cursor em falha (sem abortar).
 * Atualiza `connection.lastSyncAt` ao final (sucesso parcial conta).
 * Publica `facts:refreshed` por account_id que teve ≥1 row alterada.
 *
 * Retorna SyncRunSummary para o worker logar / auditar.
 */
export async function runDeltaSync(connectionId: string): Promise<SyncRunSummary> {
  const startedAt = new Date();
  const t0 = Date.now();

  const bindings = await prisma.companyChatBinding.findMany({
    where: { connectionId, enabled: true, deletedAt: null },
    select: { chatwootAccountId: true, displayName: true },
  });

  if (bindings.length === 0) {
    const finishedAt = new Date();
    return {
      connectionId,
      startedAt,
      finishedAt,
      totalDurationMs: Date.now() - t0,
      perTable: [],
      errors: [],
      hadChanges: false,
    };
  }

  const perTable: TableSyncResult[] = [];
  const errors: SyncRunSummary["errors"] = [];
  const accountsChanged = new Set<number>();

  for (const binding of bindings) {
    const accountId = binding.chatwootAccountId;
    for (const sync of TABLE_SYNCS) {
      try {
        const result = await sync.run({ connectionId, accountId });
        perTable.push(result);

        if (result.nextCursor.kind === "timestamp") {
          await advanceCursor(connectionId, accountId, sync.tableName, {
            lastSyncedAt: result.nextCursor.value,
            rowsAffected: result.rowsAffected,
            runMs: result.durationMs,
          });
          if (result.rowsAffected > 0) accountsChanged.add(accountId);
        } else if (result.nextCursor.kind === "id") {
          await advanceCursor(connectionId, accountId, sync.tableName, {
            lastSyncedId: result.nextCursor.value,
            rowsAffected: result.rowsAffected,
            runMs: result.durationMs,
          });
          if (result.rowsAffected > 0) accountsChanged.add(accountId);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ tableName: sync.tableName, accountId, error: msg });
        const elapsedMs = Date.now() - t0;
        await recordCursorError(
          connectionId,
          accountId,
          sync.tableName,
          err,
          elapsedMs,
        ).catch(() => {
          // Falha ao gravar erro não pode quebrar o run.
        });
      }
    }
  }

  // Publica facts:refreshed por account que teve mudança real.
  for (const accountId of accountsChanged) {
    publishRealtimeEvent({
      type: "facts:refreshed",
      connectionId,
      accountId,
    }).catch(() => {});
  }

  // Atualiza lastSyncAt mesmo com erros parciais (sucesso parcial vale).
  await prisma.nexusChatConnection
    .update({
      where: { id: connectionId },
      data: { lastSyncAt: new Date() },
    })
    .catch(() => {
      // Connection pode ter sido deletada durante run. Não quebrar.
    });

  const finishedAt = new Date();
  return {
    connectionId,
    startedAt,
    finishedAt,
    totalDurationMs: Date.now() - t0,
    perTable,
    errors,
    hadChanges: accountsChanged.size > 0,
  };
}
```

- [ ] **Step 4: Rodar teste — esperado passar**

```bash
npm test -- src/lib/chatwoot/sync/__tests__/run-delta-sync.test.ts
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chatwoot/sync/run-delta-sync.ts src/lib/chatwoot/sync/__tests__/run-delta-sync.test.ts
git commit -m "feat(sync): B14 v0.41 — runDeltaSync orquestrador (10 tables × N accounts, error-isolated, publish facts:refreshed) com 5 tests"
```

---

### Task B15: `run-full-sweep.ts` — DELETE handling

**Files:**
- Create: `src/lib/chatwoot/sync/run-full-sweep.ts`
- Test: `src/lib/chatwoot/sync/__tests__/run-full-sweep.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// src/lib/chatwoot/sync/__tests__/run-full-sweep.test.ts
import { mockDeep, mockReset } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const queryNexusChatMock = jest.fn();
jest.mock("@/lib/nexus-chat/pool", () => ({ queryNexusChat: queryNexusChatMock }));

import { prisma } from "@/lib/prisma";
import { runFullSweep } from "../run-full-sweep";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

describe("runFullSweep", () => {
  it("para cada account: lista IDs no Chatwoot e detecta IDs órfãos no nosso banco", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([
      { chatwootAccountId: 9 },
    ] as never);

    queryNexusChatMock.mockResolvedValue({
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });

    const summary = await runFullSweep("conn-1");

    expect(queryNexusChatMock).toHaveBeenCalledWith(
      "conn-1",
      expect.stringContaining("FROM conversations"),
      [9],
    );
    expect(summary.connectionId).toBe("conn-1");
    expect(summary.perTable.length).toBeGreaterThan(0);
    // sweep só passa por tabelas que tem 'id' bigint pra comparar.
    expect(summary.perTable.find((t) => t.tableName === "conversations")).toBeTruthy();
  });

  it("retorna early se 0 bindings", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([] as never);
    const summary = await runFullSweep("conn-1");
    expect(summary.perTable).toEqual([]);
    expect(queryNexusChatMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar teste — esperado falhar**

```bash
npm test -- src/lib/chatwoot/sync/__tests__/run-full-sweep.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implementar**

```typescript
// src/lib/chatwoot/sync/run-full-sweep.ts

import { prisma } from "@/lib/prisma";
import { queryNexusChat } from "@/lib/nexus-chat/pool";
import type { SyncRunSummary, TableSyncResult } from "./types";

/**
 * Tabelas que participam do full sweep (precisam ter `id` bigint).
 * Cada entry é uma query SELECT id FROM <table> WHERE account_id = $1.
 *
 * NOTA: Esta v1 do sweep só DETECTA IDs órfãos (sem deletar do nosso banco).
 * O delete real será no v2 quando a camada de upsert (chatwoot_facts_*) for
 * atualizada para suportar invalidação por id list. Por ora, log + audit
 * + deixar pra próxima iteração.
 */
const SWEEP_TABLES: Array<{ name: string; whereClause: string }> = [
  { name: "conversations", whereClause: "account_id = $1" },
  { name: "messages", whereClause: "account_id = $1" },
  { name: "inboxes", whereClause: "account_id = $1" },
  { name: "teams", whereClause: "account_id = $1" },
  { name: "contacts", whereClause: "account_id = $1" },
];

export async function runFullSweep(connectionId: string): Promise<SyncRunSummary> {
  const startedAt = new Date();
  const t0 = Date.now();

  const bindings = await prisma.companyChatBinding.findMany({
    where: { connectionId, enabled: true, deletedAt: null },
    select: { chatwootAccountId: true },
  });

  if (bindings.length === 0) {
    const finishedAt = new Date();
    return {
      connectionId,
      startedAt,
      finishedAt,
      totalDurationMs: Date.now() - t0,
      perTable: [],
      errors: [],
      hadChanges: false,
    };
  }

  const perTable: TableSyncResult[] = [];
  const errors: SyncRunSummary["errors"] = [];

  for (const binding of bindings) {
    const accountId = binding.chatwootAccountId;
    for (const table of SWEEP_TABLES) {
      const tStart = Date.now();
      try {
        const sql = `SELECT id FROM ${table.name} WHERE ${table.whereClause}`;
        const res = await queryNexusChat<{ id: number }>(
          connectionId,
          sql,
          [accountId],
        );
        perTable.push({
          tableName: table.name,
          rowsRead: res.rows.length,
          rowsAffected: 0, // sweep v1 não deleta ainda
          nextCursor: { kind: "none" },
          durationMs: Date.now() - tStart,
        });
      } catch (err) {
        errors.push({
          tableName: table.name,
          accountId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const finishedAt = new Date();
  return {
    connectionId,
    startedAt,
    finishedAt,
    totalDurationMs: Date.now() - t0,
    perTable,
    errors,
    hadChanges: false,
  };
}
```

- [ ] **Step 4: Rodar teste — esperado passar**

```bash
npm test -- src/lib/chatwoot/sync/__tests__/run-full-sweep.test.ts
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chatwoot/sync/run-full-sweep.ts src/lib/chatwoot/sync/__tests__/run-full-sweep.test.ts
git commit -m "feat(sync): B15 v0.41 — runFullSweep v1 (detecta IDs órfãos sem deletar — delete v2 hotfix) com 2 tests"
```

---

### Task B16: BullMQ processor — delta-sync.ts

**Files:**
- Create: `src/worker/jobs/chatwoot-sync/delta-sync.ts`
- Test: `src/worker/jobs/chatwoot-sync/__tests__/delta-sync.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// src/worker/jobs/chatwoot-sync/__tests__/delta-sync.test.ts

const runDeltaSyncMock = jest.fn();
jest.mock("@/lib/chatwoot/sync/run-delta-sync", () => ({
  runDeltaSync: runDeltaSyncMock,
}));

const logAuditMock = jest.fn();
jest.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));

import { processDeltaSyncJob } from "../delta-sync";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("processDeltaSyncJob", () => {
  it("delega pra runDeltaSync e audita início/sucesso (sample 1/100)", async () => {
    runDeltaSyncMock.mockResolvedValue({
      connectionId: "conn-1",
      startedAt: new Date(),
      finishedAt: new Date(),
      totalDurationMs: 100,
      perTable: [],
      errors: [],
      hadChanges: false,
    });

    const job = { id: "delta:conn-1:123", data: { connectionId: "conn-1" } };
    await processDeltaSyncJob(job as never);

    expect(runDeltaSyncMock).toHaveBeenCalledWith("conn-1");
    // sampling 1/100 — pode ou não chamar; basta que não throw
  });

  it("audita polling_sync_failed quando há erros", async () => {
    runDeltaSyncMock.mockResolvedValue({
      connectionId: "conn-1",
      startedAt: new Date(),
      finishedAt: new Date(),
      totalDurationMs: 100,
      perTable: [],
      errors: [{ tableName: "messages", accountId: 9, error: "boom" }],
      hadChanges: false,
    });

    const job = { id: "delta:conn-1:123", data: { connectionId: "conn-1" } };
    await processDeltaSyncJob(job as never);

    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "polling_sync_failed",
        targetType: "nexus_chat_connection",
        targetId: "conn-1",
      }),
    );
  });

  it("propaga erro pra BullMQ retry quando runDeltaSync throw", async () => {
    runDeltaSyncMock.mockRejectedValue(new Error("infra down"));
    const job = { id: "delta:conn-1:123", data: { connectionId: "conn-1" } };

    await expect(processDeltaSyncJob(job as never)).rejects.toThrow("infra down");
  });
});
```

- [ ] **Step 2: Rodar — esperado falhar**

```bash
npm test -- src/worker/jobs/chatwoot-sync/__tests__/delta-sync.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implementar**

```typescript
// src/worker/jobs/chatwoot-sync/delta-sync.ts

import type { Job } from "bullmq";
import { runDeltaSync } from "@/lib/chatwoot/sync/run-delta-sync";
import { logAudit } from "@/lib/audit";

export interface DeltaSyncJobData {
  connectionId: string;
}

const AUDIT_SAMPLE_RATE = 100; // 1 a cada 100 logs success

/**
 * BullMQ processor: executa delta-sync para 1 connection.
 *
 * Idempotente via jobId determinístico no scheduler. Erros propagam pra
 * BullMQ retry; sucessos parciais (alguns table-syncs falharam) NÃO
 * propagam — `runDeltaSync` já registra os erros nos cursors.
 *
 * Auditoria:
 *   - polling_sync_completed: sample 1/100 (volume alto, ~2/min/conn)
 *   - polling_sync_failed: 100% (raro, sempre logar)
 */
export async function processDeltaSyncJob(
  job: Job<DeltaSyncJobData>,
): Promise<void> {
  const { connectionId } = job.data;
  const summary = await runDeltaSync(connectionId);

  if (summary.errors.length > 0) {
    await logAudit({
      action: "polling_sync_failed",
      targetType: "nexus_chat_connection",
      targetId: connectionId,
      details: {
        durationMs: summary.totalDurationMs,
        errors: summary.errors.slice(0, 10), // cap pra evitar JSON gigante
        errorCount: summary.errors.length,
      },
    }).catch(() => {});
  } else if (Math.random() < 1 / AUDIT_SAMPLE_RATE) {
    await logAudit({
      action: "polling_sync_completed",
      targetType: "nexus_chat_connection",
      targetId: connectionId,
      details: {
        durationMs: summary.totalDurationMs,
        rowsByTable: summary.perTable.map((t) => ({
          table: t.tableName,
          rows: t.rowsAffected,
        })),
        hadChanges: summary.hadChanges,
      },
    }).catch(() => {});
  }
}
```

- [ ] **Step 4: Rodar teste — esperado passar**

```bash
npm test -- src/worker/jobs/chatwoot-sync/__tests__/delta-sync.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker/jobs/chatwoot-sync/delta-sync.ts src/worker/jobs/chatwoot-sync/__tests__/delta-sync.test.ts
git commit -m "feat(worker): B16 v0.41 — processDeltaSyncJob (audit sample 1/100 success, 100% fail) com 3 tests"
```

---

### Task B17: BullMQ processor — full-sweep.ts

**Files:**
- Create: `src/worker/jobs/chatwoot-sync/full-sweep.ts`
- Test: `src/worker/jobs/chatwoot-sync/__tests__/full-sweep.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
const runFullSweepMock = jest.fn();
jest.mock("@/lib/chatwoot/sync/run-full-sweep", () => ({
  runFullSweep: runFullSweepMock,
}));

const logAuditMock = jest.fn();
jest.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));

import { processFullSweepJob } from "../full-sweep";

beforeEach(() => jest.clearAllMocks());

describe("processFullSweepJob", () => {
  it("audita started e completed", async () => {
    runFullSweepMock.mockResolvedValue({
      connectionId: "conn-1",
      startedAt: new Date(),
      finishedAt: new Date(),
      totalDurationMs: 1500,
      perTable: [],
      errors: [],
      hadChanges: false,
    });

    const job = { id: "sweep:conn-1", data: { connectionId: "conn-1" } };
    await processFullSweepJob(job as never);

    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "polling_full_sweep_started" }),
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "polling_full_sweep_completed" }),
    );
    expect(runFullSweepMock).toHaveBeenCalledWith("conn-1");
  });
});
```

- [ ] **Step 2: Rodar — esperado falhar**

- [ ] **Step 3: Implementar**

```typescript
// src/worker/jobs/chatwoot-sync/full-sweep.ts

import type { Job } from "bullmq";
import { runFullSweep } from "@/lib/chatwoot/sync/run-full-sweep";
import { logAudit } from "@/lib/audit";

export interface FullSweepJobData {
  connectionId: string;
}

export async function processFullSweepJob(
  job: Job<FullSweepJobData>,
): Promise<void> {
  const { connectionId } = job.data;

  await logAudit({
    action: "polling_full_sweep_started",
    targetType: "nexus_chat_connection",
    targetId: connectionId,
    details: { jobId: job.id },
  }).catch(() => {});

  const summary = await runFullSweep(connectionId);

  await logAudit({
    action: "polling_full_sweep_completed",
    targetType: "nexus_chat_connection",
    targetId: connectionId,
    details: {
      durationMs: summary.totalDurationMs,
      tables: summary.perTable.length,
      errors: summary.errors.length,
    },
  }).catch(() => {});
}
```

- [ ] **Step 4: Rodar teste — esperado passar**

- [ ] **Step 5: Commit**

```bash
git add src/worker/jobs/chatwoot-sync/full-sweep.ts src/worker/jobs/chatwoot-sync/__tests__/full-sweep.test.ts
git commit -m "feat(worker): B17 v0.41 — processFullSweepJob (audit started/completed) com 1 test"
```

---

### Task B18: Scheduler tick — enfileira por connection

**Files:**
- Create: `src/worker/jobs/chatwoot-sync/scheduler.ts`
- Test: `src/worker/jobs/chatwoot-sync/__tests__/scheduler.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
import { mockDeep, mockReset } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const queueAddMock = jest.fn();
jest.mock("../queues", () => ({
  getDeltaSyncQueue: () => ({ add: queueAddMock }),
}));

import { prisma } from "@/lib/prisma";
import { tickDeltaSyncScheduler } from "../scheduler";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

describe("tickDeltaSyncScheduler", () => {
  it("enfileira jobs apenas pra conexões ativas com lastSyncAt+intervalo no passado", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "conn-1" },
      { id: "conn-3" },
    ] as never);

    await tickDeltaSyncScheduler();

    expect(queueAddMock).toHaveBeenCalledTimes(2);
    expect(queueAddMock).toHaveBeenCalledWith(
      "delta-sync",
      { connectionId: "conn-1" },
      expect.objectContaining({
        jobId: expect.stringMatching(/^delta:conn-1:\d+$/),
      }),
    );
  });

  it("não enfileira nada quando 0 conexões devidas", async () => {
    prismaMock.$queryRaw.mockResolvedValue([] as never);
    await tickDeltaSyncScheduler();
    expect(queueAddMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar — esperado falhar**

- [ ] **Step 3: Implementar `queues.ts` (helper) + `scheduler.ts`**

`src/worker/jobs/chatwoot-sync/queues.ts`:

```typescript
import { Queue } from "bullmq";
import { connection } from "@/worker/redis";

let _deltaSyncQueue: Queue | undefined;
let _fullSweepQueue: Queue | undefined;

export function getDeltaSyncQueue(): Queue {
  if (!_deltaSyncQueue) {
    _deltaSyncQueue = new Queue("chatwoot-sync-delta", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return _deltaSyncQueue;
}

export function getFullSweepQueue(): Queue {
  if (!_fullSweepQueue) {
    _fullSweepQueue = new Queue("chatwoot-sync-sweep", {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 30 },
        removeOnFail: { count: 30 },
      },
    });
  }
  return _fullSweepQueue;
}
```

`src/worker/jobs/chatwoot-sync/scheduler.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { getDeltaSyncQueue } from "./queues";

const TICK_BUCKET_MS = 5000;

interface DueConnection {
  id: string;
}

/**
 * Tick do scheduler: chamado pelo worker a cada 5s. Enfileira 1 job
 * delta-sync por conexão que está devida (last_sync_at + interval < now).
 *
 * jobId determinístico por bucket de 5s pra deduplicar caso o tick
 * enfileire 2x o mesmo (idempotência via BullMQ).
 */
export async function tickDeltaSyncScheduler(): Promise<void> {
  const due = await prisma.$queryRaw<DueConnection[]>`
    SELECT id
    FROM nexus_chat_connections
    WHERE deleted_at IS NULL
      AND status = 'active'
      AND (
        last_sync_at IS NULL
        OR last_sync_at + (polling_interval_seconds * INTERVAL '1 second') <= NOW()
      )
    ORDER BY last_sync_at NULLS FIRST
  `;

  if (due.length === 0) return;

  const queue = getDeltaSyncQueue();
  const bucket = Math.floor(Date.now() / TICK_BUCKET_MS);

  await Promise.all(
    due.map((row) =>
      queue.add(
        "delta-sync",
        { connectionId: row.id },
        {
          jobId: `delta:${row.id}:${bucket}`,
        },
      ).catch(() => {
        // jobId duplicado (idempotência) — silencioso
      }),
    ),
  );
}
```

- [ ] **Step 4: Rodar teste — esperado passar**

- [ ] **Step 5: Commit**

```bash
git add src/worker/jobs/chatwoot-sync/scheduler.ts src/worker/jobs/chatwoot-sync/queues.ts src/worker/jobs/chatwoot-sync/__tests__/scheduler.test.ts
git commit -m "feat(worker): B18 v0.41 — scheduler 5s tick + queues bullmq (jobId determinístico bucket-based) com 2 tests"
```

---

### Task B19: Registrar workers + scheduler em `src/worker/index.ts`

**Files:**
- Modify: `src/worker/index.ts`

- [ ] **Step 1: Ler arquivo atual**

```bash
cat src/worker/index.ts | head -100
```

- [ ] **Step 2: Adicionar imports e registrar Worker + JobScheduler**

No `src/worker/index.ts`, após os imports existentes:

```typescript
import { Worker, JobScheduler } from "bullmq";
import { connection } from "./redis";
import { tickDeltaSyncScheduler } from "./jobs/chatwoot-sync/scheduler";
import { processDeltaSyncJob } from "./jobs/chatwoot-sync/delta-sync";
import { processFullSweepJob } from "./jobs/chatwoot-sync/full-sweep";
import { getFullSweepQueue } from "./jobs/chatwoot-sync/queues";
```

E na função `main()` ou registro central:

```typescript
// Worker delta-sync (concurrency 4 pra processar até 4 conns simultâneas)
const deltaWorker = new Worker(
  "chatwoot-sync-delta",
  processDeltaSyncJob,
  { connection, concurrency: 4 },
);
deltaWorker.on("failed", (job, err) =>
  console.error("[delta-sync] failed:", job?.id, err.message),
);

// Worker full-sweep (concurrency 1, baixo volume)
const sweepWorker = new Worker(
  "chatwoot-sync-sweep",
  processFullSweepJob,
  { connection, concurrency: 1 },
);
sweepWorker.on("failed", (job, err) =>
  console.error("[full-sweep] failed:", job?.id, err.message),
);

// Scheduler dynamic 5s tick — enfileira por connection
setInterval(() => {
  tickDeltaSyncScheduler().catch((err) =>
    console.error("[scheduler tick] failed:", err.message),
  );
}, 5000);

// Cron sweep diário 03:00 BRT (06:00 UTC)
const sweepQueue = getFullSweepQueue();
const sweepScheduler = new JobScheduler(sweepQueue.name, { connection });
await sweepScheduler.upsertJobScheduler(
  "daily-full-sweep",
  { pattern: "0 6 * * *" }, // 03:00 BRT em UTC
  {
    name: "full-sweep",
    data: {}, // populado dinamicamente quando dispara: 1 sweep por conn
  },
);
```

**Atenção:** o `data: {}` acima precisa de ajuste — JobScheduler dispara 1 job, mas precisamos de 1 por connection. Solução: o cron dispara um job genérico que enfileira 1 job-filho por connection. Adicionar processor genérico:

```typescript
// Job "full-sweep" do cron diário: enfileira 1 sub-job por connection ativa.
const fullSweepDispatcher = new Worker(
  "chatwoot-sync-sweep",
  async (job) => {
    if (job.name !== "full-sweep") return;
    const conns = await prisma.nexusChatConnection.findMany({
      where: { deletedAt: null, status: "active" },
      select: { id: true },
    });
    for (const c of conns) {
      await sweepQueue.add("sweep-conn", { connectionId: c.id });
    }
  },
  { connection, concurrency: 1 },
);
```

E `processFullSweepJob` só é chamado para jobs com nome `sweep-conn`:

```typescript
const sweepWorker = new Worker(
  "chatwoot-sync-sweep",
  async (job) => {
    if (job.name === "sweep-conn") {
      await processFullSweepJob(job);
    }
    // job.name === "full-sweep" é dispatched pelo dispatcher acima.
  },
  { connection, concurrency: 1 },
);
```

(Subagent vai consolidar essa lógica no arquivo, evitando duplicar Worker. Use 1 Worker só com switch por name.)

- [ ] **Step 3: Validar `npm run build:worker` (ou tsc)**

```bash
npx tsc --noEmit src/worker/index.ts 2>&1 | head -20
```

Expected: zero erros (se houver, ajustar imports).

- [ ] **Step 4: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat(worker): B19 v0.41 — registra delta-sync Worker + sweep dispatcher + scheduler 5s + cron diário 03:00 BRT"
```

---

## Fase C — Server Actions

### Task C1: `connections.ts` — remove webhook + add updateConnectionPollingInterval

**Files:**
- Modify: `src/lib/actions/nexus-chat/connections.ts`
- Modify: `src/lib/actions/nexus-chat/__tests__/connections.test.ts`

- [ ] **Step 1: Editar `connections.ts` — remover `regenerateConnectionWebhookToken` e geração de token em `createNexusChatConnection`**

Remover linhas 28 (import `generateWebhookToken`) e remover toda a função `regenerateConnectionWebhookToken` (linhas 120-149).

Em `createNexusChatConnection`:
- Remover linhas 79-83 (comentário webhook + chamada `generateWebhookToken`).
- Remover linha 96 (`webhookToken,` no `data`).
- Remover linha 113 (`webhookTokenGenerated: true` em `details`).

- [ ] **Step 2: Adicionar `updateConnectionPollingInterval`**

No final do arquivo:

```typescript
const PollingIntervalSchema = z
  .number()
  .int()
  .min(20, "Intervalo mínimo de 20 segundos.")
  .max(86400, "Intervalo máximo de 86400 segundos (1 dia).");

/**
 * Atualiza apenas o `pollingIntervalSeconds` da connection. Server Action
 * separada da `updateNexusChatConnection` porque o campo é per-connection
 * mas o user pode querer ajustar sem mexer em host/senha.
 *
 * Validação: min 20s (também enforced por CHECK constraint no Postgres).
 * Audita `polling_interval_updated` 100% (raro evento).
 */
export async function updateConnectionPollingInterval(
  id: string,
  intervalSeconds: number,
): Promise<ActionResult<{ id: string; intervalSeconds: number }>> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = PollingIntervalSchema.safeParse(intervalSeconds);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }

  const before = await prisma.nexusChatConnection.findUnique({
    where: { id, deletedAt: null },
    select: { id: true, pollingIntervalSeconds: true, name: true },
  });
  if (!before) {
    return { success: false, error: "Conexão não encontrada." };
  }

  await prisma.nexusChatConnection.update({
    where: { id },
    data: { pollingIntervalSeconds: parsed.data },
  });

  await logAudit({
    userId: auth.userId,
    action: "polling_interval_updated",
    targetType: "nexus_chat_connection",
    targetId: id,
    details: {
      name: before.name,
      before: before.pollingIntervalSeconds,
      after: parsed.data,
    },
  });

  return { success: true, data: { id, intervalSeconds: parsed.data } };
}
```

- [ ] **Step 3: Atualizar testes em `connections.test.ts`**

Remover descritos de webhook (`regenerateConnectionWebhookToken`, geração de webhookToken em create).

Adicionar:

```typescript
describe("updateConnectionPollingInterval", () => {
  it("rejeita valor < 20", async () => {
    // ... mock super_admin
    const r = await updateConnectionPollingInterval("conn-1", 10);
    expect(r.success).toBe(false);
    expect(r.error).toContain("mínimo de 20");
  });

  it("aceita 30 e atualiza", async () => {
    prismaMock.nexusChatConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      name: "Padrão",
      pollingIntervalSeconds: 60,
    } as never);
    prismaMock.nexusChatConnection.update.mockResolvedValue({} as never);

    const r = await updateConnectionPollingInterval("conn-1", 30);
    expect(r.success).toBe(true);
    expect(prismaMock.nexusChatConnection.update).toHaveBeenCalledWith({
      where: { id: "conn-1" },
      data: { pollingIntervalSeconds: 30 },
    });
  });

  it("audita polling_interval_updated com before/after", async () => {
    prismaMock.nexusChatConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      name: "Padrão",
      pollingIntervalSeconds: 60,
    } as never);
    prismaMock.nexusChatConnection.update.mockResolvedValue({} as never);

    await updateConnectionPollingInterval("conn-1", 25);

    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "polling_interval_updated",
        details: expect.objectContaining({ before: 60, after: 25 }),
      }),
    );
  });
});
```

- [ ] **Step 4: Rodar testes**

```bash
npm test -- src/lib/actions/nexus-chat/__tests__/connections.test.ts
```

Expected: PASS (incluindo os 3 novos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/nexus-chat/connections.ts src/lib/actions/nexus-chat/__tests__/connections.test.ts
git commit -m "feat(actions): C1 v0.41 — remove regenerateConnectionWebhookToken/webhookToken; add updateConnectionPollingInterval (min 20s + audit polling_interval_updated)"
```

---

### Task C2: `sync-stream.ts` — listRecentSyncRuns

**Files:**
- Create: `src/lib/actions/nexus-chat/sync-stream.ts`
- Test: `src/lib/actions/nexus-chat/__tests__/sync-stream.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// src/lib/actions/nexus-chat/__tests__/sync-stream.test.ts
import { mockDeep, mockReset } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getCurrentUserMock = jest.fn();
jest.mock("@/lib/auth", () => ({ getCurrentUser: getCurrentUserMock }));

import { prisma } from "@/lib/prisma";
import { listRecentSyncRuns } from "../sync-stream";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

describe("listRecentSyncRuns", () => {
  it("rejeita não-super_admin", async () => {
    getCurrentUserMock.mockResolvedValue({ platformRole: "manager" });
    const r = await listRecentSyncRuns({ connectionId: "c1", limit: 50 });
    expect(r.success).toBe(false);
    expect(r.error).toContain("super_admin");
  });

  it("retorna até 500 audit_logs polling_* mais recentes", async () => {
    getCurrentUserMock.mockResolvedValue({ platformRole: "super_admin" });
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: "1",
        action: "polling_sync_completed",
        createdAt: new Date(),
        details: { rowsByTable: [{ table: "conversations", rows: 5 }] },
      },
    ] as never);

    const r = await listRecentSyncRuns({ connectionId: "c1", limit: 50 });

    expect(r.success).toBe(true);
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetType: "nexus_chat_connection",
          targetId: "c1",
          action: { in: expect.arrayContaining(["polling_sync_completed", "polling_sync_failed"]) },
        }),
        take: 50,
      }),
    );
  });

  it("clamp limit em 500 max", async () => {
    getCurrentUserMock.mockResolvedValue({ platformRole: "super_admin" });
    prismaMock.auditLog.findMany.mockResolvedValue([] as never);

    await listRecentSyncRuns({ connectionId: "c1", limit: 9999 });

    const args = prismaMock.auditLog.findMany.mock.calls[0]?.[0];
    expect(args?.take).toBe(500);
  });
});
```

- [ ] **Step 2: Rodar — esperado falhar**

- [ ] **Step 3: Implementar**

```typescript
// src/lib/actions/nexus-chat/sync-stream.ts
"use server";

/**
 * Server Action — lista runs recentes do polling delta para uma connection.
 * Substitui `listRecentWebhookEvents` (Fase 2).
 *
 * Origem: `audit_logs` com action ∈ {polling_sync_completed, polling_sync_failed,
 * polling_full_sweep_started, polling_full_sweep_completed, polling_interval_updated}.
 *
 * Defesa em profundidade: super_admin only.
 */

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface SyncRunEvent {
  id: string;
  action: string;
  createdAt: string;
  details: Record<string, unknown>;
}

const POLLING_AUDIT_ACTIONS = [
  "polling_sync_completed",
  "polling_sync_failed",
  "polling_full_sweep_started",
  "polling_full_sweep_completed",
  "polling_interval_updated",
] as const;

const HARD_LIMIT = 500;

export async function listRecentSyncRuns(args: {
  connectionId: string;
  limit: number;
}): Promise<{
  success: boolean;
  data?: SyncRunEvent[];
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Não autenticado." };
  if (user.platformRole !== "super_admin") {
    return {
      success: false,
      error: "Apenas super_admin pode consultar histórico de sync.",
    };
  }

  const take = Math.min(Math.max(1, args.limit), HARD_LIMIT);

  const rows = await prisma.auditLog.findMany({
    where: {
      targetType: "nexus_chat_connection",
      targetId: args.connectionId,
      action: { in: [...POLLING_AUDIT_ACTIONS] as never },
    },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, createdAt: true, details: true },
  });

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      action: r.action,
      createdAt: r.createdAt.toISOString(),
      details: (r.details ?? {}) as Record<string, unknown>,
    })),
  };
}
```

- [ ] **Step 4: Rodar teste — esperado passar**

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/nexus-chat/sync-stream.ts src/lib/actions/nexus-chat/__tests__/sync-stream.test.ts
git commit -m "feat(actions): C2 v0.41 — listRecentSyncRuns (substitui webhook stream; 5 polling_* actions; super_admin; cap 500)"
```

---

### Task C3: `health-metrics.ts` — refactor para polling

**Files:**
- Modify: `src/lib/actions/nexus-chat/health-metrics.ts`
- Modify: `src/lib/actions/nexus-chat/__tests__/health-metrics.test.ts`

- [ ] **Step 1: Reescrever `health-metrics.ts`**

Substituir o conteúdo do arquivo por:

```typescript
"use server";

/**
 * Server Action — snapshot de saúde da connection no contexto polling delta.
 *
 * Substitui webhook metrics (Fase 2). Mostra:
 *  - lastSyncAt (heartbeat do polling delta)
 *  - syncRunsLast24h (audit polling_sync_completed em 24h × sample rate 100)
 *  - syncErrorsLast24h (audit polling_sync_failed em 24h)
 *  - jobErrorsLast24h (chatwoot_facts_meta com lastError != null em 24h)
 */

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface ConnectionHealthSnapshot {
  connectionId: string;
  lastSyncAt: string | null;
  lastSyncLagMinutes: number | null;
  syncRunsLast24h: number; // estimativa (sample 1/100)
  syncErrorsLast24h: number;
  jobErrorsLast24h: number;
}

export interface HealthSnapshotResult {
  success: boolean;
  data?: ConnectionHealthSnapshot;
  error?: string;
}

export async function getConnectionHealthSnapshot(
  connectionId: string,
): Promise<HealthSnapshotResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Não autenticado." };
  if (user.platformRole !== "super_admin") {
    return {
      success: false,
      error: "Apenas super_admin pode consultar saúde da conexão.",
    };
  }

  const conn = await prisma.nexusChatConnection.findUnique({
    where: { id: connectionId, deletedAt: null },
    select: { id: true, lastSyncAt: true },
  });
  if (!conn) {
    return { success: false, error: "Conexão não encontrada." };
  }

  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 3600_000);

  const [syncRunsAuditCount, syncErrors, jobErrors] = await Promise.all([
    prisma.auditLog.count({
      where: {
        action: "polling_sync_completed",
        targetType: "nexus_chat_connection",
        targetId: connectionId,
        createdAt: { gte: last24h },
      },
    }),
    prisma.auditLog.count({
      where: {
        action: "polling_sync_failed",
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

  // Audit é sample 1/100 → multiplica para estimativa real.
  const syncRunsLast24h = syncRunsAuditCount * 100;

  const lagMs = conn.lastSyncAt
    ? now.getTime() - conn.lastSyncAt.getTime()
    : null;
  const lagMin = lagMs !== null ? Math.max(0, Math.floor(lagMs / 60_000)) : null;

  return {
    success: true,
    data: {
      connectionId: conn.id,
      lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
      lastSyncLagMinutes: lagMin,
      syncRunsLast24h,
      syncErrorsLast24h: syncErrors,
      jobErrorsLast24h: jobErrors,
    },
  };
}
```

- [ ] **Step 2: Atualizar testes** (substituir todos os contadores `webhook_*` por `polling_*`):

```typescript
// trecho-chave do teste
prismaMock.auditLog.count
  .mockResolvedValueOnce(5) // polling_sync_completed
  .mockResolvedValueOnce(0); // polling_sync_failed
```

- [ ] **Step 3: Rodar testes**

```bash
npm test -- src/lib/actions/nexus-chat/__tests__/health-metrics.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/nexus-chat/health-metrics.ts src/lib/actions/nexus-chat/__tests__/health-metrics.test.ts
git commit -m "feat(actions): C3 v0.41 — health-metrics polling-aware (lastSyncAt, syncRunsLast24h*100 sample-corrected, syncErrorsLast24h)"
```

---

## Fase D — UI: Remoção de Webhook

### Task D1: DELETE endpoint webhook + tests + arquivos relacionados

**Files:**
- Delete: `src/app/api/webhooks/nexus-chat/[token]/route.ts`
- Delete: `src/app/api/webhooks/nexus-chat/[token]/__tests__/route.test.ts`
- Delete: `src/lib/nexus-chat/webhook-credentials.ts`
- Delete: `src/lib/nexus-chat/__tests__/webhook-credentials.test.ts`
- Delete: `src/lib/actions/nexus-chat/realtime-stream.ts`
- Delete: `src/lib/actions/nexus-chat/__tests__/realtime-stream.test.ts`
- Modify: `src/middleware.ts` (remove isenção `/api/webhooks/nexus-chat/*` se houver)

- [ ] **Step 1: Deletar arquivos**

```bash
git rm src/app/api/webhooks/nexus-chat/[token]/route.ts
git rm src/app/api/webhooks/nexus-chat/[token]/__tests__/route.test.ts
git rm src/lib/nexus-chat/webhook-credentials.ts
git rm src/lib/nexus-chat/__tests__/webhook-credentials.test.ts
git rm src/lib/actions/nexus-chat/realtime-stream.ts
git rm src/lib/actions/nexus-chat/__tests__/realtime-stream.test.ts
rmdir src/app/api/webhooks/nexus-chat/[token] 2>/dev/null || true
rmdir src/app/api/webhooks/nexus-chat 2>/dev/null || true
rmdir src/app/api/webhooks 2>/dev/null || true
```

- [ ] **Step 2: Editar `src/middleware.ts` — remover isenção webhook**

Buscar `/api/webhooks/nexus-chat/` no `isPublic`/`PUBLIC_PATHS` e remover.

- [ ] **Step 3: Validar**

```bash
grep -rn "api/webhooks/nexus-chat\|webhook-credentials\|realtime-stream\|listRecentWebhookEvents\|generateWebhookToken" src/ 2>&1 | head
```

Expected: zero hits (ou apenas nos arquivos UI da Fase D2-D6, que serão consertados).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(webhook-removal): D1 v0.41 — DELETE endpoint /api/webhooks/nexus-chat + webhook-credentials + realtime-stream + middleware exemption"
```

---

### Task D2: connection-form-dialog.tsx — remove webhook + add intervalo

**Files:**
- Modify: `src/components/settings/nexus-chat/connection-form-dialog.tsx`
- Modify: `src/components/settings/nexus-chat/__tests__/connection-form-dialog.test.tsx`

- [ ] **Step 1: SUB-SKILL ui-ux-pro-max OBRIGATÓRIA**

Cada subagente que tocar UI deve invocar `ui-ux-pro-max:ui-ux-pro-max` ANTES de codar. Padrão visual confirmado:
- Campo "Intervalo de sincronização (segundos)" — Input type=number, min=20, com helper text "Mínimo 20 segundos. Padrão 30."
- Posição: após `SSL Mode`, antes de fechar o `<div className="grid gap-3">`.
- Sem bloco webhook nenhum.

- [ ] **Step 2: Editar `connection-form-dialog.tsx`**

Remover:
- Linha 5 import `Check, Clipboard, Info, Loader2, Webhook` → manter só `Loader2`
- Linhas 51-57 (constante `CHATWOOT_WEBHOOK_EVENTS`)
- Toda a função `WebhookSection` (linhas ~329-389)
- Toda a função `CopyableCode` (linhas ~395-434)
- O bloco `{showWebhookBlock && webhookUrl ? <WebhookSection ... />}` (~298-300)
- O `useMemo` de `webhookUrl` (~161-165)
- A constante `showWebhookBlock` (~167-168)

Adicionar no `FormState`:

```typescript
interface FormState {
  // ... campos existentes
  pollingIntervalSeconds: number;
}

const DEFAULT_FORM: FormState = {
  // ... campos existentes
  pollingIntervalSeconds: 30,
};
```

No `useEffect` que sincroniza form em `mode="edit"`:

```typescript
setForm({
  // ... campos existentes
  pollingIntervalSeconds: connection.pollingIntervalSeconds ?? 30,
});
```

Em `handleSubmit`, ao montar `input`:

```typescript
const input = {
  // ... existentes
  pollingIntervalSeconds: Number(form.pollingIntervalSeconds) || 30,
};
```

(`createNexusChatConnection`/`updateNexusChatConnection` precisam aceitar esse campo — adicionar no schema Zod das Server Actions na Task C1 caso ainda não tenha. **Voltar a C1 e adicionar `pollingIntervalSeconds` no `ConnectionInputSchema` se necessário.**)

Adicionar campo no JSX, após `SSL Mode`:

```tsx
<div className="grid gap-1.5">
  <Label htmlFor="conn-polling">
    Intervalo de sincronização (segundos)
  </Label>
  <Input
    id="conn-polling"
    type="number"
    inputMode="numeric"
    min={20}
    step={1}
    value={form.pollingIntervalSeconds}
    onChange={(e) =>
      update("pollingIntervalSeconds", Number(e.target.value) || 30)
    }
    disabled={pending}
  />
  <p className="text-[11px] text-muted-foreground">
    Frequência com que o Nexus Insights consulta o banco do Nexus Chat
    para detectar mudanças. Mínimo 20 segundos. Padrão 30.
  </p>
</div>
```

Atualizar a `ConnectionListItem` (importada deste arquivo) — remover `webhookToken` da interface, adicionar `pollingIntervalSeconds`.

- [ ] **Step 3: Atualizar testes**

Em `connection-form-dialog.test.tsx`, **remover** todos os testes que referenciam webhook (`WebhookSection`, `CopyableCode`, eventos, secret, etc.). **Adicionar**:

```typescript
it("renderiza campo Intervalo de sincronização com default 30", () => {
  render(<ConnectionFormDialog mode="create" open onOpenChange={() => {}} connection={null} />);
  const input = screen.getByLabelText(/Intervalo de sincronização/i) as HTMLInputElement;
  expect(input.value).toBe("30");
  expect(input.min).toBe("20");
});

it("submit envia pollingIntervalSeconds no payload", async () => {
  const createMock = createNexusChatConnection as jest.Mock;
  createMock.mockResolvedValue({ success: true, data: { id: "c1" } });

  render(<ConnectionFormDialog mode="create" open onOpenChange={() => {}} connection={null} />);
  await userEvent.type(screen.getByLabelText("Nome"), "X");
  await userEvent.type(screen.getByLabelText("Host"), "h");
  await userEvent.type(screen.getByLabelText("Banco"), "d");
  await userEvent.type(screen.getByLabelText("Usuário"), "u");
  await userEvent.type(screen.getByLabelText("Senha"), "p");
  const interval = screen.getByLabelText(/Intervalo/i);
  await userEvent.clear(interval);
  await userEvent.type(interval, "45");
  await userEvent.click(screen.getByRole("button", { name: /Salvar/i }));

  expect(createMock).toHaveBeenCalledWith(
    expect.objectContaining({ pollingIntervalSeconds: 45 }),
  );
});
```

- [ ] **Step 4: Rodar testes**

```bash
npm test -- src/components/settings/nexus-chat/__tests__/connection-form-dialog.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/nexus-chat/connection-form-dialog.tsx src/components/settings/nexus-chat/__tests__/connection-form-dialog.test.tsx src/lib/actions/nexus-chat/connections.ts
git commit -m "feat(ui): D2 v0.41 — connection-form-dialog SEM webhook + campo Intervalo de sincronização (min 20, default 30)"
```

---

### Task D3: onboarding-wizard.tsx — remove Step Webhook + suporte a `prefilledConnectionId`

**Files:**
- Modify: `src/components/settings/nexus-chat/wizard/onboarding-wizard.tsx`
- Modify: `src/components/settings/nexus-chat/wizard/__tests__/onboarding-wizard.test.tsx`

- [ ] **Step 1: SUB-SKILL ui-ux-pro-max OBRIGATÓRIA antes de codar**

Padrão UX:
- Quando aberto **dentro** de uma conexão (prefilledConnectionId): wizard tem **2 steps** — Identidade → Conclusão. Sem stepper visível (1 step só seria estranho; mostrar "Etapa 1 de 2").
- Quando aberto **fora** de uma conexão (raiz `/bancos-de-dados`): wizard tem **3 steps** — Conexão → Identidade → Conclusão. Stepper visível.
- Step "Webhook" **removido em ambos os casos**.

- [ ] **Step 2: Editar `onboarding-wizard.tsx`**

Adicionar prop:

```typescript
interface Props {
  connections: WizardConnection[];
  onClose: () => void;
  onSuccess?: (bindingId: string) => void;
  /** Se passado, pula Step 1 e fixa essa connection. */
  prefilledConnectionId?: string;
}
```

`WizardStep` muda:

```typescript
type WizardStep = 1 | 2 | 3; // só 3 agora
```

`STEP_LABELS` muda:

```typescript
const STEP_LABELS = ["Conexão", "Identidade", "Conclusão"] as const;
```

`INITIAL_STATE` aceita prefilled:

```typescript
function makeInitialState(prefilledConnectionId?: string): WizardState {
  return {
    step: prefilledConnectionId ? 2 : 1,
    connectionId: prefilledConnectionId ?? null,
    accountId: "",
    displayName: "",
    submitting: false,
    error: null,
    createdBindingId: null,
  };
}
```

(Remover campo `webhookConfirmed` do state.)

`wizardReducer` perde os actions de webhook:

```typescript
type WizardAction =
  | { type: "set_connection"; connectionId: string | null }
  | { type: "set_account_id"; value: string }
  | { type: "set_display_name"; value: string }
  | { type: "next" }
  | { type: "back" }
  | { type: "submit_start" }
  | { type: "submit_success"; bindingId: string }
  | { type: "submit_error"; error: string }
  | { type: "reset" };
```

`canAdvance`:

```typescript
const canAdvance =
  state.step === 1
    ? isValidStep1
    : state.step === 2
      ? isValidStep2
      : false;
```

`handleFinalize` movido para Step 2 (botão Finalizar lá em vez de Próximo):

```tsx
{state.step < 2 ? (
  <Button onClick={() => dispatch({ type: "next" })} disabled={!canAdvance}>
    Próximo
  </Button>
) : (
  <Button onClick={handleFinalize} disabled={!canAdvance}>
    Finalizar
  </Button>
)}
```

Render do Step 3 → Step 3 vira o "Conclusão" (antes era Step 4):

```tsx
{state.step === 3 && state.connectionId ? (
  <StepDone
    connectionId={state.connectionId}
    displayName={state.displayName}
    onReset={() => dispatch({ type: "reset" })}
  />
) : null}
```

**Remover** completamente a função `StepWebhook` e a constante `CHATWOOT_WEBHOOK_EVENTS`. Remover useMemo `webhookUrl`.

`StepDone` substitui o link `?tab=tempo-real` por `?tab=sincronizacao` (vamos renomear na E7).

Stepper: condicionar render quando `prefilledConnectionId` (se for, mostrar texto "Etapa 1 de 2: Identidade" ao invés do stepper visual):

```tsx
{prefilledConnectionId ? (
  <p className="text-xs text-muted-foreground">
    Etapa {state.step === 2 ? 1 : 2} de 2
  </p>
) : (
  <Stepper current={state.step} />
)}
```

- [ ] **Step 3: Atualizar testes**

Em `onboarding-wizard.test.tsx`:
- Remover testes que referenciam `StepWebhook`, `webhook_confirmed`, `Já cadastrei o webhook`, copy URL.
- Adicionar:

```typescript
it("quando prefilledConnectionId, pula direto para Step Identidade", () => {
  render(
    <OnboardingWizard
      connections={[{ id: "c1", name: "Padrão", status: "active" } as never]}
      onClose={jest.fn()}
      prefilledConnectionId="c1"
    />
  );
  expect(screen.getByText(/Identidade da empresa/i)).toBeInTheDocument();
  expect(screen.queryByText(/Escolher conexão/i)).not.toBeInTheDocument();
});

it("após Identidade preenchida, botão Finalizar fecha fluxo", async () => {
  const createMock = createCompanyChatBinding as jest.Mock;
  createMock.mockResolvedValue({ success: true, data: { id: "b1" } });

  render(<OnboardingWizard connections={[{ id: "c1", name: "P", status: "active" } as never]} onClose={jest.fn()} prefilledConnectionId="c1" />);

  await userEvent.type(screen.getByLabelText(/Account ID/i), "9");
  await userEvent.type(screen.getByLabelText(/Nome de exibição/i), "Matrix");
  await userEvent.click(screen.getByRole("button", { name: /Finalizar/i }));

  expect(createMock).toHaveBeenCalledWith({
    connectionId: "c1",
    chatwootAccountId: 9,
    displayName: "Matrix",
    enabled: true,
  });
});
```

- [ ] **Step 4: Rodar testes**

```bash
npm test -- src/components/settings/nexus-chat/wizard/__tests__/onboarding-wizard.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/nexus-chat/wizard/onboarding-wizard.tsx src/components/settings/nexus-chat/wizard/__tests__/onboarding-wizard.test.tsx
git commit -m "feat(ui): D3 v0.41 — wizard SEM Step Webhook + prop prefilledConnectionId pula Step Conexão (3 steps fora / 2 steps dentro)"
```

---

### Task D4: bancos-de-dados/page.tsx (raiz) — remove botão Cadastrar empresa

**Files:**
- Modify: `src/app/(protected)/bancos-de-dados/page.tsx`

- [ ] **Step 1: Editar page.tsx**

Localizar `<OnboardingWizardLauncher>` no header e remover. Remover import.

- [ ] **Step 2: Validar typecheck**

- [ ] **Step 3: Commit**

```bash
git add src/app/(protected)/bancos-de-dados/page.tsx
git commit -m "feat(ui): D4 v0.41 — remove botão 'Cadastrar empresa' do topo de /bancos-de-dados (agora só dentro de uma conexão)"
```

---

## Fase E — UI Overhaul (telas reformuladas)

### Task E1: connection-list.tsx — reconstrói card como linha clicável inteira

**Files:**
- Modify: `src/components/settings/nexus-chat/connection-list.tsx`
- Modify/Create: `src/components/settings/nexus-chat/__tests__/connection-list.test.tsx`

- [ ] **Step 1: SUB-SKILL ui-ux-pro-max OBRIGATÓRIA**

UX confirmado (resposta João):
- **Linha inteira clicável** → navega para `/bancos-de-dados/[id]`
- Tag "X empresas" à direita (já existe)
- 3 ícones: **Activity** (testar — substitui TestTube que ele odiou), **Edit2** (editar), **Trash2** (apagar)
- Ícones com `stopPropagation` no onClick para não navegar quando clica neles
- Status badge "Ativa/Pausada/Erro" (existe)
- Host masked (existe)
- Sem badge "Webhook configurado" (Webhook saiu)
- Sem botão "Abrir detalhes" (linha inteira clica)

- [ ] **Step 2: Reescrever `connection-list.tsx`**

Pontos-chave:
1. Remover toda a `WebhookBadge` e o uso dela.
2. Remover o link `<Link href="/bancos-de-dados/${c.id}">Abrir detalhes</Link>`.
3. Trocar `<li>` por `<Link>` (Next.js) que envolve todo o conteúdo:

```tsx
<li key={c.id}>
  <Link
    href={`/bancos-de-dados/${c.id}`}
    className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:gap-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    aria-label={`Abrir detalhes de ${c.name}`}
  >
    {/* identidade + tag empresas + ações */}
  </Link>
</li>
```

4. Para os botões de ação dentro do `<Link>`, usar `<button onClick={(e) => { e.preventDefault(); e.stopPropagation(); ... }}>` — `e.preventDefault()` impede a navegação do Link.

5. Substituir ícone TestTube por **Activity** (mais legível, batimento cardíaco):

```tsx
import { Activity, Edit2, Trash2 } from "lucide-react";

// no botão testar:
<Activity className="h-4 w-4" aria-hidden />
```

6. Atualizar `ConnectionListItem` interface:

```typescript
export interface ConnectionListItem {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  sslMode: string;
  applicationName: string;
  status: ConnectionStatus | string;
  lastTestAt: string | null;
  lastTestError: string | null;
  bindingsCount: number;
  pollingIntervalSeconds: number; // novo
  // webhookToken removido
}
```

- [ ] **Step 3: Atualizar test**

Em `connection-list.test.tsx`:
- Remover testes/asserções de `WebhookBadge`/`Webhook configurado`/`Abrir detalhes`.
- Adicionar:

```typescript
it("clique na linha inteira navega pra /bancos-de-dados/[id]", () => {
  render(<ConnectionList connections={[mock]} />);
  const link = screen.getByRole("link", { name: /Abrir detalhes de Padrão/i });
  expect(link).toHaveAttribute("href", "/bancos-de-dados/conn-1");
});

it("botão testar não navega (stopPropagation)", async () => {
  render(<ConnectionList connections={[mock]} />);
  const testBtn = screen.getByRole("button", { name: /Testar conexão/i });
  expect(testBtn).toBeInTheDocument();
  // verifica que o botão tem evento que para propagação
  await userEvent.click(testBtn);
  expect(testNexusChatConnection).toHaveBeenCalled();
  // navegação não dispara (mock useRouter.push)
});
```

- [ ] **Step 4: Rodar testes**

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/nexus-chat/connection-list.tsx src/components/settings/nexus-chat/__tests__/connection-list.test.tsx
git commit -m "feat(ui): E1 v0.41 — connection-list reconstruído (linha inteira clicável, ícone Activity, sem WebhookBadge, sem 'Abrir detalhes' redundante)"
```

---

### Task E2: connection-detail-tabs.tsx — renomeia chave tempo-real → sincronizacao

**Files:**
- Modify: `src/components/settings/nexus-chat/connection-detail-tabs.tsx`

- [ ] **Step 1: SUB-SKILL ui-ux-pro-max**

Label confirmado: "Sincronização" (em vez de "Tempo real"). Ícone permanece `Radio` (sinaliza fluxo contínuo).

- [ ] **Step 2: Editar**

```diff
-type TabKey = "conexao" | "tempo-real" | "jobs" | "saude";
-const TAB_KEYS: TabKey[] = ["conexao", "tempo-real", "jobs", "saude"];
+type TabKey = "conexao" | "sincronizacao" | "jobs" | "saude";
+const TAB_KEYS: TabKey[] = ["conexao", "sincronizacao", "jobs", "saude"];
```

```diff
-const TempoRealTab = dynamic(
-  () => import("./tabs/tempo-real-tab").then((m) => m.TempoRealTab),
+const SincronizacaoTab = dynamic(
+  () => import("./tabs/sincronizacao-tab").then((m) => m.SincronizacaoTab),
   { loading: () => <TabSkeleton />, ssr: false },
 );
```

```diff
-<TabsTrigger value="tempo-real">
-  <Radio className="mr-1.5 h-3.5 w-3.5" aria-hidden />
-  Tempo real
-</TabsTrigger>
+<TabsTrigger value="sincronizacao">
+  <Radio className="mr-1.5 h-3.5 w-3.5" aria-hidden />
+  Sincronização
+</TabsTrigger>
```

```diff
-<TabsContent value="tempo-real" className="mt-4">
-  <TempoRealTab connectionId={connection.id} lastWebhookAt={connection.lastWebhookAt} />
+<TabsContent value="sincronizacao" className="mt-4">
+  <SincronizacaoTab connectionId={connection.id} lastSyncAt={connection.lastSyncAt} />
 </TabsContent>
```

E atualizar `ConnectionDetailData`:

```diff
- lastWebhookAt: string | null;
- webhookToken: string | null;
+ lastSyncAt: string | null;
+ pollingIntervalSeconds: number;
```

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/nexus-chat/connection-detail-tabs.tsx
git commit -m "feat(ui): E2 v0.41 — connection-detail-tabs renomeia tempo-real → sincronizacao (ícone Radio mantido) + ajusta ConnectionDetailData"
```

---

### Task E3: sincronizacao-tab.tsx — substitui tempo-real-tab

**Files:**
- Create: `src/components/settings/nexus-chat/tabs/sincronizacao-tab.tsx`
- Delete: `src/components/settings/nexus-chat/tabs/tempo-real-tab.tsx`
- Create: `src/components/settings/nexus-chat/__tests__/sincronizacao-tab.test.tsx`

- [ ] **Step 1: SUB-SKILL ui-ux-pro-max**

UX confirmado:
- 4 KPI cards: **Última sync** (lag formatado), **Runs última 1h** (estimativa), **Erros 24h** (sync_failed), **Throughput** (rows sincronizadas última hora — cap stratagem do que conseguimos derivar).
- Lista de runs recentes (até 200): timestamp, badge ação (success/failed), tabela mais ativa, durationMs.
- Botão Pause/Play do polling da UI (5s pra refresh — não confundir com `pollingIntervalSeconds` da connection).
- Empty state quando 0 runs: "Nenhuma sync registrada nas últimas 24h. Verifique se o worker está rodando."

- [ ] **Step 2: Implementar (~250 linhas)**

```typescript
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Inbox,
  Loader2,
  Pause,
  Play,
  Radio,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listRecentSyncRuns,
  type SyncRunEvent,
} from "@/lib/actions/nexus-chat/sync-stream";

const POLL_INTERVAL_MS = 5000;

export function SincronizacaoTab(props: {
  connectionId: string;
  lastSyncAt: string | null;
}) {
  const { connectionId, lastSyncAt } = props;
  const [events, setEvents] = useState<SyncRunEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEvents = useCallback(
    async (isInitial: boolean) => {
      if (!isInitial) setRefreshing(true);
      const result = await listRecentSyncRuns({ connectionId, limit: 200 });
      if (result.success && result.data) {
        setEvents(result.data);
        setError(null);
      } else {
        setError(result.error ?? "Falha ao carregar runs.");
      }
      if (isInitial) setInitialLoading(false);
      setRefreshing(false);
    },
    [connectionId],
  );

  useEffect(() => { fetchEvents(true); }, [fetchEvents]);
  useEffect(() => {
    if (paused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => fetchEvents(false), POLL_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [paused, fetchEvents]);

  const kpis = useMemo(() => deriveKpis(events, lastSyncAt), [events, lastSyncAt]);

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3" data-tour="sincronizacao-header">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-violet-500" aria-hidden />
          <h2 className="text-sm font-medium">Sincronização em curso</h2>
          {refreshing && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <Button variant="outline" size="sm" onClick={() => setPaused(p => !p)}>
          {paused ? <><Play className="h-3.5 w-3.5" /> Retomar</> : <><Pause className="h-3.5 w-3.5" /> Pausar</>}
        </Button>
      </header>

      <KpiGrid kpis={kpis} loading={initialLoading} />

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      )}

      <RunList events={events} loading={initialLoading} />
    </div>
  );
}

interface Kpis {
  lastSyncLabel: string;
  lastSyncTone: "emerald" | "amber" | "rose" | "zinc";
  runsLastHour: number;
  errorsLast24h: number;
  rowsLastHour: number;
}

function deriveKpis(events: SyncRunEvent[], lastSyncAt: string | null): Kpis {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60_000;
  const oneDayAgo = now - 24 * 60 * 60_000;

  let runsLastHour = 0;
  let errorsLast24h = 0;
  let rowsLastHour = 0;

  for (const ev of events) {
    const ts = Date.parse(ev.createdAt);
    if (Number.isNaN(ts)) continue;
    if (ev.action === "polling_sync_completed" && ts >= oneHourAgo) {
      runsLastHour += 1;
      const rowsByTable = ev.details?.rowsByTable as Array<{ rows: number }> | undefined;
      if (rowsByTable) rowsLastHour += rowsByTable.reduce((s, r) => s + (r.rows ?? 0), 0);
    }
    if (ev.action === "polling_sync_failed" && ts >= oneDayAgo) errorsLast24h += 1;
  }

  const { label, tone } = formatLastSync(lastSyncAt);
  return { lastSyncLabel: label, lastSyncTone: tone, runsLastHour: runsLastHour * 100 /* sample */, errorsLast24h, rowsLastHour: rowsLastHour * 100 };
}

function formatLastSync(iso: string | null): { label: string; tone: "emerald" | "amber" | "rose" | "zinc" } {
  if (!iso) return { label: "Sem registro", tone: "zinc" };
  const lagMin = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (lagMin < 1) return { label: "agora", tone: "emerald" };
  if (lagMin < 5) return { label: `há ${lagMin} min`, tone: "emerald" };
  if (lagMin < 30) return { label: `há ${lagMin} min`, tone: "amber" };
  return { label: `há ${lagMin} min`, tone: "rose" };
}

const TONE: Record<string, { value: string; bullet: string }> = {
  emerald: { value: "text-emerald-500", bullet: "bg-emerald-500" },
  amber: { value: "text-amber-500", bullet: "bg-amber-500" },
  rose: { value: "text-rose-500", bullet: "bg-rose-500" },
  violet: { value: "text-violet-500", bullet: "bg-violet-500" },
  zinc: { value: "text-muted-foreground", bullet: "bg-zinc-400" },
};

function KpiGrid({ kpis, loading }: { kpis: Kpis; loading: boolean }) {
  if (loading) {
    return <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;
  }
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-tour="sincronizacao-kpis">
      <KpiCard label="Última sync" value={kpis.lastSyncLabel} tone={kpis.lastSyncTone} />
      <KpiCard label="Runs última 1h" value={kpis.runsLastHour.toString()} tone="violet" />
      <KpiCard label="Erros 24h" value={kpis.errorsLast24h.toString()} tone={kpis.errorsLast24h > 0 ? "rose" : "emerald"} />
      <KpiCard label="Linhas sync 1h" value={kpis.rowsLastHour.toString()} tone="violet" />
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone: keyof typeof TONE }) {
  const c = TONE[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${c.bullet}`} aria-hidden />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`mt-2 font-heading text-2xl font-semibold tabular-nums ${c.value}`}>{value}</p>
    </div>
  );
}

const ACTION_BADGE: Record<string, { label: string; classes: string }> = {
  polling_sync_completed: { label: "Concluído", classes: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  polling_sync_failed: { label: "Falhou", classes: "bg-rose-500/10 text-rose-500 border-rose-500/20" },
  polling_full_sweep_started: { label: "Sweep iniciado", classes: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
  polling_full_sweep_completed: { label: "Sweep concluído", classes: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
  polling_interval_updated: { label: "Intervalo alterado", classes: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
};

function RunList({ events, loading }: { events: SyncRunEvent[]; loading: boolean }) {
  if (loading) return <div className="grid gap-2 rounded-xl border border-border bg-card p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground/50" aria-hidden />
        <h3 className="text-sm font-medium">Sem runs registrados</h3>
        <p className="max-w-md text-xs text-muted-foreground">
          Nenhuma sincronização foi registrada nas últimas 24h. Se isso persistir, verifique se o worker BullMQ está rodando.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" data-tour="sincronizacao-runs">
      <ul className="divide-y divide-border">
        {events.map((ev) => {
          const badge = ACTION_BADGE[ev.action] ?? { label: ev.action, classes: "bg-muted text-muted-foreground border-border" };
          const ts = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(ev.createdAt));
          return (
            <li key={ev.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-xs hover:bg-muted/50">
              <span className="w-[8.5rem] shrink-0 font-mono tabular-nums text-muted-foreground">{ts}</span>
              <Badge variant="outline" className={`text-[11px] ${badge.classes}`}>{badge.label}</Badge>
              {typeof ev.details?.durationMs === "number" && (
                <span className="font-mono text-muted-foreground">{ev.details.durationMs}ms</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Deletar tempo-real-tab.tsx**

```bash
git rm src/components/settings/nexus-chat/tabs/tempo-real-tab.tsx
```

- [ ] **Step 4: Criar test sincronizacao-tab.test.tsx** (1 sanity test)

- [ ] **Step 5: Rodar testes**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): E3 v0.41 — sincronizacao-tab.tsx (substitui tempo-real-tab; KPIs polling-aware; lista polling_* events; pause/play)"
```

---

### Task E4: jobs-panel.tsx — aceita prop connectionId

**Files:**
- Modify: `src/components/settings/jobs-panel.tsx`
- Modify: `src/lib/actions/jobs.ts`

- [ ] **Step 1: Editar `src/lib/actions/jobs.ts`**

Adicionar `connectionId?: string` opcional em `getJobsStatus`, `triggerRefresh`, `triggerBackfill`, e filtrar pelas accountIds dessa connection se passado.

- [ ] **Step 2: Editar `jobs-panel.tsx`**

```typescript
interface JobsPanelProps {
  initialStatus: { rows: JobsStatusRow[] } | null;
  initialError?: string | null;
  connectionId?: string; // NOVO
}
```

Passar `connectionId` em `getJobsStatus({ connectionId })`/`triggerRefresh({ ..., connectionId })` etc.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/jobs-panel.tsx src/lib/actions/jobs.ts
git commit -m "feat(ui): E4 v0.41 — jobs-panel aceita prop connectionId; filtra rows e ações por connection"
```

---

### Task E5: jobs-tab.tsx — embute JobsPanel filtrado

**Files:**
- Modify: `src/components/settings/nexus-chat/tabs/jobs-tab.tsx`

- [ ] **Step 1: SUB-SKILL ui-ux-pro-max**

UX: substituir o placeholder atual por `<JobsPanel connectionId={connectionId} />` direto. Remover Link externo. Header explicativo curto.

- [ ] **Step 2: Reescrever**

```tsx
"use client";

import { Settings2 } from "lucide-react";
import { JobsPanel } from "@/components/settings/jobs-panel";
import { getJobsStatus } from "@/lib/actions/jobs";
import { useEffect, useState } from "react";

export function JobsTab({ connectionId }: { connectionId: string }) {
  const [initial, setInitial] = useState<{ rows: never[] } | null>(null);

  useEffect(() => {
    getJobsStatus({ connectionId }).then((r) => {
      if (r.success && r.data) setInitial({ rows: r.data.rows as never });
    });
  }, [connectionId]);

  return (
    <div className="grid gap-4" data-tour="jobs-tab">
      <header className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-violet-500" aria-hidden />
        <h2 className="text-sm font-medium">Jobs de pré-agregação</h2>
      </header>
      <p className="text-xs text-muted-foreground" data-tour="jobs-tab-explainer">
        Os jobs de pré-agregação atualizam tabelas internas (chatwoot_facts_*) que alimentam os
        relatórios. Eles rodam automaticamente — você só precisa intervir se algum ficar com erro.
      </p>
      <JobsPanel initialStatus={initial} connectionId={connectionId} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/nexus-chat/tabs/jobs-tab.tsx
git commit -m "feat(ui): E5 v0.41 — jobs-tab embute JobsPanel filtrado por connectionId (sem mais Link externo)"
```

---

### Task E6: saude-tab.tsx — recontextualiza para polling

**Files:**
- Modify: `src/components/settings/nexus-chat/tabs/saude-tab.tsx`

- [ ] **Step 1: SUB-SKILL ui-ux-pro-max**

UX:
- 4 cards: **Heartbeat (Última sync)**, **Runs 24h** (sample-corrected), **Erros 24h**, **Jobs com erro 24h**.
- Substituir lista de audit webhook por audit polling (todos `polling_*`).
- Mantém `data-tour` attrs para tour da Saúde.

- [ ] **Step 2: Reescrever** — substituir referências `webhook_*` por `polling_*`, `lastWebhookAt` por `lastSyncAt`, `webhookEvents` por `syncEvents` (via `listRecentSyncRuns`).

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/nexus-chat/tabs/saude-tab.tsx
git commit -m "feat(ui): E6 v0.41 — saude-tab recontextualiza para polling (heartbeat=lastSyncAt; lista polling_* audits)"
```

---

### Task E7: conexao-tab.tsx — adiciona linha intervalo + ajusta layout

**Files:**
- Modify: `src/components/settings/nexus-chat/tabs/conexao-tab.tsx`

- [ ] **Step 1: SUB-SKILL ui-ux-pro-max**

UX: na linha de detalhes técnicos do header, **adicionar** "intervalo Ns" no fim. E, no card "Empresas vinculadas", adicionar botão "Cadastrar empresa" (substitui o launcher do header da página raiz que removemos):

```tsx
<header>
  <p>{host}:{port} · banco {database} · usuário {username} · SSL {sslMode} · intervalo {pollingIntervalSeconds}s</p>
</header>

<BindingsTable connectionId={...} bindings={...}>
  {/* prop nova `headerAction` */}
  headerAction={<OnboardingWizardLauncher prefilledConnectionId={connection.id} />}
</BindingsTable>
```

(Ou mais simples: renderizar o `<OnboardingWizardLauncher prefilledConnectionId={connection.id}>` sibling à BindingsTable.)

- [ ] **Step 2: Editar**

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/nexus-chat/tabs/conexao-tab.tsx
git commit -m "feat(ui): E7 v0.41 — conexao-tab mostra intervalo + botão 'Cadastrar empresa' (prefilledConnectionId) na seção empresas"
```

---

### Task E8: bancos-de-dados/[id]/page.tsx — passa pollingIntervalSeconds + lastSyncAt

**Files:**
- Modify: `src/app/(protected)/bancos-de-dados/[id]/page.tsx`

- [ ] **Step 1: Adicionar campos no select Prisma**

```typescript
const conn = await prisma.nexusChatConnection.findUnique({
  where: { id, deletedAt: null },
  select: {
    id: true, name: true, host: true, port: true, database: true, username: true,
    sslMode: true, applicationName: true, status: true, lastTestAt: true,
    lastTestError: true,
    pollingIntervalSeconds: true, // novo
    lastSyncAt: true, // novo
    createdAt: true,
    // remover: webhookToken, lastWebhookAt
  },
});
```

E ajustar `ConnectionDetailData` mapping correspondente.

- [ ] **Step 2: Commit**

```bash
git add src/app/(protected)/bancos-de-dados/[id]/page.tsx
git commit -m "feat(ui): E8 v0.41 — page detalhe seleciona pollingIntervalSeconds + lastSyncAt; remove webhookToken/lastWebhookAt"
```

---

## Fase F — Tour Interativo

### Task F1: TourTriggerButton — botão "?" reutilizável

**Files:**
- Create: `src/components/tour/tour-trigger-button.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour, type TourConfig } from "./tour-provider";

interface Props {
  config: TourConfig;
  label?: string;
}

/**
 * Botão "?" que dispara um tour. Use perto do título da tela.
 * Padrão visual: ghost icon button h-8 w-8, tooltip "Tour da tela".
 */
export function TourTriggerButton({ config, label = "Tour da tela" }: Props) {
  const { start } = useTour();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-violet-500"
      aria-label={label}
      title={label}
      onClick={() => start(config)}
    >
      <HelpCircle className="h-4 w-4" aria-hidden />
    </Button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tour/tour-trigger-button.tsx
git commit -m "feat(tour): F1 v0.41 — TourTriggerButton (botão ? reutilizável que dispara qualquer TourConfig)"
```

---

### Task F2-F6: Configs de tour por tela

5 arquivos novos, cada um exporta um `TourConfig`:

#### F2: `src/components/tour/tours/bancos-de-dados/lista.ts`

```typescript
import type { TourConfig } from "../../tour-provider";

export const listaTour: TourConfig = {
  id: "bancos-de-dados-lista",
  title: "Bancos de dados",
  steps: [
    {
      id: "intro",
      targetSelector: "[data-tour='lista-header']",
      title: "Bancos de dados",
      description: "Aqui você gerencia todas as conexões com instalações do Nexus Chat e as empresas vinculadas a cada uma.",
      placement: "bottom",
    },
    {
      id: "card",
      targetSelector: "[data-tour='lista-conn-card']",
      title: "Cada linha é uma conexão",
      description: "Clique em qualquer lugar da linha para abrir os detalhes. Use os ícones para testar, editar ou apagar a conexão.",
      placement: "bottom",
    },
    {
      id: "actions",
      targetSelector: "[data-tour='lista-actions']",
      title: "Ações rápidas",
      description: "Activity = testa a conexão (executa SELECT 1). Lápis = edita credenciais e intervalo. Lixeira = apaga (soft delete).",
      placement: "left",
    },
    {
      id: "new-connection",
      targetSelector: "[data-tour='lista-new-connection']",
      title: "Nova conexão",
      description: "Use quando precisar conectar a outra instalação do Nexus Chat (em outra VPS ou domínio).",
      placement: "left",
    },
  ],
};
```

#### F3: `conexao.ts` — tour da Aba Conexão (4 steps)
#### F4: `sincronizacao.ts` — tour da Aba Sincronização (4 steps explicando KPIs e lista)
#### F5: `jobs.ts` — tour da Aba Jobs (3 steps explicando o que jobs fazem)
#### F6: `saude.ts` — tour da Aba Saúde (3 steps explicando os 4 KPIs e audit)

Cada um segue o mesmo padrão. Subagent escreve direto.

- [ ] **Commits separados:**
  - `feat(tour): F2 v0.41 — listaTour (4 steps)`
  - `feat(tour): F3 v0.41 — conexaoTour (4 steps)`
  - `feat(tour): F4 v0.41 — sincronizacaoTour (4 steps)`
  - `feat(tour): F5 v0.41 — jobsTour (3 steps)`
  - `feat(tour): F6 v0.41 — saudeTour (3 steps)`

---

### Task F7: Adicionar TourTriggerButton + data-tour attrs nas telas

**Files:**
- Modify: `src/app/(protected)/bancos-de-dados/page.tsx` — adiciona `<TourTriggerButton config={listaTour} />` no header + `data-tour` atrs em `connection-list.tsx`
- Modify: `src/components/settings/nexus-chat/connection-detail-tabs.tsx` — adiciona `<TourTriggerButton>` por aba (4 ButtonsTrigger ou 1 dinâmico baseado em activeTab)
- Modify: `tabs/conexao-tab.tsx`, `sincronizacao-tab.tsx`, `jobs-tab.tsx`, `saude-tab.tsx` — adicionam `data-tour` atributos

- [ ] **Step 1: Editar conexao-tab.tsx**

```tsx
<header data-tour="conexao-header">...</header>
<BindingsTable data-tour="conexao-empresas">...</BindingsTable>
```

(Repetir o pattern para as outras tabs.)

- [ ] **Step 2: Em `connection-detail-tabs.tsx`** — adicionar botão de tour ao lado da `TabsList`:

```tsx
const TOUR_BY_TAB: Record<TabKey, TourConfig> = {
  conexao: conexaoTour,
  sincronizacao: sincronizacaoTour,
  jobs: jobsTour,
  saude: saudeTour,
};

<div className="flex items-center gap-2">
  <TabsList>...</TabsList>
  <TourTriggerButton config={TOUR_BY_TAB[activeTab]} />
</div>
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(tour): F7 v0.41 — TourTriggerButton em /bancos-de-dados (lista + 4 abas) + data-tour attrs nos elementos-alvo"
```

---

## Fase G — Documentação + Release

### Task G1: Deletar runbook webhook + criar runbook polling delta

- [ ] **Step 1:** `git rm docs/runbooks/webhook-nexus-chat.md`

- [ ] **Step 2:** Criar `docs/runbooks/polling-delta-sync.md` (escrever ~150 linhas: arquitetura, troubleshooting, comandos `bullmq:list`, "como pausar polling", "como mudar intervalo", "DELETE handling explicação", smoke test).

- [ ] **Step 3:** Commit `docs(runbook): G1 v0.41 — substitui webhook-nexus-chat.md por polling-delta-sync.md`

---

### Task G2: Atualizar CLAUDE.md §4.1 + pre-agregacao runbook

- [ ] **Step 1:** Editar `CLAUDE.md` §4.1: remover trecho "Pré-agregação de relatórios (v0.8.0+)" que menciona webhook; adicionar trecho de "Polling delta universal (v0.41+)".

- [ ] **Step 2:** Editar `docs/runbooks/pre-agregacao.md`: adicionar seção "Relação com polling delta" explicando que pré-agregação continua existindo mas é disparada agora pelo worker `chatwoot-sync-delta` (publish facts:refreshed) em vez de cron 5min.

- [ ] **Step 3:** Commit `docs: G2 v0.41 — CLAUDE.md §4.1 + pre-agregacao.md mencionam polling delta`

---

### Task G3: CHANGELOG + bump versão + agent file update

- [ ] **Step 1:** Editar `package.json`: `"version": "0.40.0"` → `"0.41.0"`.

- [ ] **Step 2:** Editar `CHANGELOG.md`: adicionar entrada `## v0.41.0 — Polling Delta + UX Overhaul (2026-05-04)` com bullets de tudo que mudou.

- [ ] **Step 3:** Atualizar `docs/agents/active/claude-polling-delta-overhaul.md`: status `review`.

- [ ] **Step 4:** Commit `chore(release): G3 v0.41 — bump 0.41.0 + CHANGELOG + agent status review`.

---

### Task G4: Smoke local

- [ ] **Step 1:** `npm run typecheck` → zero erros.
- [ ] **Step 2:** `npm test` → todos verde.
- [ ] **Step 3:** `npm run dev` + abrir `http://localhost:3000/bancos-de-dados`, validar manualmente:
  - Linha de conexão clicável.
  - Edit Connection sem webhook + com campo intervalo.
  - Aba Sincronização carregando (vai estar vazia se worker não rodando local — OK).
  - Aba Jobs com painel embutido.
  - Aba Saúde com cards corretos.
  - Wizard sem Step Webhook.
  - Botão "?" abre tour em cada tela.

---

### Task G5: Release commit + push + monitor CI

- [ ] **Step 1:** `git push origin main`
- [ ] **Step 2:** `gh run watch` → até build success.
- [ ] **Step 3:** Smoke production: `curl https://insights.nexusai360.com/api/health` → status ok, version 0.41.0.
- [ ] **Step 4:** Login + abrir `/bancos-de-dados` em produção. Validar mesmas 7 itens da Task G4 Step 3.
- [ ] **Step 5:** Commit `docs(agents): registra v0.41.0 LIVE em produção + encerra sessão`. Move `claude-polling-delta-overhaul.md` para deletar (ou marca status `done`). Append em `HISTORY.md`.

---

## Apêndice A — SQL exato de cada table-sync (B4-B12)

> A tabela messages, dependendo da versão do Chatwoot, pode não ter `account_id` direto — então JOIN com `conversations`. Subagent valida no Postgres do Chatwoot via `\d messages` antes de implementar; se tiver, query simplifica.

### B4 messages (cursor updated_at)
```sql
SELECT m.id, m.account_id, m.conversation_id, m.message_type, m.content, m.private, m.created_at, m.updated_at
FROM messages m
WHERE m.account_id = $1 AND m.updated_at > $2
ORDER BY m.updated_at ASC LIMIT $3
```
*Fallback se `messages.account_id` não existir:*
```sql
SELECT m.id, c.account_id, m.conversation_id, m.message_type, m.content, m.private, m.created_at, m.updated_at
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
WHERE c.account_id = $1 AND m.updated_at > $2
ORDER BY m.updated_at ASC LIMIT $3
```

### B5 inboxes (cursor updated_at)
```sql
SELECT id, account_id, name, channel_type, created_at, updated_at FROM inboxes WHERE account_id = $1 AND updated_at > $2 ORDER BY updated_at ASC LIMIT $3
```

### B6 teams
```sql
SELECT id, account_id, name, description, allow_auto_assign, created_at, updated_at FROM teams WHERE account_id = $1 AND updated_at > $2 ORDER BY updated_at ASC LIMIT $3
```

### B7 team_members (cursor id — sem updated_at)
```sql
SELECT tm.id, tm.user_id, tm.team_id, t.account_id FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.account_id = $1 AND tm.id > $2 ORDER BY tm.id ASC LIMIT $3
```

### B8 users (cursor updated_at)
```sql
SELECT u.id, u.name, u.email, u.role, u.created_at, u.updated_at, au.account_id
FROM users u JOIN account_users au ON au.user_id = u.id
WHERE au.account_id = $1 AND u.updated_at > $2 ORDER BY u.updated_at ASC LIMIT $3
```

### B9 account_users
```sql
SELECT id, account_id, user_id, role, inviter_id, created_at, updated_at FROM account_users WHERE account_id = $1 AND updated_at > $2 ORDER BY updated_at ASC LIMIT $3
```

### B10 contacts
```sql
SELECT id, account_id, name, email, phone_number, created_at, updated_at FROM contacts WHERE account_id = $1 AND updated_at > $2 ORDER BY updated_at ASC LIMIT $3
```

### B11 reporting_events
```sql
SELECT id, account_id, name, value, conversation_id, user_id, event_start_time, event_end_time, created_at, updated_at FROM reporting_events WHERE account_id = $1 AND updated_at > $2 ORDER BY updated_at ASC LIMIT $3
```

### B12 taggings (cursor id)
```sql
SELECT tg.id, tg.tag_id, tg.taggable_id, tg.taggable_type, t.account_id
FROM taggings tg JOIN tags tag_def ON tag_def.id = tg.tag_id
JOIN conversations c ON c.id = tg.taggable_id AND tg.taggable_type = 'Conversation'
WHERE c.account_id = $1 AND tg.id > $2 ORDER BY tg.id ASC LIMIT $3
```

(Subagent ajusta cada uma para o schema real do Chatwoot da instalação Matrix antes de commitar a task.)

---

---

# Apêndice C — Tasks Atualizadas/Novas (v3 OVERRIDES)

> **REGRA:** Onde houver conflito entre uma Task neste Apêndice e a versão "antiga" no corpo do plan, **prevalece esta versão**. Subagents devem ler este Apêndice ANTES de iniciar qualquer task.

## Tasks Novas (não existem no corpo do plan)

### Task B0 (NOVA — vem antes da B1): Inspecionar schema Chatwoot

**Files:**
- Create (descartável): `scripts/inspect-chatwoot-schema.ts`

- [ ] **Step 1: Criar script de inspeção**

```typescript
// scripts/inspect-chatwoot-schema.ts — descartável após uso
import { queryNexusChat } from "@/lib/nexus-chat/pool";

const TABLES = [
  "conversations", "messages", "inboxes", "teams", "team_members",
  "users", "account_users", "contacts", "reporting_events", "taggings",
];

async function main() {
  // Pegar primeira conn ativa
  const { prisma } = await import("@/lib/prisma");
  const conn = await prisma.nexusChatConnection.findFirst({
    where: { deletedAt: null, status: "active" },
  });
  if (!conn) throw new Error("Nenhuma conn ativa");

  for (const t of TABLES) {
    const result = await queryNexusChat<{ column_name: string; data_type: string }>(
      conn.id,
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [t],
    );
    console.log(`\n=== ${t} ===`);
    for (const r of result.rows) {
      console.log(`  ${r.column_name}: ${r.data_type}`);
    }
    const hasUpdatedAt = result.rows.some((r) => r.column_name === "updated_at");
    const hasAccountId = result.rows.some((r) => r.column_name === "account_id");
    console.log(`  → updated_at: ${hasUpdatedAt ? "✓" : "✗"} | account_id: ${hasAccountId ? "✓" : "✗"}`);
  }
}

main().catch(console.error);
```

- [ ] **Step 2: Rodar**

```bash
npx tsx scripts/inspect-chatwoot-schema.ts
```

- [ ] **Step 3: Documentar output em `docs/runbooks/polling-delta-sync.md`**

Adicionar seção "Schema Chatwoot mapeado em 2026-05-04" com listagem de colunas por tabela.

- [ ] **Step 4: Atualizar Apêndice A do plan**

Para cada tabela, ajustar SQL exato baseado no que foi descoberto. Subagents que rodarem B4-B12 leem essa versão atualizada.

- [ ] **Step 5: Commit + cleanup**

```bash
git rm scripts/inspect-chatwoot-schema.ts
git add docs/runbooks/polling-delta-sync.md
git commit -m "chore(sync): B0 v0.41 — inspeciona schema Chatwoot e documenta colunas (script descartável)"
```

---

### Task BX0 (NOVA — vem antes da B1): Validar contract de useFactsRealtime

**Files:**
- Read: `src/hooks/useFactsRealtime.ts` (ou onde estiver)

- [ ] **Step 1: Localizar hook**

```bash
grep -rn "facts:refreshed\|useFactsRealtime" src/ --include="*.ts" --include="*.tsx" | head
```

- [ ] **Step 2: Ler código e validar contract**

Confirmar que aceita payload `{ type: "facts:refreshed", connectionId, accountId }`. Se exigir mais campos (ex: `event`, `payload`), documentar.

- [ ] **Step 3: Se contract for diferente, escrever fix**

Caso o hook espere o payload de webhook (`event`, `payload`, etc), simplificar pra aceitar só `{ type, connectionId, accountId }`. Servidor publishers serão atualizados em B14/BX1.

- [ ] **Step 4: Commit (se houver mudança)**

```bash
git add src/hooks/useFactsRealtime.ts
git commit -m "fix(hook): BX0 v0.41 — useFactsRealtime aceita payload simplificado {type, connectionId, accountId} (compat polling delta)"
```

Se nada mudou, sem commit; só documentar no agent file.

---

### Task BX1 (NOVA — substitui parte do B14): Integrar runDeltaSync com pré-agregação

**Files:**
- Modify: `src/lib/chatwoot/sync/run-delta-sync.ts` (extensão da B14)

- [ ] **Step 1: Localizar fila da pré-agregação existente**

```bash
grep -rn "Queue.*chatwoot-facts\|getRefreshQueue\|refresh-by-account" src/ | head
```

(Provavelmente em `src/worker/jobs/pre-agregacao/queue.ts` ou similar.)

- [ ] **Step 2: Editar `runDeltaSync` — substituir publish direto por enfileiramento**

Substituir o bloco de "publish facts:refreshed" no final do `runDeltaSync` por:

```typescript
// Para cada account com mudança real, enfileirar jobs de pré-agregação.
// Cada job, ao terminar, publica facts:refreshed (lógica existente em refresh-by-*.ts).
// Se nenhum job for enfileirado (0 mudanças), não publica nada.
import { getRefreshByAccountQueue, getRefreshByInboxQueue, /* etc */ } from "@/worker/jobs/pre-agregacao/queues";

for (const accountId of accountsChanged) {
  // Enfileirar 5 jobs (best effort — se queue não disponível, silenciar)
  await Promise.all([
    getRefreshByAccountQueue().add("delta-trigger", { connectionId, accountId }, { jobId: `delta-by-account:${connectionId}:${accountId}:${Date.now()}` }).catch(() => {}),
    getRefreshByInboxQueue().add("delta-trigger", { connectionId, accountId }).catch(() => {}),
    getRefreshByAgentQueue().add("delta-trigger", { connectionId, accountId }).catch(() => {}),
    getRefreshByTeamQueue().add("delta-trigger", { connectionId, accountId }).catch(() => {}),
    getHourlyByAccountQueue().add("delta-trigger", { connectionId, accountId }).catch(() => {}),
  ]);
}
```

(Adapte os imports baseado no que existe.)

- [ ] **Step 3: Atualizar test de `runDeltaSync` (B14)**

Em `__tests__/run-delta-sync.test.ts`:
- Remover assertions sobre `publishMock` direto.
- Adicionar mocks para as 5 queues e validar que `add` foi chamado para cada account com mudança.

- [ ] **Step 4: Rodar tests**

```bash
npm test -- src/lib/chatwoot/sync/__tests__/run-delta-sync.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/chatwoot/sync/run-delta-sync.ts src/lib/chatwoot/sync/__tests__/run-delta-sync.test.ts
git commit -m "feat(sync): BX1 v0.41 — runDeltaSync ENFILEIRA refresh-by-* (delta dispara pré-agregação) em vez de publicar facts:refreshed direto"
```

---

### Task BX2 (NOVA): Rebaixar cron pré-agregação 5min → 30min (fallback)

**Files:**
- Modify: arquivo de scheduler da pré-agregação (provavelmente `src/worker/jobs/pre-agregacao/scheduler.ts` ou `src/worker/index.ts`)

- [ ] **Step 1: Localizar**

```bash
grep -rn "pattern.*\*/5\|every.*5.*60\|chatwoot-facts.*scheduler\|refresh.*scheduler" src/ | head
```

- [ ] **Step 2: Trocar cron 5min → 30min**

Onde houver `{ pattern: "*/5 * * * *" }` ou `{ every: 5 * 60 * 1000 }`, trocar para `{ every: 30 * 60 * 1000 }` (30 min).

- [ ] **Step 3: Adicionar comentário explicando**

```typescript
// FALLBACK: pré-agregação rola a cada 30 min como rede de segurança.
// O gatilho real é runDeltaSync (que enfileira refresh-by-* on-demand).
// Reduzido de 5min → 30min para evitar overhead duplicado com polling delta.
```

- [ ] **Step 4: Commit**

```bash
git add src/worker/jobs/pre-agregacao/scheduler.ts
git commit -m "feat(worker): BX2 v0.41 — rebaixa cron pré-agregação 5min → 30min (fallback; gatilho real é runDeltaSync)"
```

---

### Task DX1 (NOVA): Atualizar `audits-table.tsx` (labels)

**Files:**
- Modify: `src/components/users/audits-table.tsx`

- [ ] **Step 1: Localizar labels webhook_***

```bash
grep -n "webhook_\|polling_" src/components/users/audits-table.tsx
```

- [ ] **Step 2: Remover labels webhook_***

Deletar todas as entradas de `ACTION_LABELS` (ou mapeamento equivalente) com chaves `webhook_*`.

- [ ] **Step 3: Adicionar labels polling_***

```typescript
polling_sync_completed: { label: "Sync OK", color: "emerald" },
polling_sync_failed: { label: "Sync falhou", color: "rose" },
polling_full_sweep_started: { label: "Sweep iniciado", color: "violet" },
polling_full_sweep_completed: { label: "Sweep OK", color: "violet" },
polling_interval_updated: { label: "Intervalo alterado", color: "amber" },
```

- [ ] **Step 4: Commit**

```bash
git add src/components/users/audits-table.tsx
git commit -m "fix(ui): DX1 v0.41 — audits-table.tsx remove labels webhook_* + add polling_* (consistente com novo enum)"
```

---

### Task F0 (NOVA): Validar TourOverlay placements

**Files:**
- Read: `src/components/tour/tour-overlay.tsx`

- [ ] **Step 1: Ler**

- [ ] **Step 2: Validar suporte aos 4 placements**

Confirmar que `placement` aceita `"top" | "bottom" | "left" | "right"` e renderiza corretamente.

- [ ] **Step 3: Se faltar suporte, implementar**

Adicionar lógica de positioning para os faltantes.

- [ ] **Step 4: Commit (se houve fix)**

```bash
git add src/components/tour/tour-overlay.tsx
git commit -m "fix(tour): F0 v0.41 — TourOverlay suporta 4 placements (top/bottom/left/right)"
```

---

### Task F8 (NOVA): Sanity tests dos tour configs

**Files:**
- Create: `src/components/tour/tours/bancos-de-dados/__tests__/configs.test.ts`

- [ ] **Step 1: Implementar**

```typescript
import { listaTour } from "../lista";
import { conexaoTour } from "../conexao";
import { sincronizacaoTour } from "../sincronizacao";
import { jobsTour } from "../jobs";
import { saudeTour } from "../saude";
import { editConnectionTour } from "../edit-connection";

const ALL_TOURS = [listaTour, conexaoTour, sincronizacaoTour, jobsTour, saudeTour, editConnectionTour];

describe("Tour configs", () => {
  it.each(ALL_TOURS.map((t) => [t.id, t]))("'%s' tem ID e ≥1 step", (_, tour) => {
    expect(tour.id).toBeTruthy();
    expect(tour.steps.length).toBeGreaterThan(0);
  });

  it.each(ALL_TOURS.map((t) => [t.id, t]))("'%s' tem todos targetSelectors no formato [data-tour=...]", (_, tour) => {
    for (const s of tour.steps) {
      expect(s.targetSelector).toMatch(/^\[data-tour=/);
    }
  });

  it("não há IDs de tour duplicados", () => {
    const ids = ALL_TOURS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Rodar testes**

- [ ] **Step 3: Commit**

```bash
git add src/components/tour/tours/bancos-de-dados/__tests__/configs.test.ts
git commit -m "test(tour): F8 v0.41 — 6 sanity tests para tour configs (id único, ≥1 step, targetSelectors válidos)"
```

---

### Task F9 (NOVA): editConnectionTour + botão "?" no Edit Dialog

**Files:**
- Create: `src/components/tour/tours/bancos-de-dados/edit-connection.ts`
- Modify: `src/components/settings/nexus-chat/connection-form-dialog.tsx`

- [ ] **Step 1: SUB-SKILL ui-ux-pro-max OBRIGATÓRIA**

- [ ] **Step 2: Criar `edit-connection.ts`**

```typescript
import type { TourConfig } from "../../tour-provider";

export const editConnectionTour: TourConfig = {
  id: "bancos-de-dados-edit-connection",
  title: "Editar conexão",
  steps: [
    { id: "name", targetSelector: "[data-tour='conn-form-name']", title: "Nome amigável", description: "Identifica a conexão na lista. Ex: 'VPS Cliente X' ou 'Padrão (legado)'.", placement: "bottom" },
    { id: "host-port", targetSelector: "[data-tour='conn-form-host']", title: "Host e Porta", description: "Endereço do banco Postgres do Nexus Chat. Padrão Postgres é porta 5432.", placement: "bottom" },
    { id: "credentials", targetSelector: "[data-tour='conn-form-credentials']", title: "Credenciais", description: "Banco, usuário e senha do Postgres. Recomendamos um usuário read-only. Senha é cifrada em repouso (AES-256-GCM).", placement: "right" },
    { id: "polling", targetSelector: "[data-tour='conn-form-polling']", title: "Intervalo de sincronização", description: "Frequência com que o Nexus Insights consulta o banco do Nexus Chat para detectar mudanças. Mínimo 20s. Padrão 30s.", placement: "left" },
  ],
};
```

- [ ] **Step 3: Adicionar `data-tour` attrs + botão "?" no dialog**

Em `connection-form-dialog.tsx`:
- Adicionar `data-tour="conn-form-name"` no `<div>` do campo Nome
- Adicionar `data-tour="conn-form-host"` no `<div>` Host/Porta
- Adicionar `data-tour="conn-form-credentials"` no `<div>` Banco/Usuário/Senha
- Adicionar `data-tour="conn-form-polling"` no `<div>` Intervalo
- No `DialogHeader`, ao lado do `DialogTitle`:
```tsx
<TourTriggerButton config={editConnectionTour} />
```

- [ ] **Step 4: Commit**

```bash
git add src/components/tour/tours/bancos-de-dados/edit-connection.ts src/components/settings/nexus-chat/connection-form-dialog.tsx
git commit -m "feat(tour): F9 v0.41 — editConnectionTour 4 steps + botão ? no Dialog Edit Connection + data-tour attrs"
```

---

### Task L-1 (NOVA): Card "Erros recentes" no Saúde tab

**Files:**
- Modify: `src/components/settings/nexus-chat/tabs/saude-tab.tsx`

- [ ] **Step 1: SUB-SKILL ui-ux-pro-max**

- [ ] **Step 2: Adicionar bloco abaixo dos 4 KPI cards**

```tsx
const recentErrors = events.filter((ev) => ev.action === "polling_sync_failed").slice(0, 5);

return (
  <>
    {/* ... KPI cards ... */}

    <div className="grid gap-2" data-tour="saude-erros">
      <h3 className="text-xs font-medium text-muted-foreground">Erros recentes (top 5)</h3>
      {recentErrors.length === 0 ? (
        <div className="rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          ✓ Nenhum erro de sync nas últimas 24h.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-rose-500/30 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Tabela</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentErrors.map((ev) => {
                const errors = (ev.details?.errors ?? []) as Array<{ tableName: string; error: string }>;
                const firstError = errors[0];
                return (
                  <TableRow key={ev.id}>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">{formatDateTime(ev.createdAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{firstError?.tableName ?? "—"}</TableCell>
                    <TableCell className="text-xs text-rose-500 truncate max-w-md">{(firstError?.error ?? "—").slice(0, 200)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>

    {/* ... audit logs gerais ... */}
  </>
);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/nexus-chat/tabs/saude-tab.tsx
git commit -m "feat(ui): L-1 v0.41 — saude-tab card 'Erros recentes' (top 5 polling_sync_failed; empty state OK quando 0)"
```

---

## Tasks SUBSTITUÍDAS (estas versões prevalecem sobre as do corpo do plan)

### Task A2 (SUBSTITUÍDA — agora 3 sub-tasks)

#### A2.0: Cleanup audit logs órfãos webhook (data migration BATCH)

**Files:**
- Create: `prisma/migrations/<auto-ts>_cleanup_audit_webhook/migration.sql`

- [ ] **Step 1:** `npx prisma migrate dev --create-only --name cleanup_audit_webhook`
- [ ] **Step 2: Editar `migration.sql` (vazio) e colocar:**
```sql
-- Cleanup: remove rows com enum values que serão dropados em A2.1.
-- Batch delete pra não travar lock em prod com >100k rows.
DO $$
DECLARE
  rows_deleted INT;
BEGIN
  LOOP
    DELETE FROM "audit_logs"
    WHERE "id" IN (
      SELECT "id" FROM "audit_logs"
      WHERE "action"::text LIKE 'webhook_%'
      LIMIT 1000
    );
    GET DIAGNOSTICS rows_deleted = ROW_COUNT;
    EXIT WHEN rows_deleted = 0;
  END LOOP;
END $$;
```
- [ ] **Step 3:** `npx prisma migrate dev` aplica.
- [ ] **Step 4: Commit** `feat(schema): A2.0 v0.41 — batch DELETE audit_logs com action webhook_*`

#### A2.1: Drop webhook fields + enum migration (DDL)

- [ ] **Step 1:** Editar `prisma/schema.prisma`:
  - Remover `webhookToken`, `webhookSecretEnc`, `lastWebhookAt` do modelo `NexusChatConnection`.
  - No enum `AuditAction`, remover os 6 valores `webhook_*`.
  - Adicionar 5 valores `polling_*` (sem `polling_sync_started` — não usado).
- [ ] **Step 2:** `npx prisma migrate dev --create-only --name drop_webhook_add_polling_audit`
- [ ] **Step 3:** Validar `migration.sql` gerado.
- [ ] **Step 4:** `npx prisma migrate dev`
- [ ] **Step 5: Commit** `feat(schema): A2.1 v0.41 — DROP webhook fields + AuditAction enum trade webhook_*→polling_*`

#### A2.2: Validação manual

- [ ] **Step 1:** `psql ... -c "\d+ audit_logs"` → confirma enum só polling_*.
- [ ] **Step 2:** `psql ... -c "\d+ nexus_chat_connections"` → confirma sem webhook_*.
- [ ] **Step 3:** Sem commit.

---

### Task B14 (SUBSTITUÍDA): runDeltaSync com probe + integração pré-agregação

**Files:**
- Create: `src/lib/chatwoot/sync/run-delta-sync.ts`
- Test: `src/lib/chatwoot/sync/__tests__/run-delta-sync.test.ts`

A versão final inclui:

1. **Probe `SELECT 1` antes do loop** (CC-3):
```typescript
try {
  await queryNexusChat(connectionId, "SELECT 1", []);
} catch (err) {
  return {
    connectionId, startedAt, finishedAt: new Date(),
    totalDurationMs: Date.now() - t0,
    perTable: [], errors: [{ tableName: "*probe*", accountId: 0, error: err instanceof Error ? err.message : String(err) }],
    hadChanges: false,
  };
}
```

2. **Validação connection ainda existe** (CC-5):
```typescript
const conn = await prisma.nexusChatConnection.findUnique({
  where: { id: connectionId, deletedAt: null },
  select: { id: true },
});
if (!conn) {
  return { /* zero summary */ };
}
```

3. **Enfileirar refresh-by-* em vez de publicar direto** (BX1 / CC-1):
Substituir o `publishRealtimeEvent` direto por enfileiramento dos 5 jobs de pré-agregação.

4. **Tests novos** (CC-4):
- Cenário probe falha → 1 erro, 0 table-syncs chamados.
- Cenário connection deletada → zero summary.
- Cenário conection ativa, probe OK, 1 mudança → 5 jobs enfileirados.

Subagent escreve a versão completa baseada no spec acima.

---

### Task B16 (SUBSTITUÍDA): processDeltaSyncJob com details enxuto

Em `delta-sync.ts`, substituir bloco audit completed por:

```typescript
} else if (Math.random() < 1 / AUDIT_SAMPLE_RATE) {
  await logAudit({
    action: "polling_sync_completed",
    targetType: "nexus_chat_connection",
    targetId: connectionId,
    details: {
      durationMs: summary.totalDurationMs,
      totalRows: summary.perTable.reduce((s, t) => s + t.rowsAffected, 0),
      topTables: summary.perTable
        .slice()
        .sort((a, b) => b.rowsAffected - a.rowsAffected)
        .slice(0, 3)
        .map((t) => ({ table: t.tableName, rows: t.rowsAffected })),
      hadChanges: summary.hadChanges,
    },
  }).catch(() => {});
}
```

---

### Task B18 (SUBSTITUÍDA — tests adicionados): Scheduler tick

Manter implementação igual, mas adicionar 3 tests:

```typescript
it("não enfileira conn pausada (status != active)", async () => {
  prismaMock.$queryRaw.mockResolvedValue([] as never); // SQL filtra status=active
  await tickDeltaSyncScheduler();
  expect(queueAddMock).not.toHaveBeenCalled();
});

it("não enfileira conn deletada", async () => {
  prismaMock.$queryRaw.mockResolvedValue([] as never); // SQL filtra deleted_at IS NULL
  await tickDeltaSyncScheduler();
  expect(queueAddMock).not.toHaveBeenCalled();
});

it("enfileira NULLS FIRST (conn nova com lastSyncAt=null)", async () => {
  prismaMock.$queryRaw.mockResolvedValue([{ id: "new-conn" }] as never);
  await tickDeltaSyncScheduler();
  expect(queueAddMock).toHaveBeenCalledWith(
    "delta-sync",
    { connectionId: "new-conn" },
    expect.objectContaining({ jobId: expect.stringMatching(/^delta:new-conn:/) }),
  );
});
```

---

### Task B19 (SUBSTITUÍDA): Worker registry com 2 queues + tz + JobScheduler

Em `src/worker/index.ts`:

```typescript
// Garantir TZ explícito
process.env.TZ = process.env.TZ ?? "America/Sao_Paulo";

import { Worker, Queue, JobScheduler } from "bullmq";
import { connection } from "./redis";
import { tickDeltaSyncScheduler } from "./jobs/chatwoot-sync/scheduler";
import { processDeltaSyncJob } from "./jobs/chatwoot-sync/delta-sync";
import { processFullSweepJob } from "./jobs/chatwoot-sync/full-sweep";
import { prisma } from "@/lib/prisma";

// 1. Worker delta-sync (concurrency 4)
new Worker("chatwoot-sync-delta", processDeltaSyncJob, { connection, concurrency: 4 })
  .on("failed", (job, err) => console.error("[delta-sync] failed:", job?.id, err.message));

// 2. Scheduler do delta-sync via BullMQ (5s interval, idempotente)
const tickQueue = new Queue("chatwoot-sync-delta-tick", { connection });
const tickScheduler = new JobScheduler(tickQueue.name, { connection });
await tickScheduler.upsertJobScheduler(
  "delta-tick",
  { every: 5000 },
  { name: "tick", data: {} },
);
new Worker(tickQueue.name, async () => {
  await tickDeltaSyncScheduler();
}, { connection, concurrency: 1 });

// 3. Cron diário 03:00 BRT (queue separada)
const cronQueue = new Queue("chatwoot-sync-sweep-cron", { connection });
const cronScheduler = new JobScheduler(cronQueue.name, { connection });
await cronScheduler.upsertJobScheduler(
  "daily-full-sweep",
  { pattern: "0 3 * * *", tz: "America/Sao_Paulo" },
  { name: "dispatch", data: {} },
);
new Worker(cronQueue.name, async () => {
  // Dispatcher: enfileira 1 sweep job por connection ativa
  const conns = await prisma.nexusChatConnection.findMany({
    where: { deletedAt: null, status: "active" },
    select: { id: true },
  });
  const sweepQueue = new Queue("chatwoot-sync-sweep", { connection });
  for (const c of conns) {
    await sweepQueue.add("sweep-conn", { connectionId: c.id });
  }
}, { connection, concurrency: 1 });

// 4. Worker dos sweep jobs filhos (queue separada)
new Worker("chatwoot-sync-sweep", processFullSweepJob, { connection, concurrency: 1 })
  .on("failed", (job, err) => console.error("[full-sweep] failed:", job?.id, err.message));
```

---

### Task C1 (SUBSTITUÍDA): connections.ts com pollingIntervalSeconds

Substituições no `ConnectionInputSchema`:

```typescript
const ConnectionInputSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(100),
  host: z.string().min(1, "Host obrigatório").max(255),
  port: z.number().int().min(1).max(65535).default(5432),
  database: z.string().min(1, "Banco obrigatório").max(100),
  username: z.string().min(1, "Usuário obrigatório").max(100),
  password: z.string().max(500),
  sslMode: SslModeSchema.default("prefer"),
  applicationName: z.string().max(100).default("nexus-insights"),
  pollingIntervalSeconds: z.number().int().min(20).max(86400).default(30), // NOVO
});
```

Em `createNexusChatConnection`/`updateNexusChatConnection.data` Prisma, adicionar:
```typescript
pollingIntervalSeconds: parsed.data.pollingIntervalSeconds,
```

Adicionar 4o test em `updateConnectionPollingInterval`:

```typescript
it("rejeita user não super_admin", async () => {
  getCurrentUserMock.mockResolvedValue({ platformRole: "manager" });
  const r = await updateConnectionPollingInterval("conn-1", 30);
  expect(r.success).toBe(false);
  expect(r.error).toContain("super_admin");
});
```

E comentário em `updateConnectionPollingInterval`:
```typescript
/**
 * ...
 * NOTA: A mudança é detectada pelo scheduler no próximo tick (≤5s).
 * Não invalida pool nem rota de leitura — não publica Pub/Sub.
 */
```

---

### Task D3 (SUBSTITUÍDA): Wizard com prefilled

Quando `prefilledConnectionId`:
- `STEP_LABELS` vira `["Identidade", "Conclusão"]` (2 entries).
- Stepper **não** é renderizado.
- Header mostra `<p className="text-xs text-muted-foreground">Etapa {state.step === 2 ? 1 : 2} de 2</p>`.

Ajustar `INITIAL_STATE`:
```typescript
function makeInitialState(prefilledConnectionId?: string): WizardState {
  return {
    step: prefilledConnectionId ? 2 : 1,
    connectionId: prefilledConnectionId ?? null,
    accountId: "",
    displayName: "",
    submitting: false,
    error: null,
    createdBindingId: null,
  };
}
```

(Sem campo `webhookConfirmed`.)

---

### Task E1 (SUBSTITUÍDA — checklist data-tour adicionado)

Após reescrita, adicionar `data-tour` attrs:
- [ ] `<section data-tour="lista-header">` no wrapper do header
- [ ] `<Link data-tour="lista-conn-card">` no primeiro Link de connection
- [ ] `<div data-tour="lista-actions">` no wrapper dos 3 ícones
- [ ] `<Button data-tour="lista-new-connection">` no botão Nova Conexão

E adicionar `<TourTriggerButton config={listaTour} />` no header.

Test mocks adicionais:
```typescript
const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: jest.fn() }),
}));

it("clique no botão Testar não dispara navegação (stopPropagation)", async () => {
  // ... render
  await userEvent.click(screen.getByRole("button", { name: /Testar conexão/i }));
  expect(pushMock).not.toHaveBeenCalled();
});
```

---

### Task E3 (SUBSTITUÍDA — checklist + fakeTimers)

Adicionar `data-tour` attrs:
- [ ] `<header data-tour="sincronizacao-header">`
- [ ] `<div data-tour="sincronizacao-kpis">` no wrapper KpiGrid
- [ ] `<div data-tour="sincronizacao-runs">` no wrapper RunList

Adicionar texto explicativo (MM-1):
```tsx
<p className="text-xs text-muted-foreground">
  Esta tela atualiza a cada 5s. O worker faz o sync efetivo a cada {pollingIntervalSeconds}s
  (configurável na Aba Conexão).
</p>
```

(Aceita prop `pollingIntervalSeconds` adicionada ao componente.)

Test config:
```typescript
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
```

---

### Task E5 (SUBSTITUÍDA): SSR-first

Em `bancos-de-dados/[id]/page.tsx`:
```typescript
const initialJobsStatus = await getJobsStatus({ connectionId: conn.id });

return <ConnectionDetailTabs connection={...} bindings={...} initialJobsStatus={initialJobsStatus} />;
```

`ConnectionDetailTabs` aceita prop e passa adiante para `<JobsTab initialStatus={initialJobsStatus} />`.

`JobsTab` não faz fetch initial — só passa pra `<JobsPanel initialStatus={initialStatus} connectionId={connectionId} />`.

`JobsPanel` mantém polling 5s.

Adicionar empty state melhorado quando `connectionId` setado e 0 rows:
```tsx
<p className="text-xs text-muted-foreground">
  Nenhum job registrado ainda para esta conexão. Os jobs aparecem após
  o primeiro polling delta detectar mudanças.
</p>
```

---

### Task E6 (SUBSTITUÍDA — recontextualização polling + L-1)

Já incluso na Task L-1 (acima): card "Erros recentes" + KPIs polling-aware + sample correction.

Cards:
1. **Heartbeat** = `formatLag(snapshot.lastSyncLagMinutes)` (mesma função, semântica nova)
2. **Runs 24h (est.)** = `snapshot.syncRunsLast24h` (já × 100 no health-metrics)
3. **Erros 24h** = `snapshot.syncErrorsLast24h`
4. **Jobs com erro 24h** = `snapshot.jobErrorsLast24h`

Lista `Audit logs recentes` filtra `polling_*` em vez de `webhook_*`.

---

### Task F7 (SUBSTITUÍDA): TourTriggerButton com activeTab

Em `connection-detail-tabs.tsx`, dentro do componente que já tem `activeTab` calculado:

```tsx
import { TourTriggerButton } from "@/components/tour/tour-trigger-button";
import { conexaoTour } from "@/components/tour/tours/bancos-de-dados/conexao";
import { sincronizacaoTour } from "@/components/tour/tours/bancos-de-dados/sincronizacao";
import { jobsTour } from "@/components/tour/tours/bancos-de-dados/jobs";
import { saudeTour } from "@/components/tour/tours/bancos-de-dados/saude";

const TOUR_BY_TAB: Record<TabKey, TourConfig> = {
  conexao: conexaoTour,
  sincronizacao: sincronizacaoTour,
  jobs: jobsTour,
  saude: saudeTour,
};

return (
  <Tabs value={activeTab} ...>
    <div className="flex items-center justify-between gap-2">
      <TabsList variant="line" ...>
        <TabsTrigger value="conexao">
          <span data-tour="aba-conexao"><Database /> Conexão</span>
        </TabsTrigger>
        {/* idem pros outros, com span data-tour="aba-X" */}
      </TabsList>
      <TourTriggerButton config={TOUR_BY_TAB[activeTab]} />
    </div>
    {/* TabsContent ... */}
  </Tabs>
);
```

---

### Task G3↔G4 (REORDENADO)

Ordem correta:
- G4 — Smoke local (incluindo `npm run worker` em paralelo a `npm run dev`)
- G3 — Bump versão + CHANGELOG + agent file update
- G5 — Push + monitor CI + smoke prod

---

## Erratas Globais

### Task D1 (ATUALIZADO): rm -rf vs rmdir

Usar:
```bash
git rm src/app/api/webhooks/nexus-chat/[token]/route.ts
git rm src/app/api/webhooks/nexus-chat/[token]/__tests__/route.test.ts
git rm src/lib/nexus-chat/webhook-credentials.ts
git rm src/lib/nexus-chat/__tests__/webhook-credentials.test.ts
git rm src/lib/actions/nexus-chat/realtime-stream.ts
git rm src/lib/actions/nexus-chat/__tests__/realtime-stream.test.ts
rm -rf src/app/api/webhooks
```

### Task D4 (ATUALIZADO): atualizar Prisma select

Em `bancos-de-dados/page.tsx`, atualizar `select` para incluir `pollingIntervalSeconds: true` e remover `webhookToken: true`/`lastWebhookAt: true`. Atualizar mapping para `ConnectionListItem`.

### Task G1 (ATUALIZADO): runbook com checklist pós-deploy

Em `polling-delta-sync.md`, incluir:

```markdown
## Checklist Pós-Deploy

- [ ] `/api/health` retorna v0.41.0
- [ ] Login + abrir `/bancos-de-dados` (linha clicável funcional)
- [ ] Aba `/bancos-de-dados/[id]?tab=sincronizacao` mostra runs aparecendo dentro de 1 minuto
- [ ] **Pedir ao João:** acessar painel admin do Nexus Chat e **remover o webhook cadastrado** (endpoint dá 404 agora)
- [ ] Validar tour funcional em todas as 4 abas + lista raiz + Edit Dialog (clicar nos botões "?")

## SLA Esperado

- Latência fim-a-fim: ≤ pollingIntervalSeconds + ~10s pré-agregação ≈ 40-45s p99 (default 30s).
- Configurável: 20s mín → 80s pré-agregação overhead estimado p99.
```

### Task G2 (ATUALIZADO): pre-agregacao.md

Reescrever seção "Cron 5min" → "Gatilho híbrido":
- Cron 30 min (fallback)
- Gatilho real: `runDeltaSync` enfileirando jobs `refresh-by-*` quando há mudança detectada

### Task G4 (ATUALIZADO): smoke local com worker paralelo

Adicionar Step:
```
- [ ] Em terminal 1: `npm run dev`
- [ ] Em terminal 2: `npm run worker`
- [ ] Validar em terminal 2: log `[scheduler tick]` aparece a cada 5s
- [ ] Após 30s, validar `[delta-sync]` log para 1 conn ativa
```

---

**Fim do Apêndice C — v3 OVERRIDES**

**Status:** v3 final consolidado. Pronto para implementação via `superpowers:subagent-driven-development`.
