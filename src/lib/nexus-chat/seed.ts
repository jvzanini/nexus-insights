// NÃO usar `import "server-only"` aqui: chamado no boot do worker BullMQ.

import { parse as parseConnString } from "pg-connection-string";
import { encrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { pgPool } from "@/lib/pg-pool";
import { ensureNexusChatTables } from "./ensure-tables";

/**
 * Seed idempotente da Fase 1 multi-tenant.
 *
 * Cria, na primeira execução pós-deploy:
 *   1. `nexus_chat_connection` "Padrão (legado)" parseando
 *      `process.env.CHATWOOT_DATABASE_URL` via pg-connection-string. Senha
 *      cifrada via AES-256-GCM (`encrypt`).
 *   2. `company_chat_binding` para cada `chatwoot_account_id` distinto em
 *      `user_account_access`, apontando para a connection seed.
 *   3. Backfill `UPDATE chatwoot_facts_* SET connection_id = <seed.id>
 *      WHERE connection_id IS NULL` em cada uma das 6 tabelas.
 *   4. Marca `app_settings.connections_seeded_at`.
 *
 * Concorrência App ↔ Worker: usa `pg_try_advisory_lock(8472938)` para
 * garantir que apenas 1 processo executa o seed (não bloqueante; o segundo
 * skip-aceita).
 *
 * Idempotência: se a flag `connections_seeded_at` existe, retorna
 * `{ seeded: false }` sem efeitos.
 */

const SEED_LOCK_KEY = 8472938;

const FACTS_TABLES = [
  "chatwoot_facts_daily_by_account",
  "chatwoot_facts_daily_by_inbox",
  "chatwoot_facts_daily_by_agent",
  "chatwoot_facts_daily_by_team",
  "chatwoot_facts_hourly_by_account",
  "chatwoot_facts_meta",
] as const;

export interface SeedResult {
  seeded: boolean;
  connectionId?: string;
  bindingsCreated?: number;
}

export async function runConnectionsSeedIfNeeded(): Promise<SeedResult> {
  // 1. Garante que as tabelas existem antes de qualquer query.
  await ensureNexusChatTables();

  // 2. Tenta pegar advisory lock; se outro processo segura, skip.
  const lock = await pgPool.query<{ locked: boolean }>(
    `SELECT pg_try_advisory_lock($1) AS locked`,
    [SEED_LOCK_KEY],
  );
  if (!lock.rows[0]?.locked) {
    return { seeded: false };
  }

  try {
    // 3. Idempotência: já rodou?
    const flag = await prisma.appSetting.findUnique({
      where: { key: "connections_seeded_at" },
    });
    if (flag) return { seeded: false };

    // 4. Parse CHATWOOT_DATABASE_URL.
    const url = process.env.CHATWOOT_DATABASE_URL;
    if (!url) {
      throw new Error(
        "CHATWOOT_DATABASE_URL não definida; abortando seed de connections.",
      );
    }
    const parsed = parseConnString(url);

    // 5. Cria connection seed.
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

    // 6. Cria bindings para cada chatwoot_account_id distinto.
    const distinctAccounts = await prisma.userAccountAccess.findMany({
      distinct: ["chatwootAccountId"],
      select: {
        chatwootAccountId: true,
        chatwootAccountName: true,
      },
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

    // 7. Backfill connection_id nas 6 tabelas chatwoot_facts_*.
    for (const t of FACTS_TABLES) {
      await pgPool.query(
        `UPDATE ${t} SET connection_id = $1 WHERE connection_id IS NULL`,
        [conn.id],
      );
    }

    // 8. Marca flag.
    await prisma.appSetting.create({
      data: {
        key: "connections_seeded_at",
        value: { at: new Date().toISOString(), connectionId: conn.id },
        category: "system",
      },
    });

    return {
      seeded: true,
      connectionId: conn.id,
      bindingsCreated,
    };
  } finally {
    await pgPool.query(`SELECT pg_advisory_unlock($1)`, [SEED_LOCK_KEY]);
  }
}
