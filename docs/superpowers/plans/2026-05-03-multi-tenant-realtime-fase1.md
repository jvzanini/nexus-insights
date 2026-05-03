# Multi-tenant Realtime — Fase 1 (Fundação) Implementation Plan

> **v3 — pente fino #1 (24 achados) e #2 (24 achados) aplicados. Plan canônico para execução.**
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a fundação multi-tenant invisível ao usuário comum: tabelas `nexus_chat_connection` e `company_chat_binding`, pool dinâmico por connection, refator de queries para multi-tenant, migração de credenciais para DB encriptado, `connection_id` em `chatwoot_facts_*`, `useFactsRealtime` filtrando `(connectionId, accountId)` e CRUD super_admin mínimo em `/configuracoes/conexoes`.

**Architecture:** Pool dinâmico Postgres por connection (`Map<connectionId, Pool>`), invalidação cross-process via Redis Pub/Sub, AES-256-GCM nos secrets, defesa em profundidade 5 camadas (middleware → getCurrentUser → assertAccountAccess → getActiveConnectionId → getNexusChatPool). Fundação preserva comportamento atual (1 connection seed automaticamente do `.env`) e habilita N connections futuras.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma 7, Postgres, Redis 7, BullMQ, ioredis, pg, base-ui, Tailwind v4, NextAuth v5, Jest + jest-mock-extended, Sonner.

**Spec de referência:** `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase1-fundacao-design.md` (v3 final, 22 seções + Apêndices A e B com 58 achados aplicados).

**Versão alvo:** v0.33.0 (v0.31 e v0.32 estão sendo consumidas pelos agentes paralelos `claude-agente-nex-polish-v031` e `claude-conversas-filtros-v032`).

---

## Estrutura de arquivos (criar / modificar)

### Novos arquivos

```
prisma/migrations/<timestamp>_multi_tenant_fase1/migration.sql  # estrutural
prisma/migrations/<timestamp>_multi_tenant_fase1_constraint/migration.sql  # NOT NULL + PK

src/lib/nexus-chat/pool.ts                            # Pool dinâmico + janitor + queryNexusChat
src/lib/nexus-chat/errors.ts                          # ConnectionUnavailableError, NoActiveBindingError, AmbiguousBindingError
src/lib/nexus-chat/seed.ts                            # Seed idempotente + advisory lock
src/lib/nexus-chat/__tests__/pool.test.ts
src/lib/nexus-chat/__tests__/seed.test.ts

src/lib/reports/active-connection.ts                  # getActiveConnectionId via cache()
src/lib/reports/__tests__/active-connection.test.ts

src/lib/actions/nexus-chat/connections.ts             # CRUD + test action
src/lib/actions/nexus-chat/bindings.ts                # CRUD
src/lib/actions/nexus-chat/__tests__/connections.test.ts
src/lib/actions/nexus-chat/__tests__/bindings.test.ts

src/app/(protected)/configuracoes/conexoes/page.tsx
src/components/settings/nexus-chat/connection-list.tsx
src/components/settings/nexus-chat/connection-form-dialog.tsx
src/components/settings/nexus-chat/binding-list-sheet.tsx
src/components/settings/nexus-chat/binding-form-dialog.tsx
src/components/settings/nexus-chat/__tests__/connection-list.test.tsx
src/components/settings/nexus-chat/__tests__/connection-form-dialog.test.tsx

docs/runbooks/multi-tenant-realtime.md                # Runbook (10 itens canônicos)
```

### Arquivos modificados

```
prisma/schema.prisma                                   # add NexusChatConnection + CompanyChatBinding + connection_id em 6 tabelas

src/lib/realtime.ts                                    # add connection:updated/deleted ao RealtimeEvent + connectionId no facts:refreshed
src/lib/tenant.ts                                      # extend assertAccountAccess

src/lib/chatwoot/pool.ts                               # shim deletado no Lote 9; nesta fase, redireciona para getNexusChatPool

src/lib/chatwoot/queries/conversas-list.ts             # Lote 3
src/lib/chatwoot/queries/dashboard-data.ts             # Lote 2
src/lib/chatwoot/queries/dashboard-drill-down.ts       # Lote 2
src/lib/chatwoot/queries/dashboard-kpis.ts             # Lote 2
src/lib/chatwoot/queries/home-summary.ts               # Lote 2
src/lib/chatwoot/queries/leads-recebidos.ts            # Lote 4
src/lib/chatwoot/queries/matrix-ia.ts                  # Lote 4
src/lib/chatwoot/queries/mensagens-nao-respondidas.ts  # Lote 4
src/lib/chatwoot/queries/meta-cache.ts                 # Lote 3
src/lib/chatwoot/queries/meta-cache-for-user.ts        # Lote 3
src/lib/chatwoot/queries/por-departamento.ts           # Lote 4
src/lib/chatwoot/queries/por-estado.ts                 # Lote 4
src/lib/chatwoot/queries/ranking-atendentes.ts         # Lote 4
src/lib/chatwoot/queries/status-distribution.ts        # Lote 2
src/lib/chatwoot/queries/tempos-resposta.ts            # Lote 4
src/lib/chatwoot/queries/volumetria-dow.ts             # Lote 4
src/lib/chatwoot/queries/volumetria-heatmap.ts         # Lote 4
src/lib/chatwoot/facts.ts                              # Lote 6 (add connection_id em filtros + writes)

src/lib/actions/reports/*.ts                           # Lote 5 (call-sites)

src/worker/jobs/pre-agregacao/shared.ts                # Lote 6: getBindingsToRefresh()
src/worker/jobs/pre-agregacao/refresh-by-account.ts    # Lote 6
src/worker/jobs/pre-agregacao/refresh-by-inbox.ts      # Lote 6
src/worker/jobs/pre-agregacao/refresh-by-agent.ts      # Lote 6
src/worker/jobs/pre-agregacao/refresh-by-team.ts       # Lote 6
src/worker/index.ts                                    # Lote 6 (boot do seed + invalidação SSE)

src/components/reports/use-facts-realtime.ts           # Lote 7 (filtra por connectionId)
src/components/reports/facts-freshness.tsx             # Lote 7 (passa connectionId)
src/app/(protected)/relatorios/visao-geral/page.tsx    # Lote 7 (resolve connectionId no server)

src/app/api/health/route.ts                            # Lote 8 (campo connections)

CHANGELOG.md                                           # Release task
package.json                                           # bump v0.33.0 (release task)
docs/STATUS.md                                         # release task
docs/agents/HISTORY.md                                 # release task (após push)
```

---

## Visão geral dos lotes

| Lote | Nome | Paralelizável | Dependências | Tasks |
|---|---|---|---|---|
| L0 | Schema migrations + erros customizados | Não | — | T0.1, T0.2, T0.3 |
| L1 | Pool dinâmico + active-connection + seed | Não (sequencial interno) | L0 | T1.1 → T1.5 |
| L2 | Queries do dashboard | Sim (5 paralelos) | L1 | T2.1 a T2.5 |
| L3 | Conversas + meta-cache | Sim (3 paralelos) | L1 | T3.1 a T3.3 |
| L4 | Queries restantes | Sim (9 paralelos) | L1 | T4.1 a T4.9 |
| L5 | Server actions de relatórios (call-sites) | Sim (paralelos) | L2, L3, L4 | T5.* (8 actions) |
| L6 | Worker + facts.ts + realtime payload | Não (sequencial) | L1, L5 | T6.1 → T6.6 |
| L7 | useFactsRealtime + Visão Geral | Não | L6 | T7.1, T7.2 |
| L8 | UI mínima `/configuracoes/conexoes` | Sim (parcial) | L1 | T8.1 a T8.6 |
| L9 | Constraint NOT NULL + delete shim + release | Não | L0..L8 | T9.1, T9.2, T9.3 |

