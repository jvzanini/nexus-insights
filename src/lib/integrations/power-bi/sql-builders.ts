/**
 * SQL builders DDL para Power BI integration.
 *
 * Funções próprias de quoting (sem dep externa):
 * - `quoteIdent`: aspas duplas + escape de aspas internas (sempre quota,
 *   mesmo identifiers seguros — defesa contra reserved words).
 * - `quoteLiteral`: aspas simples + escape de aspas + null-byte safe.
 *
 * Substituiu `pg-format` (não compatível com Turbopack do Next.js 16
 * por uso de `__dirname + '/reserved.js'`).
 *
 * View names derivadas usam hash sha1 curto (8 hex) do profileId pra
 * caber no limite de 63 chars do Postgres mesmo com nome de tabela longo.
 */

import { createHash } from "crypto";

export const POWERBI_SCHEMA = "powerbi";

/**
 * Escapa identifier Postgres SEMPRE com aspas duplas.
 * Dobra qualquer aspa dupla interna (proteção contra injection).
 */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Escapa literal Postgres com aspas simples.
 * Dobra aspas simples internas. Rejeita NUL byte (não suportado em PG strings).
 */
function quoteLiteral(value: string): string {
  if (value.indexOf("\0") !== -1) {
    throw new Error("Literal contém NUL byte (não permitido em strings Postgres)");
  }
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildDerivedViewName(profileId: string, table: string): string {
  const hash = createHash("sha1").update(profileId).digest("hex").slice(0, 8);
  return `pbi_${hash}_v_${table}`;
}

export function buildCreateUserSql(username: string, password: string): string {
  return `CREATE USER ${quoteIdent(username)} WITH PASSWORD ${quoteLiteral(password)} CONNECTION LIMIT 5 LOGIN`;
}

export function buildAlterUserPasswordSql(username: string, password: string): string {
  return `ALTER USER ${quoteIdent(username)} WITH PASSWORD ${quoteLiteral(password)} CONNECTION LIMIT 5 LOGIN`;
}

export function buildAlterUserNoLoginSql(username: string): string {
  return `ALTER USER ${quoteIdent(username)} WITH NOLOGIN`;
}

export function buildAlterUserLoginSql(username: string): string {
  return `ALTER USER ${quoteIdent(username)} WITH LOGIN CONNECTION LIMIT 5`;
}

export function buildDropUserSql(username: string): string {
  return `DROP USER IF EXISTS ${quoteIdent(username)}`;
}

export function buildRevokeAllSql(username: string): string {
  return `REVOKE ALL ON SCHEMA ${quoteIdent(POWERBI_SCHEMA)} FROM ${quoteIdent(username)}`;
}

export function buildGrantUsageSql(username: string): string {
  return `GRANT USAGE ON SCHEMA ${quoteIdent(POWERBI_SCHEMA)} TO ${quoteIdent(username)}`;
}

export function buildGrantSelectSql(username: string, viewName: string): string {
  return `GRANT SELECT ON ${quoteIdent(POWERBI_SCHEMA)}.${quoteIdent(viewName)} TO ${quoteIdent(username)}`;
}

export function buildKillBackendsSql(username: string): string {
  return `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = ${quoteLiteral(username)}`;
}

export function buildSelectDerivedViewsSql(profileId: string): string {
  const hash = createHash("sha1").update(profileId).digest("hex").slice(0, 8);
  return `SELECT viewname FROM pg_views WHERE schemaname = ${quoteLiteral(POWERBI_SCHEMA)} AND viewname LIKE ${quoteLiteral(`pbi_${hash}_v_%`)}`;
}

export function buildDropDerivedViewSql(viewName: string): string {
  return `DROP VIEW IF EXISTS ${quoteIdent(POWERBI_SCHEMA)}.${quoteIdent(viewName)} CASCADE`;
}

export interface RlsPredicateInput {
  hasAccountId: boolean;
  hasTeamId: boolean;
  accountIdFilter: number[] | null;
  teamIdFilter: number[] | null;
}

export function buildRlsPredicate(input: RlsPredicateInput): string {
  const clauses: string[] = [];
  if (input.hasAccountId && input.accountIdFilter && input.accountIdFilter.length > 0) {
    const list = input.accountIdFilter
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n))
      .join(", ");
    if (list.length > 0) clauses.push(`${quoteIdent("account_id")} IN (${list})`);
  }
  if (input.hasTeamId && input.teamIdFilter && input.teamIdFilter.length > 0) {
    const list = input.teamIdFilter
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n))
      .join(", ");
    if (list.length > 0) clauses.push(`${quoteIdent("team_id")} IN (${list})`);
  }
  return clauses.join(" AND ");
}

export interface CreateDerivedViewInput {
  profileId: string;
  table: string;
  columns: string[];
  hasAccountId: boolean;
  hasTeamId: boolean;
  accountIdFilter: number[] | null;
  teamIdFilter: number[] | null;
}

export function buildCreateDerivedViewSql(input: CreateDerivedViewInput): string {
  const viewName = buildDerivedViewName(input.profileId, input.table);
  const cols = input.columns.map((c) => quoteIdent(c)).join(", ");
  const where = buildRlsPredicate({
    hasAccountId: input.hasAccountId,
    hasTeamId: input.hasTeamId,
    accountIdFilter: input.accountIdFilter,
    teamIdFilter: input.teamIdFilter,
  });
  const whereClause = where ? ` WHERE ${where}` : "";
  return `CREATE VIEW ${quoteIdent(POWERBI_SCHEMA)}.${quoteIdent(viewName)} AS SELECT ${cols} FROM ${quoteIdent(POWERBI_SCHEMA)}.${quoteIdent(input.table)}${whereClause}`;
}
