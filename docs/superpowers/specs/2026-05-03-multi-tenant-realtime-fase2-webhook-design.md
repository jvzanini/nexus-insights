---
title: "Multi-tenant Realtime — Fase 2 (Webhook + realtime em todos os relatórios)"
status: "v3 (final — pronta para aprovação)"
authored_at: 2026-05-03
authored_by: claude-fase2-spec
target_version: v0.37.0 (Fase 1 consumiu v0.33–v0.36 conforme commits T0–T8; Fase 3 alvo v0.38)
phase: "2 de 3 (Realtime ativo + UI mínima de webhook)"
depends_on:
  - "Fase 1 LIVE em produção: schema multi-tenant + pool dinâmico + seed + getActiveConnectionId + queries refatoradas + CRUD super_admin mínimo (`/configuracoes/conexoes`)"
unblocks:
  - "Fase 3 (v0.38.0) — UI completa em 4 abas (Conexões / Tempo real / Jobs / Saúde) + sidebar reorg (`Bancos Nexus Chat`) + wizard de onboarding + alertas automáticos. Spec já redigida em `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase3-ui-completa-design.md`."
---

# Spec — Multi-tenant Realtime — Fase 2 (Webhook + realtime)

> **v3 — pente fino #1 (24 achados) e #2 (22 achados) aplicados. Pronta para aprovação do João.**

## 1. Sumário executivo

A Fase 1 entrega a fundação invisível: pool dinâmico por connection, resolver `getActiveConnectionId`, queries refatoradas, seed da connection legada e CRUD super_admin mínimo de connections/bindings. Os relatórios continuam atualizando via cron de 5 min (BullMQ scheduler) — atraso típico 0–5 min até facts reflitirem evento novo do Nexus Chat.

A Fase 2 troca o gatilho do refresh de **cron periódico** para **evento real**: cada instalação Nexus Chat é cadastrada com um webhook único (`POST /api/webhooks/nexus-chat/<token>`), validado por HMAC e debounced em BullMQ. Quando uma conversa muda no Chatwoot, em <100 ms o handler responde 200 OK, enfileira refresh dos 4 jobs `refresh-by-*` para o `(connectionId, accountId)` afetado, e publica `facts:refreshed` no Redis Pub/Sub. As 7 páginas de relatório passam a montar `useFactsRealtime({ connectionId, accountId })` e o `router.refresh()` (debounced 5s) atualiza a UI. O cron de 5 min é mantido como **fallback** com frequência reduzida para 30 min (cobre falhas do webhook ou janelas de deploy do Chatwoot).

Também finaliza a remoção do shim `getChatwootPool()` (delete final, zero call-sites), monta o listener `connection:updated/deleted` no processo do **App** (hoje só roda no worker), e produz runbook para o admin do Chatwoot cadastrar o webhook.

**Sem mudança visível ao usuário comum** — UI nova é apenas no `/configuracoes/conexoes` (campo "Webhook URL" + botão "Copiar" + botão "Regerar segredo"). Wizard de onboarding, abas "Tempo real"/"Saúde" e alertas por email ficam para Fase 3.

## 2. Motivação

- Cron de 5 min é lento para o uso real: o atendente fecha conversa, abre o dashboard e espera "até 5 min" pra refletir. Sensação de produto travado.
- Sob carga real (vários eventos/min), cron processa todas as bindings independentemente do que mudou. Webhook processa só o que de fato mudou — economia de queries.
- Pré-condição da Fase 3 (alertas em tempo real, ex.: "fila de espera passou de 30 min"). Sem evento granular, não há como disparar.
- Reduz risco de "shim esquecido": Fase 1 deixou `src/lib/chatwoot/pool.ts` como compat layer; a Fase 2 fecha esse capítulo.

## 3. Estado atual (linha de base)

Pós-Fase 1, deployada em produção:

- `prisma/schema.prisma`: `NexusChatConnection` (com `webhookToken: String? @unique` e `webhookSecretEnc: String?` — ambos NULL pós-seed) e `CompanyChatBinding`.
- `src/lib/nexus-chat/pool.ts`: `getNexusChatPool(connectionId)`, `invalidateNexusChatPool(connectionId)`, `queryNexusChat(connectionId, sql, params)` com cache `Map`, snapshot, janitor 30 min, hot-reload safe via `globalThis.__nexusChatPools`.
- `src/lib/nexus-chat/errors.ts`: `ConnectionUnavailableError`, `NoActiveBindingError`, `AmbiguousBindingError`.
- `src/lib/nexus-chat/seed.ts`: roda no boot do worker via advisory lock 8472938; idempotente.
- `src/lib/nexus-chat/ensure-tables.ts`: DDL idempotente runtime (cria `nexus_chat_connections`, `company_chat_bindings`, adiciona `connection_id` em 6 tabelas `chatwoot_facts_*`, indexes secundários).
- `src/lib/realtime.ts`: `RealtimeEvent` já inclui `facts:refreshed` com `{ dimension, connectionId, accountId }`, `connection:updated` e `connection:deleted` (todos com `connectionId`). `publishRealtimeEvent` escreve em `nexus-insights:realtime`.
- `src/app/api/events/route.ts`: SSE inscrito no canal Redis, `runtime: "nodejs"`, heartbeat 30s.
- `src/components/reports/use-facts-realtime.ts`: hook client filtra por `accountId` apenas (Fase 1 não conseguiu fechar `connectionId` ainda — pendência transferida explicitamente para a Fase 2 §4.1, item 7).
- `src/components/reports/facts-freshness.tsx`: monta `useFactsRealtime({ accountId })` e poll 30s. Usado em 5 das 7 pages: `visao-geral`, `distribuicao`, `equipe`, `origem-ia`, `performance`. **Faltam:** `conversas`, `mensagens-nao-respondidas`.
- `src/worker/index.ts`: scheduler `*/5 * * * *` em 4 queues `refresh-by-*` + `housekeeping` diário. Listener Pub/Sub para `connection:updated/deleted` invalidando pool. App **NÃO** tem esse listener (§4.1, item 8).
- `src/lib/chatwoot/pool.ts` (shim): ainda existe como camada de transição da Fase 1; deve sumir nesta fase (§4.1, item 9).
- `src/lib/queue.ts`: 4 queues `refresh-by-*` com `attempts: 3, backoff: exponential 5s`. **Sem suporte a debounce ainda** — Fase 2 introduz padrão `jobId` único + `delay`.
- Auditoria: `logAudit({ action, targetType, targetId, details })` em `src/lib/audit.ts` com fire-and-forget. `AuditAction` enum no schema Prisma — nova ação `webhook.received` precisa ser adicionada (§5.6).
- Rate limit: padrão `redis.incr(key) + redis.expire(key, ttl)` usado em `src/lib/actions/integrations-power-bi.ts` linhas 666/718 (5 reveals/dia, 10 rotates/dia). Padrão repetido para webhook (§7.4).
- `src/instrumentation.ts`: hook do Next.js já registra handlers `unhandledRejection` / `uncaughtException`. Boa porta de entrada para subscriber Pub/Sub do App (§4.1, item 8).

## 4. Escopo desta Fase 2

### 4.1 Objetivos (entregáveis)

1. **Endpoint webhook** `POST /api/webhooks/nexus-chat/[token]/route.ts` (App Router, `runtime: "nodejs"`, `dynamic: "force-dynamic"`).
2. **Geração de `webhookToken` (64 chars hex) + `webhookSecret` (64 chars hex, AES-256-GCM antes de persistir)** dentro das Server Actions `createNexusChatConnection` (auto na criação) e `regenerateConnectionWebhookSecret` (super_admin sob demanda) já existentes em `src/lib/actions/nexus-chat/connections.ts` (Fase 1 L8).
3. **Validação HMAC SHA-256** do header `X-Chatwoot-Hmac-Sha256` contra `webhookSecretEnc` decriptado. Comparação **constant-time** via `crypto.timingSafeEqual`. Rejeita 401 se inválido. Sem fallback inseguro.
4. **Resolução de binding** a partir do `account.id` do payload Chatwoot. Bind `(connectionId, accountId)` com `enabled=true`, `deletedAt: null`, `connection.status='active'`, `connection.deletedAt: null`. Se ausente → 200 OK + log estruturado `webhook.unmatched` (não 4xx; Chatwoot trata 4xx como retry-forever que entope o painel).
5. **Debounce ~2s** em BullMQ: usa `jobId` único `refresh:<dimension>:<connectionId>:<accountId>:<bucket-2s>` + `delay: 2000`, `removeOnComplete: 100`. Burst de eventos do mesmo binding é coalescido (segundo enqueue com `jobId` igual é silenciosamente ignorado pelo BullMQ).
6. **Publish imediato** de `facts:refreshed` no Redis Pub/Sub **sem aguardar refresh terminar**. UI faz `router.refresh()` debounced 5s; até o refresh do worker concluir, RSC ainda lê facts antigos por uns segundos — aceitável (e detectável pelo `FactsFreshness` badge).
7. **`useFactsRealtime` filtra por `(connectionId, accountId)` em todas as 7 páginas de relatório.** Fechar a pendência da Fase 1 (item 11 da spec da Fase 1, pulado em L7). Pages server-component fazem `await getActiveConnectionId(user)` + `await getActiveAccountId(user)` e passam para um wrapper client (`<RealtimeMount connectionId accountId />`) que monta o hook. Páginas afetadas: `visao-geral` (já tem via `FactsFreshness` — atualizar), `conversas` (novo), `distribuicao` (já tem via `FactsFreshness` — atualizar), `equipe` (idem), `origem-ia` (idem), `performance` (idem), `mensagens-nao-respondidas` (novo).
8. **App escuta `connection:updated/deleted`** via `instrumentation.ts → register()`: cria `IORedis` subscriber dedicado, on `connection:updated/deleted` chama `invalidateNexusChatPool(connectionId)` no processo do App. Mesmo padrão do worker. Justificativa: pool dinâmico vive em `globalThis.__nexusChatPools` por processo — App e worker têm Maps distintos; ambos precisam invalidar.
9. **Cron reduzido para fallback (30 min)** em todas as 4 queues `refresh-by-*`. Pattern muda de `*/5 * * * *` para `*/30 * * * *`. Webhook é o caminho primário; cron só cobre quedas de webhook (Chatwoot down, app reiniciando, perda de pacote).
10. **Remover o shim `src/lib/chatwoot/pool.ts`** completamente. Pré-condição: `git grep` por `getChatwootPool` em todo o repo retorna **zero call-sites** após Fase 1 LIVE. Migration final: deletar arquivo + atualizar imports residuais (se houver) + audit log de "shim removido".
11. **UI mínima de webhook** em `/configuracoes/conexoes` (estende a tela da Fase 1):
    - Coluna "Webhook" na tabela: badge "Configurado" (emerald) ou "Não configurado" (muted).
    - No Dialog de detalhe da connection: bloco "Webhook" com URL completa (read-only, button "Copiar"), botão "Regerar segredo" (com confirm AlertDialog), botão "Ver instruções" (Sheet lateral com runbook §13.1 inline).
    - Secret nunca aparece — UI só confirma "Configurado" + permite regerar (gera novo, antigo invalidado imediatamente).
