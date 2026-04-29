import { NextRequest } from "next/server";
import IORedis from "ioredis";
import { CHANNEL } from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = process.env.REDIS_URL;
  if (!url) {
    return new Response("Redis not configured", { status: 503 });
  }

  // Criar subscriber dedicado (Redis requer conexão separada para subscribe)
  const subscriber = new IORedis(url, { maxRetriesPerRequest: null });

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Heartbeat para manter conexão viva
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // Stream já fechada
        }
      }, 30000);

      subscriber.subscribe(CHANNEL).then(() => {
        subscriber.on("message", (_channel: string, message: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${message}\n\n`));
          } catch {
            // Stream já fechada
          }
        });
      });

      // Cleanup quando cliente desconecta
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        subscriber.unsubscribe(CHANNEL).catch(() => {});
        subscriber.quit().catch(() => {});
      });
    },
    cancel() {
      closed = true;
      subscriber.unsubscribe(CHANNEL).catch(() => {});
      subscriber.quit().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
