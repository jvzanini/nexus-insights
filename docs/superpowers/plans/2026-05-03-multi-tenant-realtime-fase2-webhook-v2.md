# Multi-tenant Realtime — Fase 2 (Webhook + Realtime universal) Implementation Plan

> **v2 — pente fino #1 aplicado (24 achados). Em pente fino #2.**
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o fluxo event-driven do Nexus Chat: endpoint webhook `/api/webhooks/nexus-chat/[token]` valida HMAC + rate limit + debounce, enfileira 4 jobs `refresh-by-*` e publica `facts:refreshed` no Pub/Sub. Hook `useFactsRealtime` montado em todas as 7 pages de relatório. Cron rebaixado para fallback 30 min. UI super_admin estendida para mostrar webhook URL + secret + regenerate.

**Architecture:** POST com body cru (necessário para HMAC sobre raw bytes). HMAC SHA-256 timing-safe via `crypto.timingSafeEqual`. Debounce 2s via `jobId` único por (connection, account, bucket-de-2s) + `delay: 2000ms` no BullMQ — bursts são coalescidos. Listener `connection:updated/deleted` no App via `instrumentation.ts` (singleton no boot do Next.js) para invalidar pool. UI consome via Server Actions já existentes (Fase 1).

**Tech Stack:** Next.js 16 (App Router, runtime nodejs), TypeScript, Prisma 7, Postgres, Redis 7, BullMQ, ioredis, pg, base-ui, Tailwind v4, Sonner, Lucide React, Jest + jest-mock-extended.

**Spec de referência:** `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase2-webhook-design.md` (v3 final, 1245 linhas, 22 seções + 3 apêndices).

**Versão alvo:** v0.38.0 (próxima após v0.37.0 LIVE).

---

## Estrutura de arquivos

### Novos arquivos

```
src/lib/nexus-chat/webhook-credentials.ts            # generateWebhookCredentials() + helpers
src/lib/nexus-chat/__tests__/webhook-credentials.test.ts

src/app/api/webhooks/nexus-chat/[token]/route.ts      # POST handler (HMAC + rate limit + debounce)
src/app/api/webhooks/nexus-chat/[token]/__tests__/route.test.ts

src/instrumentation.ts                                # Listener Pub/Sub no boot do App

src/components/reports/realtime-mount.tsx             # Wrapper client que monta useFactsRealtime
src/components/reports/__tests__/realtime-mount.test.tsx

docs/runbooks/webhook-nexus-chat.md
```

### Arquivos modificados

```
prisma/schema.prisma                                   # AuditAction +6 valores webhook + last_webhook_at em NexusChatConnection
src/lib/nexus-chat/ensure-tables.ts                    # ALTER TYPE +6 ADD VALUE + ALTER TABLE ADD last_webhook_at
src/lib/nexus-chat/seed.ts                             # backfill webhook_token + webhook_secret_enc na seed (advisory lock 8472939)

src/lib/actions/nexus-chat/connections.ts              # createNexusChatConnection gera webhook automaticamente +
                                                       # nova action regenerateConnectionWebhookSecret(id)
src/lib/actions/nexus-chat/__tests__/connections.test.ts

src/worker/jobs/pre-agregacao/shared.ts                # withMetaUpdate atualiza last_webhook_at via job.data.fromWebhook (opt-in)
src/worker/index.ts                                    # cron `*/30 * * * *` (era `*/5 * * * *`)

src/app/(protected)/relatorios/conversas/page.tsx      # adiciona <RealtimeMount connectionId={...} accountId={...}/>
src/app/(protected)/relatorios/distribuicao/page.tsx   # idem
src/app/(protected)/relatorios/equipe/page.tsx         # idem
src/app/(protected)/relatorios/origem-ia/page.tsx      # idem
src/app/(protected)/relatorios/performance/page.tsx    # idem
src/app/(protected)/relatorios/mensagens-nao-respondidas/page.tsx  # idem

src/components/settings/nexus-chat/connection-form-dialog.tsx      # estende com bloco Webhook (URL + Secret + botões)
src/components/settings/nexus-chat/connection-list.tsx             # coluna Webhook (configurado / não)

CHANGELOG.md
docs/STATUS.md
package.json                                           # bump 0.37.0 → 0.38.0
docs/agents/HISTORY.md                                 # append release entry
```

---

## Convenções