12. **Audit log enriquecido**: novas ações `webhook.received` (sample 1/100), `webhook.rejected_hmac`, `webhook.rejected_rate_limit`, `webhook.regenerated_secret`, `webhook.no_binding`, `webhook.shim_removed`.
13. **Rate limit por token**: 100 req/min/token via padrão Redis `incr + expire 60s`. Acima → 429 com `Retry-After: <seconds>` header. Audit log `webhook.rejected_rate_limit` (sample 1/100).
14. **Replay attack protection** (defesa em camadas):
    - Header `X-Chatwoot-Hmac-Sha256` é determinístico (mesmo body → mesmo HMAC). Por si só não previne replay de payload duplicado.
    - **Mitigação primária via debounce do BullMQ:** payload duplicado dentro da janela de 2s é coalescido (mesmo `jobId`) e processado 1 vez. Replays espaçados (>2s) disparam refresh idempotente — o worker reescreve as facts com `INSERT ... ON CONFLICT (...) DO UPDATE` (padrão atual dos 4 jobs). Idempotente por design.
    - **Mitigação secundária via rate limit:** atacante enviando replay massivo bate em 100 req/min e é rejeitado.
    - **Não usar timestamp do header** porque o Chatwoot atualmente não fornece um. Documentado como Q1 §22.
15. **Retry policy do BullMQ** mantém os 3 attempts já configurados no `src/lib/queue.ts`. Se enqueue do Redis falha (caso raro: Redis down), webhook handler ainda retorna 200 OK + log estruturado `webhook.enqueue_failed`. Cron de 30 min cobre o gap.
16. **Runbook completo** em `docs/runbooks/webhook-nexus-chat.md`: como cadastrar webhook no Chatwoot, eventos a marcar, troubleshooting.

### 4.2 Não-objetivos (explicitamente fora desta fase)

- ❌ UI completa em 4 abas (Conexões / Tempo real / Jobs / Saúde) — Fase 3.
- ❌ Wizard de onboarding nova empresa (autopreenche binding etc.) — Fase 3.
- ❌ Alertas automáticos por email (ex.: "binding sem evento há 1h") — Fase 3.
- ❌ Sidebar reorg (mover "Jobs de pré-agregação" pra agrupar com Conexões) — Fase 3.
- ❌ Renomear tabelas legadas `chatwoot_*` → `nexus_chat_*` — fase futura de naming cleanup.
- ❌ Webhook outbound (Nexus Insights enviando eventos para outros sistemas) — fora de roadmap.
- ❌ Suporte a múltiplos webhooks por connection — desnecessário (1 instalação Chatwoot já cobre N accounts internamente).
- ❌ Filas dedicadas por binding — concurrency=1 por queue continua, debounce já cobre coalescência.
- ❌ Reprocessar histórico via webhook (backfill de eventos antigos) — cron de 30 min + housekeeping cobrem.
- ❌ Webhook signing key rotation automática — manual sob demanda via "Regerar segredo".

## 5. Endpoint do webhook

### 5.1 Arquivo e contrato

**Path:** `src/app/api/webhooks/nexus-chat/[token]/route.ts`
**Runtime:** `export const runtime = "nodejs";` (`pg` + `crypto` precisam de Node nativo).
**Caching:** `export const dynamic = "force-dynamic";` (toda request é única).
**Method:** `POST` apenas. `GET/PUT/DELETE` retornam 405.

### 5.2 Pseudo-código

```typescript
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import {
  refreshByAccountQueue,
  refreshByInboxQueue,
  refreshByAgentQueue,
  refreshByTeamQueue,
} from "@/lib/queue";
import { publishRealtimeEvent } from "@/lib/realtime";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_MINUTE = 100;
const DEBOUNCE_MS = 2_000;
const SAMPLE_RATE = 100; // log 1 a cada 100 eventos

interface ChatwootWebhookPayload {
  event: string; // "conversation_created" | "conversation_updated" | ...
  account?: { id?: number };
  // payload tem mais campos; nós só usamos `account.id`.
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const startedAt = Date.now();
  const { token } = await params;

  // 1. Lookup da connection. Se não existe → 404 silencioso (não revela existência de tokens).
  const conn = await prisma.nexusChatConnection.findUnique({
    where: { webhookToken: token, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      webhookSecretEnc: true,
    },
  });
  if (!conn || conn.status !== "active" || !conn.webhookSecretEnc) {
    // 404 ambíguo cobre: token inválido, connection paused/deleted, secret não gerado.
    return new NextResponse(null, { status: 404 });
  }

  // 2. Rate limit por token (incr + expire 60s). 100 req/min/token.
  const rateKey = `webhook:rate:${conn.id}:${Math.floor(Date.now() / 60_000)}`;
  const count = await redis.incr(rateKey);
  if (count === 1) await redis.expire(rateKey, 60);
  if (count > RATE_LIMIT_PER_MINUTE) {
    if (count % SAMPLE_RATE === 1) {
      void logAudit({
        action: "webhook_rejected_rate_limit",
        targetType: "nexus_chat_connection",
        targetId: conn.id,
        details: { count, name: conn.name },
      });
    }
    return new NextResponse(null, {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  // 3. Validação HMAC. Body cru (NÃO json) — HMAC é sobre raw bytes.
  const rawBody = await req.text();
  const headerSig = req.headers.get("x-chatwoot-hmac-sha256") ?? "";
  if (!headerSig) {
    void logAudit({
      action: "webhook_rejected_hmac",
      targetType: "nexus_chat_connection",
      targetId: conn.id,
      details: { reason: "missing_header", name: conn.name },
    });
    return new NextResponse(null, { status: 401 });
  }
  const secret = decrypt(conn.webhookSecretEnc);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const headerBuf = Buffer.from(headerSig, "utf8");
  if (
    expectedBuf.length !== headerBuf.length ||
    !timingSafeEqual(expectedBuf, headerBuf)
  ) {
    void logAudit({
      action: "webhook_rejected_hmac",
      targetType: "nexus_chat_connection",
      targetId: conn.id,
      details: { reason: "mismatch", name: conn.name },
    });
    return new NextResponse(null, { status: 401 });
  }

  // 4. Parse + extração do account.id. Tolerante a JSON malformado (200 OK, log).
  let payload: ChatwootWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ChatwootWebhookPayload;
  } catch {
    void logAudit({
      action: "webhook_received",
      targetType: "nexus_chat_connection",
      targetId: conn.id,
      details: { reason: "invalid_json", name: conn.name },
    });
    return NextResponse.json({ ok: true, ignored: "invalid_json" });
  }
  const accountId = payload.account?.id;
  if (typeof accountId !== "number" || !Number.isFinite(accountId)) {
    return NextResponse.json({ ok: true, ignored: "missing_account_id" });
  }

  // 5. Resolver binding ativo (connectionId, accountId).
  const binding = await prisma.companyChatBinding.findFirst({
    where: {
      connectionId: conn.id,
      chatwootAccountId: accountId,
      enabled: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!binding) {
    if (Math.random() * SAMPLE_RATE < 1) {
      void logAudit({
        action: "webhook_no_binding",
        targetType: "nexus_chat_connection",
        targetId: conn.id,
        details: { accountId, name: conn.name, event: payload.event },
      });
    }
    // Nunca 4xx: Chatwoot trata 4xx como retry forever e enche painel.
    return NextResponse.json({ ok: true, ignored: "no_binding" });
  }

  // 6. Enfileirar 4 jobs com debounce (jobId único por bucket de 2s).
  const bucket = Math.floor(Date.now() / DEBOUNCE_MS);
  const jobOpts = (dim: string) => ({
    jobId: `refresh:${dim}:${conn.id}:${accountId}:${bucket}`,
    delay: DEBOUNCE_MS,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
  const data = { connectionId: conn.id, accountId };

  try {
    await Promise.all([
      refreshByAccountQueue.add("refresh-by-account", data, jobOpts("account")),
      refreshByInboxQueue.add("refresh-by-inbox", data, jobOpts("inbox")),
      refreshByAgentQueue.add("refresh-by-agent", data, jobOpts("agent")),
      refreshByTeamQueue.add("refresh-by-team", data, jobOpts("team")),
    ]);
  } catch (err) {
    void logAudit({
      action: "webhook_received",
      targetType: "nexus_chat_connection",
      targetId: conn.id,
      details: {
        reason: "enqueue_failed",
        message: (err as Error).message,
        accountId,
      },
    });
    // Webhook responde 200 mesmo assim — cron de 30 min cobrirá.
  }

  // 7. Publish imediato no Pub/Sub (UI já reage via SSE — não esperamos refresh terminar).
  // Publica 1 evento por dimensão para coalescência por filtro do hook.
  const dims = ["by_account", "by_inbox", "by_agent", "by_team"] as const;
  for (const d of dims) {
    void publishRealtimeEvent({
      type: "facts:refreshed",
      dimension: d,
      connectionId: conn.id,
      accountId,
    });
  }

  // 8. Audit log de evento recebido (sample 1/100 — não inundar).
  if (Math.random() * SAMPLE_RATE < 1) {
    void logAudit({
      action: "webhook_received",
      targetType: "nexus_chat_connection",
      targetId: conn.id,
      details: {
        accountId,
        event: payload.event,
        durationMs: Date.now() - startedAt,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return new NextResponse(null, { status: 405 });
}
```

**Nota de implementação — limite de payload (mitigação DoS):** antes de `await req.text()`, validar `Content-Length` e abortar com `413 Payload Too Large` se acima de 1 MB. Chatwoot raramente envia payloads >100 KB; 1 MB é margem 10x. Patch:

```typescript
const contentLength = Number(req.headers.get("content-length") ?? "0");
if (contentLength > 1_000_000) {
  return new NextResponse(null, { status: 413 });
}
const rawBody = await req.text();
if (rawBody.length > 1_000_000) {
  return new NextResponse(null, { status: 413 });
}
```

A validação dupla cobre clients que omitem `Content-Length` (usam chunked encoding).

### 5.3 Tempos esperados

| Etapa | Tempo p99 alvo | Observação |
|---|---|---|
| Lookup connection (Prisma + index `webhook_token` UNIQUE) | < 5 ms | Tabela pequena. |
| Rate limit (`incr + expire`) | < 2 ms | Latência Redis local ~1 ms. |
| Decrypt do secret + HMAC | < 5 ms | AES-256-GCM + HMAC SHA-256 ~MB/s. |
| `findFirst` binding | < 5 ms | Index `(connection_id, chatwoot_account_id)` UNIQUE. |
| 4 enqueues BullMQ | < 30 ms | 4 LPUSH em paralelo, mas Redis serializa internamente. |
| 4 publishes Pub/Sub | < 10 ms | Fire-and-forget, sem `await`. |
| **Total p99** | **< 60 ms** | Margem confortável vs alvo <100 ms. |

