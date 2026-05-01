/**
 * Provisioner Power BI: orquestra DDL Postgres para criar/atualizar/remover
 * usuários e views derivadas dos perfis de integração.
 *
 * Fluxo de provisionProfile (3 transações):
 *
 *   Tx 1 (sem BEGIN — DDL cluster-level):
 *     CREATE USER ou ALTER USER (idempotente via catch 42710).
 *
 *   Tx 2 (BEGIN/COMMIT):
 *     Lista views existentes do perfil (LIKE prefixo) + DROP CASCADE em cada.
 *
 *   Tx 3 (BEGIN/COMMIT):
 *     GRANT USAGE no schema + para cada tabela liberada:
 *       - validateAllowedTables (defesa em profundidade vs UI).
 *       - força PK columns (catalog.pkColumns).
 *       - valida cada coluna ⊂ catalog.allColumns.
 *       - CREATE VIEW pbi_<id>_v_<table> com WHERE RLS opcional.
 *       - GRANT SELECT na view derivada.
 *
 * Em qualquer falha: ROLLBACK + throw. Caller (Server Action) marca status='error'.
 *
 * disableProfile, reactivateProfile, deprovisionProfile seguem padrões similares
 * com ordens cuidadosas (DROP VIEW antes de DROP USER, kill backends antes de
 * DROP USER pra evitar "role cannot be dropped because some objects depend on it").
 */

import { getIntegrationAdminPool } from "./admin-pool";
import {
  buildCreateUserSql,
  buildAlterUserPasswordSql,
  buildAlterUserNoLoginSql,
  buildAlterUserLoginSql,
  buildDropUserSql,
  buildRevokeAllSql,
  buildGrantUsageSql,
  buildGrantSelectSql,
  buildCreateDerivedViewSql,
  buildDropDerivedViewSql,
  buildSelectDerivedViewsSql,
  buildKillBackendsSql,
  buildDerivedViewName,
} from "./sql-builders";
import { getCatalogEntry, validateAllowedTables } from "./catalog";

export interface ProvisionInput {
  id: string;
  pgUsername: string;
  password: string;
  allowedTables: string[];
  allowedColumns: Record<string, string[]>;
  accountIdFilter: number[] | null;
  teamIdFilter: number[] | null;
}

export async function provisionProfile(input: ProvisionInput): Promise<void> {
  // Defesa em profundidade contra BLOCKED_TABLES + tabelas desconhecidas.
  validateAllowedTables(input.allowedTables);

  const pool = getIntegrationAdminPool();
  const client = await pool.connect();
  try {
    // Tx 1: CREATE/ALTER USER (sem BEGIN)
    try {
      await client.query(buildCreateUserSql(input.pgUsername, input.password));
    } catch (err: any) {
      if (err && err.code === "42710") {
        await client.query(buildAlterUserPasswordSql(input.pgUsername, input.password));
      } else {
        throw err;
      }
    }

    // Tx 2: drop views antigas
    await client.query("BEGIN");
    try {
      const { rows } = await client.query(buildSelectDerivedViewsSql(input.id));
      for (const r of rows as Array<{ viewname: string }>) {
        await client.query(buildDropDerivedViewSql(r.viewname));
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }

    // Tx 3: cria views derivadas + grants
    await client.query("BEGIN");
    try {
      await client.query(buildGrantUsageSql(input.pgUsername));
      for (const table of input.allowedTables) {
        const entry = getCatalogEntry(table);
        if (!entry) throw new Error(`Tabela desconhecida: ${table}`);

        const requested = input.allowedColumns[table] ?? [...entry.essentialColumns];
        // Validar que cada coluna requested está em allColumns
        for (const c of requested) {
          if (!entry.allColumns.includes(c)) {
            throw new Error(`Coluna inválida "${c}" para tabela "${table}".`);
          }
        }
        // Forçar PK columns
        const cols = [...requested];
        for (const pk of entry.pkColumns) {
          if (!cols.includes(pk)) cols.push(pk);
        }

        const sql = buildCreateDerivedViewSql({
          profileId: input.id,
          table,
          columns: cols,
          hasAccountId: entry.hasAccountId,
          hasTeamId: entry.hasTeamId,
          accountIdFilter: input.accountIdFilter,
          teamIdFilter: input.teamIdFilter,
        });
        await client.query(sql);

        const viewName = buildDerivedViewName(input.id, table);
        await client.query(buildGrantSelectSql(input.pgUsername, viewName));
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  } finally {
    client.release();
  }
}

export async function disableProfile(input: { pgUsername: string }): Promise<void> {
  const pool = getIntegrationAdminPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query(buildRevokeAllSql(input.pgUsername));
      await client.query(buildAlterUserNoLoginSql(input.pgUsername));
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
    await client.query(buildKillBackendsSql(input.pgUsername));
  } finally {
    client.release();
  }
}

export async function reactivateProfile(input: { id: string; pgUsername: string }): Promise<void> {
  const pool = getIntegrationAdminPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query(buildAlterUserLoginSql(input.pgUsername));
      await client.query(buildGrantUsageSql(input.pgUsername));
      const { rows } = await client.query(buildSelectDerivedViewsSql(input.id));
      for (const r of rows as Array<{ viewname: string }>) {
        await client.query(buildGrantSelectSql(input.pgUsername, r.viewname));
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  } finally {
    client.release();
  }
}

export async function deprovisionProfile(input: { id: string; pgUsername: string }): Promise<void> {
  const pool = getIntegrationAdminPool();
  const client = await pool.connect();
  try {
    // 1) kill conexões ativas
    await client.query(buildKillBackendsSql(input.pgUsername));
    // 2) drop views (DROP USER falha se objects owned)
    const { rows } = await client.query(buildSelectDerivedViewsSql(input.id));
    for (const r of rows as Array<{ viewname: string }>) {
      await client.query(buildDropDerivedViewSql(r.viewname));
    }
    // 3) drop user
    await client.query(buildDropUserSql(input.pgUsername));
  } finally {
    client.release();
  }
}
