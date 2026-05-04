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
const MAX_PAYLOAD_BYTES = 1_000_000; // 1 MB anti-DoS

interface ChatwootWebhookPayload {
  event?: string;
  account?: { id?: number };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const startedAt = Date.now();
  const { token } = await params;

  // 0. Limite de payload (anti-DoS) ANTES de ler o body.
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  // 1. Lookup da connection por webhookToken. 404 silencioso se inválido,
  // paused/deleted, ou sem secret gerado — não revelamos existência de tokens.
  const conn = await prisma.nexusChatConnection.findFirst({
    where: { webhookToken: token, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      webhookSecretEnc: true,
    },
  });
  if (!conn || conn.status !== "active" || !conn.webhookSecretEnc) {
    return new NextResponse(null, { status: 404 });
  }

  // 2. Rate limit Redis (incr + expire). Degrade graceful: se Redis falhar,
  // prossegue sem limit (Chatwoot não retry-bombarda em 200 OK).
  let count = 0;
  try {
    const rateKey = `webhook:rate:${conn.id}:${Math.floor(Date.now() / 60_000)}`;
    count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 60);
  } catch (err) {
    console.warn(
      "[webhook] rate limit Redis falhou, prosseguindo sem limit:",
      (err as Error).message,
    );
  }
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

  // 3. Ler body cru. HMAC é sobre raw bytes.
  const rawBody = await req.text();
  if (rawBody.length > MAX_PAYLOAD_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  // 4. Validação HMAC.
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

  // 5. Parse JSON. Tolerante a JSON malformado (200 OK, log).
  // Chatwoot trata 4xx como retry forever — sempre 200 OK quando a request é
  // legítima mas o conteúdo não é processável.
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
    console.log(
      JSON.stringify({
        kind: "webhook_received",
        connectionId: conn.id,
        accountId: null,
        event: null,
        reason: "invalid_json",
        durationMs: Date.now() - startedAt,
      }),
    );
    return NextResponse.json({ ok: true, ignored: "invalid_json" });
  }
  const accountId = payload.account?.id;
  if (typeof accountId !== "number" || !Number.isFinite(accountId)) {
    console.log(
      JSON.stringify({
        kind: "webhook_received",
        connectionId: conn.id,
        accountId: null,
        event: payload.event ?? null,
        reason: "missing_account_id",
        durationMs: Date.now() - startedAt,
      }),
    );
    return NextResponse.json({ ok: true, ignored: "missing_account_id" });
  }

  // 6. Resolver binding ativo (connectionId, accountId).
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
    console.log(
      JSON.stringify({
        kind: "webhook_received",
        connectionId: conn.id,
        accountId,
        event: payload.event ?? null,
        reason: "no_binding",
        durationMs: Date.now() - startedAt,
      }),
    );
    return NextResponse.json({ ok: true, ignored: "no_binding" });
  }

  // 7. Enfileirar 4 jobs com debounce (jobId único por bucket de 2s).
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

  // 8. Publish imediato no Pub/Sub (1 evento por dimensão para coalescência
  // por filtro do hook). Fire-and-forget.
  const dims = ["by_account", "by_inbox", "by_agent", "by_team"] as const;
  for (const d of dims) {
    void publishRealtimeEvent({
      type: "facts:refreshed",
      dimension: d,
      connectionId: conn.id,
      accountId,
    });
  }

  // 9. Update lastWebhookAt fire-and-forget (não bloqueia resposta).
  void prisma.nexusChatConnection
    .update({ where: { id: conn.id }, data: { lastWebhookAt: new Date() } })
    .catch(() => {});

  // 10. Audit log de evento recebido (sample 1/100 — não inundar).
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

  // 11. Log estruturado SEMPRE em stdout (diagnóstico fora do audit log).
  console.log(
    JSON.stringify({
      kind: "webhook_received",
      connectionId: conn.id,
      accountId,
      event: payload.event ?? null,
      durationMs: Date.now() - startedAt,
    }),
  );

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return new NextResponse(null, { status: 405 });
}

export async function PUT() {
  return new NextResponse(null, { status: 405 });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405 });
}

export async function PATCH() {
  return new NextResponse(null, { status: 405 });
}