### 5.4 Por que `findUnique` no `webhookToken` e não autenticação no path

A URL com slug 32-byte (64 chars hex) é o "primeiro fator". HMAC é o "segundo fator". Slug enumerável (ex.: incremental ID) seria fragilíssimo: scanner descobre IDs e força HMAC contra todos. Token random é resistente a brute force até com volume massivo (2^256 → impraticável).

Não usamos `Authorization: Bearer` porque o Chatwoot já envia `X-Chatwoot-Hmac-Sha256` nativo — adicionar Bearer separado complica config do admin sem ganho real (ambos secrets viram alvos).

### 5.5 Detalhe importante: body cru vs `req.json()`

HMAC do Chatwoot é calculado sobre **bytes brutos** do body. Se chamarmos `req.json()` direto, perdemos os bytes originais e o HMAC computado localmente diverge mesmo em payloads idênticos (espaços, ordem de chaves serializada pelo Chatwoot). Sempre `await req.text()` primeiro, depois `JSON.parse(rawBody)`.

### 5.6 `AuditAction` enum — adições necessárias

`prisma/schema.prisma → enum AuditAction` ganha:

```prisma
enum AuditAction {
  // ... existentes
  webhook_received
  webhook_rejected_hmac
  webhook_rejected_rate_limit
  webhook_no_binding
  webhook_regenerated_secret
  webhook_shim_removed
}
```

Migration aditiva idempotente (mesmo padrão da Fase 1: `ensureNexusChatTables` runtime cria/altera tipo). Como Prisma não tem `addEnumValue` em migrations não-destrutivas com `CREATE TYPE IF NOT EXISTS`, usar SQL nativo:

```sql
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'webhook_received';
-- repetir para os outros 5
```

`ALTER TYPE ADD VALUE` em Postgres 12+ é instantâneo (não bloqueia leitura/escrita, mas exige `COMMIT` antes de uso — Prisma faz transaction-per-statement por padrão, OK).

## 6. Geração de token e secret

### 6.1 Função utilitária

`src/lib/nexus-chat/webhook-credentials.ts` (novo):

```typescript
import { randomBytes } from "crypto";

/**
 * Gera token público de webhook (vai na URL).
 * 32 bytes = 256 bits de entropia → 64 chars hex.
 * Random suficiente para resistir a brute force até 2^128 ops.
 */
export function generateWebhookToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Gera secret HMAC do webhook.
 * Mesma especificação do token; secret é cifrado com AES-256-GCM antes de persistir.
 */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}
```

Por que 32 bytes (não 16): margem de segurança. CPU custo nulo na geração. Banco custa 64 chars vs 32 — irrelevante.

### 6.2 Server Actions atualizadas

Em `src/lib/actions/nexus-chat/connections.ts` (entregue na Fase 1 L8):

```typescript
// Existente (Fase 1):
export async function createNexusChatConnection(input: ConnInput): Promise<ActionResult> {
  // ...validação...
  const passwordEnc = encrypt(input.password);
  // ── ADICIONAR (Fase 2):
  const webhookToken = generateWebhookToken();
  const webhookSecret = generateWebhookSecret();
  const webhookSecretEnc = encrypt(webhookSecret);
  // ───────────────────────
  const conn = await prisma.nexusChatConnection.create({
    data: {
      ...input,
      passwordEnc,
      webhookToken,
      webhookSecretEnc,
      // ...
    },
  });
  await logAudit({
    userId: actor.id,
    action: "connection_create",
    targetType: "nexus_chat_connection",
    targetId: conn.id,
    details: { name: conn.name, host: conn.host, webhookConfigured: true },
  });
  return { ok: true, data: { id: conn.id, name: conn.name } };
}

// Nova ação (Fase 2):
export async function regenerateConnectionWebhookSecret(
  id: string,
): Promise<ActionResult<{ ok: true }>> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const newSecret = generateWebhookSecret();
  const newSecretEnc = encrypt(newSecret);

  await prisma.nexusChatConnection.update({
    where: { id, deletedAt: null },
    data: { webhookSecretEnc: newSecretEnc },
  });

  await logAudit({
    userId: guard.userId,
    action: "webhook_regenerated_secret",
    targetType: "nexus_chat_connection",
    targetId: id,
    details: {},
  });

  // Note: token é o mesmo. Só o secret muda.
  // Não publicamos connection:updated porque pool de DB não muda.
  // Mas instruímos o admin a atualizar o secret no painel do Chatwoot
  // (Sheet de instruções do passo 11.2).

  return { ok: true, data: { ok: true } };
}
```

### 6.3 Backfill da connection seed

A connection "Padrão (legado)" criada pelo seed da Fase 1 ainda **não tem** webhook token/secret (campos NULL — Fase 1 §5.1 confirma). No deploy da Fase 2:

1. Migration runtime `ensureWebhookCredentialsForExistingConnections()`: para toda connection com `webhookToken IS NULL OR webhookSecretEnc IS NULL`, gerar e popular.
2. Idempotente: se já populado, no-op.
3. Roda no boot do worker (depois de `ensureNexusChatTables`, antes do listener Pub/Sub) e idempotente via advisory lock 8472939 (chave distinta do seed da Fase 1).
4. **Não** publica nenhum evento (nada muda em pool/UI até admin colar a URL no Chatwoot).

```typescript
// src/lib/nexus-chat/ensure-webhook-credentials.ts (novo)
const LOCK_KEY = 8472939;

export async function ensureWebhookCredentialsForExistingConnections(): Promise<{
  updated: number;
}> {
  const lock = await pgPool.query<{ locked: boolean }>(
    `SELECT pg_try_advisory_lock($1) AS locked`,
    [LOCK_KEY],
  );
  if (!lock.rows[0]?.locked) return { updated: 0 };
  try {
    const conns = await prisma.nexusChatConnection.findMany({
      where: {
        OR: [{ webhookToken: null }, { webhookSecretEnc: null }],
        deletedAt: null,
      },
      select: { id: true },
    });
    let updated = 0;
    for (const c of conns) {
      const tok = generateWebhookToken();
      const sec = encrypt(generateWebhookSecret());
      await prisma.nexusChatConnection.update({
        where: { id: c.id },
        data: { webhookToken: tok, webhookSecretEnc: sec },
      });
      updated++;
    }
    return { updated };
  } finally {
    await pgPool.query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY]);
  }
}
```

## 7. Debounce em BullMQ

### 7.1 Estratégia: `jobId` único + `delay`

BullMQ aceita `jobId` no `add()`. Se já existe um job com mesmo `jobId` (no estado `delayed`, `waiting` ou `active`), o segundo `add()` é rejeitado silenciosamente (o método retorna o job existente em vez do novo). Combinado com `delay: 2000`, isso vira "agendar daqui a 2s, mas se já agendado para esse bucket, ignorar". É exatamente o comportamento desejado: bursts dentro de 2s coalescem; burst de 100 eventos vira 1 refresh.

**Bucket de 2s:** `Math.floor(Date.now() / 2000)`. Dois eventos no mesmo bucket → mesmo `jobId`. Eventos em buckets adjacentes (separados por <2s mas cruzando boundary) podem disparar 2 jobs — aceitável (overshoot raro, refresh é idempotente).

### 7.2 Trade-offs avaliados

| Estratégia | Pró | Contra | Decisão |
|---|---|---|---|
| `jobId` + `delay 2000` | Simples, nativo, atômico | Bucket boundary pode duplicar | **Escolhido.** Duplicate cost = 1 query extra, idempotente. |
| Sliding window via Redis ZSET + cron | Sem boundary | Complexo, precisa worker dedicado | Over-engineering. |
| Job único persistente que faz `.changeDelay()` em cada evento | Coalescência perfeita | API não atômica → race | Descartado. |
| Lock distribuído (`SETNX 2s`) | Simples | Perde refreshes legítimos se falha | Descartado. |

### 7.3 Idempotência dos jobs `refresh-by-*`

Os 4 jobs já são idempotentes por design — usam `INSERT ... ON CONFLICT (...) DO UPDATE` para gravar facts. Verificar em `src/worker/jobs/pre-agregacao/refresh-by-account.ts` (linhas chave do upsert) que isso continua válido pós-Fase 1 (`connection_id` na PK não muda esse padrão; só vira mais coluna no `ON CONFLICT`).

### 7.4 Backpressure

Hoje cada queue tem `concurrency: 1` no worker. Burst de 100 webhooks de 100 bindings distintos enfileira 400 jobs (4 dimensões × 100 bindings) com 2s delay; o worker processa serialmente. Estimativa: cada job dura 200–500 ms. 400 jobs × 500 ms = 200 s até drenar. Aceitável dado que usuários veem facts antigas por <1 min em pior caso (e o `FactsFreshness` badge avisa "Atualizado há 1 min" — UX honesta).

Se virar gargalo: aumentar `concurrency` para 2 ou 3 (o pool dinâmico tem `max: 2` por connection — duas refreshes do mesmo binding em paralelo é seguro). **Fora do escopo da Fase 2;** flag de risco em §19.

### 7.5 Monitoramento simples

`/api/health` ganha bloco `queues: { refreshByAccount: { waiting, delayed, active }, ... }` via `queue.getJobCounts("waiting", "delayed", "active")`. Alvo p99 `delayed < 50` (quando `> 50` por mais de 5 min, cron de 30 min está atuando como freio — investigar).

## 8. Listener `connection:updated/deleted` no App

### 8.1 Por que precisa

Pool dinâmico (`src/lib/nexus-chat/pool.ts`) é `globalThis.__nexusChatPools` — escopo por processo. App e worker são processos diferentes. Hoje só o worker tem subscriber Pub/Sub que invalida o pool quando connection é editada/deletada (ver `src/worker/index.ts:48-81`). Sem o mesmo no App, edição de connection no super_admin invalida o pool **dele mesmo** (Server Action chama `invalidateNexusChatPool(id)` direto), mas pools de outras instâncias do App em produção (se houver replicas) ficam stale. Hoje não há replicas → não é problema crítico, mas a arquitetura prevê escala.

### 8.2 Implementação via `instrumentation.ts`

Next.js executa `register()` uma vez por processo no boot. Adicionar:

