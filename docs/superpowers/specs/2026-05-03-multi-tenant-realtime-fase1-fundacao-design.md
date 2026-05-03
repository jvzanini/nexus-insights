---
title: "Multi-tenant Realtime — Fase 1 (Fundação)"
status: "v3 (final — pronta para aprovação)"
authored_at: 2026-05-03
authored_by: claude-multitenant-realtime-fase1
target_version: v0.33.0
phase: "1 de 3 (Fundação invisível)"
depends_on: []
unblocks:
  - "Fase 2 — Webhook + realtime em todos os relatórios"
  - "Fase 3 — UI completa de gestão (sidebar reorg)"
---

# Spec — Multi-tenant Realtime — Fase 1 (Fundação)

> **v3 — pente fino #1 (28 achados) e #2 (30 achados) aplicados. Pronta para aprovação do João.**

## 1. Sumário executivo

Hoje o Nexus Insights está acoplado a **uma única instalação Chatwoot** (`CHATWOOT_DATABASE_URL` no `.env`) e o conceito de "empresa" é representado implicitamente pelo `chatwoot_account_id`. Para virar **hub multi-cliente** o produto precisa suportar:

- N instalações Chatwoot diferentes (bancos físicos distintos).
- Várias accounts dentro da mesma instalação (várias empresas no mesmo banco).
- Combinação livre dos dois.

Esta Fase 1 implementa a **fundação multi-tenant invisível ao usuário comum** (super_admin vê uma rota administrativa nova `/configuracoes/conexoes`): introduz duas tabelas (`nexus_chat_connection`, `company_chat_binding`), substitui o pool global de Postgres por **pool dinâmico por connection**, refatora todas as queries de leitura para resolver a connection a partir da empresa ativa, migra as credenciais do `.env` para o DB encriptado, adiciona `connection_id` nas tabelas `chatwoot_facts_*`, e atualiza `useFactsRealtime` para filtrar por `(connectionId, accountId)`. **Sem mudança visível para admin/manager/viewer das empresas.** O webhook em tempo real (Fase 2) e a UI completa em 4 abas (Fase 3) ficam para sessões posteriores.

## 2. Motivação

- João opera múltiplos clientes em **diferentes instalações Chatwoot** e em **diferentes accounts dentro da mesma instalação**.
- Hoje, cada cliente novo exige redeploy + alteração de `.env` — não escala.
- Sem multi-connection real, qualquer relatório consulta o único banco configurado e seria forçado a misturar dados.
- Segurança é pilar do produto: dados de empresa A nunca podem vazar para queries da empresa B; isso exige isolamento por pool e auditoria de acesso.

## 3. Estado atual (linha de base)

- `prisma/schema.prisma`: `User`, `UserAccountAccess` (tenant via `chatwoot_account_id`), `UserTeamAccess`. Não há entidade `Company` rica.
- `src/lib/chatwoot/pool.ts`: pool global singleton com `connectionString: process.env.CHATWOOT_DATABASE_URL` e queue serial (max=2 por processo, CONNECTION LIMIT 5 no DB do Chatwoot).
- `src/lib/chatwoot/queries/*`: todas as queries usam `getChatwootPool()` direto. Filtram por `account_id` mas nunca por connection.
- `src/lib/chatwoot/facts.ts`: leitura das 6 tabelas pré-agregadas (`chatwoot_facts_daily_by_*`, `chatwoot_facts_hourly_by_account`, `chatwoot_facts_meta`). Schema atual: PK `(dimension, account_id, bucket_date, ...)` — sem `connection_id`.
- `src/worker/jobs/pre-agregacao/*`: jobs cron `*/5 * * * *` que chamam `getAccountsToRefresh()` lendo `user_account_access` e disparam refresh para cada `chatwoot_account_id` distinto. Pool usado: `pgPool` (banco interno) para escrever facts e `getChatwootPool()` (banco do Chatwoot) para ler dados crus.
- `src/lib/realtime.ts`: `publishRealtimeEvent({ type: "facts:refreshed", dimension, accountId })` no canal Redis `nexus-insights:realtime`.
- `src/app/api/events/route.ts`: SSE inscrito no canal Redis e repassando para clientes.
- `src/components/reports/use-facts-realtime.ts`: hook client que escuta SSE filtrando por `accountId` e dá `router.refresh()` (debounce 5s).
- `src/components/reports/facts-freshness.tsx`: único consumidor do hook em produção (badge da Visão Geral).
- `src/lib/tenant.ts`: `getAccessibleCompanyIds`, `assertCompanyAccess`. `getActiveAccountId(user)` em `src/lib/reports/active-account.ts` (fail-closed na primeira account permitida).
- `src/lib/encryption.ts`: helper AES-256-GCM já usado em `LlmConfig.encryptedApiKey` e em integrações Power BI.

## 4. Escopo desta Fase 1

### 4.1 Objetivos (entregáveis)

1. **Modelagem nova:** tabelas `nexus_chat_connection` e `company_chat_binding`.
2. **Migration aditiva** que adiciona `connection_id` em `chatwoot_facts_daily_by_account`, `_by_inbox`, `_by_agent`, `_by_team`, `chatwoot_facts_hourly_by_account` e `chatwoot_facts_meta`.
3. **Seed automático:** na primeira execução pós-migration, criar 1 `nexus_chat_connection` chamada "Padrão (legado)" populada a partir do `.env` atual, criar `company_chat_binding`s para cada `chatwoot_account_id` distinto presente em `user_account_access`, e backfillar `connection_id` em todas as linhas de `chatwoot_facts_*` para essa connection seed.
4. **Pool dinâmico:** novo módulo `src/lib/nexus-chat/pool.ts` com `getNexusChatPool(connectionId)`, cache `Map<connectionId, Pool>`, invalidação via Redis Pub/Sub quando connection é editada/deletada. **Substitui** `src/lib/chatwoot/pool.ts` em todos os call-sites.
5. **Resolver de connection:** `getActiveConnectionId(user)` que combina `getActiveAccountId(user)` com `company_chat_binding` para devolver `connectionId`. Estende `assertAccountAccess` para também validar binding existe e está enabled.
6. **Refator das queries:** todas as funções de `src/lib/chatwoot/queries/*.ts` e `src/lib/chatwoot/facts.ts` passam a receber `connectionId` (não mais `accountId` solo) e usam o pool correspondente. Argumentos atualizados nos call-sites (Server Actions de `src/lib/actions/reports/*`).
7. **Refator dos jobs:** `src/worker/jobs/pre-agregacao/shared.ts → getAccountsToRefresh()` vira `getBindingsToRefresh()` retornando `Array<{ connectionId, accountId }>`. Jobs `refresh-by-*` recebem ambos e gravam `connection_id` nas tabelas. `publishRealtimeEvent` ganha `connectionId` no payload.
8. **Encriptação dos secrets:** senha do banco (`password_enc`) e webhook secret (`webhook_secret_enc`) usando `src/lib/encryption.ts`. Nada em texto plano.
9. **CRUD super_admin mínimo (read + create + edit + test):** Server Actions em `src/lib/actions/nexus-chat/connections.ts` e `bindings.ts`. UI mínima ainda nesta Fase 1 (suficiente para João cadastrar 1 connection e 1 binding novos manualmente e validar). UI completa com abas, eventos ao vivo, métricas → Fase 3.
10. **Sidebar:** **NÃO mexe** nesta fase. "Jobs de pré-agregação" continua existindo até a Fase 3 absorvê-lo.
11. **`useFactsRealtime` filtra por `(connectionId, accountId)`:** payload do `facts:refreshed` ganha `connectionId`; hook compara ambos. Sem isso a Fase 2 ficaria com responsabilidade que pertence ao isolamento desta fase.
12. **`meta-cache.ts` cache key inclui `connectionId`:** evita colisão entre connections com mesma `account_id`. Versão da cache key bumpada no deploy (cache antigo expira naturalmente).

### 4.2 Não-objetivos (explicitamente fora desta fase)

