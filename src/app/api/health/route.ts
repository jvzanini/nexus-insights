import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getChatwootPool } from "@/lib/chatwoot/pool";

export const runtime = "nodejs";

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

interface HealthConnection {
  id: string;
  name: string;
  status: string;
  lastTestAt: string | null;
  lastTestError: string | null;
}

async function listConnections(): Promise<HealthConnection[]> {
  try {
    const rows = await prisma.nexusChatConnection.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        lastTestAt: true,
        lastTestError: true,
      },
      orderBy: { name: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      lastTestAt: r.lastTestAt?.toISOString() ?? null,
      lastTestError: r.lastTestError ?? null,
    }));
  } catch {
    // Tabela ainda não existe (pré-seed) → retorna vazio sem quebrar o health.
    // Check `database` separado cobre falha crítica de conexão.
    return [];
  }
}

export async function GET() {
  const [database, redisCheck, chatwoot, connections] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`, 1000),
    timed(() => redis.ping(), 500),
    timed(async () => {
      const pool = getChatwootPool();
      await pool.query("SELECT 1");
      return true;
    }, 2000),
    listConnections(),
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
      // Multi-tenant Fase 1: lista de connections cadastradas para diagnóstico
      // pós-deploy (status, last_test_at, last_error). Sem credenciais.
      connections,
      version: process.env.APP_VERSION ?? "dev",
      uptime_s: Math.floor(process.uptime()),
    },
    { status: httpStatus },
  );
}