```typescript
// src/instrumentation.ts (estender o existente)
import IORedis from "ioredis";
import { CHANNEL as REALTIME_CHANNEL } from "@/lib/realtime";
import { invalidateNexusChatPool } from "@/lib/nexus-chat/pool";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // ... handlers existentes (unhandledRejection, uncaughtException) ...

  // ── Listener Pub/Sub para invalidar pool dinâmico (Fase 2) ────────────
  if (process.env.REDIS_URL) {
    const subscriber = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
      // Diferenciar dos outros subscribers no log do Redis:
      connectionName: "app-realtime-subscriber",
    });
    subscriber
      .subscribe(REALTIME_CHANNEL)
      .then(() => {
        subscriber.on("message", (_channel, message) => {
          try {
            const ev = JSON.parse(message) as {
              type?: string;
              connectionId?: string;
            };
            if (
              (ev.type === "connection:updated" ||
                ev.type === "connection:deleted") &&
              ev.connectionId
            ) {
              void invalidateNexusChatPool(ev.connectionId).catch(() => {});
            }
          } catch {
            // payload malformado — ignorar.
          }
        });
        console.log(
          `[instrumentation] inscrito em ${REALTIME_CHANNEL} (App side)`,
        );
      })
      .catch((err) => {
        console.error("[instrumentation] subscribe falhou:", err);
      });
  }
}
```

### 8.3 Trade-off avaliado: API route long-lived vs `instrumentation.ts`

| Abordagem | Pró | Contra | Decisão |
|---|---|---|---|
| `instrumentation.ts → register()` | Hook oficial Next.js, executa 1x por processo no boot | Conexão IORedis vira "fantasma" se Redis cai mid-flight (ioredis re-conecta automaticamente, mas requer monitoring) | **Escolhido.** |
| API route auto-pingada | Visível em `/api/...` | Hack; route handlers Next.js são request-scoped, conexão não persiste fora da request | Descartado. |
| BackgroundProvider client component | UI visível | Roda no cliente — não invalida pool do server | Inviável. |

### 8.4 Reconexão e robustez

`ioredis` faz reconnect automático (default `retryStrategy`). Se Redis cai por 30s, subscriber re-inscreve sozinho. Mensagens publicadas durante a queda são perdidas (Pub/Sub é fire-and-forget). Mitigação: Server Action de edit/delete da connection chama `invalidateNexusChatPool(id)` diretamente no processo dela antes de publicar — então o processo origem sempre invalida. Replicas perdem em janela de queda do Redis, mas pool TTL de 30 min limita o stale.

## 9. `useFactsRealtime` em todas as 7 páginas

### 9.1 Atualização da assinatura do hook

```typescript
// src/components/reports/use-facts-realtime.ts (extender)
export function useFactsRealtime(args: {
  connectionId: string;
  accountId: number;
  enabled?: boolean;
}): void {
  const { connectionId, accountId, enabled = true } = args;
  const router = useRouter();
  const lastCallRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource("/api/events");
    es.onmessage = (event: MessageEvent<string>) => {
      let payload: unknown;
      try { payload = JSON.parse(event.data); } catch { return; }
      if (
        typeof payload !== "object" || payload === null ||
        (payload as Record<string, unknown>).type !== "facts:refreshed" ||
        (payload as Record<string, unknown>).connectionId !== connectionId ||
        (payload as Record<string, unknown>).accountId !== accountId
      ) return;
      const now = Date.now();
      if (now - lastCallRef.current < 5_000) return;
      lastCallRef.current = now;
      router.refresh();
    };
    return () => es.close();
  }, [connectionId, accountId, enabled, router]);
}
```

Mudança: filtro adiciona `connectionId !== connectionId`. Sem isso, App com 2+ connections ouve eventos cruzados (um cliente vê refresh disparado por evento de outro cliente).

### 9.2 Wrapper client component

`src/components/reports/realtime-mount.tsx` (novo):

```typescript
"use client";
import { useFactsRealtime } from "./use-facts-realtime";

export function RealtimeMount(props: {
  connectionId: string;
  accountId: number;
}) {
  useFactsRealtime(props);
  return null; // não renderiza nada — efeito puro.
}
```

### 9.3 Atualização de cada page

**Pages que já têm `<FactsFreshness>` (5):** `visao-geral`, `distribuicao`, `equipe`, `origem-ia`, `performance`. Atualizar a assinatura de `<FactsFreshness>` (interno) para receber `connectionId` e propagar. **Não criar `<RealtimeMount>` nessas — já tem hook via FactsFreshness.**

**Pages sem `<FactsFreshness>` (2):** `conversas` e `mensagens-nao-respondidas`. Adicionar `<RealtimeMount connectionId accountId />` no JSX (invisível) + opcionalmente `<FactsFreshness>` no header (nova prop). Decisão: **adicionar `<FactsFreshness>` em ambas para consistência visual** — todo relatório passa a mostrar o badge de freshness.

**Padrão por page:**

```typescript
// src/app/(protected)/relatorios/conversas/page.tsx
import { getActiveConnectionId } from "@/lib/reports/active-connection";
// ...
const accountId = await getActiveAccountId(user as AuthUser);
const connectionId = await getActiveConnectionId(user as AuthUser); // novo
await assertAccountAccess(user as AuthUser, accountId);
// ...
<PageHeader
  // ...
  actions={<FactsFreshness connectionId={connectionId} accountId={accountId} />}
/>
```

### 9.4 Atualização de `<FactsFreshness>`

Adicionar prop `connectionId: string`. Hook `useFactsRealtime` passa a receber `{ connectionId, accountId }`. Logic interna do componente (poll 30s, visual de badge) **não muda**.

### 9.5 SSE — limite de conexões por aba

Cada aba aberta cria 1 EventSource. 5 abas × 1 user = 5 conexões SSE. Hoje sem replicas no App, tudo no mesmo processo Node — limite prático 1024 conexões TCP. Para 50 super_admins ativos com 5 abas cada → 250 conexões. Confortável. Se preocupar no futuro: SharedWorker com BroadcastChannel coalesce em 1 EventSource por origin. Fora do escopo da Fase 2.

### 9.6 Hook único por page (não duplicar)

Garantir que `useFactsRealtime` é montado **uma vez** por page. Se `<FactsFreshness>` montar e a page também montar `<RealtimeMount>`, abrem 2 EventSources e disparam 2 `router.refresh()` por evento (ineficiente mas inofensivo — `router.refresh()` é debounced 5s). **Convenção:** se page tem `<FactsFreshness>`, não montar `<RealtimeMount>` adicional. Se não tem, montar `<RealtimeMount>` standalone.

## 10. Cron como fallback (30 min)

### 10.1 Mudança em `src/worker/index.ts`

```typescript
// ANTES (Fase 1):
await refreshByAccountQueue.upsertJobScheduler(
  "facts-refresh-by-account",
  { pattern: "*/5 * * * *" },
  { name: "facts-refresh-by-account" },
);

// DEPOIS (Fase 2):
await refreshByAccountQueue.upsertJobScheduler(
  "facts-refresh-by-account-fallback",
  { pattern: "*/30 * * * *" },
  { name: "facts-refresh-by-account-fallback" },
);
```

**Importante:** mudar o `name` evita que o BullMQ mantenha o scheduler antigo (5min) coexistindo com o novo (30min). `upsertJobScheduler` substitui pelo `id` (primeiro arg); usar id novo `facts-refresh-by-account-fallback` força criação clean. Migration de housekeeping (§14) deleta o scheduler antigo explicitamente para garantir.

### 10.2 Job sem binding específico (modo broadcast)

Cron de fallback **não recebe payload `{ connectionId, accountId }`** (não há evento gatilhando). Em vez disso, ele iteia sobre todas as bindings ativas e enfileira um job por binding — mesmo padrão da Fase 1 (`getBindingsToRefresh()`). Isso significa que o job de scheduler dispara um sub-job por binding. Implementação: o handler do scheduled job vira um "fan-out":

```typescript
// src/worker/jobs/pre-agregacao/refresh-by-account.ts
export async function processRefreshByAccount(job: Job): Promise<unknown> {
  // Job de scheduler (sem payload específico): fan-out
  if (job.name.endsWith("-fallback")) {
    const bindings = await getBindingsToRefresh();
    for (const b of bindings) {
      await refreshByAccountQueue.add("refresh-by-account-event", b, {
        // sem jobId/delay — webhook usa esses; cron quer tudo executar
        removeOnComplete: 100,
      });
    }
    return { fannedOut: bindings.length };
  }
  // Job real (de webhook ou de cron fan-out): processa o binding específico
  const { connectionId, accountId } = job.data as RefreshTarget;
  // ... lógica existente da Fase 1 ...
}
```

Por que dois nomes (`-fallback` para scheduler, `-event` para job real)?
- `-fallback`: discoverable em logs ("ah, refresh disparado por cron de 30min, não por webhook").
- `-event`: payload `{ connectionId, accountId }` — vêm tanto de webhook quanto do fan-out do cron.

### 10.3 Reduzir frequência: justificativa numérica

- Webhook = caminho primário, latência 0–7s (2s debounce + 200–500 ms refresh).
- Cron = safety net. 30 min cobre cenários: deploy do app (~5 min downtime), Chatwoot deploy/restart (raro), perda de pacote.
- Bindings × dimensões cron: 100 × 4 × 1/30min = 13 jobs/min. Carga insignificante vs antes (66 jobs/min em 5min).
- Custo da redução: se webhook falha silenciosamente, usuário pode ver até 30 min de defasagem antes do fallback rodar. Mitigação: `/api/health` mostra `webhookLastReceivedAt` por connection; super_admin vê quando última event foi processado.

### 10.4 Detecção de webhook quieto

Coluna nova `last_webhook_event_at TIMESTAMP NULL` em `nexus_chat_connection` (DDL idempotente em `ensure-tables.ts`). Webhook handler atualiza essa coluna com `NOW()` no caminho de sucesso (passo 8 do pseudo-código §5.2). Update é fire-and-forget, não bloqueia resposta.

```sql
ALTER TABLE "nexus_chat_connections" ADD COLUMN IF NOT EXISTS "last_webhook_event_at" TIMESTAMP(3);
```

Update no handler:
```typescript
void prisma.nexusChatConnection.update({
  where: { id: conn.id },
  data: { lastWebhookEventAt: new Date() },
}).catch(() => {});
```

`/api/health` adiciona campo:
```json
{
  "connections": [
    {
      "id": "...",
      "name": "...",
      "lastWebhookEventAt": "2026-05-03T22:30:00Z",
      "lastWebhookSecondsAgo": 12
    }
  ]
}
```

## 11. UI mínima de webhook

### 11.1 Tela `/configuracoes/conexoes` (extensão da Fase 1)

**Coluna nova "Webhook"** na tabela:
- Badge `bg-emerald-500/10 text-emerald-600` "Configurado" quando `webhookToken IS NOT NULL`.
- Badge `bg-muted/40 text-muted-foreground` "Não configurado" quando NULL.
- Tooltip: "Última requisição: há X min" (lendo `last_webhook_event_at`). Se nunca: "Aguardando primeira requisição".

### 11.2 Dialog de detalhe da connection (já criado na Fase 1 — estender)

Bloco novo "Webhook":

