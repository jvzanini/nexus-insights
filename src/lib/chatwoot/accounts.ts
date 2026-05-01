/**
 * Helpers relacionados a Chatwoot accounts conhecidos pela plataforma.
 *
 * Lê do Postgres interno via pgPool (raw SQL) — padrão canônico do projeto.
 * NÃO usa Prisma client e NÃO consulta o banco do Chatwoot.
 *
 * Fonte de verdade: a tabela de pré-agregação
 * `chatwoot_facts_daily_by_account` é refrescada de hora em hora pelo worker
 * BullMQ (job `refresh-by-account`), portanto contém os accountIds que a
 * plataforma já viu/processou.
 *
 * Consumidor inicial (T2d, plan v0.16.0): card "URLs Públicas Chatwoot" em
 * `/configuracoes` (super_admin) — listar accounts conhecidos para gerar
 * deep-links.
 */

import "server-only";
import { pgPool } from "@/lib/pg-pool";

export interface KnownAccount {
  accountId: number;
  /** Nome opcional (depende do que está disponível). */
  name?: string | null;
}

/**
 * Retorna lista de accountIds distintos que aparecem nas facts diárias,
 * ordenada ascendente.
 *
 * O nome (`name`) fica `undefined` no momento — a tabela de facts não guarda
 * nome do account; consumidores podem complementar a partir de outras fontes
 * caso necessário.
 */
export async function listKnownAccountIds(): Promise<KnownAccount[]> {
  const result = await pgPool.query<{ account_id: number }>(
    `SELECT DISTINCT account_id
       FROM chatwoot_facts_daily_by_account
      ORDER BY account_id ASC`,
  );
  return result.rows.map((row) => ({
    accountId: Number(row.account_id),
  }));
}