- **TDD obrigatório** em toda task com código testável.
- **`ui-ux-pro-max:ui-ux-pro-max`** obrigatória em qualquer task de UI (L8). Subagent invoca skill ANTES de codar.
- **Commits granulares**: 1 commit por task com escopo `feat(webhook): TX.Y v0.38 — <descrição>`.
- **Coordenação multi-agente:** antes de cada task, ler `docs/agents/active/` e checar conflito.
- **Nada de `git add -A`**. Usar `git commit --only <paths>`.
- **Push só em T9.x release**. Commits intermediários ficam locais.
- **Naming:** UI/copy = "Nexus Chat".

---

## Lote 0 — Schema additions

### Task T0.1: AuditAction enum +6 valores webhook

**Files:**
- Modify: `prisma/schema.prisma` (enum AuditAction)
- Modify: `src/lib/nexus-chat/ensure-tables.ts` (NEW_AUDIT_ENUM_VALUES_FASE2)

- [ ] **Step 1: Adicionar valores ao enum em `prisma/schema.prisma`**

```prisma
// Adicionar logo após company_chat_binding_deleted:
webhook_received
webhook_rejected_hmac
webhook_rejected_rate_limit
webhook_no_binding
webhook_token_regenerated
webhook_secret_regenerated
```

- [ ] **Step 2: Atualizar ensure-tables.ts**

```typescript
const NEW_AUDIT_ENUM_VALUES_FASE2 = [
  "webhook_received",
  "webhook_rejected_hmac",
  "webhook_rejected_rate_limit",
  "webhook_no_binding",
  "webhook_token_regenerated",
  "webhook_secret_regenerated",
] as const;

// Dentro de createTables(), após o loop de NEW_AUDIT_ENUM_VALUES (Fase 1):
for (const v of NEW_AUDIT_ENUM_VALUES_FASE2) {
  await pgPool.query(
    `ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS '${v}'`,
  );
}
```

- [ ] **Step 3: Adicionar coluna `last_webhook_at` em nexus_chat_connections**

```typescript
// Em createTables(), após CREATE TABLE de nexus_chat_connections:
await pgPool.query(`
  ALTER TABLE "nexus_chat_connections"
  ADD COLUMN IF NOT EXISTS "last_webhook_at" TIMESTAMP(3);
`);
```

E adicionar no schema.prisma:
```prisma
model NexusChatConnection {
  // ... campos existentes
  lastWebhookAt   DateTime? @map("last_webhook_at")  // populado pelo endpoint do webhook
}
```

- [ ] **Step 4: `npx prisma generate` e validar**

```bash
npx prisma generate
npx prisma validate
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/lib/nexus-chat/ensure-tables.ts
git commit -m "feat(webhook): T0.1 v0.38 — AuditAction enum +6 valores webhook + last_webhook_at column"
```

---

## Lote 1 — Webhook credentials utility

### Task T1.1: `generateWebhookCredentials()` em `webhook-credentials.ts`

**Files:**
- Create: `src/lib/nexus-chat/webhook-credentials.ts`
- Test: `src/lib/nexus-chat/__tests__/webhook-credentials.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/nexus-chat/__tests__/webhook-credentials.test.ts
jest.mock("@/lib/encryption", () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, "")),
}));

import { generateWebhookCredentials } from "../webhook-credentials";

describe("generateWebhookCredentials", () => {
  it("retorna token de 64 chars hex (32 bytes random)", () => {
    const c = generateWebhookCredentials();
    expect(c.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("retorna secret cifrado (não em plain) e plain separado para mostrar 1x na UI", () => {
    const c = generateWebhookCredentials();
    expect(c.secretEnc).toMatch(/^enc:/);
    expect(c.secretPlain).toMatch(/^[0-9a-f]{64}$/);
    expect(c.secretEnc).not.toBe(c.secretPlain);
  });

  it("token e secret são diferentes em chamadas seguidas (entropia ok)", () => {
    const a = generateWebhookCredentials();
    const b = generateWebhookCredentials();
    expect(a.token).not.toBe(b.token);
    expect(a.secretPlain).not.toBe(b.secretPlain);
  });
});
```

- [ ] **Step 2: Run test → FAIL (módulo não existe)**

```bash
npx jest src/lib/nexus-chat/__tests__/webhook-credentials.test.ts --no-coverage
```

Expected: `Cannot find module '../webhook-credentials'`.

- [ ] **Step 3: Implementar `webhook-credentials.ts`**