```
┌───────────────────────────────────────────────────────────┐
│ Webhook                                                  │
│                                                           │
│ URL pública                                               │
│ ┌──────────────────────────────────────────────┐ [Copiar]│
│ │ https://insights.nexus.app/api/webhooks/...  │         │
│ └──────────────────────────────────────────────┘         │
│                                                           │
│ Segredo                            ●●●●●●●●  [Regerar...] │
│ Configurado em 30/04/2026 às 14h                          │
│                                                           │
│ Última requisição                                         │
│ Há 2 min · 142 eventos hoje                               │
│                                                           │
│ [Ver instruções de instalação no Chatwoot →]              │
└───────────────────────────────────────────────────────────┘
```

- "Copiar" usa `navigator.clipboard.writeText`. Toast Sonner verde "URL copiada".
- "Regerar..." abre AlertDialog: "Isso invalida o segredo atual imediatamente. Você precisará atualizar o segredo no painel do Chatwoot. Continuar?". Confirma → chama `regenerateConnectionWebhookSecret(id)`. Toast verde "Novo segredo gerado. Atualize no Chatwoot."
- "Ver instruções de instalação no Chatwoot" → abre Sheet com runbook §13.1 inline (markdown renderizado).

### 11.3 Ícones (Lucide)

- `Webhook` ícone do bloco.
- `Copy` no botão Copiar.
- `RefreshCw` no botão Regerar.
- `BookOpen` no link Instruções.

### 11.4 Skill obrigatória `ui-ux-pro-max`

Implementação dessa UI exige `ui-ux-pro-max:ui-ux-pro-max` antes de codar (regra absoluta CLAUDE.md §2.2). Tasks: (a) coluna na tabela, (b) bloco no dialog, (c) Sheet de instruções. Skill é invocada **separadamente** em cada uma porque todas têm decisões visuais (paleta da badge, layout do bloco, tipografia do código copiável, motion no toast de copiado).

### 11.5 Sidebar inalterada

A entrada `/configuracoes/conexoes` continua visível só para super_admin. Sidebar reorg = Fase 3.

## 12. Segurança

### 12.1 Camadas

| Camada | Mecanismo | Falha-fechada? |
|---|---|---|
| 1. URL com slug random 64 chars | `crypto.randomBytes(32).toString("hex")` | Sim: token errado → 404 ambíguo. |
| 2. HMAC SHA-256 obrigatório | `timingSafeEqual` sobre raw body | Sim: header faltando ou inválido → 401. |
| 3. Rate limit por token | Redis `incr + expire 60s`, 100/min | Sim: > 100/min → 429. |
| 4. Resolver binding ativo | `findFirst` com `enabled + deletedAt: null + connection.status='active'` | Sim: sem binding → 200 OK + log (não 4xx). |
| 5. Connection ativa + não deletada | Prisma `where: { status: 'active', deletedAt: null }` | Sim: paused/deleted → 404 ambíguo. |

### 12.2 Por que 200 OK em casos "ignorados" (sem binding, JSON inválido)

Chatwoot trata 4xx como erro permanente e tenta reentregar indefinidamente — pode encher o painel do admin Chatwoot com "webhooks falhando". 5xx = retry com backoff; 4xx = retry forever. **Política:** 4xx **só** quando há prova de auth fail (HMAC inválido, token desconhecido, rate limit). Outros casos (binding desabilitado, account_id ausente, JSON corrompido) são `200 OK { ignored: <reason> }` — Chatwoot considera entregue, log nosso registra para auditoria.

### 12.3 Logs nunca incluem secrets

- `webhookSecretEnc` decriptado vive em variável local apenas durante HMAC. Nunca em log.
- Body do payload **não** vai pra log (pode conter PII de mensagens). Só `event` (string curta) + `accountId`.
- Token público (`webhookToken`) vai pra log? **Não.** Em log só `connection.id` (UUID interno).

### 12.4 Replay attack — análise

Replay = atacante captura webhook genuíno e reenvia. HMAC determinístico → atacante não precisa do secret se reenviar exato.

**Mitigação:** debounce 2s + idempotência dos jobs. 100 replays do mesmo evento = 1 refresh + 99 silenciosamente ignorados. Custo zero pra plataforma.

**Cenário pior:** atacante reenvia 10k vezes esperando saturar Redis. Rate limit 100/min/token corta antes — mesmo 10k tentativas só conseguem 100 enqueues/min. Refresh idempotente.

**Não há vetor de elevação:** atacante não consegue criar binding fantasma, não consegue ler dados do banco do Chatwoot, não consegue alterar facts (apenas força refresh idempotente do mesmo binding).

### 12.5 RBAC — webhook é público (sem autenticação de usuário)

Endpoint `/api/webhooks/nexus-chat/[token]` **não autentica usuário** (Chatwoot não passa cookie de NextAuth). Auth é via token + HMAC. Endpoint precisa estar **fora** do middleware NextAuth — `src/middleware.ts` já isenta `/api/webhooks/*` (verificar; se não isenta, adicionar matcher excludente).

### 12.6 Matriz RBAC (UI)

| Ação | super_admin | admin (company) | manager | viewer |
|---|---|---|---|---|
| Ver "Webhook" coluna em `/configuracoes/conexoes` | ✅ | ❌ | ❌ | ❌ |
| Copiar URL pública | ✅ | ❌ | ❌ | ❌ |
| Regerar segredo | ✅ (audit log) | ❌ | ❌ | ❌ |
| Ler `last_webhook_event_at` | ✅ | ❌ | ❌ | ❌ |
| Receber evento via SSE (filtrado por accountId) | ✅ | ✅ | ✅ | ✅ |

Receber evento SSE é benigno (não vaza dados; só dispara `router.refresh()` no client). Filtro de `accountId` na fonte (`useFactsRealtime`) garante isolamento mesmo se Pub/Sub fosse global.

## 13. Documentação

### 13.1 Runbook `docs/runbooks/webhook-nexus-chat.md`

Conteúdo canônico:

**Seção 1 — Cadastrar webhook no Chatwoot**
1. Acesse o painel do Chatwoot da instalação.
2. `Settings → Integrations → Webhooks`.
3. Click "Add new webhook".
4. **URL:** copie do Nexus Insights → `/configuracoes/conexoes` → detalhe da connection → bloco "Webhook" → botão "Copiar".
5. **Subscribed events** — marque os 5 eventos abaixo (mínimo para que os relatórios reflitam tudo):
   - `conversation_created`
   - `conversation_updated`
   - `conversation_status_changed` (resolved, reopened, snoozed)
   - `message_created`
   - `assignee_changed` (atribuição de agente/team)
   - **Opcional:** `conversation_typing_on/off` — não usados pelos relatórios; pode marcar mas é ruído.
6. **Webhook secret** — copiar do Nexus Insights → `/configuracoes/conexoes` → detalhe → "Webhook" → botão "Regerar segredo" (gera + mostra UMA VEZ no toast). **Atenção:** o segredo nunca mais aparece depois; copie imediatamente.
7. Save no Chatwoot.

**Seção 2 — Validar funcionamento**
1. Abra `/configuracoes/conexoes` → detalhe da connection.
2. Aguarde até alguém usar o Chatwoot dessa instalação (criar/atualizar conversa).
3. Coluna "Última requisição" deve mudar de "Aguardando" para "Há X min".
4. Se passar 5 min e não mudar: §3 troubleshooting.

**Seção 3 — Troubleshooting**
| Sintoma | Causa provável | Ação |
|---|---|---|
| Coluna "Última requisição" estagnada | Webhook não chega ao app | Verificar `gh logs` por `webhook_received`. Se nada → DNS/firewall do Chatwoot bloqueia. |
| Painel do Chatwoot mostra 401 nas tentativas | Secret divergente | "Regerar segredo" no Nexus Insights → atualizar no Chatwoot. |
| Painel do Chatwoot mostra 429 | Rate limit (>100/min) | Esperar 1 min; se persiste, investigar loop de eventos no Chatwoot. |
| Painel do Chatwoot mostra 404 | Token inválido OU connection paused/deleted | Verificar status da connection (`active` esperado) e URL copiada corretamente. |
| Eventos chegam mas relatório não atualiza | Binding desabilitado ou inexistente | Verificar `/configuracoes/conexoes` → bindings ativos para o `account.id` correto. |
| Defasagem de até 30 min | Webhook silenciado (cron cobriu) | Verificar `last_webhook_event_at`. Refazer §1 do runbook. |

**Seção 4 — Operação**
- Como regerar segredo manualmente (clique → confirm → toast com new value).
- Como pausar uma connection (não exige tocar no Chatwoot — Nexus Insights ignora webhooks com 404 silencioso).
- Como remover uma connection (soft delete; bindings precisam estar `enabled=false` antes).
- Como ler audit log filtrando por `target_id = <connection.id>` (SQL exemplo).
- Como invalidar cache de pool (publica `connection:updated` via redis-cli — útil em debug).

**Seção 5 — Escalabilidade**
- Limites atuais (100 connections, 500 bindings, 100 req/min/token).
- Quando aumentar `concurrency` das queues `refresh-by-*`.
- Quando subir `RATE_LIMIT_PER_MINUTE` (instalação Chatwoot enterprise com >100 events/min).

### 13.2 README do projeto

Adicionar seção "Webhook do Nexus Chat" referenciando `docs/runbooks/webhook-nexus-chat.md`.

### 13.3 CHANGELOG

Entrada `## [v0.37.0] — Multi-tenant Realtime Fase 2`:
- Webhook /api/webhooks/nexus-chat/[token] com HMAC + rate limit + debounce 2s.
- Realtime em todas as 7 páginas de relatório.
- Cron reduzido para fallback (30min).
- UI de webhook em /configuracoes/conexoes (URL + Regerar + Instruções).
- Shim getChatwootPool() removido.
- AppListener Pub/Sub via instrumentation.ts.

## 14. Migrations e ordem de execução

Ordem rigorosa, cada step deployado e validado antes do próximo:

1. **Pré-requisito:** Fase 1 LIVE em produção e estável (≥7 dias). Validar `git grep getChatwootPool src/` retorna **zero call-sites** em código de produção (apenas o arquivo do shim).
2. **Migration aditiva runtime** (no boot do worker, idempotente):
   - `ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'webhook_received'` × 6.
   - `ALTER TABLE "nexus_chat_connections" ADD COLUMN IF NOT EXISTS "last_webhook_event_at" TIMESTAMP(3)`.
3. **Backfill** das credenciais de webhook das connections existentes (`ensureWebhookCredentialsForExistingConnections`, advisory lock 8472939).
4. **Deploy do código novo:** webhook handler, listener no `instrumentation.ts`, hook atualizado, UI nova, scheduler trocado para 30 min, ações novas no `connections.ts`.
5. **Pós-deploy: smoke test** (§17).
6. **Cleanup do shim:** delete físico de `src/lib/chatwoot/pool.ts`. Migration "morta" (sem efeito em runtime). Audit log `webhook_shim_removed`. Rebuild dos type-checks. **Este step é separado** do passo 4 para reduzir surface de change em uma release; se rollback necessário, shim ainda existia até o passo 6.
7. **Documentação ao admin Chatwoot** (`docs/runbooks/webhook-nexus-chat.md`) já versionada — comunicar pelo João.
8. **Cadastro do webhook no Chatwoot da Matrix Fitness Group** (instalação real). João faz manualmente seguindo runbook.