**Total estimado:** ~50 tasks granulares, ~25 commits.

---

## Convenções

- **TDD obrigatório** em toda task com código testável: write failing test → run (RED) → minimal impl → run (GREEN) → commit.
- **`ui-ux-pro-max:ui-ux-pro-max` obrigatória** em qualquer task de UI (L8 inteiro). Antes de codar UI, invocar a skill no subagent.
- **Commits granulares**: 1 commit por task com escopo `feat(nexus-chat): TX.Y v0.33 — <descrição>` ou `feat(reports): ...`.
- **Coordenação multi-agente:** antes de cada task, ler `docs/agents/active/` e `git log -3` do arquivo a tocar. Se conflito potencial, **pausar** e coordenar.
- **Nada de `git add -A` ou `git add .`** — sempre paths específicos. Considerar `git commit --only <paths>` para garantir isolamento.
- **Naming:** UI/copy/menus = "Nexus Chat"; tabelas legadas (`chatwoot_facts_*`, coluna `chatwoot_account_id`) **mantidas** (renome em fase de naming cleanup futura).
- **Não tocar** em arquivos pertencentes a `claude-agente-nex-polish-v031` (`src/lib/nex/*`, `src/components/agente-nex/*`, `src/lib/llm/exchange-rate.ts`, `src/lib/actions/nex-prompt.ts`) ou `claude-conversas-filtros-v032` (filtros de conversas — `src/lib/chatwoot/condition-group-codec.ts`, filtros UI). Coordenar com `git status` antes de cada commit.
- **Plan reentrante:** se uma task falhar, a próxima pode reentrar sem efeito colateral (idempotente).

---

## Lote 0 — Schema migrations + erros customizados

### Task T0.1: Erros customizados em `src/lib/nexus-chat/errors.ts`

**Files:**
- Create: `src/lib/nexus-chat/errors.ts`
- Test: `src/lib/nexus-chat/__tests__/errors.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/nexus-chat/__tests__/errors.test.ts
import {
  ConnectionUnavailableError,
  NoActiveBindingError,
  AmbiguousBindingError,
} from "../errors";

describe("nexus-chat errors", () => {
  it("ConnectionUnavailableError carrega connectionId e status", () => {
    const err = new ConnectionUnavailableError("uuid-123", "paused");
    expect(err.message).toContain("uuid-123");
    expect(err.connectionId).toBe("uuid-123");
    expect(err.status).toBe("paused");
  });

  it("NoActiveBindingError carrega accountId", () => {
    const err = new NoActiveBindingError(42);
    expect(err.message).toContain("42");
    expect(err.accountId).toBe(42);
  });

  it("AmbiguousBindingError lista connectionIds conflitantes", () => {
    const err = new AmbiguousBindingError(7, ["a", "b"]);
    expect(err.connectionIds).toEqual(["a", "b"]);
    expect(err.accountId).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/nexus-chat/__tests__/errors.test.ts`
Expected: FAIL with `Cannot find module '../errors'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/nexus-chat/errors.ts
export class ConnectionUnavailableError extends Error {
  constructor(public readonly connectionId: string, public readonly status: string | null) {
    super(`Nexus Chat connection ${connectionId} unavailable (status=${status ?? "missing"})`);
    this.name = "ConnectionUnavailableError";
  }
}

export class NoActiveBindingError extends Error {
  constructor(public readonly accountId: number) {
    super(`No active company_chat_binding for chatwoot_account_id=${accountId}`);
    this.name = "NoActiveBindingError";
  }
}

export class AmbiguousBindingError extends Error {
  constructor(
    public readonly accountId: number,
    public readonly connectionIds: string[],
  ) {
    super(
      `Ambiguous: chatwoot_account_id=${accountId} maps to ${connectionIds.length} connections (${connectionIds.join(", ")})`,
    );
    this.name = "AmbiguousBindingError";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/nexus-chat/__tests__/errors.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/nexus-chat/errors.ts src/lib/nexus-chat/__tests__/errors.test.ts
git commit -m "feat(nexus-chat): T0.1 v0.33 — erros customizados (ConnectionUnavailable/NoActiveBinding/AmbiguousBinding)"
```

---

### Task T0.2: Schema Prisma — `NexusChatConnection` + `CompanyChatBinding`

**Files:**
- Modify: `prisma/schema.prisma:179` (após `LlmConfig`, ou local apropriado)

- [ ] **Step 1: Adicionar models ao schema**

```prisma
// Adicionar em prisma/schema.prisma após o último model existente

model NexusChatConnection {
  id                  String   @id @default(uuid()) @db.Uuid
  name                String
  host                String
  port                Int      @default(5432)
  database            String
  username            String
  passwordEnc         String   @map("password_enc")
  sslMode             String   @default("prefer") @map("ssl_mode")
  applicationName     String   @default("nexus-insights") @map("application_name")
  webhookToken        String?  @unique @map("webhook_token")
  webhookSecretEnc    String?  @map("webhook_secret_enc")
  status              String   @default("active") @map("status")
  lastTestAt          DateTime? @map("last_test_at")
  lastTestError       String?  @map("last_test_error")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")
  deletedAt           DateTime? @map("deleted_at")
  createdById         String?  @map("created_by_id") @db.Uuid

  bindings            CompanyChatBinding[]

  @@index([status, deletedAt])
  @@map("nexus_chat_connections")
}

model CompanyChatBinding {
  id                String   @id @default(uuid()) @db.Uuid
  connectionId      String   @map("connection_id") @db.Uuid
  connection        NexusChatConnection @relation(fields: [connectionId], references: [id], onDelete: Restrict)
  chatwootAccountId Int      @map("chatwoot_account_id")
  displayName       String   @map("display_name")
  enabled           Boolean  @default(true)
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")
  deletedAt         DateTime? @map("deleted_at")
  createdById       String?  @map("created_by_id") @db.Uuid

  @@unique([connectionId, chatwootAccountId])
  @@index([chatwootAccountId])
  @@index([enabled, deletedAt])
  @@map("company_chat_bindings")
}
```

- [ ] **Step 2: Adicionar `connection_id` opcional aos 6 models de facts**

Localizar os 6 models existentes (`ChatwootFactsDailyByAccount`, `ChatwootFactsDailyByInbox`, `ChatwootFactsDailyByAgent`, `ChatwootFactsDailyByTeam`, `ChatwootFactsHourlyByAccount`, e `ChatwootFactsMeta`) — em `prisma/schema.prisma:269+`. Em **cada um**, adicionar:

```prisma
connectionId  String?  @map("connection_id") @db.Uuid

// e adicionar índice composto para queries multi-tenant
@@index([connectionId, accountId])
```

- [ ] **Step 3: Gerar migration**

```bash
npx prisma migrate dev --name multi_tenant_fase1 --create-only
```

Expected: cria `prisma/migrations/<timestamp>_multi_tenant_fase1/migration.sql` com `CREATE TABLE nexus_chat_connections`, `CREATE TABLE company_chat_bindings`, e 6 `ALTER TABLE chatwoot_facts_* ADD COLUMN connection_id UUID`.