```typescript
import { randomBytes } from "crypto";
import { encrypt } from "@/lib/encryption";

export interface WebhookCredentials {
  token: string;        // 64 chars hex (32 bytes random) — usado no path da URL
  secretPlain: string;  // 64 chars hex — mostrado UMA VEZ na UI ao criar/regenerar
  secretEnc: string;    // ciphertext AES-256-GCM persistido
}

/**
 * Gera credenciais novas para o webhook do Nexus Chat:
 *   - token: parte do path da URL /api/webhooks/nexus-chat/{token}.
 *     Não é segredo (sai pra rede), mas tem 32 bytes random — não é
 *     enumerável.
 *   - secret: chave HMAC compartilhada com o painel admin do Chatwoot.
 *     Mostrado UMA VEZ ao super_admin no Dialog (precisa copiar/colar lá).
 *     Persistido apenas cifrado.
 */
export function generateWebhookCredentials(): WebhookCredentials {
  const token = randomBytes(32).toString("hex");
  const secretPlain = randomBytes(32).toString("hex");
  const secretEnc = encrypt(secretPlain);
  return { token, secretPlain, secretEnc };
}
```

- [ ] **Step 4: Run test → PASS**

```bash
npx jest src/lib/nexus-chat/__tests__/webhook-credentials.test.ts --no-coverage
```

Expected: 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nexus-chat/webhook-credentials.ts src/lib/nexus-chat/__tests__/webhook-credentials.test.ts
git commit -m "feat(webhook): T1.1 v0.38 — generateWebhookCredentials (token+secret 32B random)"
```

---

## Lote 2 — Server Actions de Connection geram + regeneram webhook

### Task T2.1: `createNexusChatConnection` gera webhook automaticamente

**Files:**
- Modify: `src/lib/actions/nexus-chat/connections.ts` (createNexusChatConnection)
- Modify: `src/lib/actions/nexus-chat/__tests__/connections.test.ts`

- [ ] **Step 1: Test failing — espera webhook gerado**

Adicionar ao describe `createNexusChatConnection`:

```typescript
it("gera webhookToken + webhookSecretEnc automaticamente e devolve secretPlain UMA VEZ", async () => {
  userMock.mockResolvedValue({ id: "u1", platformRole: "super_admin" } as never);
  createMock.mockResolvedValue({ id: "conn-1", name: "X" });

  const result = await createNexusChatConnection(validInput);

  expect(result.success).toBe(true);
  expect(result.data?.webhookSecretPlain).toMatch(/^[0-9a-f]{64}$/);
  expect(createMock).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        webhookToken: expect.stringMatching(/^[0-9a-f]{64}$/),
        webhookSecretEnc: expect.any(String),
      }),
    }),
  );
});
```

- [ ] **Step 2: Run test → FAIL**

- [ ] **Step 3: Atualizar `connections.ts`**

```typescript
import { generateWebhookCredentials } from "@/lib/nexus-chat/webhook-credentials";

export async function createNexusChatConnection(
  input: NexusChatConnectionInput,
): Promise<ActionResult<{ id: string; webhookSecretPlain: string }>> {
  // ... validação Zod existente

  const credentials = generateWebhookCredentials();

  const conn = await prisma.nexusChatConnection.create({
    data: {
      // ... campos existentes
      passwordEnc: encrypt(parsed.data.password),
      webhookToken: credentials.token,
      webhookSecretEnc: credentials.secretEnc,
      // ...
    },
  });

  // ... audit log existente

  // Retorna secretPlain UMA VEZ (caller mostra em toast / Dialog).
  return {
    success: true,
    data: { id: conn.id, webhookSecretPlain: credentials.secretPlain },
  };
}
```

- [ ] **Step 4: Run test → PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/nexus-chat/connections.ts src/lib/actions/nexus-chat/__tests__/connections.test.ts
git commit -m "feat(webhook): T2.1 v0.38 — createNexusChatConnection gera webhook + retorna secretPlain"
```

### Task T2.2: `regenerateConnectionWebhookSecret(id)` Server Action

**Files:**
- Modify: `src/lib/actions/nexus-chat/connections.ts`
- Modify: `src/lib/actions/nexus-chat/__tests__/connections.test.ts`

- [ ] **Step 1: Test failing**