### 14.1 Plan de execução por etapa

A implementação em Fase 2 segue o padrão da Fase 1 (lotes paralelizáveis):

- **L0 — Schema/Errors/Helpers (sequencial):** `AuditAction` enum + `last_webhook_event_at` em `ensure-tables` + `webhook-credentials.ts` + `ensure-webhook-credentials.ts` + atualização do `RealtimeEvent` (não muda — Fase 1 já fez).
- **L1 — Webhook handler (sequencial, TDD):** `/api/webhooks/nexus-chat/[token]/route.ts` + testes unitários (HMAC OK, HMAC inválido, rate limit, debounce, no-binding, JSON inválido, GET 405).
- **L2 — UI estendida (paralelizável):** coluna webhook na tabela, bloco no Dialog, Sheet de instruções. Cada uma com `ui-ux-pro-max` separada.
- **L3 — Hook + 7 pages (paralelizável):** atualizar `useFactsRealtime`, criar `<RealtimeMount>`, atualizar `<FactsFreshness>`, montar nas 7 pages. 7 sub-tasks paralelas.
- **L4 — Worker mudanças (sequencial):** scheduler 30min, fan-out, listener (já existe — sem mudança). Atualizar shared.ts e refresh-by-*.
- **L5 — App instrumentation (sequencial):** adicionar listener no `instrumentation.ts`.
- **L6 — Server Actions:** atualizar `createNexusChatConnection`, criar `regenerateConnectionWebhookSecret`.
- **L7 — Cleanup do shim:** delete `src/lib/chatwoot/pool.ts`, atualizar imports residuais.
- **L8 — Runbook + CHANGELOG + verification:** documentação + smoke test em staging + release.

## 15. Rollback

### 15.1 Reversibilidade

Toda mudança da Fase 2 é **aditiva** (novas rotas, novas colunas opcionais, código novo). Rollback consiste em deployar a versão anterior do código. Cron 30 min volta ao 5 min via `upsertJobScheduler` no worker antigo.

**Estado do banco pós-rollback:** colunas novas ficam órfãs (`last_webhook_event_at`, `webhook_token`, `webhook_secret_enc` populados mas não usados). Sem efeito.

**Webhook cadastrado no Chatwoot:** continua chegando 404 (rota antiga não existe). Log do Chatwoot enche, mas não corrompe estado. Admin remove manualmente após confirmar rollback.

### 15.2 Cenários

| Cenário | Detecção | Ação |
|---|---|---|
| HMAC sempre falhando | Audit log spam `webhook_rejected_hmac` em <5 min | Rollback do código + reverter scheduler para 5min. Investigar config do Chatwoot. |
| Worker travando com debounce | `gh logs` worker repetindo `delayed > 1000` | Rollback. Investigar memory leak no BullMQ. |
| Pool exhaustion no banco do Chatwoot | `pg_stat_activity` no banco do Chatwoot mostra >5 conexões | Reduzir `max` no pool (já em 2; baixar pra 1) OU rollback. |
| Listener `instrumentation.ts` enchendo Redis com reconnects | Logs `[instrumentation] subscribe falhou` repetitivos | Rollback ou desligar via env flag. |
| `regenerateConnectionWebhookSecret` apaga secret real | Audit log + connection de cliente real | NÃO há rollback do secret antigo (não é guardado). Operacional: regerar de novo + atualizar no Chatwoot manualmente. |

### 15.3 Critério de "está em produção"

Fase 2 fica oficialmente LIVE quando:
- 7 dias sem falha persistente em log.
- Pelo menos 1 cliente real (Matrix) com webhook cadastrado e processando eventos.
- Métrica `lastWebhookSecondsAgo` < 60 em pelo menos uma connection.
- Rollback testado em staging (deploy + rollback + verify integridade do banco).

## 16. Observabilidade

Padrão da Fase 1: logs estruturados JSON via stdout do Portainer + `/api/health`.

### 16.1 Logs

- `webhook.received` (sample 1/100): `{ connectionId, accountId, event, durationMs }`.
- `webhook.rejected_hmac` (todos): `{ connectionId, reason: "missing_header" | "mismatch" }`.
- `webhook.rejected_rate_limit` (sample 1/100): `{ connectionId, count }`.
- `webhook.no_binding` (sample 1/100): `{ connectionId, accountId, event }`.
- `webhook.regenerated_secret` (todos): `{ connectionId, userId }`.
- `webhook.shim_removed` (uma vez): no boot pós-cleanup do shim.
- `instrumentation.realtime` (uma vez): no boot do listener no App.

### 16.2 `/api/health` enriquecido

```json
{
  "status": "ok",
  "version": "v0.37.0",
  "uptime_s": 124,
  "db": { "ms": 3 },
  "redis": { "ms": 1 },
  "chatwoot": { "ms": 4 },
  "connections": [
    {
      "id": "uuid",
      "name": "Matrix",
      "status": "active",
      "lastWebhookEventAt": "2026-05-03T22:30:00Z",
      "lastWebhookSecondsAgo": 12
    }
  ],
  "queues": {
    "refreshByAccount": { "waiting": 0, "delayed": 4, "active": 1 },
    "refreshByInbox": { "waiting": 0, "delayed": 4, "active": 0 },
    "refreshByAgent": { "waiting": 0, "delayed": 4, "active": 0 },
    "refreshByTeam": { "waiting": 0, "delayed": 4, "active": 0 }
  }
}
```

### 16.3 Painel super_admin (visualização leve, opcional)

Bloco em `/configuracoes/conexoes` "Saúde dos webhooks" mostrando lastWebhookSecondsAgo por connection. Pode ser badge na tabela mesmo (verde <60s, amber 60s-30min, rose >30min, muted nunca). Detalhamento profundo (gráfico hora a hora) = Fase 3.

## 17. Critérios de aceitação

A Fase 2 está completa quando:

- [ ] Endpoint `/api/webhooks/nexus-chat/[token]` POST responde 200 OK em <100 ms p99 com payload válido.
- [ ] HMAC validação falha-fechada com 401 em payload inválido.
- [ ] Rate limit retorna 429 com `Retry-After: 60` quando excedido.
- [ ] Debounce coalesce 100 eventos do mesmo binding em <2s em 1 refresh (verificado via `queue.getJobCounts`).
- [ ] `useFactsRealtime` filtra por `(connectionId, accountId)` e dispara `router.refresh()` debounced 5s nas 7 páginas.
- [ ] Páginas `conversas` e `mensagens-nao-respondidas` ganham `<FactsFreshness>` no header.
- [ ] App escuta `connection:updated/deleted` via `instrumentation.ts` e invalida pool corretamente.
- [ ] Cron rebaixado para 30 min (verificado em `bull-board` ou via `getRepeatableJobs`).
- [ ] Shim `src/lib/chatwoot/pool.ts` deletado e zero referências.
- [ ] UI mínima de webhook funcional (URL + Regerar + Instruções).
- [ ] Backfill de credenciais nas connections existentes idempotente (rerun não duplica).
- [ ] Audit log registrando todas as 6 novas ações.
- [ ] `/api/health` mostra `connections[]` com `lastWebhookEventAt` e `queues{}`.
- [ ] Runbook `docs/runbooks/webhook-nexus-chat.md` completo.
- [ ] Smoke test **em staging**: cadastrar webhook real em Chatwoot de teste, disparar evento, ver fact atualizada e UI re-renderizar dentro de 7s. **Em produção:** smoke test com payload simulado via `curl` (assinado com HMAC válido).
- [ ] Suíte de testes verde (typecheck 0, jest verde, ≥30 tests novos para webhook handler + hook + listener).
- [ ] CHANGELOG.md atualizado.

## 18. Dependências e o que vem a seguir

**Bloqueia Fase 3:**
- UI rica em 4 abas precisa do CRUD de webhook como base.
- Alertas automáticos por email exigem o evento granular (`webhook_no_binding`, `webhook_rejected_hmac`) já capturado no audit log.
- Wizard de onboarding precisa do botão "Regerar segredo" como ferramenta.

**Não bloqueia:**
- Renomear schema `chatwoot_*` → `nexus_chat_*` (independente).
- Convite/email de usuário (independente).
- Suporte SSL strict-mode em connection (Q2 da Fase 1; independente).

## 19. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| HMAC validação rejeita eventos legítimos por encoding diferente (UTF-8 vs LATIN-1) no body | Baixa | Alto | Usar `req.text()` que decodifica UTF-8 padrão; teste explícito com payload Chatwoot real em staging. |
| Replay attack massivo satura Redis | Baixa | Médio | Rate limit 100/min + debounce + idempotência. Não há saturação realista. |
| `regenerateConnectionWebhookSecret` apaga secret antigo sem confirmação clara | Média | Médio | AlertDialog explícito + audit log + toast pós-ação avisando "Atualize no Chatwoot agora". |
| `setInterval` do listener no App duplica em hot reload Next.js | Média | Baixo | `instrumentation.ts → register()` é executado UMA vez por boot — Next.js não roda hot-reload nesse hook. Verificado em §8. |
| App e Worker subscribers competem por mensagens Pub/Sub | Não acontece | — | Pub/Sub broadcasts pra todos os subscribers; cada um processa seu fan-out. |
| Concurrency=1 nos jobs vira gargalo após webhook ativo | Média | Baixo | Aumentar `concurrency` para 2-3 se `delayed > 50` por >5 min. Painel `/api/health` expõe. Não fix nessa fase. |
| Bucket boundary do debounce duplica refresh raramente | Alta (rara mas inevitável) | Baixo | Refresh é idempotente. Custo = 1 query extra. Aceito. |
| Backfill `ensureWebhookCredentialsForExistingConnections` lockou advisory mas crashou | Baixa | Baixo | Advisory lock do Postgres é session-scoped — release automático no disconnect. Próximo boot retoma. |
| Chatwoot envia eventos `conversation_typing_on/off` em alta frequência (ruído) | Alta | Baixo | Debounce 2s coalesce; payload `event` não filtrado no handler — todos os eventos disparam refresh. Trade-off aceitável (não quero filtragem complexa). Documentado no runbook (instruir admin a NÃO marcar typing). |
| Shim removido mas algum lugar ainda referencia | Média | Médio | Antes do delete físico, `git grep` em monorepo + jest + typecheck. Lote 7 separado em commit dedicado. |
| Segurança: `webhookToken` aparece em URL → fica em logs do Traefik e do Chatwoot | Média | Médio | Token tem entropia 256 bits — basta para resistir a brute force se vazar. Documentado em §12. Rotação manual disponível ("Regerar"). |
| Listener do App perde mensagens durante queda do Redis | Baixa | Baixo | Pool TTL 30 min limita stale; Server Action de edit invalida pool local antes de publicar. |
| `last_webhook_event_at` UPDATE em cada request gera contention | Baixa | Médio | Coluna isolada (não na PK), update é fire-and-forget. p99 <5 ms. Se virar gargalo, mover pra Redis (`SET webhook:last:<connId> <ts>`). |
| Subscriber do `instrumentation.ts` não fecha em SIGTERM | Baixa | Baixo | Next.js encerra processo, conexão TCP fecha por OS. Sem leak persistente. |
| `req.text()` em Next.js 16 com edge runtime: indisponível | N/A | — | Sempre `runtime: "nodejs"`. Documentado §5.1. |

