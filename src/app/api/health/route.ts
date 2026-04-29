import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getChatwootPool } from "@/lib/chatwoot/pool";

async function timed<T>(fn: () => Promise<T>, timeoutMs: number) {
  const start = Date.now();
  try {
    const value = await Promise.race([
      fn().then((v) => ({ ok: true as const, value: v })),
      new Promise<{ ok: false }>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs),
      ),
    ]);
    return { ok: (value as { ok: boolean }).ok, ms: Date.now() - start };
  } catch {
    return { ok: false, ms: Date.now() - start };
  }
}

export async function GET() {
  const [database, redisCheck, chatwoot] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`, 1000),
    timed(() => redis.ping(), 500),
    timed(async () => {
      const pool = getChatwootPool();
      await pool.query("SELECT 1");
      return true;
    }, 2000),
  ]);

  const status = !database.ok ? "down" : !redisCheck.ok || !chatwoot.ok ? "degraded" : "ok";
  const httpStatus = status === "down" ? 503 : 200;

  return NextResponse.json(
    {
      status,
      checks: {
        database: { ok: database.ok, ms: database.ms },
        redis: { ok: redisCheck.ok, ms: redisCheck.ms },
        chatwoot: { ok: chatwoot.ok, ms: chatwoot.ms },
      },
      version: process.env.APP_VERSION ?? "dev",
      uptime_s: Math.floor(process.uptime()),
    },
    { status: httpStatus },
  );
}