```typescript
describe("regenerateConnectionWebhookSecret", () => {
  it("super_admin regenera secret + audit log", async () => {
    userMock.mockResolvedValue({ id: "u1", platformRole: "super_admin" } as never);
    findUniqueMock.mockResolvedValue({ id: "conn-1", webhookToken: "old-token" });
    updateMock.mockResolvedValue({ id: "conn-1" });

    const result = await regenerateConnectionWebhookSecret("conn-1");

    expect(result.success).toBe(true);
    expect(result.data?.webhookSecretPlain).toMatch(/^[0-9a-f]{64}$/);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          webhookSecretEnc: expect.any(String),
        }),
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "webhook_secret_regenerated" }),
    );
  });

  it("admin é rejeitado (super_admin only)", async () => {
    userMock.mockResolvedValue({ id: "u1", platformRole: "admin" } as never);
    const result = await regenerateConnectionWebhookSecret("conn-1");
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test → FAIL**

- [ ] **Step 3: Implementar action**

```typescript
export async function regenerateConnectionWebhookSecret(
  id: string,
): Promise<ActionResult<{ webhookSecretPlain: string }>> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const before = await prisma.nexusChatConnection.findUnique({ where: { id, deletedAt: null } });
  if (!before) return { success: false, error: "Conexão não encontrada." };

  const credentials = generateWebhookCredentials();

  await prisma.nexusChatConnection.update({
    where: { id },
    data: { webhookSecretEnc: credentials.secretEnc },
  });

  await logAudit({
    userId: auth.userId,
    action: "webhook_secret_regenerated",
    targetType: "nexus_chat_connection",
    targetId: id,
    details: { name: before.name },
  });

  return {
    success: true,
    data: { webhookSecretPlain: credentials.secretPlain },
  };
}
```

- [ ] **Step 4: Run test → PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/nexus-chat/connections.ts src/lib/actions/nexus-chat/__tests__/connections.test.ts
git commit -m "feat(webhook): T2.2 v0.38 — regenerateConnectionWebhookSecret super_admin"
```

---

## Lote 3 — Backfill da connection seed

### Task T3.1: `seed.ts` v2 — gera webhook se ausente

**Files:**
- Modify: `src/lib/nexus-chat/seed.ts`
- Modify: `src/lib/nexus-chat/__tests__/seed.test.ts`

- [ ] **Step 1: Test failing**

```typescript
it("backfill: connection seed sem webhook ganha token+secret idempotente (advisory lock 8472939)", async () => {
  // Seed já rodou anteriormente; webhook fields são NULL.
  queryMock.mockResolvedValueOnce({ rows: [{ locked: true }] } as never); // lock fase1
  findFlagMock.mockResolvedValue({ key: "connections_seeded_at", value: { at: "..." } });
  // Ainda preciso entrar no backfill webhook:
  queryMock.mockResolvedValueOnce({ rows: [{ locked: true }] } as never); // lock fase2
  findFlagMock.mockResolvedValueOnce(null); // flag webhooks_seeded_at não existe
  findManyMock.mockResolvedValueOnce([
    { id: "conn-seed", webhookToken: null, webhookSecretEnc: null },
  ]);
  updateMock.mockResolvedValue({});
  createFlagMock.mockResolvedValue({});

  const result = await runConnectionsSeedIfNeeded();

  expect(result.webhooksBackfilled).toBe(1);
  expect(updateMock).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: "conn-seed" },
      data: expect.objectContaining({
        webhookToken: expect.stringMatching(/^[0-9a-f]{64}$/),
        webhookSecretEnc: expect.any(String),
      }),
    }),
  );
});
```

- [ ] **Step 2: Run test → FAIL**

- [ ] **Step 3: Atualizar `seed.ts`**

Após o bloco existente da Fase 1 (que cria connection + bindings + backfill connection_id), adicionar:

```typescript
// Fase 2: backfill webhook_token+secret nas connections que ainda não têm.
// Advisory lock distinto (8472939) — evita conflito com o lock da Fase 1.
const WEBHOOK_LOCK_KEY = 8472939;

async function backfillWebhookCredentialsIfNeeded(): Promise<{ webhooksBackfilled: number }> {
  const lock = await pgPool.query<{ locked: boolean }>(
    `SELECT pg_try_advisory_lock($1) AS locked`,
    [WEBHOOK_LOCK_KEY],
  );
  if (!lock.rows[0]?.locked) return { webhooksBackfilled: 0 };

  try {
    const flag = await prisma.appSetting.findUnique({
      where: { key: "webhooks_seeded_at" },
    });
    if (flag) return { webhooksBackfilled: 0 };

    const connections = await prisma.nexusChatConnection.findMany({
      where: { deletedAt: null, webhookToken: null },
      select: { id: true },
    });

    let count = 0;
    for (const c of connections) {
      const credentials = generateWebhookCredentials();
      await prisma.nexusChatConnection.update({
        where: { id: c.id },
        data: {
          webhookToken: credentials.token,
          webhookSecretEnc: credentials.secretEnc,
        },
      });
      count++;
    }

    await prisma.appSetting.create({
      data: {
        key: "webhooks_seeded_at",
        value: { at: new Date().toISOString(), backfilled: count },
        category: "system",
      },
    });

    return { webhooksBackfilled: count };
  } finally {
    await pgPool.query(`SELECT pg_advisory_unlock($1)`, [WEBHOOK_LOCK_KEY]);
  }
}

export async function runConnectionsSeedIfNeeded(): Promise<SeedResult> {
  // ... lógica fase 1 existente ...
  const result = await runFase1Seed();

  // Fase 2: backfill webhook
  const webhookBackfill = await backfillWebhookCredentialsIfNeeded();

  return { ...result, ...webhookBackfill };
}
```