## 20. Convenções de naming

| Camada | Padrão | Exemplo Fase 2 |
|---|---|---|
| Path/diretório | kebab-case | `src/app/api/webhooks/nexus-chat/[token]/route.ts` |
| Tabela / coluna SQL | snake_case | `last_webhook_event_at`, `webhook_token`, `webhook_secret_enc` |
| Modelo Prisma | PascalCase singular | `NexusChatConnection.lastWebhookEventAt` |
| Enum value | snake_case | `webhook_received`, `webhook_rejected_hmac` |
| Server Action | camelCase verbo | `regenerateConnectionWebhookSecret` |
| Helper | camelCase | `generateWebhookToken`, `generateWebhookSecret` |
| Componente | PascalCase | `RealtimeMount`, `FactsFreshness` |
| Test file | kebab-case + `.test.ts` | `route.test.ts`, `webhook-credentials.test.ts` |
| Cron scheduler id | kebab-case | `facts-refresh-by-account-fallback` |
| Job name | kebab-case | `refresh-by-account-event` (vs `-fallback`) |
| Audit `action` | snake_case | `webhook_regenerated_secret` |

UI/copy: **sempre "Nexus Chat"** (badge, título do bloco "Webhook", instruções, toast). "Chatwoot" só em strings técnicas — header `X-Chatwoot-Hmac-Sha256` (controlado pela própria Chatwoot), runbook de instalação no Chatwoot (referência ao painel deles).

## 21. Decision records

| Decisão | Alternativa | Razão |
|---|---|---|
| Body cru via `req.text()` antes de JSON.parse | `req.json()` direto | HMAC é sobre raw bytes; parse re-stringifica e diverge. |
| 32 bytes random hex (64 chars) para token | UUIDv4 | UUIDv4 tem só 122 bits de entropia úteis; hex 32 bytes é uniforme 256 bits. |
| `webhookSecret` cifrado com AES-256-GCM | Plaintext | Padrão de defense-in-depth: vazamento de DB não revela secret. |
| Rate limit 100/min/token | 30/min ou 500/min | Compatível com volume Chatwoot real (instalações de até 1k convs/dia × 5 events = ~10/min). 100 é margem 10x. |
| Debounce 2s | 500ms ou 5s | 500ms = pouca coalescência sob burst real (Chatwoot envia 5+ events/conversa); 5s = UX defasada. 2s é sweet-spot. |
| 4xx só em auth fail; 200 ignored em outros | 4xx em todo erro | Chatwoot faz retry forever em 4xx; entope painel. |
| Shim removido em commit separado pós-deploy | Junto com webhook | Reduz surface de change; rollback fácil mantendo shim. |
| `instrumentation.ts` como hook do listener | API route + cron de keep-alive | Hook oficial Next.js; executa 1× por boot. |
| Cron 30 min como fallback | Eliminar cron | Se webhook cair (Chatwoot down), sem cron usuário vê dados de horas atrás. 30min é seguro. |
| `<FactsFreshness>` em todas as 7 páginas | Só em algumas | Consistência visual; UX honesta sobre defasagem. |
| Backfill via DDL runtime | Migration Prisma manual | Padrão deste projeto (`ensureNexusChatTables` da Fase 1). Idempotente, sem downtime. |
| HMAC com `timingSafeEqual` e Buffer length check | `===` direto | Defesa contra timing attack — padrão de bibliotecas como `crypto-js`. |
| `last_webhook_event_at` em coluna SQL (não Redis) | Redis `SET webhook:last:<id>` | Consistência transactional com `connection`. Persistência cross-deploy. Volume baixo (~10 updates/min/connection). |
| AuditAction snake_case | camelCase | Consistência com enum existente (`integration_password_revealed`, `connection_create`). |
| Webhook URL com slug random embed | `?token=` query param | Path param fica fora dos logs de Traefik por default; query param sempre vai pro access log. |
| `concurrency: 1` mantido | Aumentar para 3 | Pool max=2 por connection; concurrency 3 pode saturar. Otimização futura. |

## 22. TODOs e questões abertas

- [ ] **Q1:** Chatwoot fornece header timestamp para replay protection? Hoje **não** (verificar mais a fundo durante implementação; possivelmente `X-Webhook-Timestamp`). Se aparecer, adicionar validação de `Math.abs(now - ts) < 300s`.
- [ ] **Q2:** Testar com Chatwoot Cloud vs self-hosted: o header HMAC pode variar (`X-Chatwoot-Hmac-Sha256` vs `X-Webhook-Signature`). Validar em staging com Chatwoot real antes de produção.
- [ ] **Q3:** Suporte a webhook **outbound** (Nexus Insights enviando alertas para Slack/email): deferido para Fase 3.
- [ ] **Q4:** Filtragem de eventos por tipo no handler (ignorar `conversation_typing_on/off` sem precisar do admin desmarcar): adicionar lista whitelist no código? Decisão atual: aceitar tudo (filtrar é opcional). Reavaliar se `webhook_received` log volumar incomodar.
- [ ] **Q5:** Substituir `lastWebhookEventAt` UPDATE síncrono por write-behind via Redis `SET` + flush a cada 1 min: otimização se volume passa 100 events/min/connection.
- [ ] **Q6:** Panel "Saúde dos webhooks" com gráfico hora a hora — Fase 3.
- [ ] **Q7:** Auto-disable de connection com webhook silenciado por > 24h e alerta por email: Fase 3.
- [ ] **Q8:** Considerar mover Pub/Sub do Redis para canal **por connection** (`nexus-insights:realtime:<connectionId>`) em escala alta — reduz fanout. Hoje canal único é OK até ~10 connections.
- [ ] **Q9:** Adicionar header `User-Agent: Chatwoot/X.Y.Z` validation no handler (defesa fraca, descartável). Não vamos fazer agora — falsos positivos possíveis em re-deploys do Chatwoot.

---

## Apêndice A — Pente fino #1 (achados aplicados)

Análise crítica da v1 buscando: bugs de exemplo, escopo mal-definido, segurança superficial, edge cases, contradições com Fase 1, ambiguidade.

| # | Achado | Severidade | Resolução |
|---|---|---|---|
| A1 | v1 dizia "Validar HMAC do header" sem citar o nome exato. Chatwoot usa `X-Chatwoot-Hmac-Sha256` — confirmação importante para o admin do Chatwoot copiar correto. | Importante | §5.2 e §13.1 explicitam o header exato. Q2 §22 reconhece variação Cloud vs self-hosted. |
| A2 | v1 não especificava se `req.json()` ou `req.text()` para body. HMAC é sobre raw bytes — parse de JSON re-stringifica e quebra. | Crítico | §5.5 nova explicando obrigatoriedade de `req.text()` antes de `JSON.parse`. Decision record §21. |
| A3 | v1 dizia "rate limit Redis-based" sem padrão concreto. Projeto já usa `incr + expire`. | Documentação | §5.2 e §7.4 referenciam o padrão exato (`integrations-power-bi.ts:666/718`). |
| A4 | v1 propunha `4xx` em casos como "binding ausente" e "JSON inválido". Chatwoot trata 4xx como retry forever — enche painel do admin. | Crítico | §12.2 nova explicando política: `4xx` apenas em auth fail (HMAC, token, rate limit); demais casos `200 OK { ignored: <reason> }`. Spec atualizada em §5.2 pseudo-código. |
| A5 | v1 não abordava como o handler envia o evento Pub/Sub se a connection tem múltiplos hooks (`facts:refreshed` por dimensão). Em UI, hook filtra por `accountId` — múltiplos eventos na mesma janela disparam 1 refresh debounced 5s. OK, mas precisa explicar. | Documentação | §5.2 passo 7: 4 publishes (uma por dimensão) — UI debounce coalesce. |
| A6 | Backfill: connections existentes (criadas pela seed da Fase 1) têm `webhookToken: NULL` e `webhookSecretEnc: NULL`. v1 não mencionou como populá-los. | Crítico | §6.3 nova: `ensureWebhookCredentialsForExistingConnections` runtime via advisory lock 8472939 (chave distinta da seed). Step §14 atualizado. |
| A7 | `AuditAction` é enum Postgres — adicionar valor exige `ALTER TYPE ... ADD VALUE`, não `ALTER TABLE`. v1 omitiu detalhe. | Crítico | §5.6 nova: SQL `ALTER TYPE ... ADD VALUE IF NOT EXISTS` × 6. Detalhado em ensure-tables. |
| A8 | v1 dizia "publica facts:refreshed imediatamente" sem clarificar que é **antes** do refresh terminar — UI pode ler dados velhos por 1-5s. Risco de UX confusa. | Importante | §1 e §4.1 item 6 deixam explícito: publish imediato + worker pode demorar; `FactsFreshness` badge mostra "Atualizado há X" — UX honesta. |
| A9 | v1 listava 7 pages mas não tinha lista exata. Agentes paralelos podem incluir page nova. | Documentação | §3 e §4.1 item 7 listam as 7 páginas exatas: visao-geral, conversas, distribuicao, equipe, origem-ia, performance, mensagens-nao-respondidas. |
| A10 | Pages `conversas` e `mensagens-nao-respondidas` **NÃO TÊM** `<FactsFreshness>` hoje — adicionar custom client component só pra montar o hook é estranho. | Importante | §9.3: padronizar **adicionar `<FactsFreshness>` em todas as 7 pages**, mantendo consistência visual. |
| A11 | Hook montado via `<FactsFreshness>` E também `<RealtimeMount>` standalone duplicaria EventSource e refresh. | Bug em design | §9.6 nova: convenção "se já tem FactsFreshness, NÃO montar RealtimeMount". |
| A12 | v1 dizia "instrumentation.ts ou API route" sem decidir. | Decisão | §8.3 com tabela de trade-offs; escolhido `instrumentation.ts`. Decision record §21. |
| A13 | Chave do advisory lock do backfill colidir com a do seed (8472938) é catastrófico (deadlock). | Crítico | §6.3 usa chave 8472939 (incremento +1). Documentado no runbook §13. |
| A14 | v1 não tratava cenário de regenerar secret: secret antigo apagado sem aviso + admin não consegue rollback. | Importante | §15.2 explicita "não há rollback do secret antigo"; §11.2 toast pós-ação alerta "Atualize no Chatwoot agora"; AlertDialog antes de confirmar regerar. |
| A15 | `webhookToken` no path da URL aparece em logs do Traefik. | Segurança | §19 risco listado; §21 decision record argumenta entropia 256 bits suficiente; mitigação operacional via "Regerar". |
| A16 | v1 não mencionava middleware NextAuth — webhook não tem cookie de auth, precisa estar fora do middleware. | Crítico | §12.5 nova: verificar `src/middleware.ts` isenta `/api/webhooks/*`. |
| A17 | v1 mantinha cron 5 min; tarefa explícita do João é reduzir para 30 min. | Escopo | §10 implementa; §4.1 item 9. |
| A18 | Mudar pattern do scheduler sem mudar o `id` deixa scheduler antigo coexistindo. BullMQ não substitui pattern por upsert sem detecção de id distinto. | Bug | §10.1 muda `id` para `facts-refresh-by-account-fallback`. Migration deleta o antigo via `removeRepeatableByKey`. |
| A19 | v1 não definia o que o cron faz quando o trigger é agendamento (sem payload de connectionId/accountId). | Crítico | §10.2 introduz padrão fan-out: scheduler dispara `processRefreshByAccount` que detecta `job.name.endsWith("-fallback")` e enfileira sub-jobs por binding. |
| A20 | v1 não detalhava p99 esperado no webhook handler. | Performance | §5.3 tabela com tempos por etapa, total p99 < 60 ms, alvo < 100 ms. |
| A21 | v1 não detalhava SSE e suporte a múltiplas abas. | Operacional | §9.5 nova: limites práticos, 250 conexões/processo confortável. SharedWorker = futuro. |
| A22 | v1 não tinha critério de "está em produção" claro. | Documentação | §15.3 lista 4 critérios. |
| A23 | Listener no App pode duplicar em hot reload (Next dev). | Importante | §19 risco listado: `instrumentation.ts → register()` executa 1× por boot; Next.js não hot-reloada esse hook. Verificado. |
| A24 | v1 sugeria `ws.columns = ...` em xlsx — sem relação com webhook, era confusão. | Não-bloqueante | Nada relacionado; achado descartado da lista. |