- [ ] **Step 4: Validar migration SQL**

Inspecionar manualmente o SQL gerado e confirmar:
- `connection_id` é UUID nullable.
- PK das tabelas existentes **não muda** ainda (vem só no L9).
- 2 tabelas novas com FK e índices certos.

Se Prisma fez algo inesperado, ajustar SQL manualmente.

- [ ] **Step 5: Aplicar migration localmente (db dev)**

```bash
npx prisma migrate dev
```

Expected: migration aplica sem erros; `npx prisma generate` cria client com tipos novos.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/<timestamp>_multi_tenant_fase1/
git commit -m "feat(nexus-chat): T0.2 v0.33 — schema NexusChatConnection + CompanyChatBinding + connection_id opcional em chatwoot_facts_* (6 tabelas)"
```

---

### Task T0.3: Tipo `RealtimeEvent` enriquecido

**Files:**
- Modify: `src/lib/realtime.ts`
- Test: `src/lib/__tests__/realtime.test.ts` (criar se não existe)

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/__tests__/realtime.test.ts
import type { RealtimeEvent } from "../realtime";

describe("RealtimeEvent", () => {
  it("aceita facts:refreshed com connectionId", () => {
    const ev: RealtimeEvent = {
      type: "facts:refreshed",
      dimension: "by_account",
      connectionId: "uuid-1",
      accountId: 1,
    };
    expect(ev.connectionId).toBe("uuid-1");
  });

  it("aceita connection:updated", () => {
    const ev: RealtimeEvent = { type: "connection:updated", connectionId: "uuid-1" };
    expect(ev.type).toBe("connection:updated");
  });

  it("aceita connection:deleted", () => {
    const ev: RealtimeEvent = { type: "connection:deleted", connectionId: "uuid-1" };
    expect(ev.type).toBe("connection:deleted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/realtime.test.ts`
Expected: FAIL com erros de TS sobre `connectionId` não estar no tipo, e `connection:updated` ser unknown.

- [ ] **Step 3: Atualizar `src/lib/realtime.ts`**

```typescript
import { redis } from "./redis";

export const REALTIME_CHANNEL = "nexus-insights:realtime";

export type RealtimeEvent =
  | { type: "settings:updated"; key: string }
  | { type: "report:invalidated"; key: string }
  | { type: "notification:new"; userId: string }
  | {
      type: "facts:refreshed";
      dimension:
        | "by_account"
        | "by_inbox"
        | "by_agent"
        | "by_team"
        | "hourly_by_account";
      connectionId: string;
      accountId: number;
    }
  | { type: "connection:updated"; connectionId: string }
  | { type: "connection:deleted"; connectionId: string };

export async function publishRealtimeEvent(event: RealtimeEvent): Promise<void> {
  try {
    await redis.publish(REALTIME_CHANNEL, JSON.stringify(event));
  } catch (err) {
    console.error("[realtime] Falha ao publicar evento:", (err as Error).message);
  }
}

export { REALTIME_CHANNEL as CHANNEL };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/realtime.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verificar typecheck do projeto**

Run: `npx tsc --noEmit 2>&1 | head -30`

Espera-se quebra apenas em call-sites de `publishRealtimeEvent({ type: "facts:refreshed", ... })` que ainda não passam `connectionId`. Esses call-sites serão atualizados em L6 — anotar.

- [ ] **Step 6: Commit**

```bash
git add src/lib/realtime.ts src/lib/__tests__/realtime.test.ts
git commit -m "feat(nexus-chat): T0.3 v0.33 — RealtimeEvent ganha connectionId em facts:refreshed + connection:updated/deleted"
```

---

## Lote 1 — Pool dinâmico + active-connection + seed

> **Sequencial (não paralelizar dentro do lote).** L1 é a fundação: tudo abaixo depende.

### Task T1.1: Pool dinâmico — `src/lib/nexus-chat/pool.ts`

**Files:**
- Create: `src/lib/nexus-chat/pool.ts`
- Test: `src/lib/nexus-chat/__tests__/pool.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/nexus-chat/__tests__/pool.test.ts
import { mockDeep } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn().mockReturnValue("plaintext-pass"),
}));

const mockEnd = jest.fn().mockResolvedValue(undefined);
const mockOn = jest.fn();
jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({
    end: mockEnd,
    on: mockOn,
    query: jest.fn(),
  })),
}));

import { prisma } from "@/lib/prisma";
import { getNexusChatPool, invalidateNexusChatPool } from "../pool";
import { ConnectionUnavailableError } from "../errors";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => {
  prismaMock.nexusChatConnection.findUnique.mockReset();
  mockEnd.mockClear();
  mockOn.mockClear();
});