- ❌ Endpoint de webhook do Nexus Chat (`/api/webhooks/nexus-chat/{token}`).
- ❌ Substituir cron de 5 min por trigger event-driven.
- ❌ Montar `useFactsRealtime` em todas as páginas de relatório (Conversas, Distribuição, Equipe, etc.).
- ❌ UI rica com 4 abas (Conexões, Tempo real, Jobs, Saúde).
- ❌ Wizard de onboarding nova empresa.
- ❌ Remover entrada "Jobs de pré-agregação" do sidebar.
- ❌ Renomear tabelas/colunas `chatwoot_*` → `nexus_chat_*` (futuro, em fase própria de naming cleanup).
- ❌ Convite/email de usuário (continua login+senha sem self-signup).

## 5. Modelo de dados

### 5.1 Tabela `nexus_chat_connection`

Representa **uma instalação física do Nexus Chat** (1 banco de dados).

```prisma
model NexusChatConnection {
  id                  String   @id @default(uuid()) @db.Uuid
  name                String   // ex: "Hostinger principal", "VPS Cliente X"
  host                String
  port                Int      @default(5432)
  database            String
  username            String
  passwordEnc         String   @map("password_enc")          // AES-256-GCM
  sslMode             String   @default("prefer") @map("ssl_mode") // disable | prefer | require | verify-full
  applicationName     String   @default("nexus-insights") @map("application_name")
  // Webhook é por instalação (Fase 2 popula; nesta fase os campos existem mas ficam null)
  webhookToken        String?  @unique @map("webhook_token")  // slug random 32 chars (Fase 2). Postgres aceita múltiplos NULL em UNIQUE — OK na Fase 1 onde todos os tokens são NULL.
  webhookSecretEnc    String?  @map("webhook_secret_enc")     // AES-256-GCM (Fase 2)
  status              String   @default("active") @map("status") // active | paused | error
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
```

### 5.2 Tabela `company_chat_binding`

Vincula **uma empresa (account dentro de uma connection) à plataforma**. É a unidade de tenancy a partir desta fase.