- [ ] **Step 4: Run test → PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/nexus-chat/seed.ts src/lib/nexus-chat/__tests__/seed.test.ts
git commit -m "feat(webhook): T3.1 v0.38 — seed v2 backfill webhook na connection seed (lock 8472939)"
```

---

## Lote 4 — Endpoint webhook

### Task T4.1: `POST /api/webhooks/nexus-chat/[token]/route.ts`

**Files:**
- Create: `src/app/api/webhooks/nexus-chat/[token]/route.ts`
- Test: `src/app/api/webhooks/nexus-chat/[token]/__tests__/route.test.ts`

- [ ] **Step 1: Test cases (cobertura crítica)**

Criar test cobrindo 8 cenários (todos com mock de `prisma`, `redis`, queues, `publishRealtimeEvent`):
1. Token inválido → 404 silencioso (sem revelar existência).
2. Connection com `status='paused'` → 404.
3. Rate limit acima de 100/min → 429 com `Retry-After: 60`.
4. Header `x-chatwoot-hmac-sha256` ausente → 401.
5. HMAC inválido → 401 + audit `webhook_rejected_hmac`.
6. JSON inválido → 200 OK ignored com audit (sem retry forever do Chatwoot).
7. `account.id` sem binding → 200 OK ignored (sample audit) sem 4xx.
8. Caminho feliz → 200 OK + 4 jobs enfileirados com `jobId` debounce + 4 publishes Pub/Sub.
9. Payload >1MB → 413.

(Testes longos — escrever cada caso com setup específico de mocks. Total ~200 linhas de test.)

- [ ] **Step 2: Run test → FAIL (route.ts não existe)**

- [ ] **Step 3: Implementar route.ts**

Cole o pseudo-código da §5.2 da spec (302 linhas) — tudo materializado: HMAC timing-safe, rate limit Redis incr+expire, debounce via jobId, publish 4 dimensões, audit sample 1/100, limite de payload 1MB.

- [ ] **Step 4: Run test → PASS**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/nexus-chat/[token]/route.ts src/app/api/webhooks/nexus-chat/[token]/__tests__/route.test.ts
git commit -m "feat(webhook): T4.1 v0.38 — endpoint POST /api/webhooks/nexus-chat/[token] (HMAC + rate limit + debounce)"
```

---

## Lote 5 — Listener `instrumentation.ts` no App

### Task T5.1: Criar `src/instrumentation.ts`

**Files:**
- Create: `src/instrumentation.ts`

- [ ] **Step 1: Implementar**

```typescript
// src/instrumentation.ts
// Roda UMA VEZ no boot do servidor Next.js (ambos dev e prod).
// Padrão idêntico ao do worker (subscribe.then(on('message'))).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.REDIS_URL) return;

  const { default: IORedis } = await import("ioredis");
  const { CHANNEL } = await import("@/lib/realtime");
  const { invalidateNexusChatPool } = await import("@/lib/nexus-chat/pool");

  const subscriber = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  subscriber.subscribe(CHANNEL).then(() => {
    subscriber.on("message", (_channel, message) => {
      try {
        const ev = JSON.parse(message) as { type?: string; connectionId?: string };
        if (
          (ev.type === "connection:updated" ||
            ev.type === "connection:deleted") &&
          ev.connectionId
        ) {
          invalidateNexusChatPool(ev.connectionId).catch((err) =>
            console.warn("[app.pubsub] invalidateNexusChatPool falhou:", err.message),
          );
        }
      } catch {
        // payload malformado — ignorar
      }
    });
    console.log(`[app.pubsub] inscrito em ${CHANNEL} para invalidação de pools`);
  }).catch((err) => {
    console.error("[app.pubsub] subscribe falhou:", err);
  });
}
```

- [ ] **Step 2: Validar — `next dev` no boot loga `[app.pubsub] inscrito`**

- [ ] **Step 3: Smoke test manual**

Em dev:
```bash
redis-cli PUBLISH 'nexus-insights:realtime' '{"type":"connection:updated","connectionId":"test-uuid"}'
```

