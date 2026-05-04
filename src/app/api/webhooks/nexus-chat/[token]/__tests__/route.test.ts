/**
 * Tests do endpoint POST /api/webhooks/nexus-chat/[token] (v0.39 hotfix).
 *
 * Account Webhooks no Chatwoot self-hosted NÃO suportam HMAC. A
 * autenticação é apenas o token único de 32 bytes random no path da URL.
 * Cenários cobertos:
 *   1. Token inválido → 404 silencioso.
 *   2. Connection paused → 404.
 *   3. Rate limit > 100/min → 429 com Retry-After: 60.
 *   4. Rate limit Redis falha → degrade graceful (sem rate limit).
 *   5. JSON inválido → 200 OK ignored com audit webhook_received (invalid_json).
 *   6. account.id ausente → 200 OK ignored.
 *   7. account.id sem binding → 200 OK ignored com audit (sample).
 *   8. Caminho feliz → 200 OK + 4 jobs com jobId correto + 4 publishes + lastWebhookAt update.
 *   9. Payload >1MB (Content-Length) → 413.
 *  10. GET → 405.
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
import { POST, GET } from "../route";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  refreshByAccountQueue,
  refreshByInboxQueue,
  refreshByAgentQueue,
  refreshByTeamQueue,
} from "@/lib/queue";
import { publishRealtimeEvent } from "@/lib/realtime";

const findFirstConnMock = (
  prisma as unknown as {
    nexusChatConnection: { findFirst: jest.Mock; update: jest.Mock };
  }
).nexusChatConnection.findFirst;
const updateConnMock = (
  prisma as unknown as {
    nexusChatConnection: { findFirst: jest.Mock; update: jest.Mock };
  }
).nexusChatConnection.update;
const findFirstBindingMock = (
  prisma as unknown as { companyChatBinding: { findFirst: jest.Mock } }
).companyChatBinding.findFirst;
const incrMock = redis.incr as jest.MockedFunction<typeof redis.incr>;
const expireMock = redis.expire as jest.MockedFunction<typeof redis.expire>;
const publishMock = publishRealtimeEvent as jest.MockedFunction<
  typeof publishRealtimeEvent
>;
const auditMock = logAudit as jest.MockedFunction<typeof logAudit>;

const TOKEN = "a".repeat(64);
const CONNECTION_ID = "5e6a4eef-2a23-4f33-8d4e-1a2b3c4d5e6f";

function buildRequest(opts: {
  body: string;
  contentLength?: number;
  token?: string;
}): NextRequest {
  const tk = opts.token ?? TOKEN;
  const headers: Record<string, string> = {
    "content-length": String(opts.contentLength ?? opts.body.length),
  };
  return new NextRequest(`http://localhost/api/webhooks/nexus-chat/${tk}`, {
    method: "POST",
    body: opts.body,
    headers,
  });
}

beforeEach(() => {
  findFirstConnMock.mockReset();
  updateConnMock.mockReset().mockResolvedValue({});
  findFirstBindingMock.mockReset();
  incrMock.mockReset().mockResolvedValue(1);
  expireMock.mockReset().mockResolvedValue(1 as never);
  publishMock.mockClear();
  auditMock.mockClear();
  (refreshByAccountQueue.add as jest.Mock).mockClear().mockResolvedValue({});
  (refreshByInboxQueue.add as jest.Mock).mockClear().mockResolvedValue({});
  (refreshByAgentQueue.add as jest.Mock).mockClear().mockResolvedValue({});
  (refreshByTeamQueue.add as jest.Mock).mockClear().mockResolvedValue({});
});

describe("POST /api/webhooks/nexus-chat/[token]", () => {
  it("(1) token inválido → 404 silencioso", async () => {
    findFirstConnMock.mockResolvedValue(null);
    const req = buildRequest({ body: "{}", token: "invalido" });
    const res = await POST(req, { params: Promise.resolve({ token: "invalido" }) });
    expect(res.status).toBe(404);
  });

  it("(2) connection paused → 404 (não revela existência)", async () => {
    findFirstConnMock.mockResolvedValue({
      id: CONNECTION_ID,
      name: "Padrão",
      status: "paused",
    });
    const req = buildRequest({ body: "{}" });
    const res = await POST(req, { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(404);
  });

  it("(3) rate limit > 100/min → 429 com Retry-After: 60", async () => {
    findFirstConnMock.mockResolvedValue({
      id: CONNECTION_ID,
      name: "Padrão",
      status: "active",
    });
    incrMock.mockResolvedValue(101);
    const req = buildRequest({ body: "{}" });
    const res = await POST(req, { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("(4) Redis incr falha → degrade graceful (não bloqueia request)", async () => {
    findFirstConnMock.mockResolvedValue({
      id: CONNECTION_ID,
      name: "Padrão",
      status: "active",
    });
    incrMock.mockRejectedValue(new Error("redis down"));
    findFirstBindingMock.mockResolvedValue({ id: "binding-1" });
    const body = JSON.stringify({ event: "conversation_created", account: { id: 9 } });
    const req = buildRequest({ body });
    const res = await POST(req, { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(200);
  });

  it("(5) JSON inválido → 200 OK ignored com audit invalid_json", async () => {
    findFirstConnMock.mockResolvedValue({
      id: CONNECTION_ID,
      name: "Padrão",
      status: "active",
    });
    const body = "{ malformed json";
    const req = buildRequest({ body });
    const res = await POST(req, { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe("invalid_json");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "webhook_received",
        details: expect.objectContaining({ reason: "invalid_json" }),
      }),
    );
  });

  it("(6) account.id ausente → 200 OK ignored missing_account_id", async () => {
    findFirstConnMock.mockResolvedValue({
      id: CONNECTION_ID,
      name: "Padrão",
      status: "active",
    });
    const body = JSON.stringify({ event: "conversation_created" });
    const req = buildRequest({ body });
    const res = await POST(req, { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe("missing_account_id");
  });

  it("(7) account.id sem binding → 200 OK ignored no_binding", async () => {
    findFirstConnMock.mockResolvedValue({
      id: CONNECTION_ID,
      name: "Padrão",
      status: "active",
    });
    findFirstBindingMock.mockResolvedValue(null);
    const body = JSON.stringify({ event: "conversation_created", account: { id: 999 } });
    const req = buildRequest({ body });
    const res = await POST(req, { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe("no_binding");
  });

  it("(8) caminho feliz → 200 OK + 4 jobs + 4 publishes + lastWebhookAt update", async () => {
    findFirstConnMock.mockResolvedValue({
      id: CONNECTION_ID,
      name: "Padrão",
      status: "active",
    });
    findFirstBindingMock.mockResolvedValue({ id: "binding-1" });
    const body = JSON.stringify({ event: "conversation_created", account: { id: 9 } });
    const req = buildRequest({ body });
    const res = await POST(req, { params: Promise.resolve({ token: TOKEN }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(refreshByAccountQueue.add).toHaveBeenCalledWith(
      "refresh-by-account",
      { connectionId: CONNECTION_ID, accountId: 9 },
      expect.objectContaining({
        jobId: expect.stringMatching(
          new RegExp(`^refresh:account:${CONNECTION_ID}:9:\\d+$`),
        ),
        delay: 2000,
      }),
    );
    expect(refreshByInboxQueue.add).toHaveBeenCalled();
    expect(refreshByAgentQueue.add).toHaveBeenCalled();
    expect(refreshByTeamQueue.add).toHaveBeenCalled();

    expect(publishMock).toHaveBeenCalledTimes(4);
    expect(publishMock).toHaveBeenCalledWith({
      type: "facts:refreshed",
      dimension: "by_account",
      connectionId: CONNECTION_ID,
      accountId: 9,
    });

    expect(updateConnMock).toHaveBeenCalledWith({
      where: { id: CONNECTION_ID },
      data: { lastWebhookAt: expect.any(Date) },
    });
  });

  it("(9) Content-Length > 1MB → 413", async () => {
    const req = buildRequest({ body: "{}", contentLength: 2_000_000 });
    const res = await POST(req, { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(413);
  });
});

describe("GET /api/webhooks/nexus-chat/[token]", () => {
  it("(10) GET → 405", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });
});