## Apêndice B — Pente fino #2 (achados aplicados)

Análise mais profunda buscando: contradições internas, edge cases sutis, requisitos implícitos, riscos não-óbvios, dependências esquecidas, decisões não justificadas.

| # | Achado | Severidade | Resolução |
|---|---|---|---|
| B1 | "facts:refreshed" hoje (Fase 1) já existe; spec diz "publish imediatamente" — não diferenciar webhook-trigger vs cron-trigger no payload pode confundir filtro do hook. | Edge | Ambos publicam mesmo evento (`type: "facts:refreshed"`) com `connectionId` + `accountId`. Hook não precisa diferenciar — ambos resultam em `router.refresh()`. Documentado §5.2 step 7 e §10. |
| B2 | Numeração de §13 estava parcialmente como 12.x; renumeração revisada na v2. | Crítico | Verificada estrutura: §1-§22 contínuas. |
| B3 | Frontmatter dizia "v3" no callout antes da v3 estar pronta. | Crítico | v3 final agora ratifica o callout. |
| B4 | A pendência da Fase 1 §4.1 item 11 (filtro `connectionId` no `useFactsRealtime`) precisa ser explicitada como "fechada nesta fase" para evitar pensar que ainda é gap. | Importante | §3 e §4.1 item 7 explicitam transferência de pendência. |
| B5 | v2 não tratava como o backfill se comporta se houver connection com `status='paused'`. Precisa popular credenciais mesmo paused (admin pode reativar). | Edge | §6.3 query usa `where: deletedAt: null` apenas (status irrelevante). Documentado. |
| B6 | Race: Server Action `createNexusChatConnection` pode rodar concorrente em 2 super_admins → 2 INSERTs → conflito do UNIQUE em `webhook_token`. | Edge | UNIQUE constraint do Postgres rejeita; um falha com erro user-friendly "Connection conflict, retry"; UI mostra toast + admin re-cria. Probabilidade desprezível. |
| B7 | `FactsFreshness` em `conversas`: o header da Conversas tem MUITO conteúdo (filtros, busca). Adicionar badge pode quebrar layout responsivo. | UI/UX | §11 e §9 invocam `ui-ux-pro-max` antes de codar. Decisão concreta de placement (no header vs em outro lugar) ocorre na implementação, não na spec. |
| B8 | Chatwoot pode enviar webhook MUITO grande (payload com array de 100 conversas em batch update). `req.text()` carrega tudo em memória. Sem limite → DoS por payload gigante. | Importante | Validação opcional: `if (rawBody.length > 1_000_000) return 413`. Não está no pseudo-código v2. **Adicionado em §5.2 nota de implementação.** |
| B9 | `ensureWebhookCredentialsForExistingConnections` chamado em `worker/index.ts` boot — mas o backfill envolve `prisma.update()` que requer migration `ALTER TYPE` aplicada. Se `ensure-tables` ainda não rodou, ordem importa. | Crítico | §14 ordem: `ensureNexusChatTables` (já existe) → `ensure-webhook-credentials` (novo) → seed Fase 1 → listener Pub/Sub. Sequência mantida. |
| B10 | `AuditAction` enum Prisma vs SQL: `ALTER TYPE` é SQL puro; Prisma generate vai bater erro se enum não declarado em `schema.prisma`. | Crítico | Migration aditiva: 1) `schema.prisma` adiciona valores novos no enum (sem migration formal — `prisma db pull` ou `prisma migrate dev` em dev). 2) Em produção runtime: `ALTER TYPE ... ADD VALUE IF NOT EXISTS`. Detalhado §5.6. |
| B11 | `<FactsFreshness>` recebe `connectionId` agora — mas tests existentes em `__tests__/facts-freshness.test.tsx` passam só `accountId`. Vão quebrar. | Cobertura | §13 (testes) atualiza estimativa: tests existentes precisam atualizar; ~5-10 specs afetadas. |
| B12 | v2 não menciona `next.config.ts` ou middleware excludente — `/api/webhooks/*` precisa estar fora. | Crítico | §12.5 explicita verificação. Adicionar em runbook §13.4. |
| B13 | `runConnectionsSeedIfNeeded` da Fase 1 chama `prisma.appSetting.findUnique({ where: { key: "connections_seeded_at" } })` — bom padrão. Backfill de credentials deve seguir mesma ideia? Idempotência por flag `app_settings.webhook_credentials_seeded_v2_at`? | Edge | **Não** — backfill em §6.3 é idempotente por **dado** (`OR: [{ webhookToken: null }]`). Não precisa de flag. Cobertura ok. |
| B14 | `regenerateConnectionWebhookSecret` não publica `connection:updated`. Mas se outro processo do app cacheou a connection (Prisma findFirst com cache?), pode usar secret stale. Hoje Prisma não cacheia — então OK, mas declarar. | Edge | Prisma sem cache; `findUnique` sempre query fresh. Documentado §6.2 ("Não publicamos connection:updated porque pool não muda"). |
| B15 | "Bucket de 2s" do debounce: dois eventos em t=1999ms e t=2000ms caem em buckets diferentes → 2 jobs. Já mencionado no v1, mas faltava custo numérico. | Edge | §7.1 e Decision record §21: refresh idempotente; custo = 1 query SQL extra por overshoot. Aceitável. |
| B16 | `removeOnComplete: 100` no debounce — mantém histórico de 100 jobs. Em alto volume (1000 events/min/connection) job antigo cai do histórico em <1 min. OK pra debug imediato; insuficiente pra pós-mortem 1h depois. | Operacional | §7.1: alvo é debug imediato; pós-mortem via audit log (sample 1/100). Trade-off aceitável. |
| B17 | Listener `instrumentation.ts` cria `IORedis` separado do `redis` global. 2 conexões TCP por boot. Se app tem 4 replicas → 8 conexões só de subscribers. | Operacional | Aceitável; Redis suporta milhares de conexões. Documentado §8.4. |
| B18 | `useFactsRealtime` filtra por `(connectionId, accountId)` — mas hoje publish (Fase 1) já carrega `connectionId`. Tudo alinhado, apenas o hook precisa acrescentar. | Não-bloqueante | OK. |
| B19 | Se `webhookSecretEnc` for NULL na connection (caso edge de race ou DB import manual), HMAC falhará. Resposta atual é 404 (§5.2 step 1). É o certo? | Edge | Sim — 404 ambíguo é correto: connection "incompleta" não pode receber webhook. Admin re-cria ou regerar. |
| B20 | Spec não detalha como "regerar secret" interage com webhook em flight (evento chega entre regeração e admin atualizar Chatwoot). | Edge | Toast pós-ação avisa. Eventos rejeitados nessa janela aparecem em audit log `webhook_rejected_hmac`. Admin tolera 1-2 min de perda — cron 30 min cobre. |
| B21 | `setInterval` do janitor do pool dinâmico (Fase 1) é guardado em `globalThis`. App e Worker têm `globalThis` distintos — OK (cada processo tem seu janitor). Validação importante. | Não-bloqueante | OK. Documentado para clareza em §8.1. |
| B22 | Volume de eventos do Chatwoot Cloud: típico 100-500/h por instalação. Pico em horário comercial. Capacidade do handler: 100 req/min/token = 6k req/h. Margem 12-60x. | Não-bloqueante | OK. Documentado em §13.1 §5. |

---

## Apêndice C — Glossário

| Termo | Definição |
|---|---|
| **Connection** | Uma instalação física do Nexus Chat (1 banco Postgres, 1 ou N accounts dentro). |
| **Binding** | Vínculo `(connection, chatwoot_account_id)` — unidade de tenancy. |
| **Webhook token** | Slug 64 chars hex na URL pública do webhook. Não-secreto (só identifica). |
| **Webhook secret** | Chave HMAC SHA-256, cifrada com AES-256-GCM antes de persistir. |
| **Debounce** | Coalescência de eventos burst em 1 ação (`jobId` único + `delay` 2s). |
| **Fan-out** | Scheduler dispara um job que enfileira N sub-jobs (1 por binding ativo). |
| **HMAC SHA-256** | Hash autenticado do body com chave secreta — prova autenticidade. |
| **Bucket** | `Math.floor(Date.now() / 2000)` — janela de 2s. Eventos no mesmo bucket coalescem. |
| **Shim** | `src/lib/chatwoot/pool.ts` — camada de transição da Fase 1, deletada na Fase 2 L7. |

---

**Próximos passos:**
1. ~~v1 escrita.~~ ✅
2. ~~Pente fino #1 (achados explícitos) → v2.~~ ✅ Aplicado (Apêndice A).
3. ~~Pente fino #2 (mais profundo) → v3.~~ ✅ Aplicado (Apêndice B).
4. Aprovação do João desta v3.
5. Plan v1→v2→v3 (próxima sessão, via `superpowers:writing-plans`).
6. Implementação via `superpowers:subagent-driven-development` (sessão depois do plan aprovado).
7. Spec da Fase 3 (UI completa).
