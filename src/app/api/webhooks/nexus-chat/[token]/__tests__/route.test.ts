/**
 * Tests do endpoint POST /api/webhooks/nexus-chat/[token].
 *
 * Cobre 9 cenários da spec §5 (Fase 2 do épico Multi-tenant Realtime):
 *   1. Token inválido → 404 silencioso.
 *   2. Connection paused → 404.
 *   3. Rate limit > 100/min → 429 com Retry-After: 60.
 *   4. Header HMAC ausente → 401 + audit webhook_rejected_hmac.
 *   5. HMAC mismatch → 401 + audit webhook_rejected_hmac.
 *   6. JSON inválido → 200 OK ignored com audit webhook_received (invalid_json).
 *   7. account.id sem binding → 200 OK ignored.
 *   8. Caminho feliz → 200 OK + 4 jobs com jobId correto + 4 publishes + lastWebhookAt update.
 *   9. Payload >1MB (Content-Length) → 413.
 */

jest.mock("@/lib/redis", () => ({
  redis: {
    incr: jest.fn(),
    expire: jest.fn(),
    publish: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    nexusChatConnection: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    companyChatBinding: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn().mockReturnValue("KNOWN_SECRET_PLAIN"),
}));

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/realtime", () => ({
  publishRealtimeEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/queue", () => ({
  refreshByAccountQueue: { add: jest.fn().mockResolvedValue({}) },
  refreshByInboxQueue: { add: jest.fn().mockResolvedValue({}) },
  refreshByAgentQueue: { add: jest.fn().mockResolvedValue({}) },
  refreshByTeamQueue: { add: jest.fn().mockResolvedValue({}) },
}));

import { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { POST, GET } from "../route";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { publishRealtimeEvent } from "@/lib/realtime";
import {
  refreshByAccountQueue,
  refreshByInboxQueue,
  refreshByAgentQueue,
  refreshByTeamQueue,
} from "@/lib/queue";

const KNOWN_SECRET = "KNOWN_SECRET_PLAIN";
const TOKEN = "abc123token";
const CONN_ID = "conn-uuid-1";

function signBody(rawBody: string): string {
  return createHmac("sha256", KNOWN_SECRET).update(rawBody).digest("hex");
}

function buildRequest(opts: {
  body?: string;
  headers?: Record<string, string>;
  signed?: boolean;
}): NextRequest {
  const rawBody = opts.body ?? "";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "content-length": String(rawBody.length),
    ...(opts.headers ?? {}),
  };
  if (opts.signed && !("x-chatwoot-hmac-sha256" in headers)) {
    headers["x-chatwoot-hmac-sha256"] = signBody(rawBody);
  }
  return new NextRequest(`http://localhost/api/webhooks/nexus-chat/${TOKEN}`, {
    method: "POST",
    body: rawBody.length > 0 ? rawBody : undefined,
    headers,
  });
}

const params = (token: string = TOKEN) => ({
  params: Promise.resolve({ token }),
});

const findFirstMock = prisma.nexusChatConnection.findFirst as jest.Mock;
const updateMock = prisma.nexusChatConnection.update as jest.Mock;
const bindingFindFirstMock = prisma.companyChatBinding.findFirst as jest.Mock;
const incrMock = redis.incr as jest.Mock;
const expireMock = redis.expire as jest.Mock;
const logAuditMock = logAudit as jest.Mock;
const publishMock = publishRealtimeEvent as jest.Mock;
const addAccountMock = refreshByAccountQueue.add as jest.Mock;
const addInboxMock = refreshByInboxQueue.add as jest.Mock;
const addAgentMock = refreshByAgentQueue.add as jest.Mock;
const addTeamMock = refreshByTeamQueue.add as jest.Mock;