Esperado: log no app dev `invalidateNexusChatPool` chamado.

- [ ] **Step 4: Commit**

```bash
git add src/instrumentation.ts
git commit -m "feat(webhook): T5.1 v0.38 — instrumentation.ts ouve connection:updated/deleted no App"
```

---

## Lote 6 — `useFactsRealtime` em todas as 7 pages

### Task T6.0: Wrapper `<RealtimeMount>`

**Files:**
- Create: `src/components/reports/realtime-mount.tsx`
- Test: `src/components/reports/__tests__/realtime-mount.test.tsx`

- [ ] **Step 1: Test failing**

```typescript
// teste verifica que componente client-side monta useFactsRealtime
// com (connectionId, accountId) recebidos via prop.
```

- [ ] **Step 2: Implementar**

```typescript
"use client";

import { useFactsRealtime } from "@/components/reports/use-facts-realtime";

export function RealtimeMount({
  connectionId,
  accountId,
}: {
  connectionId: string;
  accountId: number;
}) {
  useFactsRealtime({ connectionId, accountId });
  return null;
}
```

- [ ] **Step 3: Run test → PASS**

- [ ] **Step 4: Commit**

```bash
git add src/components/reports/realtime-mount.tsx src/components/reports/__tests__/realtime-mount.test.tsx
git commit -m "feat(webhook): T6.0 v0.38 — <RealtimeMount> wrapper client para montar useFactsRealtime"
```

### Task T6.1-T6.6: Adicionar `<RealtimeMount>` nas 6 pages restantes

**Files (cada page recebe a mesma alteração):**
- Modify: `src/app/(protected)/relatorios/conversas/page.tsx`
- Modify: `src/app/(protected)/relatorios/distribuicao/page.tsx`
- Modify: `src/app/(protected)/relatorios/equipe/page.tsx`
- Modify: `src/app/(protected)/relatorios/origem-ia/page.tsx`
- Modify: `src/app/(protected)/relatorios/performance/page.tsx`
- Modify: `src/app/(protected)/relatorios/mensagens-nao-respondidas/page.tsx`

Padrão (no JSX da page, após `getActiveConnectionId`):

```typescript
import { RealtimeMount } from "@/components/reports/realtime-mount";

// dentro do JSX:
<RealtimeMount connectionId={connectionId} accountId={accountId} />
```

(Visão Geral já tem `<FactsFreshness>` que monta o hook — deixar como está. O wrapper `<RealtimeMount>` é alternativa quando a página não usa `<FactsFreshness>`.)

Commits granulares: 1 commit por page ou agrupar em 2 commits (3 + 3).

```bash
git commit -m "feat(webhook): T6.1-T6.3 v0.38 — <RealtimeMount> em Conversas + Distribuição + Equipe"
git commit -m "feat(webhook): T6.4-T6.6 v0.38 — <RealtimeMount> em Origem IA + Performance + Mensagens não respondidas"
```

---

## Lote 7 — Cron rebaixado para 30 min fallback

### Task T7.1: Atualizar cron em `src/worker/index.ts`

**Files:**
- Modify: `src/worker/index.ts` (4 calls de `upsertJobScheduler`)

- [ ] **Step 1: Mudar pattern de `*/5 * * * *` para `*/30 * * * *`**

```typescript
await refreshByAccountQueue.upsertJobScheduler(
  "facts-refresh-by-account-fallback",  // novo schedule id distinto evita conflito
  { pattern: "*/30 * * * *" },
  { name: "facts-refresh-by-account" },
);
// ... idem inbox/agent/team
```

(Nome do scheduler distinto pra que `upsertJobScheduler` substitua corretamente o cron antigo da Fase 1 — id `facts-refresh-by-account` antigo fica órfão e BullMQ housekeeping limpa.)

- [ ] **Step 2: Adicionar housekeeping para limpar schedulers antigos**

No housekeeping job (ou novo step inline no worker boot):

```typescript
const oldSchedulers = ["facts-refresh-by-account", "facts-refresh-by-inbox",
                       "facts-refresh-by-agent", "facts-refresh-by-team"];
for (const id of oldSchedulers) {
  await refreshByAccountQueue.removeJobScheduler(id).catch(() => {});
  // idem para inbox/agent/team
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(webhook): T7.1 v0.38 — cron rebaixado para 30 min fallback (webhook é gatilho primário)"
```

---

## Lote 8 — UI extensão webhook

### Task T8.1: Bloco Webhook em `<ConnectionFormDialog>`

**Files:**
- Modify: `src/components/settings/nexus-chat/connection-form-dialog.tsx`