```prisma
model CompanyChatBinding {
  id                String   @id @default(uuid()) @db.Uuid
  connectionId      String   @map("connection_id") @db.Uuid
  connection        NexusChatConnection @relation(fields: [connectionId], references: [id], onDelete: Restrict)
  chatwootAccountId Int      @map("chatwoot_account_id") // tipo Int confirmado pelas queries existentes (Conversation.account_id no Chatwoot é integer)
  displayName       String   @map("display_name")        // nome amigável da empresa
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

**Constraint de unicidade adicional (validada em Server Action):** enquanto `UserAccountAccess` apontar diretamente para `chatwoot_account_id` (sem `connection_id`), **bloquear** criação de binding com `account_id` que já existe em outra connection enabled. Caso contrário, a resolução `account_id → connection_id` fica ambígua e perigosa pra segurança. Migração de `UserAccountAccess` para `UserBindingAccess` (apontando para `binding.id`) fica como Q1 em §20 — quando feita, libera o constraint.

**Soft delete validation:** ao soft-deletar uma `nexus_chat_connection`, validar que não há binding com `enabled=true` apontando para ela. Se houver, bloquear o delete com mensagem explícita ("Desabilite os bindings X, Y, Z primeiro"). `onDelete: Restrict` cobre delete físico, não soft delete — daí a validação explícita na Server Action.

### 5.3 Migrations aditivas em `chatwoot_facts_*`

Para suportar mesmo `account_id` em connections diferentes sem ambiguidade:

- Adicionar coluna `connection_id UUID NULL` em todas as 6 tabelas.
- Backfill com a connection seed gerada (passo 5.4).
- Após backfill, alterar para `NOT NULL`.
- Atualizar PK / unique constraints para incluir `connection_id` no início.

Tabelas afetadas:

```
chatwoot_facts_daily_by_account     PK (connection_id, account_id, bucket_date)
chatwoot_facts_daily_by_inbox       PK (connection_id, account_id, inbox_id, bucket_date)
chatwoot_facts_daily_by_agent       PK (connection_id, account_id, agent_id, bucket_date)
chatwoot_facts_daily_by_team        PK (connection_id, account_id, team_id, bucket_date)
chatwoot_facts_hourly_by_account    PK (connection_id, account_id, bucket_hour)
chatwoot_facts_meta                 PK (connection_id, dimension, account_id)
```

Indexes secundários revisados para liderar com `connection_id` em queries de leitura, e `(account_id, connection_id)` em queries que entram pelo binding ativo do usuário.

### 5.4 Seed automático (idempotente)

Script de migração de dados, executado **uma vez** após a migration estrutural. Marcado por flag `app_settings.connections_seeded_at`:

1. Cria `nexus_chat_connection` "Padrão (legado)" com `host/port/database/username/password` derivados do `process.env.CHATWOOT_DATABASE_URL` parsed. `password_enc` = AES-256 do password parseado.
2. Para cada `chatwoot_account_id` distinto presente em `user_account_access`, cria `company_chat_binding` apontando para a connection seed, com `display_name` = `chatwoot_account_name` da maior contagem.
3. Backfill: `UPDATE chatwoot_facts_* SET connection_id = '<seed-uuid>' WHERE connection_id IS NULL`.
4. Define `app_settings.connections_seeded_at = NOW()`.

Reentrância: se a flag já existe, o seed é skipped (idempotência).

**Concorrência App ↔ Worker no boot:** App e Worker iniciam em paralelo no mesmo deploy. Para evitar dois processos rodando o seed simultaneamente:

```typescript
const lock = await pgPool.query("SELECT pg_try_advisory_lock(8472938) AS locked");
if (!lock.rows[0].locked) {
  console.log("[seed] outro processo segura o lock; pulando seed nesta instância");
  return;
}
try {
  // ... lógica do seed
} finally {
  await pgPool.query("SELECT pg_advisory_unlock(8472938)");
}
```

`pg_try_advisory_lock` é não-bloqueante; o segundo processo continua sem rodar o seed (idempotente). O número `8472938` é arbitrário e exclusivo deste seed (registrar em `docs/runbooks/multi-tenant-realtime.md`).

**`CHATWOOT_DATABASE_URL` parsing:** usar `pg-connection-string` (dependência transitiva do pacote `pg`, sempre disponível) — `parse(connectionString)` resolve corretamente senhas com chars especiais.

## 6. Pool dinâmico

**Runtime constraint:** roda exclusivamente em Node.js (App em `runtime: 'nodejs'`, Worker em Node nativo). Nunca em edge — `pg` não suporta edge runtime.

### 6.1 Novo módulo `src/lib/nexus-chat/pool.ts`

```typescript
import { Pool, type QueryResult } from "pg";
import { decrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";

interface CachedPool {
  pool: Pool;
  snapshot: { name: string; host: string; port: number; database: string; status: string };
  lastUsedAt: number;
}

const pools = new Map<string, CachedPool>();
const IDLE_POOL_TTL_MS = 30 * 60_000; // 30 min — pool fechado se não usado nesse tempo

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

  const password = decrypt(conn.passwordEnc); // SÍNCRONO — decrypt() não é async
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

export async function queryNexusChat<T>(connectionId: string, sql: string, params: unknown[]): Promise<QueryResult<T>> {
  const pool = await getNexusChatPool(connectionId);
  return pool.query<T>(sql, params);
}

// Janitor: fecha pools idle por mais de 30 min, evita memory leak
setInterval(() => {
  const now = Date.now();
  for (const [id, cached] of pools.entries()) {
    if (now - cached.lastUsedAt > IDLE_POOL_TTL_MS) {
      pools.delete(id);
      cached.pool.end().catch(() => {});
    }
  }
}, 10 * 60_000); // a cada 10 min
```

Por que cachear o `snapshot`: evita refetch do Prisma em todo `getNexusChatPool`. Snapshot é invalidado junto com o pool quando há `connection:updated` no Pub/Sub.

### 6.2 Invalidação cross-process via Redis Pub/Sub

Novo evento no `RealtimeEvent`:
```typescript
| { type: "connection:updated"; connectionId: string }
| { type: "connection:deleted"; connectionId: string }
```

Worker e App processes inscritos no canal: ao receber `connection:updated`/`deleted`, chamam `invalidateNexusChatPool(connectionId)` localmente. Próximo uso recria o pool com config fresca.

Server Actions de edit/delete da connection publicam o evento após persistir.

**UX em `connection:deleted` para SSE clients:** `useFactsRealtime` recebe o evento; se o `connectionId` corresponde ao binding ativo do usuário → mostra toast Sonner "Conexão removida pelo administrador" + redireciona para `/dashboard` após 3s. Padrão `useRealtime` (genérico) também propaga.

**Hot reload safety (Next.js dev):** o `setInterval` do janitor é guardado em `globalThis` para evitar duplicação em hot reload — padrão já usado em `prisma.ts` e `pg-pool.ts` do projeto:
```typescript
const globalForPool = globalThis as unknown as { __nexusChatJanitor?: NodeJS.Timeout };
if (!globalForPool.__nexusChatJanitor) {
  globalForPool.__nexusChatJanitor = setInterval(...);
}
```

### 6.3 Substituição em call-sites

`src/lib/chatwoot/pool.ts` é mantido **temporariamente** como shim que delega para `getNexusChatPool(connectionId)` — mas todos os call-sites são atualizados para receber `connectionId`. Ao final da Fase 1, o shim é deletado.

## 7. Resolver de connection a partir do usuário ativo

### 7.1 `src/lib/reports/active-connection.ts`

```typescript
import { cache } from "react";

// Envolto em cache() do React: dentro do mesmo request server, várias chamadas
// (Server Action + Page + layout) reutilizam o resultado sem refetch do Prisma.
// Padrão idêntico ao getActiveAccountId.
export const getActiveConnectionId = cache(
  async (user: AuthUser): Promise<string> => {
    const accountId = await getActiveAccountId(user); // já existe, fail-closed
    const bindings = await prisma.companyChatBinding.findMany({
      where: {
        chatwootAccountId: accountId,
        enabled: true,
        deletedAt: null,
        connection: { deletedAt: null, status: "active" },
      },
    });
    if (bindings.length === 0) throw new NoActiveBindingError(accountId);
    if (bindings.length > 1) {
      // Constraint operacional violada: mesmo account_id em 2 connections.
      // Falhar fechado. NUNCA escolher arbitrariamente — risco de vazar dados
      // entre tenants.
      throw new AmbiguousBindingError(accountId, bindings.map(b => b.connectionId));
    }
    return bindings[0].connectionId;
  },
);
```

### 7.2 Extensão de `assertAccountAccess`

`src/lib/tenant.ts → assertAccountAccess(user, accountId)` ganha verificação adicional: existe **exatamente um** `company_chat_binding` enabled para esse `accountId` (em qualquer connection que o usuário tem acesso). Mantém fail-closed. Se houver dois ou mais → erro fatal (corrupção de dados; super_admin alertado).

### 7.3 Edge case: mesmo `account_id` em duas connections

Embora hoje seja improvável (raro 2 instalações Chatwoot terem accounts numeradas iguais), o modelo permite — e isso é uma **falha de segurança em potencial** se não tratado. Solução em duas camadas:

1. **Constraint operacional na Server Action de criar binding:** se `chatwootAccountId` já existe em outra `nexus_chat_connection` enabled e não-deletada, **rejeitar a criação** com mensagem "Já existe outra empresa cadastrada com account_id X. Migre `UserAccountAccess` para `UserBindingAccess` antes (Q1 §22)." Garante a invariante "1 binding enabled por account_id global" enquanto a refatoração não acontece.
2. **Resolver `getActiveConnectionId` é fail-closed:** se por qualquer motivo houver 2 bindings (ex.: edição manual via SQL, race condition), lança `AmbiguousBindingError` em vez de escolher arbitrariamente. Audit log gerado, super_admin alertado.

A migração de `UserAccountAccess` → `UserBindingAccess` é **TODO Q1 (§22)** — quando feita, a constraint operacional pode ser relaxada porque a ambiguidade é eliminada na origem.

## 8. Encriptação

- `password_enc` e `webhook_secret_enc` usam `src/lib/encryption.ts` (AES-256-GCM, chave em `ENCRYPTION_KEY` env de **64 hex chars / 32 bytes**, formato `iv:authTag:ciphertext` em hex).
- API é **síncrona**: `encrypt(plaintext): string` e `decrypt(ciphertext): string`. Não usar `await`.
- Chave já existe no `.env` de produção (usada por `LlmConfig.encryptedApiKey` e Power BI). Nenhuma rotação necessária na Fase 1.
- Nunca logar valores decriptados. Nunca expor em respostas de Server Action — UI recebe apenas `passwordSet: true|false`.
- Senha vazia em form de edit = manter senha atual (não overwrita).

## 9. Refator das queries

### 9.1 Padrão "antes" / "depois"

**Antes** (`src/lib/chatwoot/queries/conversas-list.ts`):
```typescript
export async function fetchConversas(filters: ReportFilters, ...) {
  const pool = getChatwootPool();
  const result = await pool.query(...);
}
```

**Depois**:
```typescript
export async function fetchConversas(connectionId: string, filters: ReportFilters, ...) {
  const result = await queryNexusChat(connectionId, sql, params);
}
```

### 9.2 Call-sites afetados

Toda Server Action em `src/lib/actions/reports/*` que monta query do Chatwoot precisa, no início:
```typescript
const user = await getCurrentUser();
const connectionId = await getActiveConnectionId(user);
const accountId = await getActiveAccountId(user); // mantido para filtro WHERE account_id = $X
// ...
const data = await fetchConversas(connectionId, filters, accountId, ...);
```

Lista completa de queries refatoradas:
- `conversas-list.ts`, `dashboard-data.ts`, `dashboard-drill-down.ts`, `dashboard-kpis.ts`, `home-summary.ts`, `leads-recebidos.ts`, `matrix-ia.ts`, `mensagens-nao-respondidas.ts`, `meta-cache.ts`, `meta-cache-for-user.ts`, `por-departamento.ts`, `por-estado.ts`, `ranking-atendentes.ts`, `status-distribution.ts`, `tempos-resposta.ts`, `volumetria-dow.ts`, `volumetria-heatmap.ts`.

`facts.ts` (banco interno, não Chatwoot) não muda de pool — continua usando `pgPool`. **Mas** seus parâmetros ganham `connectionId` para filtrar `WHERE connection_id = $1`.

### 9.3 Ordem de refator (paralelizável por agentes diferentes)

Para minimizar risco e permitir TDD por arquivo, o plan da implementação deve seguir esta ordem:

1. **Lote 1 — Fundação (sequencial):** novo módulo `pool.ts`, `getActiveConnectionId`, encryption helpers. Sem dependentes ainda.
2. **Lote 2 — Queries do dashboard (paralelizável):** `dashboard-data.ts`, `dashboard-drill-down.ts`, `dashboard-kpis.ts`, `home-summary.ts`, `status-distribution.ts`. Cada uma com TDD; pode ser despachada em paralelo via `superpowers:dispatching-parallel-agents`.
3. **Lote 3 — Queries de Conversas e meta-cache (paralelizável):** `conversas-list.ts`, `meta-cache.ts`, `meta-cache-for-user.ts`. **Atenção:** sobreposição com `claude-conversas-filtros-v032` em curso — coordenar.
4. **Lote 4 — Queries restantes (paralelizável):** `leads-recebidos.ts`, `matrix-ia.ts`, `mensagens-nao-respondidas.ts`, `por-departamento.ts`, `por-estado.ts`, `ranking-atendentes.ts`, `tempos-resposta.ts`, `volumetria-dow.ts`, `volumetria-heatmap.ts`.
5. **Lote 5 — Server actions de relatórios:** atualizam call-sites que invocam as queries refatoradas.
6. **Lote 6 — `facts.ts` + worker:** `getBindingsToRefresh`, jobs `refresh-by-*` gravando `connection_id`, `publishRealtimeEvent` com `connectionId`.
7. **Lote 7 — `useFactsRealtime`:** filtro por `(connectionId, accountId)`.
8. **Lote 8 — UI mínima `/configuracoes/conexoes` + Server Actions de CRUD.**
9. **Lote 9 — Migration de constraint NOT NULL + delete do shim `getChatwootPool()`.**

### 9.4 `meta-cache.ts` — colisão entre connections

`meta-cache.ts` cacheia inboxes/teams/users no Redis com TTL 24h e `cacheKey()` derivada de `accountId`. Se duas connections tiverem o mesmo `account_id`, o cache mistura. Solução:

- `cacheKey()` passa a incluir `connectionId`: `meta:inbox:{connectionId}:{accountId}:v2`.
- Versão da chave bumpada (`v1` → `v2`) força invalidação natural do cache antigo no deploy.
- Função assinatura: `getInboxesForUser(connectionId, accountId)` em vez de `getInboxesForUser(accountId)`.

## 10. Refator dos jobs

### 10.1 `getBindingsToRefresh()`

Substitui `getAccountsToRefresh()`. Retorna:
```typescript
type RefreshTarget = { connectionId: string; accountId: number };
```

Lê de `company_chat_binding` (enabled, não-soft-deleted) joining com `nexus_chat_connection` (status='active', não-soft-deleted).

### 10.2 Jobs `refresh-by-*`

Recebem `RefreshTarget`. Lêem do pool do `connectionId` (Chatwoot) e gravam em `chatwoot_facts_*` no banco interno com `connection_id` populado.

### 10.3 `publishRealtimeEvent` enriquecido

```typescript
| {
    type: "facts:refreshed";
    dimension: ...;
    connectionId: string;
    accountId: number;
  }
```

`useFactsRealtime` filtra por `(connectionId, accountId)` — **alteração obrigatória nesta fase** (item 11 de §4.1). O hook precisa receber `connectionId` como prop adicional; pages que montam o hook usam `await getActiveConnectionId(user)` no server e passam pro client component.

### 10.4 Limites operacionais

- **Hard limit:** 100 connections + 500 bindings totais. Configurável via `app_settings.connection_limit` / `binding_limit`. Server Action de criação rejeita acima do limite.
- **Concorrência:** queues `refresh-by-*` continuam com `concurrency: 1` (preservar serialização atual). Bullmq agrupa jobs por queue, não por binding — bursts de bindings novos não saturam o Redis.
- **Job throughput estimado (alvo):** 100 bindings × 4 dimensões = 400 jobs a cada 5 min = ~1,3 jobs/s. Ordem de grandeza compatível com infra atual.

## 11. UI mínima da Fase 1

Tela única `/configuracoes/conexoes` (super_admin only — outros papéis recebem redirect para `/dashboard`):

- Lista de connections em tabela: nome, host masked (`db.example.com`), banco, status (badge: active=emerald / paused=amber / error=rose), last_test_at relativo (`há 5 min`), ações.
- Botão **"Nova conexão"** abre Dialog com form: nome*, host*, porta (default 5432), banco*, usuário*, senha* (input type=password com toggle eye), sslMode (select: disable/prefer/require/verify-full, default `prefer`). Submit chama Server Action `createNexusChatConnection`.
- Ações por linha:
  - **Editar** — abre Dialog com mesmo form. Password field vazio = "Manter senha atual" (placeholder explicativo).
  - **Testar** — Server Action síncrona. Executa `pool.query("SELECT 1")` com timeout 10s. Atualiza `last_test_at` e `last_test_error`. Toast verde/vermelho com resultado.
  - **Apagar** — soft delete. Bloqueado se houver binding com `enabled=true`: toast vermelho "Existem N empresas vinculadas. Desabilite as bindings primeiro." Apaga só após confirmação em AlertDialog.
  - **Bindings** — abre Sheet (drawer) listando bindings dessa connection. Cada linha: display_name, chatwoot_account_id, enabled toggle, ações Editar/Apagar. Botão "Nova empresa" → form (chatwoot_account_id*, display_name*, enabled).
- **Sem aba "Tempo real" e sem aba "Saúde" nesta fase** (elas vêm na Fase 3).
- Página em `src/app/(protected)/configuracoes/conexoes/page.tsx`.

**Componentes UI:** seguir padrão visual existente do Roteador Webhook Meta (PageHeader com ícone violeta, base-ui Dialog/Sheet, Sonner toast, ícones Lucide). **Skill obrigatória `ui-ux-pro-max:ui-ux-pro-max` em todas as tasks de UI desta fase** (regra absoluta CLAUDE.md §2.2).

Sidebar: nada muda nesta fase. A nova rota fica acessível por URL direta para super_admin (ele sabe do quê estamos falando). Sidebar reorg = Fase 3.

## 12. Segurança

- **Defesa em profundidade (5 camadas):** middleware NextAuth → `getCurrentUser` → `assertAccountAccess` → `getActiveConnectionId` → `getNexusChatPool(connectionId)`. Cada camada falha-fechada.
- **Encriptação:** AES-256-GCM em todos os secrets.
- **Isolamento de pool:** pool é criado por `connectionId`. Não há caminho técnico para query de connection A acabar no pool da B.
- **Rate limit nas Server Actions de teste de conexão:** Redis-based, 10 testes / minuto / super_admin.
- **Logs:** nunca logar `password_enc`, `password` em texto, ou `webhook_secret_enc`. Logs de erro de pool incluem só `connection.name`.

### 12.1 Schema dos audit logs

Toda mudança em `nexus_chat_connection` e `company_chat_binding` passa por `logAudit` (`src/lib/audit.ts`). `details` JSON nunca contém senhas (em texto ou cifradas) — apenas metadados.

| Operação | `action` | `targetType` | `details` JSON |
|---|---|---|---|
| Criar connection | `connection.create` | `nexus_chat_connection` | `{ name, host, port, database, username, sslMode, applicationName }` |
| Editar connection | `connection.update` | `nexus_chat_connection` | `{ before: {...}, after: {...}, passwordChanged: bool }` |
| Apagar connection (soft) | `connection.delete` | `nexus_chat_connection` | `{ name, bindingsAffected: 0 }` |
| Testar connection | `connection.test` | `nexus_chat_connection` | `{ success: bool, durationMs, errorMessage? }` |
| Criar binding | `binding.create` | `company_chat_binding` | `{ connectionId, chatwootAccountId, displayName }` |
| Editar binding | `binding.update` | `company_chat_binding` | `{ before, after }` |
| Apagar binding | `binding.delete` | `company_chat_binding` | `{ connectionId, chatwootAccountId }` |

### 12.2 Matriz RBAC (Fase 1)

| Ação | super_admin | admin (company) | manager (company) | viewer (company) |
|---|---|---|---|---|
| Listar `/configuracoes/conexoes` | ✅ | ❌ redirect | ❌ redirect | ❌ redirect |
| Criar/editar/deletar connection | ✅ | ❌ | ❌ | ❌ |
| Testar connection | ✅ (10/min) | ❌ | ❌ | ❌ |
| Criar/editar/deletar binding | ✅ | ❌ | ❌ | ❌ |
| Ler relatórios da empresa ativa | ✅ | ✅ | ✅ | ✅ |
| Ver `password_enc` (mesmo cifrada) | ❌ (UI nunca expõe) | ❌ | ❌ | ❌ |
| Ver `webhook_secret_enc` | ❌ (UI nunca expõe) | ❌ | ❌ | ❌ |

Atualização de roles para Fase 2/3: admin de empresa pode ganhar permissão "ver status da connection (read-only)" — fora do escopo desta fase.

## 13. Testes

### 13.1 Unitários (Jest + jest-mock-extended)

- `src/lib/nexus-chat/pool.ts`:
  - cria pool no primeiro uso, retorna do cache no segundo.
  - lança `ConnectionUnavailableError` se status != 'active' ou deletedAt != null.
  - `invalidateNexusChatPool` fecha pool e remove do cache.
- `src/lib/reports/active-connection.ts`:
  - retorna `connectionId` do binding ativo único.
  - lança `NoActiveBindingError` se não há binding enabled.
  - lança `AmbiguousBindingError` se há 2+ bindings enabled para o mesmo `accountId` (fail-closed; nunca escolher arbitrariamente).
  - resultado memoizado por request via `cache()` do React (verificar 2 chamadas no mesmo request → 1 query Prisma).
- `src/lib/actions/nexus-chat/connections.ts`:
  - super_admin pode criar/editar/deletar; outros papéis bloqueados.
  - senha vazia em edit não overwrita `password_enc`.
  - delete cria audit log.
- `src/lib/actions/nexus-chat/bindings.ts`: idem.
- Encriptação: `password_enc` decripta para o valor original (round-trip test).
- Seed: idempotência (rodar 2x não duplica connection).

### 13.2 Integração (mocks de Prisma + pool real via testcontainers)

- Fluxo completo: criar connection → criar binding → resolver `connectionId` a partir de `accountId` → query do pool correto.
- Edit connection → pool antigo invalidado → próxima query usa config nova.
- Testes que precisam de Postgres real usam `testcontainers/postgresql` (subir Postgres ephemeral em CI). Padrão alternativo: `mockPool` injetado via DI nos call-sites — preferido onde possível para velocidade.

### 13.3 Cobertura mínima

- 100% das funções novas (`pool.ts`, `active-connection.ts`, `actions/nexus-chat/connections.ts`, `actions/nexus-chat/bindings.ts`).
- Atualização das suítes existentes que passavam `accountId` como argumento e agora precisam de `connectionId`. Lista parcial:
  - `src/lib/chatwoot/queries/__tests__/conversas-list.test.ts`
  - `src/lib/chatwoot/queries/__tests__/dashboard-data.test.ts`
  - `src/lib/chatwoot/queries/__tests__/dashboard-drill-down.test.ts`
  - `src/lib/chatwoot/queries/__tests__/dashboard-kpis.test.ts`
  - `src/lib/chatwoot/queries/__tests__/home-summary.test.ts`
  - `src/lib/chatwoot/queries/__tests__/leads-recebidos.test.ts`
  - `src/lib/chatwoot/queries/__tests__/matrix-ia.test.ts`
  - `src/lib/chatwoot/queries/__tests__/mensagens-nao-respondidas.test.ts`
  - `src/lib/chatwoot/queries/__tests__/meta-cache.test.ts`
  - `src/lib/chatwoot/queries/__tests__/por-departamento.test.ts`
  - `src/lib/chatwoot/queries/__tests__/por-estado.test.ts`
  - `src/lib/chatwoot/queries/__tests__/ranking-atendentes.test.ts`
  - `src/lib/chatwoot/queries/__tests__/status-distribution.test.ts`
  - `src/lib/chatwoot/queries/__tests__/tempos-resposta.test.ts`
  - `src/lib/chatwoot/queries/__tests__/volumetria-dow.test.ts`
  - `src/lib/chatwoot/queries/__tests__/volumetria-heatmap.test.ts`
  - `src/lib/chatwoot/__tests__/facts.test.ts`
  - `src/worker/jobs/pre-agregacao/__tests__/refresh-by-*.test.ts` (4)
  - `src/components/reports/__tests__/use-facts-realtime.test.tsx`
  - `src/components/reports/__tests__/facts-freshness.test.tsx`
- Testes novos a criar: ~25 (entre unit e integration).

## 14. Migrations e ordem de execução

Ordem rigorosa para evitar downtime:

1. **Migration estrutural** (Prisma): cria `nexus_chat_connections` e `company_chat_bindings`; adiciona `connection_id UUID NULL` em todas as 6 tabelas `chatwoot_facts_*`.
2. **Deploy do código novo** mantendo o shim `getChatwootPool()` ativo (ainda lê `.env`). Worker continua escrevendo facts com `connection_id = NULL`.
3. **Seed (passo 5.4)** roda automaticamente no primeiro startup pós-deploy, criando connection "Padrão (legado)" + bindings + backfill de `connection_id`.
4. **Migration de constraint**: `ALTER TABLE chatwoot_facts_* ALTER COLUMN connection_id SET NOT NULL` + recriar PKs incluindo `connection_id`.
5. **Deploy do código que** remove o shim `getChatwootPool()` e exige `connectionId` em todas as queries.

Migrations Prisma rodadas manualmente em produção (padrão do projeto). Cada step é deployado e validado antes do próximo.

### 14.1 Plano detalhado por tabela (passo 4 — ALTER TABLE)

Postgres permite `ALTER TABLE ALTER COLUMN ... SET NOT NULL` sem rewrite (apenas validação rápida) **se já não houver linhas com NULL**. Mudar PK exige `DROP CONSTRAINT old_pk` + `ADD CONSTRAINT new_pk PRIMARY KEY (...)` — operação que **adquire ACCESS EXCLUSIVE lock** na tabela. Estimativa por volume:

| Tabela | Linhas estimadas (set up Matrix atual) | Tempo de lock estimado |
|---|---|---|
| `chatwoot_facts_daily_by_account` | ~30 (1 conta × 30 dias) | < 100 ms |
| `chatwoot_facts_daily_by_inbox` | ~3.000 (10 inboxes × 30 dias × 10 buckets) | < 1 s |
| `chatwoot_facts_daily_by_agent` | ~3.000 | < 1 s |
| `chatwoot_facts_daily_by_team` | ~600 | < 100 ms |
| `chatwoot_facts_hourly_by_account` | ~720 (1 conta × 30 dias × 24h) | < 200 ms |
| `chatwoot_facts_meta` | ~5 | < 100 ms |

Total estimado de janela de lock: < 5 s — aceitável em horário de baixo tráfego (madrugada). Se volume crescer (cliente novo onboardado), revalidar antes da migration. Comando antes do passo 4: `SELECT COUNT(*) FROM <tabela>` em cada uma para confirmar.

**Pré-condição obrigatória do passo 4:** `SELECT COUNT(*) FROM <cada_tabela> WHERE connection_id IS NULL = 0` em todas as 6 tabelas.

### 14.2 Janela entre passo 3 (seed) e passo 4 (NOT NULL)

Durante essa janela, código novo **já está em produção** (passo 2). Como o shim `getChatwootPool()` foi mantido só para compat de transição, mas as queries de leitura já passaram a receber `connectionId` no passo 2, **toda gravação em `chatwoot_facts_*` no passo 2 já tem `connection_id` populado** (workers atualizados). Não há janela onde código grave NULL.

O backfill do passo 3 cobre apenas dados **históricos** existentes pré-deploy. Reentrante: se o worker rodar entre passos 2 e 3, ele **insere com `connection_id` da seed** (que é resolvida via `getBindingsToRefresh` lendo da tabela nova).

## 15. Rollback

### 15.1 Antes do passo 4 (ainda NULL aceito)

`ALTER TABLE ... DROP COLUMN connection_id` em todas as 6 tabelas + drop das 2 tabelas novas. Código volta para versão anterior (shim ativo, `.env`). Risco: baixo. Tempo: minutos.

### 15.2 Após o passo 4 (NOT NULL ativo)

Rollback exige reversão controlada:

1. **Snapshot lógico antes do passo 4** (obrigatório): `pg_dump --table=chatwoot_facts_daily_by_account --table=chatwoot_facts_daily_by_inbox ... > backup-pre-fase1.sql`. Salvar em S3 / disco persistente.
2. Em caso de rollback pós-passo-4: `pg_restore` do snapshot, `ALTER TABLE` para tornar `connection_id` NULL again, drop das 2 tabelas novas, deploy do código antigo.
3. **Janela de risco hard:** se algum cliente real foi onboardado em connection diferente da seed antes do rollback, dados dele NÃO estão no snapshot pré-fase1. Mitigação: **freeze operacional** — proibir criação de connection 2+ até Fase 2 LIVE em produção por 1 semana de observação. Constraint Server Action: `app_settings.allow_secondary_connection: false` por default; só super_admin com flag flipped manualmente.

### 15.3 Critérios para sair do freeze

- `/api/health` verde por 7 dias seguidos pós-deploy da Fase 1.
- Suite de testes verde 100%.
- Audit log sem entries de erro persistente em 7 dias.
- João aprova explicitamente o flip da flag.

### 15.4 UX de erro de connection em runtime

`getNexusChatPool` lança `ConnectionUnavailableError(connectionId, status)`. Server Actions de relatório capturam:

```typescript
try {
  const data = await fetchConversas(connectionId, ...);
  return { ok: true, data };
} catch (err) {
  if (err instanceof ConnectionUnavailableError) {
    logAudit({ action: "report.error", details: { reason: err.message, connectionId } });
    return { ok: false, code: "connection_unavailable", message: "Banco de dados temporariamente indisponível. Equipe notificada." };
  }
  throw err;
}
```

UI exibe banner amigável (Sonner toast + componente inline em vez de white screen). Super_admin é notificado via audit log; em fase futura, alerta automático.

## 16. Observabilidade

Projeto não tem Prometheus configurado hoje — observability é via **logs estruturados** (stdout JSON) no Portainer e via `/api/health` (já consumido pelo workflow de deploy). Padrão da Fase 1:

- `console.log` JSON-shaped em pontos chave do `pool.ts` (open, close, query duration buckets, errors). Tag `kind: "nexus-chat-pool"`.
- `/api/health` ganha campo `connections: [{ name, status, lastTestAt, error? }]` para facilitar smoke test pós-deploy.
- Logs **nunca** incluem senhas decriptadas, ciphertext, nem connection strings completas — apenas `connection.name`.

### 16.1 Runbook (`docs/runbooks/multi-tenant-realtime.md`)

Conteúdo mínimo:

1. **Como cadastrar nova connection** — sequência de cliques em `/configuracoes/conexoes`.
2. **Como cadastrar nova binding (empresa)** — incluindo o constraint de `account_id` único entre connections.
3. **Smoke test manual** pós-deploy.
4. **Como rodar o seed manualmente** (caso falha no boot): comando node.js + lock advisory.
5. **Como invalidar pool de uma connection** (caso connection ficou stale após edição manual no DB): publicar evento Pub/Sub via redis-cli.
6. **Como ler audit log** filtrado por connection/binding.
7. **Como rodar pg_dump pré-rollback** (passo 4 da migration).
8. **Como confirmar `WHERE connection_id IS NULL = 0`** antes do passo 4.
9. **Comando para sair do freeze operacional** (`UPDATE app_settings SET value='true' WHERE key='allow_secondary_connection'`).
10. **Troubleshooting** dos erros mais comuns (`ConnectionUnavailableError`, `NoActiveBindingError`, `AmbiguousBindingError`).

## 17. Critérios de aceitação

A Fase 1 está completa quando:

- [ ] Migrations rodadas, schema novo em produção.
- [ ] Seed gerou connection "Padrão (legado)" + bindings para todos os accounts existentes.
- [ ] Backfill populou `connection_id` em 100% das linhas de `chatwoot_facts_*`.
- [ ] Constraint `NOT NULL` ativa em `connection_id`.
- [ ] Todas as queries de `src/lib/chatwoot/queries/*` recebem `connectionId` e usam `getNexusChatPool`.
- [ ] Shim `getChatwootPool()` deletado.
- [ ] CRUD super_admin funcional em `/configuracoes/conexoes`.
- [ ] Smoke test em **staging**: super_admin cria connection 2 (mesmo banco com user diferente, ou banco distinto), cria binding com `account_id` distinto, query roteia corretamente. Em produção: freeze operacional ativo (§15.2) — smoke test não cria connection 2 em prod.
- [ ] `/api/health` mostra todas as connections.
- [ ] Suíte de testes verde (typecheck 0, jest verde).
- [ ] Audit logs registrando criação/edição/delete.
- [ ] Documentação de runbook em `docs/runbooks/multi-tenant-realtime.md` (operação básica).

## 18. Dependências e o que vem a seguir

**Bloqueia Fase 2** (webhook + realtime em todos relatórios):
- Sem o `webhook_token`/`webhook_secret_enc` no model (criados nesta fase com NULL), o webhook handler não tem como autenticar requisição.
- Sem `connection_id` na chave do `facts:refreshed`, o filtro client não pode discriminar.

**Bloqueia Fase 3** (UI completa, sidebar reorg):
- A UI rica precisa do CRUD da Fase 1 como base.
- A sidebar reorg só faz sentido depois das funções operacionais existirem.

## 19. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Backfill de `connection_id` falha no meio (linhas com NULL) | Baixa | Alto | Migration de constraint NOT NULL só roda após verificação `SELECT COUNT(*) WHERE connection_id IS NULL = 0`. |
| Pool do banco do Chatwoot atinge CONNECTION LIMIT 5 quando 2+ connections ativas | Média | Médio | min=0/max=2 por pool já é conservador. Monitorar; reduzir max se preciso. |
| Cliente A acessa dados do Cliente B por bug no resolver | Baixa | Crítico | 5 camadas de defesa + suite de tests com cenário cross-tenant + audit log. |
| Edit de connection invalida pool mas processo paralelo ainda tem query inflight | Baixa | Baixo | `pool.end()` aguarda inflight terminar antes de fechar. Pool antigo é descartado, próximo uso recria. |
| `.env` ainda existe mas seed já rodou — qual fonte da verdade? | Alta | Médio | Após seed, `.env CHATWOOT_DATABASE_URL` é deprecated; logs de warning no startup se ainda definido após Fase 1 LIVE. |
| Pool exhaustion: 100 connections × max 2 = 200 conexões abertas no host do app | Baixa | Médio | Limite hard 100 connections (§10.4); cada pool min=0 (recicla quando idle); janitor 30 min libera ainda mais. App roda em VM com pool de threads do Node — 200 conexões é abaixo do limite OS. |
| Lock conflitante na migration de PK (passo 4) | Baixa | Alto | Antes do `ALTER TABLE`, rodar `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE NOWAIT` para falhar rápido se houver lock pendente; rodar em horário de baixo tráfego (madrugada). |
| `setInterval` do janitor duplicado em hot reload (Next.js dev) | Média | Baixo | Guarda em `globalThis.__nexusChatJanitor` (§6.2). |
| pg_dump exige credencial superuser/owner | Baixa | Médio | Validar `pg_dump` funcional em staging antes do passo 4 em produção. João é DBA do banco interno → tem credencial necessária. |
| UAA (`UserAccountAccess`) referencia `account_id` que não tem binding correspondente | Média | Médio | Server Action de delete de binding também alerta o admin sobre UAAs órfãs (lista usuários afetados). Audit log registra. |

## 20. Convenções de naming

| Camada | Padrão | Exemplo |
|---|---|---|
| Path/diretório novo | kebab-case | `src/lib/nexus-chat/pool.ts` |
| Tabela Postgres | snake_case + plural | `nexus_chat_connections`, `company_chat_bindings` |
| Coluna Postgres | snake_case | `password_enc`, `webhook_token` |
| Modelo Prisma | PascalCase singular | `NexusChatConnection`, `CompanyChatBinding` |
| Campo Prisma (TS) | camelCase | `passwordEnc`, `webhookToken` |
| Server Action | camelCase verbo | `createNexusChatConnection`, `testNexusChatConnection` |
| Erro custom | PascalCase + sufixo `Error` | `ConnectionUnavailableError`, `NoActiveBindingError`, `AmbiguousBindingError` |
| Eventos Pub/Sub | kebab-case com namespace | `connection:updated`, `connection:deleted`, `facts:refreshed` |
| Audit `action` | dotted lowercase | `connection.create`, `binding.update` |

UI/copy/menus: **sempre "Nexus Chat"** (nunca "Chatwoot"). Tabelas legadas (`chatwoot_facts_*`, coluna `chatwoot_account_id`) renomeadas em fase futura de naming cleanup, fora do escopo desta Fase 1.

## 21. Decision records

| Decisão | Alternativa considerada | Razão |
|---|---|---|
| `min: 0, max: 2` por pool | `max: 5` | Banco do Chatwoot tem CONNECTION LIMIT 5; conservador para múltiplos pools coexistirem. |
| `sslMode='prefer'` default | `require` | `prefer` aceita servidores sem SSL (caso edge dev local) e tenta SSL primeiro em produção. Menos surpresa. |
| `IDLE_POOL_TTL_MS = 30 min` | 5 min ou ilimitado | 30 min permite uso esporádico sem reconectar; janitor a cada 10 min é leve. |
| AES-256-GCM via `encryption.ts` existente | KMS / Vault | Reuso de infra já existente; KMS é over-engineering pra escala atual. |
| `onDelete: Restrict` em binding | `Cascade` | Evita acidentalmente apagar dados em cascata; força admin a desativar bindings antes. |
| Bloquear `account_id` duplicado entre connections | Resolver dinamicamente | Resolver dinâmico precisa de `UserBindingAccess` (refator não-trivial). Bloquear na criação é defensivo e simples. |
| Soft delete com `deletedAt` | Hard delete + audit log | Padrão do projeto; permite restaurar até 30 dias (housekeeping cleanup). |
| Dois deploys (passos 2 e 4) | Migração big-bang | Big-bang é arriscado em produção; deploy gradual permite validar em cada step. |
| `useFactsRealtime` filtra `(connectionId, accountId)` | Só `accountId` | Sem `connectionId`, qualquer Phase 2/3 com 2+ connections vê eventos cruzados — falha de isolamento. |
| Hard limit 100 connections | Sem limite | Proteção contra abuse / erros operacionais. Configurável se realmente necessário. |
| Webhook token NULL na Fase 1 | Gerar já agora | Fora do escopo; Fase 2 popula. |

## 22. TODOs e questões abertas

- [ ] **Q1 (Fase futura):** `UserAccountAccess` deveria virar `UserBindingAccess`? Hoje ele aponta para `chatwoot_account_id` que pode ambíguo entre connections. Ficaria explícito apontar para `binding.id`. Custo: refator não-trivial em todo lugar que usa account access. Resolve a constraint operacional de §7.3 (bloqueio de account_id duplicado).
- [ ] **Q2:** Alguma connection precisa de tunelamento SSH/SSL strict-mode? Adicionar `ssl_ca_pem` opcional no model? Decidir antes de cadastrar segunda connection real (em staging).
- [ ] **Q3:** Renomear schema `chatwoot_*` → `nexus_chat_*` em fase futura de naming cleanup. Especialmente: tabelas `chatwoot_facts_daily_by_*`, `chatwoot_facts_hourly_*`, `chatwoot_facts_meta` e coluna `chatwoot_account_id`. Migração não-trivial; fora desta fase.
- [ ] **Q4:** Rotação periódica do `ENCRYPTION_KEY`. Não é problema em curto prazo (chave atual está protegida em `.env`), mas plano de rotação e re-encrypt de dados sensíveis (LlmConfig, NexusChatConnection) deve ser definido antes de scaling pra muitos clientes.
- [ ] **Q5:** Estratégia de retenção do AuditLog. Hoje é append-only sem cleanup. Após Fase 1 LIVE, audit cresce a cada operação de connection/binding. Definir TTL ou archival.
- [ ] **Q6:** UAA órfã quando binding é deletado. Server Action de delete de binding alerta admin (§19), mas não corrige automaticamente. Decidir comportamento de longo prazo: cascade delete? Auto-disable UAA?

---

## Apêndice A — Pente fino #1 (achados aplicados)

Lista numerada de achados encontrados na revisão crítica da v1 e como cada um foi resolvido na v2.

| # | Achado | Severidade | Resolução |
|---|---|---|---|
| A1 | `decrypt()` foi escrito como `await decrypt(...)` mas a API real em `src/lib/encryption.ts` é **síncrona** (`encrypt(plaintext: string): string`, `decrypt(ciphertext: string): string`). | Bug de exemplo | Removido `await` em todos os trechos de código da spec. Confirmado uso síncrono. |
| A2 | `useFactsRealtime` filtra hoje só por `accountId`. Spec dizia "vai precisar atualizar — mas não quebra na Fase 1". Isso descumpre o objetivo "fundação completa": Fase 2 ficaria com tarefa de Fase 1. | Escopo | Movido para escopo da Fase 1: hook passa a filtrar por `(connectionId, accountId)` desde já. Ajustado em §4.1 e §10.3. |
| A3 | `getActiveConnectionId` escolhe binding mais antigo arbitrariamente quando mesmo `accountId` aparece em 2 connections. Isso é falha de segurança em potencial: usuário pode ver dados errados. | Crítico | Adicionada constraint operacional: enquanto `UserAccountAccess` apontar para `chatwoot_account_id` cru (sem `connection_id`), **bloquear** criação de binding com `account_id` já existente em outra connection. Validação na Server Action de criação. Detalhado em §7.3. |
| A4 | Migration de PK em `chatwoot_facts_*` envolve DROP + RECREATE; spec não estimava tempo, lock ou downtime. | Operacional | Adicionada §14.1 com plano detalhado: migrations rodam em horário de baixo tráfego, `ALTER TABLE` é incremental por tabela, estimativa por volume de linhas (`SELECT COUNT(*)` antes), e PK só é alterada após backfill 100%. |
| A5 | Pool dinâmico cresce sem TTL — vazamento de memória em SaaS com muitas connections. | Operacional | Adicionado em §6.1: cada pool tem timestamp de último uso; janitor a cada 10 min fecha pools idle por mais de 30 min (excluindo-os do `Map`). |
| A6 | Pool em ambiente Next.js — não citado runtime constraint. SSE precisa `runtime: 'nodejs'`. | Documentação | Confirmado em §6 que o pool roda só em Node runtime (App e Worker), nunca em edge. Worker vai precisar do mesmo módulo importado. |
| A7 | `ENCRYPTION_KEY` env não validado. | Validação | Confirmado: `src/lib/encryption.ts` exige 64 hex chars. Spec atualizada §8 com nota de que a chave já existe no `.env` de produção (LlmConfig usa). |
| A8 | `getNexusChatPool` consulta Prisma a cada chamada — overhead. | Performance | Cache do snapshot da connection junto do pool (`Map<connectionId, { pool, snapshot, lastUsedAt }>`). Refetch só na invalidação. Detalhado §6.1. |
| A9 | Testes de pool real exigem Postgres. | Cobertura | Spec atualizada §13.2: testes de integração usam `testcontainers` (Postgres efêmero) ou `mockPool` injetado. Padronizar com testes existentes do worker. |
| A10 | Refator de queries é gigante (17 arquivos + 8 actions). Sem ordem nem TDD por arquivo. | Escopo | Adicionado §9.3 com ordem proposta (queries usadas por dashboard primeiro, depois Conversas, depois rankings) e exigência de TDD por arquivo no plan da implementação. |
| A11 | Worker — explosão de jobs paralelos quando há N×M bindings. | Operacional | §10 ganha §10.4: jobs continuam concurrency=1 por queue; total de bindings limitado a 100 (hard) e o ciclo de 5 min comporta facilmente. |
| A12 | `Conversation.account_id` no Chatwoot é Int — confirmado pelas queries existentes. | Não-bloqueante | Anotação em §5.2 confirmando o tipo. |
| A13 | Rollback "se já onboardou cliente em connection 2+ os dados se perdem" é inaceitável. | Crítico | §15 reescrita: pg_dump da connection seed antes do passo 4; snapshot lógico das 6 tabelas pré-NOT-NULL; rollback restaura snapshot. Onboarding de cliente novo bloqueado até Fase 2 LIVE + 1 semana de observação. |
| A14 | Audit log não detalha campos. | Segurança | §12.1 adicionada: schema do `details` JSON do AuditLog para cada operação (criar/editar/deletar/testar connection e binding). Senha NUNCA aparece, nem encrypted. |
| A15 | Connection error em runtime — UX pobre. | UX | §15.5 adicionada: `getNexusChatPool` lança `ConnectionUnavailableError`; Server Actions de relatório capturam e devolvem estrutura `{ ok: false, code: "connection_unavailable", message }`; UI exibe banner amigável "Banco de dados temporariamente indisponível, super_admin foi notificado". |
| A16 | UI mínima — UX de "Apagar" e "Testar conexão" não detalhada. | UX | §11 expandida: "Testar" é Server Action síncrona com timeout 10s, atualiza `last_test_at`/`last_test_error`. "Apagar" é soft delete; bloqueado se houver binding enabled (toast informativo). Form de password com toggle eye, máscara em campos sensíveis em listagens. |
| A17 | `meta-cache.ts` cacheia por `accountId`. Colisão entre connections. | Bug pré-existente induzido | §9.4 adicionada: `cacheKey()` em meta-cache passa a incluir `connectionId`; cache existente é invalidado no deploy (versão da chave bumpada — padrão já usado no projeto). |
| A18 | Migration Prisma vs SQL — confirmado que tabelas estão no `schema.prisma` (linhas 269+). | Não-bloqueante | Spec confirma uso de Prisma migrations em §14. |
| A19 | Janela entre seed e NOT NULL — workers podem gravar NULL. | Operacional | §14.2 adicionada: durante a janela, código novo só grava com `connection_id` resolvido; código antigo (shim) não está em produção (passos 2 e 4 são deploys separados, em ordem). Verificação `COUNT(*) WHERE connection_id IS NULL = 0` antes de aplicar `NOT NULL`. |
| A20 | `webhook_token` unique com NULL — Postgres aceita múltiplos NULL como unique. | Não-bloqueante | Anotação em §5.1. |
| A21 | Soft delete vs `onDelete: Restrict` — relação não bloqueia soft delete. | Bug em design | §5.2 atualizada: ao soft-deletar connection, validar que não há binding enabled. Se houver, bloquear. Cascade soft delete não é feito (admin precisa primeiro disabled bindings). |
| A22 | Naming de path/snake_case/PascalCase. | Documentação | §22 adicionada com tabela de naming. |
| A23 | Smoke test exige banco Chatwoot extra — qual? | Operacional | §17 atualizada: smoke test pode usar mesma connection com user diferente, ou mesma connection criando binding em `account_id` diferente do já existente. Não exige infra nova. |
| A24 | Tests existentes que passam `accountId` precisam atualizar. | Cobertura | §13 adicionada lista exata de arquivos `*.test.ts` afetados. |
| A25 | `connection:deleted` SSE — quem está conectado vê tela quebrar. | UX | §6.2 atualizada: SSE client recebendo `connection:deleted` para a connection ativa do usuário mostra toast "Conexão removida pelo administrador" e redireciona para `/dashboard`. |
| A26 | Contradição: "fundação invisível" mas adiciona rota nova. | Documentação | §1 corrigida: "fundação invisível ao usuário comum (super_admin vê uma rota administrativa nova `/configuracoes/conexoes`)". |
| A27 | Decision Records ausentes. | Não-bloqueante | §23 adicionada com tabela de decisões e justificativas. |
| A28 | RBAC explícito — actions de read podem ser chamadas com role inferior. | Documentação | §12.2 adicionada: matriz role × ação (super_admin write/read; admin/manager/viewer read-only se houver binding accessible; sem read direto de credenciais por nenhum role exceto super_admin). |

**Próximos passos:**
1. ~~Pente fino #1 (achados explícitos) → v2.~~ ✅ Aplicado.
2. ~~Pente fino #2 (mais profundo) → v3.~~ ✅ Aplicado (Apêndice B).
3. Aprovação do João desta v3.
4. Plan v1→v2→v3 (próxima sessão, via `superpowers:writing-plans`).
5. Implementação via `superpowers:subagent-driven-development` (sessão depois do plan aprovado).
6. Spec da Fase 2 (webhook).
7. Spec da Fase 3 (UI completa).

---

## Apêndice B — Pente fino #2 (achados aplicados)

Análise mais profunda buscando contradições internas, edge cases, requisitos implícitos, riscos, dependências esquecidas e decisões não justificadas.

| # | Achado | Severidade | Resolução |
|---|---|---|---|
| B1 | §6.2 duplicada (mesmo conteúdo aparece duas vezes em sequência por erro de edit). | Crítico | Deduplicado: agora §6.2 única, com UX de `connection:deleted` + hot reload safety. |
| B2 | Numeração de seções quebrada: ia 1-19, depois 22, 23, 20 (gap em 20-21 e fora de ordem). | Crítico | Renumerado: §20 Naming, §21 Decision records, §22 TODOs. Coerente. |
| B3 | Frontmatter dizia "v1" no callout abaixo do título mesmo após v2. | Crítico | Atualizado para "v3 — pente fino #1 (28 achados) e #2 (30 achados) aplicados." |
| B4 | §13.1 tinha teste descrevendo comportamento v1 ("prefere binding mais antigo") inconsistente com §7.1 v2 (lança `AmbiguousBindingError`). | Crítico | Atualizada lista de testes em §13.1 para refletir comportamento v2/v3 (lança erro se >1 binding). |
| B5 | §4.1 e §9.2 mencionavam `src/lib/actions/reports/*`. CLAUDE.md diz "padrão consolidado em `src/lib/actions/*`". | Documentação | Mantido `src/lib/actions/reports/*` porque é a estrutura existente do projeto (validado por inspeção). Anotado em §9.2 como sub-pasta canônica. |
| B6 | Race condition de seed entre App e Worker no boot. | Importante | §5.4 ganhou seção "Concorrência App ↔ Worker": `pg_try_advisory_lock(8472938)` não-bloqueante; segundo processo skipa. |
| B7 | `getActiveConnectionId` chamado em toda Server Action sem cache — N queries Prisma por request. | Performance | §7.1 envolto em `cache()` do React (mesmo padrão de `getActiveAccountId`). |
| B8 | `setInterval` global — Next.js dev hot reload duplica o janitor. | Importante | §6.2 ganhou bloco "Hot reload safety": guarda em `globalThis.__nexusChatJanitor`. |
| B9 | `pg_dump` precisa de credencial superuser/owner — não validado. | Importante | §19 ganhou linha de risco; runbook §16.1 inclui "validar pg_dump funcional em staging". |
| B10 | `app_settings.connections_seeded_at` — confirmado que `AppSetting` model existe (linha 117 do schema atual). | Não-bloqueante | Anotação preservada em §5.4. |
| B11 | `testcontainers/postgresql` é dependência nova; CI precisa rodar Docker. | Importante | §13.2: alternativa `mockPool` injetado via DI é o caminho preferido (mais rápido); testcontainers só onde necessário. Reduz escopo de adição. |
| B12 | UAA órfã quando binding é deletado. | Importante | §19 ganhou linha de risco; §22 Q6 documenta decisão de longo prazo; Server Action alerta admin no momento do delete. |
| B13 | Parser de `CHATWOOT_DATABASE_URL` com chars especiais. | Importante | §5.4 atualizada: usar `pg-connection-string` (já dependência transitiva de `pg`). |
| B14 | Runbook em §17 critério de aceitação sem detalhar conteúdo. | Importante | §16.1 nova: lista 10 itens canônicos do runbook. |
| B15 | Métricas Prometheus mencionadas em §16 mas projeto não tem. | Documentação | §16 reescrita: logs estruturados JSON via stdout; Prometheus removido. |
| B16 | Pool exhaustion em rajada. | Risco | §19 ganhou linha de risco; min=0 + janitor + hard limit 100 mitigam. |
| B17 | Runtime constraint repetido. | Não-bloqueante | OK (uma vez em §6 cabeçalho). |
| B18 | Naming snake_case plural — confirmado padrão do projeto (`users`, `audit_logs`). | Não-bloqueante | OK. |
| B19 | Smoke test §17 vs freeze §15.2 — aparente contradição. | Documentação | §17 atualizada: smoke test em **staging**; produção freeze ativo. |
| B20 | Limites 100/500 sem justificativa numérica. | Decision record | §21 já cobre "Hard limit 100 connections"; numero específico ficou em decisão pragmática (escala atual: ~10 clientes; 100 é margem de 10x). |
| B21 | Rotação `ENCRYPTION_KEY` não citada. | Q em aberto | §22 Q4 nova: plano de rotação. |
| B22 | Lock conflitante na migration de PK. | Risco | §19 ganhou linha; mitigação `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE NOWAIT` antes do ALTER. |
| B23 | §15.5 sem 15.4. | Crítico | Renumerado para §15.4 (UX de erro). |
| B24 | Q3 obsoleta (já coberta em §10.4 hard limit). | Documentação | Q3 reescrita: vira "renomear schema chatwoot_*" (TODO real). |
| B25 | Q4 obsoleta (já no model). | Documentação | Q4 reescrita: vira "rotação de ENCRYPTION_KEY". |
| B26 | §22/§23 fora de ordem. | Crítico | Renumerado (vide B2). |
| B27 | Page que monta `useFactsRealtime` precisa passar `connectionId` — quem? | Importante | §10.3 detalhada: page (server component) faz `await getActiveConnectionId(user)` e passa pra client component que monta o hook. |
| B28 | `getActiveAccountId` já tem `cache()`? | Validação | Confirmar na implementação; padrão a seguir em `getActiveConnectionId`. |
| B29 | Worker e App processes — janitor roda em ambos? | Não-bloqueante | OK; cada processo tem seu Map; janitor independente é correto. Seed é o único caso especial (B6). |
| B30 | `runtime: 'nodejs'` em routes confirmado em código existente. | Não-bloqueante | OK. |