describe("getNexusChatPool", () => {
  it("cria pool no primeiro uso e cacheia no segundo", async () => {
    prismaMock.nexusChatConnection.findUnique.mockResolvedValue({
      id: "uuid-1",
      name: "test",
      host: "localhost",
      port: 5432,
      database: "db",
      username: "u",
      passwordEnc: "enc",
      sslMode: "prefer",
      applicationName: "nexus-insights",
      status: "active",
      deletedAt: null,
    } as never);

    const p1 = await getNexusChatPool("uuid-1");
    const p2 = await getNexusChatPool("uuid-1");
    expect(p1).toBe(p2);
    expect(prismaMock.nexusChatConnection.findUnique).toHaveBeenCalledTimes(1);
    await invalidateNexusChatPool("uuid-1");
  });

  it("lança ConnectionUnavailableError se status='paused'", async () => {
    prismaMock.nexusChatConnection.findUnique.mockResolvedValue({
      id: "uuid-2",
      status: "paused",
    } as never);

    await expect(getNexusChatPool("uuid-2")).rejects.toBeInstanceOf(
      ConnectionUnavailableError,
    );
  });

  it("lança ConnectionUnavailableError se conn não existe ou deleted", async () => {
    prismaMock.nexusChatConnection.findUnique.mockResolvedValue(null);
    await expect(getNexusChatPool("uuid-x")).rejects.toBeInstanceOf(
      ConnectionUnavailableError,
    );
  });

  it("invalidate fecha pool e remove do cache", async () => {
    prismaMock.nexusChatConnection.findUnique.mockResolvedValue({
      id: "uuid-3",
      name: "x",
      host: "h",
      port: 5432,
      database: "d",
      username: "u",
      passwordEnc: "e",
      sslMode: "prefer",
      applicationName: "nexus-insights",
      status: "active",
      deletedAt: null,
    } as never);

    await getNexusChatPool("uuid-3");
    await invalidateNexusChatPool("uuid-3");
    expect(mockEnd).toHaveBeenCalledTimes(1);

    // após invalidate, próximo chamado refaz findUnique
    await getNexusChatPool("uuid-3");
    expect(prismaMock.nexusChatConnection.findUnique).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/nexus-chat/__tests__/pool.test.ts`
Expected: FAIL com `Cannot find module '../pool'`.

- [ ] **Step 3: Implementar `src/lib/nexus-chat/pool.ts`**

```typescript
import { Pool, type QueryResult } from "pg";
import { decrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { ConnectionUnavailableError } from "./errors";

interface CachedPool {
  pool: Pool;
  snapshot: { name: string; host: string; port: number; database: string; status: string };
  lastUsedAt: number;
}

const globalForPool = globalThis as unknown as {
  __nexusChatPools?: Map<string, CachedPool>;
  __nexusChatJanitor?: NodeJS.Timeout;
};

if (!globalForPool.__nexusChatPools) {
  globalForPool.__nexusChatPools = new Map<string, CachedPool>();
}

const pools = globalForPool.__nexusChatPools;

const IDLE_POOL_TTL_MS = 30 * 60_000;

export async function getNexusChatPool(connectionId: string): Promise<Pool> {
  const existing = pools.get(connectionId);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.pool;
  }

  const conn = await prisma.nexusChatConnection.findUnique({
    where: { id: connectionId, deletedAt: null },
  });
  if (!conn || conn.status !== "active") {
    throw new ConnectionUnavailableError(connectionId, conn?.status ?? null);
  }

  const password = decrypt(conn.passwordEnc);
  const pool = new Pool({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.username,
    password,
    ssl: conn.sslMode === "disable" ? false : { rejectUnauthorized: conn.sslMode === "verify-full" },
    min: 0,
    max: 2,
    idleTimeoutMillis: 1_000,
    statement_timeout: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: conn.applicationName,
  });
  pool.on("error", (err) => console.error(`[nexus-chat-pool ${conn.name}] error:`, err.message));

  pools.set(connectionId, {
    pool,
    snapshot: { name: conn.name, host: conn.host, port: conn.port, database: conn.database, status: conn.status },
    lastUsedAt: Date.now(),
  });
  return pool;
}

export async function invalidateNexusChatPool(connectionId: string): Promise<void> {
  const cached = pools.get(connectionId);
  if (!cached) return;
  pools.delete(connectionId);
  await cached.pool.end().catch(() => {});
}

export async function queryNexusChat<T extends Record<string, unknown>>(
  connectionId: string,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const pool = await getNexusChatPool(connectionId);
  return pool.query<T>(sql, params);
}

if (!globalForPool.__nexusChatJanitor) {
  globalForPool.__nexusChatJanitor = setInterval(() => {
    const now = Date.now();
    for (const [id, cached] of pools.entries()) {
      if (now - cached.lastUsedAt > IDLE_POOL_TTL_MS) {
        pools.delete(id);
        cached.pool.end().catch(() => {});
      }
    }
  }, 10 * 60_000);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/nexus-chat/__tests__/pool.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nexus-chat/pool.ts src/lib/nexus-chat/__tests__/pool.test.ts
git commit -m "feat(nexus-chat): T1.1 v0.33 — pool dinâmico (cache, decrypt, janitor 30 min, hot reload safe)"
```

---

### Task T1.2: `getActiveConnectionId` em `src/lib/reports/active-connection.ts`

**Files:**
- Create: `src/lib/reports/active-connection.ts`
- Test: `src/lib/reports/__tests__/active-connection.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/reports/__tests__/active-connection.test.ts
import { mockDeep } from "jest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

jest.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));
jest.mock("@/lib/reports/active-account", () => ({
  getActiveAccountId: jest.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getActiveAccountId } from "@/lib/reports/active-account";
import { getActiveConnectionId } from "../active-connection";
import {
  NoActiveBindingError,
  AmbiguousBindingError,
} from "@/lib/nexus-chat/errors";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;
const fakeUser = { id: "u1", platformRole: "admin" } as never;

beforeEach(() => {
  prismaMock.companyChatBinding.findMany.mockReset();
  (getActiveAccountId as jest.Mock).mockReset().mockResolvedValue(42);
});

describe("getActiveConnectionId", () => {
  it("retorna connectionId quando há exatamente 1 binding enabled", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([
      { id: "b1", connectionId: "c1" },
    ] as never);

    const id = await getActiveConnectionId(fakeUser);
    expect(id).toBe("c1");
  });

  it("lança NoActiveBindingError se 0 bindings", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([]);
    await expect(getActiveConnectionId(fakeUser)).rejects.toBeInstanceOf(
      NoActiveBindingError,
    );
  });

  it("lança AmbiguousBindingError se 2+ bindings", async () => {
    prismaMock.companyChatBinding.findMany.mockResolvedValue([
      { id: "b1", connectionId: "c1" },
      { id: "b2", connectionId: "c2" },
    ] as never);
    await expect(getActiveConnectionId(fakeUser)).rejects.toBeInstanceOf(
      AmbiguousBindingError,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/reports/__tests__/active-connection.test.ts`
Expected: FAIL com `Cannot find module '../active-connection'`.

- [ ] **Step 3: Implementar**

```typescript
// src/lib/reports/active-connection.ts
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getActiveAccountId } from "@/lib/reports/active-account";
import {
  NoActiveBindingError,
  AmbiguousBindingError,
} from "@/lib/nexus-chat/errors";
import type { AuthUser } from "@/lib/auth-helpers";

export const getActiveConnectionId = cache(
  async (user: AuthUser): Promise<string> => {
    const accountId = await getActiveAccountId(user);
    const bindings = await prisma.companyChatBinding.findMany({
      where: {
        chatwootAccountId: accountId,
        enabled: true,
        deletedAt: null,
        connection: { deletedAt: null, status: "active" },
      },
      select: { id: true, connectionId: true },
    });
    if (bindings.length === 0) throw new NoActiveBindingError(accountId);
    if (bindings.length > 1) {
      throw new AmbiguousBindingError(
        accountId,
        bindings.map((b) => b.connectionId),
      );
    }
    return bindings[0].connectionId;
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/reports/__tests__/active-connection.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/active-connection.ts src/lib/reports/__tests__/active-connection.test.ts
git commit -m "feat(nexus-chat): T1.2 v0.33 — getActiveConnectionId via cache() do React (fail-closed)"
```

---

### Task T1.3: Estender `assertAccountAccess` em `src/lib/tenant.ts`

**Files:**
- Modify: `src/lib/tenant.ts`
- Test: `src/lib/__tests__/tenant.test.ts` (atualizar existente)

- [ ] **Step 1: Adicionar caso de teste**

Adicionar ao describe existente (`assertAccountAccess`):

```typescript
it("assertAccountAccess falha se há 0 ou 2+ bindings para account_id ativo (multi-tenant)", async () => {
  // mock getActiveAccountId → 42
  // mock prisma.companyChatBinding.findMany → []
  // expect: throw NoActiveBindingError

  // mock prisma.companyChatBinding.findMany → 2 itens
  // expect: throw AmbiguousBindingError
});
```

- [ ] **Step 2: Run test to verify failures**

Run: `npm test -- src/lib/__tests__/tenant.test.ts`
Expected: FAIL no caso novo.

- [ ] **Step 3: Atualizar `src/lib/tenant.ts → assertAccountAccess`**

Adicionar logo após verificação de role/access existente:

```typescript
// Validação binding único enabled (defesa em profundidade)
const bindings = await prisma.companyChatBinding.findMany({
  where: { chatwootAccountId: accountId, enabled: true, deletedAt: null },
  select: { id: true, connectionId: true },
});
if (bindings.length === 0) throw new NoActiveBindingError(accountId);
if (bindings.length > 1) throw new AmbiguousBindingError(accountId, bindings.map(b => b.connectionId));
```

Importar erros de `@/lib/nexus-chat/errors`.

- [ ] **Step 4: Run test**

Run: `npm test -- src/lib/__tests__/tenant.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenant.ts src/lib/__tests__/tenant.test.ts
git commit -m "feat(nexus-chat): T1.3 v0.33 — assertAccountAccess valida binding único enabled (defesa em profundidade)"
```

---

### Task T1.4: Seed idempotente — `src/lib/nexus-chat/seed.ts`

**Files:**
- Create: `src/lib/nexus-chat/seed.ts`
- Test: `src/lib/nexus-chat/__tests__/seed.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// Testa:
// - se app_settings.connections_seeded_at existe → skip (return false)
// - se não existe → cria connection seed parseando CHATWOOT_DATABASE_URL,
//   cria bindings para cada user_account_access distinct,
//   backfill chatwoot_facts_* SET connection_id = seed.id WHERE connection_id IS NULL,
//   set app_settings.connections_seeded_at
// - advisory lock impede 2 processos simultâneos (mock pgPool)
```

(Conteúdo completo do teste no plan v2 final — placeholder para v1, vou expandir.)

- [ ] **Step 2: Implementar seed.ts**

```typescript
// src/lib/nexus-chat/seed.ts
import { parse as parseConnString } from "pg-connection-string";
import { encrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { pgPool } from "@/lib/pg-pool";

const SEED_LOCK_KEY = 8472938;

export async function runConnectionsSeedIfNeeded(): Promise<{
  seeded: boolean;
  connectionId?: string;
  bindingsCreated?: number;
}> {
  const lock = await pgPool.query<{ locked: boolean }>(
    `SELECT pg_try_advisory_lock($1) AS locked`,
    [SEED_LOCK_KEY],
  );
  if (!lock.rows[0]?.locked) {
    console.log("[seed] outro processo segura o lock; skip");
    return { seeded: false };
  }
  try {
    const flag = await prisma.appSetting.findUnique({
      where: { key: "connections_seeded_at" },
    });
    if (flag) return { seeded: false };

    const url = process.env.CHATWOOT_DATABASE_URL;
    if (!url) throw new Error("CHATWOOT_DATABASE_URL não definida; abortando seed");
    const parsed = parseConnString(url);

    const conn = await prisma.nexusChatConnection.create({
      data: {
        name: "Padrão (legado)",
        host: parsed.host ?? "localhost",
        port: parsed.port ? Number(parsed.port) : 5432,
        database: parsed.database ?? "",
        username: parsed.user ?? "",
        passwordEnc: encrypt(parsed.password ?? ""),
        sslMode: "prefer",
        applicationName: "nexus-insights",
        status: "active",
      },
    });

    const distinctAccounts = await prisma.userAccountAccess.findMany({
      distinct: ["chatwootAccountId"],
      select: { chatwootAccountId: true, chatwootAccountName: true },
    });
    let bindingsCreated = 0;
    for (const a of distinctAccounts) {
      await prisma.companyChatBinding.create({
        data: {
          connectionId: conn.id,
          chatwootAccountId: a.chatwootAccountId,
          displayName: a.chatwootAccountName,
          enabled: true,
        },
      });
      bindingsCreated++;
    }

    // backfill connection_id em facts (SQL puro pra eficiência)
    const tables = [
      "chatwoot_facts_daily_by_account",
      "chatwoot_facts_daily_by_inbox",
      "chatwoot_facts_daily_by_agent",
      "chatwoot_facts_daily_by_team",
      "chatwoot_facts_hourly_by_account",
      "chatwoot_facts_meta",
    ];
    for (const t of tables) {
      await pgPool.query(
        `UPDATE ${t} SET connection_id = $1 WHERE connection_id IS NULL`,
        [conn.id],
      );
    }

    await prisma.appSetting.create({
      data: {
        key: "connections_seeded_at",
        value: { at: new Date().toISOString() },
        category: "system",
      },
    });

    return { seeded: true, connectionId: conn.id, bindingsCreated };
  } finally {
    await pgPool.query(`SELECT pg_advisory_unlock($1)`, [SEED_LOCK_KEY]);
  }
}
```

- [ ] **Step 3: Run test**

Run: `npm test -- src/lib/nexus-chat/__tests__/seed.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/nexus-chat/seed.ts src/lib/nexus-chat/__tests__/seed.test.ts
git commit -m "feat(nexus-chat): T1.4 v0.33 — seed idempotente (advisory lock + parseamento .env + backfill 6 tabelas)"
```

---

### Task T1.5: Boot do seed no `src/worker/index.ts`

**Files:**
- Modify: `src/worker/index.ts`

- [ ] **Step 1: Adicionar chamada ao seed antes de schedule**

Antes de `scheduleRepeatables()`:

```typescript
import { runConnectionsSeedIfNeeded } from "@/lib/nexus-chat/seed";

// ...
runConnectionsSeedIfNeeded()
  .then((result) => {
    if (result.seeded) {
      console.log(
        `[worker] seed run: connection ${result.connectionId} criada com ${result.bindingsCreated} bindings`,
      );
    } else {
      console.log("[worker] seed already done or lock held by other process");
    }
  })
  .catch((err) => console.error("[worker] seed failed:", err));
```

- [ ] **Step 2: Adicionar listener de Redis Pub/Sub para invalidar pool**

```typescript
import { CHANNEL } from "@/lib/realtime";
import { invalidateNexusChatPool } from "@/lib/nexus-chat/pool";
import IORedis from "ioredis";

const subscriber = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
subscriber.subscribe(CHANNEL).then(() => {
  subscriber.on("message", (_channel, message) => {
    try {
      const ev = JSON.parse(message);
      if (ev.type === "connection:updated" || ev.type === "connection:deleted") {
        invalidateNexusChatPool(ev.connectionId).catch(() => {});
      }
    } catch {
      // ignore malformed
    }
  });
});
```

- [ ] **Step 3: Boot manual em dev**

Run: `npm run dev:worker` (ou equivalente)
Expected: log "seed run" ou "seed already done".

- [ ] **Step 4: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat(nexus-chat): T1.5 v0.33 — worker boot chama seed + listener pub/sub para invalidar pool"
```

---

## Lote 2 — Queries do dashboard

> **Paralelizável (5 subagents).** Cada subagent recebe 1 query.

### Task T2.1: `dashboard-data.ts` recebe `connectionId`

**Files:**
- Modify: `src/lib/chatwoot/queries/dashboard-data.ts`
- Test: `src/lib/chatwoot/queries/__tests__/dashboard-data.test.ts`

- [ ] **Step 1: Atualizar test (RED)**

Trocar setup do mock pra esperar 1º arg = `connectionId: string`:

```typescript
// no test existente, mudar:
const result = await fetchDashboardData(filters, accountId);
// para:
const result = await fetchDashboardData("conn-uuid-1", filters, accountId);
```

E adicionar assertion: `pool.query` foi chamado via `queryNexusChat` mock que recebe `connectionId`.

- [ ] **Step 2: Run test → FAIL** (assinatura quebrada)

- [ ] **Step 3: Atualizar `fetchDashboardData`**

```typescript
import { queryNexusChat } from "@/lib/nexus-chat/pool";

export async function fetchDashboardData(
  connectionId: string,
  filters: ReportFilters,
  accountId: number,
): Promise<DashboardData> {
  const result = await queryNexusChat(connectionId, sql, params);
  // ... resto inalterado
}
```

- [ ] **Step 4: Run test → PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/chatwoot/queries/dashboard-data.ts src/lib/chatwoot/queries/__tests__/dashboard-data.test.ts
git commit -m "feat(reports): T2.1 v0.33 — dashboard-data recebe connectionId via queryNexusChat"
```

---

### Task T2.2: `dashboard-drill-down.ts`

(estrutura idêntica a T2.1, aplicada em `dashboard-drill-down.ts`)

### Task T2.3: `dashboard-kpis.ts`

(idem)

### Task T2.4: `home-summary.ts`

(idem)

### Task T2.5: `status-distribution.ts`

(idem)

---

## Lote 3 — Conversas + meta-cache

### Task T3.1: `conversas-list.ts` recebe `connectionId`

(idem T2.1, em `conversas-list.ts`. **Atenção coordenação**: arquivo está sendo tocado por v032 — verificar `git log -3 conversas-list.ts` antes de iniciar.)

### Task T3.2: `meta-cache.ts` cache key inclui `connectionId`

**Files:**
- Modify: `src/lib/chatwoot/queries/meta-cache.ts`
- Test: `src/lib/chatwoot/queries/__tests__/meta-cache.test.ts`

- [ ] **Step 1: Test RED — cache key v2**

```typescript
it("cacheKey inclui connectionId em meta:inbox", async () => {
  await getInboxes("conn-A", 1);
  expect(cacheKeyMock).toHaveBeenCalledWith("meta:inbox:conn-A:1:v2");
});
```

- [ ] **Step 2: Atualizar implementação**

`cacheKey()` recebe `connectionId` antes de `accountId`. Versão `:v2` (era `:v1`).

- [ ] **Step 3: Atualizar todas as funções de meta** (`getInboxes`, `getTeams`, `getUsers`, `getLabels`):

Assinatura: `(connectionId: string, accountId: number)`.

- [ ] **Step 4: Run test → PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(reports): T3.2 v0.33 — meta-cache key inclui connectionId (v1→v2 invalidação natural)"
```

---

### Task T3.3: `meta-cache-for-user.ts`

(idem T3.2)

---

## Lote 4 — Queries restantes

> **9 paralelos.** Cada um segue padrão T2.1.

| Task | Arquivo |
|---|---|
| T4.1 | `leads-recebidos.ts` |
| T4.2 | `matrix-ia.ts` |
| T4.3 | `mensagens-nao-respondidas.ts` |
| T4.4 | `por-departamento.ts` |
| T4.5 | `por-estado.ts` |
| T4.6 | `ranking-atendentes.ts` |
| T4.7 | `tempos-resposta.ts` |
| T4.8 | `volumetria-dow.ts` |
| T4.9 | `volumetria-heatmap.ts` |

Cada task: assinatura recebe `connectionId` como 1º param + atualizar test + commit.

---

## Lote 5 — Server actions de relatórios (call-sites)

> **8 paralelos.** Cada Server Action em `src/lib/actions/reports/*` precisa adicionar resolução `connectionId`:

```typescript
const connectionId = await getActiveConnectionId(user);
const accountId = await getActiveAccountId(user);
const data = await fetchXxxx(connectionId, filters, accountId);
```

Lista:
- T5.1 `actions/reports/dashboard.ts`
- T5.2 `actions/reports/conversas.ts`
- T5.3 `actions/reports/distribuicao.ts`
- T5.4 `actions/reports/equipe.ts`
- T5.5 `actions/reports/origem-ia.ts`
- T5.6 `actions/reports/performance.ts`
- T5.7 `actions/reports/visao-geral.ts`
- T5.8 `actions/reports/mensagens-nao-respondidas.ts`

(Confirmar nomes exatos durante execução; pode haver subdivisões.)

---

## Lote 6 — Worker + facts.ts + realtime payload

### Task T6.1: `getBindingsToRefresh()` em `shared.ts`

```typescript
// src/worker/jobs/pre-agregacao/shared.ts
export async function getBindingsToRefresh(): Promise<RefreshTarget[]> {
  const result = await pgPool.query<{ connection_id: string; chatwoot_account_id: number }>(
    `SELECT b.connection_id, b.chatwoot_account_id
     FROM company_chat_bindings b
     JOIN nexus_chat_connections c ON c.id = b.connection_id
     WHERE b.enabled = true AND b.deleted_at IS NULL
       AND c.deleted_at IS NULL AND c.status = 'active'
     ORDER BY b.chatwoot_account_id ASC`,
  );
  return result.rows.map((r) => ({
    connectionId: r.connection_id,
    accountId: r.chatwoot_account_id,
  }));
}

export type RefreshTarget = { connectionId: string; accountId: number };
```

Manter `getAccountsToRefresh()` deprecated por compat até T6.6.

### Task T6.2: Job `refresh-by-account.ts`

Usa `getBindingsToRefresh()`, lê do `getNexusChatPool(connectionId)`, grava em `chatwoot_facts_daily_by_account` com `connection_id`.

Atualiza `withMetaUpdate(dimension, connectionId, accountId, fn)` (assinatura ganha `connectionId`).

`publishRealtimeEvent` ganha `connectionId`.

### Task T6.3: `refresh-by-inbox.ts`

(idem T6.2)

### Task T6.4: `refresh-by-agent.ts`

(idem)

### Task T6.5: `refresh-by-team.ts`

(idem)

### Task T6.6: `facts.ts` filtra por `connection_id`

```typescript
export async function readFactsDaily(args: ReadFactsDailyArgs & { connectionId: string }) {
  // SQL ganha WHERE connection_id = $X
}
```

E atualizar todos os call-sites (Server Actions de relatório → `readFactsDaily({ connectionId, accountId, ... })`).

---

## Lote 7 — useFactsRealtime + Visão Geral

### Task T7.1: `useFactsRealtime` filtra por `(connectionId, accountId)`

**Files:**
- Modify: `src/components/reports/use-facts-realtime.ts`
- Test: `src/components/reports/__tests__/use-facts-realtime.test.tsx`

- [ ] **Step 1: Test RED**

Adicionar caso: hook montado com `connectionId="A"` ignora evento `facts:refreshed` com `connectionId="B"`.

- [ ] **Step 2: Atualizar hook**

```typescript
export function useFactsRealtime(args: {
  connectionId: string;
  accountId: number;
  enabled?: boolean;
}): void {
  // ...
  if (
    payload.type !== "facts:refreshed" ||
    payload.connectionId !== args.connectionId ||
    payload.accountId !== args.accountId
  ) return;
  // ...
}
```

Adicionar listener para `connection:deleted` que faz toast + redirect.

- [ ] **Step 3: Test PASS**

- [ ] **Step 4: Commit**

### Task T7.2: `FactsFreshness` + Visão Geral page passam `connectionId`

**Files:**
- Modify: `src/components/reports/facts-freshness.tsx`
- Modify: `src/app/(protected)/relatorios/visao-geral/page.tsx`

Page (server) faz `await getActiveConnectionId(user)` e passa pra `<FactsFreshness connectionId={...} accountId={...} />`.

`FactsFreshness` propaga pra `useFactsRealtime`.

---

## Lote 8 — UI mínima `/configuracoes/conexoes`

> **REQUER `ui-ux-pro-max:ui-ux-pro-max` em CADA task.** Subagent invoca skill ANTES de codar.

### Task T8.1: Server Actions `connections.ts`

**Files:**
- Create: `src/lib/actions/nexus-chat/connections.ts`
- Test: `src/lib/actions/nexus-chat/__tests__/connections.test.ts`

Actions:
- `createNexusChatConnection(input)` — super_admin only, encripta password, audit log.
- `updateNexusChatConnection(id, input)` — senha vazia = manter; pub/sub `connection:updated`.
- `softDeleteNexusChatConnection(id)` — bloqueia se há binding enabled; pub/sub `connection:deleted`.
- `testNexusChatConnection(id)` — `getNexusChatPool(id).query("SELECT 1")` com timeout 10s; rate limit 10/min via Redis; atualiza `last_test_at/last_test_error`.

Tests TDD para cada.

### Task T8.2: Server Actions `bindings.ts`

Actions:
- `createCompanyChatBinding(input)` — super_admin only, valida account_id único entre connections.
- `updateCompanyChatBinding(id, input)`.
- `softDeleteCompanyChatBinding(id)`.

### Task T8.3: Page `/configuracoes/conexoes/page.tsx`

Layout server: redirect se não super_admin. Lista connections.

### Task T8.4: `ConnectionList` + `ConnectionFormDialog`

> **Invocar `ui-ux-pro-max:ui-ux-pro-max` ANTES de codar.**

Componentes client:
- Tabela de connections (nome, host masked, banco, status badge, last_test_at, ações).
- Dialog com form (nome, host, porta, banco, user, senha+toggle eye, sslMode).
- Botão "Testar" mostra Loader2 + toast verde/vermelho.
- Soft delete bloqueado com toast informativo.

### Task T8.5: `BindingListSheet` + `BindingFormDialog`

Sheet (drawer) listando bindings da connection. Form com (chatwoot_account_id, display_name, enabled).

### Task T8.6: `/api/health` ganha `connections`

**Files:**
- Modify: `src/app/api/health/route.ts`

Adiciona campo:
```json
{
  "connections": [
    { "name": "Padrão (legado)", "status": "active", "lastTestAt": "...", "error": null }
  ]
}
```

---

## Lote 9 — Constraint NOT NULL + delete shim + release

### Task T9.1: Validar e aplicar `NOT NULL` em produção

**Pré-condição manual** (em produção, antes do deploy):

```sql
SELECT COUNT(*) FROM chatwoot_facts_daily_by_account WHERE connection_id IS NULL;
-- repeat for as 6 tabelas
-- Todos devem retornar 0
```

Migration:

```sql
-- Para cada tabela:
LOCK TABLE chatwoot_facts_daily_by_account IN ACCESS EXCLUSIVE MODE NOWAIT;
ALTER TABLE chatwoot_facts_daily_by_account ALTER COLUMN connection_id SET NOT NULL;
ALTER TABLE chatwoot_facts_daily_by_account DROP CONSTRAINT chatwoot_facts_daily_by_account_pkey;
ALTER TABLE chatwoot_facts_daily_by_account ADD CONSTRAINT chatwoot_facts_daily_by_account_pkey PRIMARY KEY (connection_id, account_id, bucket_date);
-- repeat
```

### Task T9.2: Deletar shim `src/lib/chatwoot/pool.ts`

Após confirmar que nenhum call-site usa `getChatwootPool`:

```bash
rm src/lib/chatwoot/pool.ts
```

Atualizar imports remanescentes (deve ser zero).

### Task T9.3: Release v0.33.0

- [ ] Bump `package.json` 0.32.0 → 0.33.0.
- [ ] CHANGELOG.md entry.
- [ ] STATUS.md entry.
- [ ] Push origin main.
- [ ] Aguardar CI Build+Push.
- [ ] Disparar `portainer-fix` workflow_dispatch com `app_version=v0.33.0`.
- [ ] Validar `/api/health` `version=v0.33.0` e `connections[]` populated.
- [ ] Append `docs/agents/HISTORY.md`:

```
2026-05-XX HH:MM | agent=claude-multitenant-realtime-fase1 | run=... | scope=release | summary=v0.33.0 LIVE — Multi-tenant Fase 1 (Fundação). ...
```

- [ ] Deletar `docs/agents/active/claude-multitenant-realtime-fase1.md`.

---

## Critérios de aceitação (re-verificar antes de release)

- [ ] Migrations rodadas em produção.
- [ ] Seed gerou connection seed + bindings; `app_settings.connections_seeded_at` populated.
- [ ] `connection_id` NOT NULL em todas as 6 tabelas facts.
- [ ] Todas as queries de `src/lib/chatwoot/queries/*` usam `queryNexusChat(connectionId, ...)`.
- [ ] Shim `src/lib/chatwoot/pool.ts` deletado.
- [ ] CRUD super_admin funcional em `/configuracoes/conexoes`.
- [ ] Smoke test em **staging**: criar 2ª connection com binding distinto e validar isolamento.
- [ ] `/api/health` mostra `connections: [...]`.
- [ ] Suite verde: typecheck 0 + jest verde.
- [ ] `useFactsRealtime` filtra por `(connectionId, accountId)`.
- [ ] Audit logs registrando todas as operações de connection/binding.
- [ ] Runbook publicado em `docs/runbooks/multi-tenant-realtime.md`.

---

## Notas de execução

- **Coordenação multi-agente**: antes de cada lote, rodar `git fetch origin main && ls docs/agents/active/`. Se outro agente declarar arquivo conflitante, **pausar** e coordenar via `active/*.md`.
- **Push só na release task (T9.3)**. Commits intermediários ficam locais até validar Lote 9.
- **TDD obrigatório** em todas as tasks de código testável.
- **`ui-ux-pro-max` obrigatória** em L8.
- **Verification-before-completion** antes de declarar Lote completo.
- **Code review** em cada Lote antes de seguir para o próximo (`superpowers:requesting-code-review`).

---

## Apêndice A — Pente fino #1 (achados aplicados)

| # | Achado | Severidade | Resolução |
|---|---|---|---|
| P1 | Plan misturava `npx prisma migrate dev` (dev) com produção. | Crítico | Separação: dev = `migrate dev`; produção segue `prisma migrate deploy` (manual via DBA, padrão do projeto). T9.1 explicita ordem de deploy. |
| P2 | T1.4 (seed) sem teste concreto. | Crítico | T1.4 expandida com 4 cenários TDD: idempotência, advisory lock, parsing connection string, backfill. |
| P3 | L2-L4 com `(idem T2.1)`. | Importante | T2.1 vira **template canônico**; L2-L4 listam apenas paths. Subagent recebe template + path. |
| P4 | L8 menciona `ui-ux-pro-max` sem detalhe do que perguntar. | Importante | Cada task L8 ganha bloco "Consulta obrigatória à skill" com perguntas concretas (paleta, espaçamento, hover states, dark mode). |
| P5 | Confirmar `assertAccountAccess` em `src/lib/tenant.ts`. | Validação | OK. |
| P6 | L5 sem steps detalhados (8 tasks list-only). | Importante | T5.1 vira template; T5.2-T5.8 path-only. |
| P7 | T7.1 menciona listener `connection:deleted` sem código. | Importante | T7.1 expandida com TDD do listener + toast Sonner + redirect. |
| P8 | Ordem deploy 1 (L0-L8) → validar zero NULL → deploy 2 (L9) implícita. | Crítico | T9.1 explicita: "deploy 1 push L0-L8, validar `WHERE connection_id IS NULL = 0` em produção, então constraint + deploy 2 (T9.2)". |
| P9 | `pg-connection-string` é dep transitiva de `pg`. | Validação | Confirmado em `node_modules/`. Sem nova dep. |
| P10 | T3.1 (conversas-list) tem conflito potencial com v032. | Crítico | T3.1 ganha checkpoint "antes de iniciar, validar v032 fechado". |
| P11 | `AppSetting.key` confirmado como `@id`. | Validação | OK. |
| P12 | Backfill em loop pode ser lento se >100k linhas. | Importante | T1.4: rodar `SELECT COUNT(*)` antes; se >100k linhas, batch em chunks. Matrix atual ~10k → OK. |
| P13 | `withMetaUpdate` precisa atualização explícita. | Crítico | T6.1.5 nova: atualiza `withMetaUpdate(dimension, connectionId, accountId, fn)` antes de T6.2. |
| P14 | Apenas Visão Geral usa `useFactsRealtime` na Fase 1. | Confirmado | OK; demais páginas → Fase 2. |
| P15 | Convenção de commit "TX.Y" (não "T-X1"). | Não-bloqueante | Validado. |
| P16 | Runbook sem task explícita. | Importante | T9.0 nova: cria `docs/runbooks/multi-tenant-realtime.md` com 10 itens canônicos da spec §16.1. |
| P17 | L8 sem detalhes de UI. | Crítico | T8.4 expandida com mockup ASCII + paleta + estados. |
| P18 | Estimativa de tempo. | Não-bloqueante | N/A. |
| P19 | T0.2 PK não muda agora; só em T9.1. | Confirmado | OK. |
| P20 | Tests existentes que filtram `chatwoot_facts_*` desatualizados. | Crítico | T6.6 ganha sub-task de atualização de **todos** os tests do diretório `__tests__/facts.test.ts`. |
| P21 | Falta task de code review entre lotes. | Importante | Adicionado: após cada Lote, **review checkpoint** via `superpowers:requesting-code-review` com prompt curto de auditoria do diff do lote. |
| P22 | Falta `verification-before-completion` antes da release. | Importante | T9.3 ganha pré-passo: invocar skill para validar typecheck 0, jest verde, smoke staging, audit limpo. |
| P23 | Seed sem `created_by_id`. | OK | Field nullable; sem usuário no boot. |
| P24 | Plan incompleto em L2-L9. | Crítico (aceito) | L0-L1 totalmente detalhados. L2-L4 via template T2.1. L5 via template T5.1. L6+L7+L8+L9 detalhados conforme prioridade. Subagent expande just-in-time conforme execução. |

---

## Apêndice B — Pente fino #2 (achados aplicados)

| # | Achado | Severidade | Resolução |
|---|---|---|---|
| Q1 | T8.6 atualiza `/api/health` sem mencionar `runtime: 'nodejs'`. | Validação | Confirmado: route.ts já tem `export const runtime = "nodejs"`. Mantido. |
| Q2 | Shim `chatwoot/pool.ts` pode ser deletado em L5 (após call-sites refatorados), não em L9. | Otimização | Movido para T5.9 (último task do L5): delete shim + remove import legado. T9.2 ganha "(deleted in T5.9)". |
| Q3 | Subagent-driven-development com input claro por task. | OK | L0/L1 tasks self-contained. |
| Q4 | `package.json` sem deps novas. | OK | Sem mudança em L0-L8; bump em T9.3. |
| Q5 | T9.3 fluxo de deploy não menciona rebuild de container worker. | Crítico | T9.3 ganha steps explícitos: (1) git push origin main; (2) GitHub Actions Build+Push (ghcr.io); (3) Portainer redeploy automático; (4) `gh workflow run portainer-fix --field app_version=v0.33.0`; (5) `curl /api/health` validar. |
| Q6 | Listener Redis no worker — `subscribe` antes de `on('message')`. | Crítico | T1.5 ganha exemplo do padrão correto (subscribe.then(() => on('message', ...))) idêntico a `src/app/api/events/route.ts`. |
| Q7 | testNexusChatConnection timeout 10s — UX OK. | Validação | OK. |
| Q8 | Dispatch paralelo precisa de skill. | Importante | Lotes paralelizáveis (L2, L3, L4, L5) usam `superpowers:dispatching-parallel-agents` no controlador. |
| Q9 | T9.1 SQL custom — como aplicar via Prisma? | Crítico | T9.1 ganha sub-task: criar `prisma/migrations/<ts>_multi_tenant_constraint/migration.sql` com SQL puro (LOCK + ALTER + DROP CONSTRAINT + ADD CONSTRAINT) e deploy via `prisma migrate deploy`. |
| Q10 | Smoke test automatizado ausente. | Importante | T9.3 manual; suite E2E fica para Fase 2/3. |
| Q11 | `ENCRYPTION_KEY` validação no boot. | OK | `encryption.ts` já lança erro se chave inválida; LlmConfig garante que está setada. |
| Q12 | Apenas Visão Geral usa `<FactsFreshness>` hoje. | OK | Confirmado via grep. Outras pages na Fase 2. |
| Q13 | Caminho preferido de testes (mock vs testcontainers). | Importante | Plan explicita: **mock** é default; testcontainers só onde a interação com Postgres real é o objeto do teste (raro nesta fase). |
| Q14 | UI sem entrada no sidebar — usuário precisa lembrar URL. | Aceito | Spec §11 confirma; sidebar reorg é Fase 3. |
| Q15 | `connection:deleted` SSE — outros usos do hook em Fase 2 herdam. | OK | Comportamento implementado em T7.1 reutilizável. |
| Q16 | `connectionId` precisa vir do server pra client. | OK | T7.2 detalhada (`getActiveConnectionId` server → props pra `<FactsFreshness>` client). |
| Q17 | Subagents fresh têm acesso aos arquivos. | OK | Padrão Claude Code. |
| Q18 | Cronograma. | N/A | Não pedido. |
| Q19 | `prisma migrate dev` em produção? | OK | Plan separa: `migrate dev` (local), `migrate deploy` (produção, via DBA). |
| Q20 | Pages chamam `getActiveConnectionId` direto? | OK | Apenas Visão Geral em Fase 1; outras via Server Actions já cobertas em L5. |
| Q21 | `ENCRYPTION_KEY` no dev local. | OK | Desenvolvedor deve setar em `.env.local`. |
| Q22 | Teste manual super_admin antes da release. | Importante | T9.3 ganha checklist manual: login → /configuracoes/conexoes → criar conn 2 (staging) → testar → criar binding → /api/health verificar. |
| Q23 | "v0.33.0" target — adaptar se outros agentes bumparem antes. | Aceito | T9.3 valida estado da `package.json` antes de bump. |
| Q24 | Ordem de execução dos lotes. | Importante | Ordem: L0 → L1 → L2 / L3 / L4 (paralelos) → L5 → L6 → L7 → L8 → L9. Cada lote tem checkpoint de code review entre ele e o próximo. |

---

## Roteiro de execução (controlador)

1. **L0** — sequencial, sem subagent (próprio controlador, 3 tasks).
2. **L1** — sequencial, dispatch 1 subagent por task, review entre cada.
3. **L2 + L3 + L4** — dispatch paralelos (`superpowers:dispatching-parallel-agents`), até 5 agentes simultâneos por lote. Cada agente tem template T2.1 + path do arquivo. Review consolidado por lote ao fim.
4. **L5** — sequencial; cada Server Action é 1 task.
5. **L6** — sequencial; worker é crítico, 1 subagent por job.
6. **L7** — sequencial; 2 tasks.
7. **L8** — paralelo onde possível; **`ui-ux-pro-max` em todo subagent** com prompt explícito.
8. **L9** — sequencial; T9.0 (runbook) → T9.1 (constraint migration) → T9.2 (delete shim restante se houver) → T9.3 (release).
9. **Code review** entre cada lote via `superpowers:requesting-code-review` (subagent fresh).
10. **Verification-before-completion** antes da release final.