> **REGRA ABSOLUTA:** invocar `ui-ux-pro-max:ui-ux-pro-max` ANTES de codar UI.

Adicionar bloco abaixo do form (visível em modo Edit + após criar):
- URL completa: `https://insights.nexusai360.com/api/webhooks/nexus-chat/{token}` com botão Copy.
- Secret: mostrado UMA VEZ ao criar/regenerar, escondido em outras visualizações (placeholder `••••••••`).
- Botão "Regenerar secret" com AlertDialog confirmação.
- Bloco "Eventos a marcar no Chatwoot" com checkboxes/lista informativa: `conversation_created`, `conversation_updated`, `conversation_resolved`, `message_created`, `conversation_status_changed`.
- Link para o runbook.

### Task T8.2: Coluna Webhook em `<ConnectionList>`

Adicionar coluna após Status mostrando badge "Configurado" (verde) ou "Não" (amber) baseado em `webhookToken IS NOT NULL`.

Commits:
```bash
git commit -m "feat(webhook): T8.1 v0.38 — Dialog estende com bloco Webhook (URL + Secret + Regenerar + instruções)"
git commit -m "feat(webhook): T8.2 v0.38 — ConnectionList coluna Webhook configurado/não"
```

---

## Lote 9 — Runbook + Release

### Task T9.0: Runbook `docs/runbooks/webhook-nexus-chat.md`

10 itens canônicos (vê §13.1 da spec):
1. Como cadastrar webhook no painel Chatwoot.
2. Eventos a marcar.
3. Validar com `curl -X POST` + HMAC manual.
4. Como regenerar secret (rotação).
5. Verificar latência: query SQL em audit_logs filtrando `webhook_received`.
6. Troubleshooting: 404, 401, 429, 200 ignored.
7. Rate limit por token (100/min).
8. Replay attack — ausência de timestamp no Chatwoot, mitigado por HMAC.
9. Cron fallback 30 min — quando recorre.
10. Detectar webhook quieto: `last_webhook_at < now() - 1h` indica problema.

### Task T9.1: Release v0.38.0

- Bump `package.json` 0.37.0 → 0.38.0.
- CHANGELOG entry.
- STATUS.md entry.
- Git push origin main → CI Build+Push → Portainer redeploy.
- `gh workflow run portainer-fix.yml -f app_version=v0.38.0`.
- Validar `/api/health version=v0.38.0`.
- Append `docs/agents/HISTORY.md`.
- Deletar active file controlador.

Commits:
```bash
git commit -m "docs(runbooks): T9.0 v0.38 — runbook webhook-nexus-chat (10 itens canônicos)"
git commit -m "chore(release): v0.38.0 — Multi-tenant Realtime Fase 2 (webhook event-driven)"
```

---

## Critérios de aceitação

- [ ] Endpoint `/api/webhooks/nexus-chat/[token]` aceita POST com body cru, valida HMAC SHA-256, debounce 2s.
- [ ] Rate limit 100/min/token via Redis.
- [ ] 4 jobs enfileirados com `jobId` único (coalescência confirmada em test).
- [ ] `publishRealtimeEvent` chamado 4x com `(connectionId, accountId)` corretos.
- [ ] `instrumentation.ts` no App ouve `connection:updated/deleted` e invalida pool.
- [ ] `useFactsRealtime` montado em todas as 7 pages de relatório.
- [ ] Cron rebaixado para 30 min fallback.
- [ ] UI super_admin mostra URL+secret+regenerate+instruções.
- [ ] Connection seed em produção tem `webhookToken+webhookSecretEnc` populados.
- [ ] Runbook `webhook-nexus-chat.md` publicado.
- [ ] Suite verde: typecheck 0, jest verde nos arquivos tocados.
- [ ] `/api/health version=v0.38.0` em produção.

---

## Dependências e o que vem a seguir

**Bloqueia Fase 3** (UI completa em 4 abas, sidebar reorg, wizard onboarding):
- A aba "Tempo real" da Fase 3 consome o stream de `webhook_received` audit logs criado nesta Fase 2.
- A aba "Saúde" consome `last_webhook_at` para detecção de quietude.
- O wizard onboarding usa o token+secret retornado pelo `createNexusChatConnection`.

**Não-objetivos (Fase 3):**
- UI rica em 4 abas (Conexões/Tempo real/Jobs/Saúde).
- Wizard onboarding nova empresa.
- Sidebar reorg.
- Constraint NOT NULL + nova PK em `chatwoot_facts_*`.

---

## Notas de execução