const VALID_CONN = {
  id: CONN_ID,
  name: "Padrão (legado)",
  status: "active" as const,
  webhookSecretEnc: "ciphertext-not-real",
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default Redis: count=1 sob limite.
  incrMock.mockResolvedValue(1);
  expireMock.mockResolvedValue(1);
  // Default update: resolve.
  updateMock.mockResolvedValue({});
  // Default queue add: resolve.
  addAccountMock.mockResolvedValue({});
  addInboxMock.mockResolvedValue({});
  addAgentMock.mockResolvedValue({});
  addTeamMock.mockResolvedValue({});
  // Math.random fixo para tornar sample audit determinístico (>0.05 → não loga).
  jest.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /api/webhooks/nexus-chat/[token]", () => {
  it("1. token inválido → 404 silencioso (sem audit log)", async () => {
    findFirstMock.mockResolvedValue(null);
    const req = buildRequest({ body: "{}", signed: true });
    const res = await POST(req, params());
    expect(res.status).toBe(404);
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("2. connection paused → 404", async () => {
    findFirstMock.mockResolvedValue({ ...VALID_CONN, status: "paused" });
    const req = buildRequest({ body: "{}", signed: true });
    const res = await POST(req, params());
    expect(res.status).toBe(404);
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("3. rate limit > 100/min → 429 com Retry-After: 60", async () => {
    findFirstMock.mockResolvedValue(VALID_CONN);
    incrMock.mockResolvedValue(101);
    const rawBody = JSON.stringify({ event: "x", account: { id: 9 } });
    const req = buildRequest({ body: rawBody, signed: true });
    const res = await POST(req, params());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    // Sample audit: count=101 → 101 % 100 === 1 → loga.
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "webhook_rejected_rate_limit",
        targetId: CONN_ID,
      }),
    );
  });

  it("4. header x-chatwoot-hmac-sha256 ausente → 401 + audit webhook_rejected_hmac (missing_header)", async () => {
    findFirstMock.mockResolvedValue(VALID_CONN);
    const rawBody = JSON.stringify({ event: "x", account: { id: 9 } });
    const req = buildRequest({ body: rawBody });
    const res = await POST(req, params());
    expect(res.status).toBe(401);
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "webhook_rejected_hmac",
        targetId: CONN_ID,
        details: expect.objectContaining({ reason: "missing_header" }),
      }),
    );
    // Não enfileirou nada.
    expect(addAccountMock).not.toHaveBeenCalled();
  });

  it("5. HMAC inválido → 401 + audit webhook_rejected_hmac (mismatch)", async () => {
    findFirstMock.mockResolvedValue(VALID_CONN);
    const rawBody = JSON.stringify({ event: "x", account: { id: 9 } });
    const req = buildRequest({
      body: rawBody,
      headers: { "x-chatwoot-hmac-sha256": "deadbeef".repeat(8) }, // 64 chars hex
    });
    const res = await POST(req, params());
    expect(res.status).toBe(401);
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "webhook_rejected_hmac",
        targetId: CONN_ID,
        details: expect.objectContaining({ reason: "mismatch" }),
      }),
    );
    expect(addAccountMock).not.toHaveBeenCalled();
  });

  it("6. JSON inválido → 200 OK ignored com audit webhook_received (invalid_json)", async () => {
    findFirstMock.mockResolvedValue(VALID_CONN);
    const rawBody = "not-json{{";
    const req = buildRequest({ body: rawBody, signed: true });
    const res = await POST(req, params());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; ignored: string };
    expect(json).toEqual({ ok: true, ignored: "invalid_json" });
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "webhook_received",
        targetId: CONN_ID,
        details: expect.objectContaining({ reason: "invalid_json" }),
      }),
    );
    expect(addAccountMock).not.toHaveBeenCalled();
  });

  it("7. account.id sem binding → 200 OK ignored (sem enqueue, sem publish)", async () => {
    findFirstMock.mockResolvedValue(VALID_CONN);
    bindingFindFirstMock.mockResolvedValue(null);
    const rawBody = JSON.stringify({
      event: "conversation_created",
      account: { id: 9 },
    });
    const req = buildRequest({ body: rawBody, signed: true });
    const res = await POST(req, params());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; ignored: string };
    expect(json).toEqual({ ok: true, ignored: "no_binding" });
    expect(addAccountMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("8. caminho feliz → 200 OK + 4 jobs com jobId correto + 4 publishes + lastWebhookAt update", async () => {
    findFirstMock.mockResolvedValue(VALID_CONN);
    bindingFindFirstMock.mockResolvedValue({ id: "binding-uuid-1" });
    // Math.now fixo para bucket determinístico (DEBOUNCE_MS=2000):
    const nowMs = 1_700_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(nowMs);
    const expectedBucket = Math.floor(nowMs / 2000);

    const rawBody = JSON.stringify({
      event: "conversation_created",
      account: { id: 9 },
    });
    const req = buildRequest({ body: rawBody, signed: true });
    const res = await POST(req, params());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json).toEqual({ ok: true });

    // 4 jobs enfileirados com jobId correto.
    expect(addAccountMock).toHaveBeenCalledTimes(1);
    expect(addAccountMock).toHaveBeenCalledWith(
      "refresh-by-account",
      { connectionId: CONN_ID, accountId: 9 },
      expect.objectContaining({
        jobId: `refresh:account:${CONN_ID}:9:${expectedBucket}`,
        delay: 2000,
        removeOnComplete: 100,
        removeOnFail: 100,
      }),
    );
    expect(addInboxMock).toHaveBeenCalledWith(
      "refresh-by-inbox",
      { connectionId: CONN_ID, accountId: 9 },
      expect.objectContaining({
        jobId: `refresh:inbox:${CONN_ID}:9:${expectedBucket}`,
      }),
    );
    expect(addAgentMock).toHaveBeenCalledWith(
      "refresh-by-agent",
      { connectionId: CONN_ID, accountId: 9 },
      expect.objectContaining({
        jobId: `refresh:agent:${CONN_ID}:9:${expectedBucket}`,
      }),
    );
    expect(addTeamMock).toHaveBeenCalledWith(
      "refresh-by-team",
      { connectionId: CONN_ID, accountId: 9 },
      expect.objectContaining({
        jobId: `refresh:team:${CONN_ID}:9:${expectedBucket}`,
      }),
    );

    // 4 publishes Pub/Sub (1 por dimensão).
    expect(publishMock).toHaveBeenCalledTimes(4);
    const dims = ["by_account", "by_inbox", "by_agent", "by_team"];
    for (const d of dims) {
      expect(publishMock).toHaveBeenCalledWith({
        type: "facts:refreshed",
        dimension: d,
        connectionId: CONN_ID,
        accountId: 9,
      });
    }

    // lastWebhookAt update fire-and-forget.
    // Aguarda microtasks pendentes para o void update().catch() resolver.
    await new Promise((r) => setImmediate(r));
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: CONN_ID },
      data: { lastWebhookAt: expect.any(Date) },
    });
  });

  it("9. payload > 1MB via Content-Length → 413 antes do lookup", async () => {
    const req = new NextRequest(
      `http://localhost/api/webhooks/nexus-chat/${TOKEN}`,
      {
        method: "POST",
        body: "x",
        headers: { "content-length": "1000001" },
      },
    );
    const res = await POST(req, params());
    expect(res.status).toBe(413);
    // Não chamou prisma (cortado antes).
    expect(findFirstMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/webhooks/nexus-chat/[token]", () => {
  it("retorna 405 Method Not Allowed", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });
});