- TDD obrigatório.
- `ui-ux-pro-max` em L8.
- Subagents paralelos onde possível: L0/L1/L2 sequenciais; L3 sequencial; L4/L5/L6/L7 podem rodar em paralelo (escopos distintos); L8/L9 sequenciais finais.
- Push só em T9.1.
- Não tocar `docs/agents/HISTORY.md` em commits intermediários.

---

## Apêndice A — Pente fino #1 (24 achados aplicados)

| # | Achado | Severidade | Resolução |
|---|---|---|---|
| P1 | Plan v1 dizia "RealtimeMount em todas as 7 pages mas Visão Geral já tem". Errado: 5 pages (Visão Geral+Distribuição+Equipe+Origem-IA+Performance+Dashboard) já recebem `<FactsFreshness>` que monta o hook (Fase 1 cbd49a5). Apenas Conversas e Mensagens não respondidas precisam de `<RealtimeMount>`. | Crítico | T6 reduzido a 2 pages. Wrapper `<RealtimeMount>` continua útil. |
| P2 | Pages com FactsFreshness não duplicam hook. | Confirmado | OK. |
| P3 | T4.1 diz "200 linhas de test" sem detalhar. | Importante | v3 inclui 3 testes detalhados em código (token inválido / HMAC mismatch / caminho feliz). Outros 5+ casos seguem o padrão. |
| P4 | `last_webhook_at` adicionado em T0.1 mas endpoint não atualiza. | Crítico | T4.1 ganha step extra: `prisma.nexusChatConnection.update({ where: { id }, data: { lastWebhookAt: new Date() }})` fire-and-forget após enfileirar. |
| P5 | Retorno de createNexusChatConnection mudou. | Importante | T2.1 documenta caller (UI) deve exibir secret em Alert verde dentro do Dialog. T8.1 cobre. |
| P6 | Cron fallback continua chamando getBindingsToRefresh. | Confirmado | OK. |
| P7 | Webhook publica 4x facts:refreshed; debounce 5s coalesça. | Confirmado | OK. |
| P8 | instrumentation.ts em Next 16 é automático. | Confirmado | OK. |
| P9 | Backfill webhook DEPOIS do seed Fase 1. | Confirmado | T3.1 chama backfillWebhookCredentialsIfNeeded() APÓS runFase1Seed(). |
| P10 | UI deve mostrar secretPlain UMA VEZ. | Importante | T8.1 ganha detalhe: Alert verde com `<code>` copiable + warning. |
| P11 | Test coalescência precisa mock detalhado de BullMQ. | Importante | T4.1 inclui pseudo-código do mock + assertion `expect(addMock).toHaveBeenCalledWith("refresh-by-account", data, expect.objectContaining({ jobId: "...", delay: 2000 }))`. |
| P12 | Math.random sample 1/100 inconsistente em testes. | Médio | Test usa `jest.spyOn(Math, "random").mockReturnValue(0.005)`. |
| P13 | hourly_by_account não tem job dedicado. | Importante | Documentação: refresh-by-account processa hourly. Webhook publica 4x (by_account/inbox/agent/team) — useFactsRealtime filtra dimension. |
| P14 | SeedResult ganha webhooksBackfilled. | Importante | T3.1 atualiza interface SeedResult. |
| P15 | Smoke test produção precisa simular Chatwoot. | Importante | T9.1 inclui script bash que computa HMAC + curl POST. Adicionar em runbook. |
| P16 | audits-table UI quebra build se faltar entry no Record<AuditAction>. | Crítico | Nova T0.2: atualizar audits-table com 6 entries novas. Verificar todos call-sites. |
| P17 | Cliente novo: createNexusChatConnection já gera webhook. | Confirmado | OK. |
| P18 | Path src/instrumentation.ts. | Confirmado | OK. |
| P19 | Mock NextRequest para teste. | Importante | T4.1 inclui exemplo concreto. |
| P20 | Endpoint precisa estar acessível externamente. | Crítico | T9.1 inclui smoke test: `curl -I .../api/webhooks/nexus-chat/teste-404` deve retornar 404 (não Bad Gateway). |
| P21 | Onde mostrar webhookSecretPlain. | Médio | T8.1: Alert variant="success" no topo do Dialog após criar/regenerar com botão Copiar + warning. |
| P22 | Rate limit keys orfãos. | Não-bloqueante | Redis expire 60s. OK. |
| P23 | Schedulers antigos. | Confirmado | T7.1 trata removeJobScheduler(). |
| P24 | webhook_received no caminho feliz é sample 1/100. | Médio | Adicionar log JSON estruturado em stdout em todo webhook recebido. Audit fica como amostra. |
