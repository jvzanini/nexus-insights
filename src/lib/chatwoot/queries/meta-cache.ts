/**
 * Metadados raramente mutáveis (inboxes, teams, users) — cache 24h.
 * Usado para popular filtros, seletores e legendas.
 */

import { getChatwootPool } from "../pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey } from "@/lib/cache/keys";

export interface MetaItem {
  id: number;
  name: string;
}

const META_TTL_SECONDS = 86_400; // 24h

interface InboxRow {
  id: number;
  name: string | null;
}
interface TeamRow {
  id: number;
  name: string | null;
}
interface UserRow {
  id: number;
  name: string | null;
}
interface LabelRow {
  id: number;
  name: string | null;
}

// Etiquetas (labels) mudam com mais frequência que inbox/team/user.
// TTL menor (10 min) reduz a janela de cache stale após CRUD no Chatwoot.
const LABEL_TTL_SECONDS = 600;

export async function getInboxes(accountId: number) {
  const key = cacheKey({
    scope: "meta",
    name: "inboxes",
    accountId,
  });
  return withCache<MetaItem[]>({
    key,
    ttlSeconds: META_TTL_SECONDS,
    fetcher: () =>
      withChatwootResilience<MetaItem[]>(
        async () => {
          const pool = getChatwootPool();
          const result = await pool.query<InboxRow>(
            `SELECT id, name FROM inboxes WHERE account_id = $1 ORDER BY name`,
            [accountId],
          );
          return result.rows.map((r) => ({
            id: r.id,
            name: r.name ?? `Inbox ${r.id}`,
          }));
        },
        { fallbackKey: key },
      ),
  });
}

export async function getTeams(accountId: number) {
  const key = cacheKey({
    scope: "meta",
    name: "teams",
    accountId,
  });
  return withCache<MetaItem[]>({
    key,
    ttlSeconds: META_TTL_SECONDS,
    fetcher: () =>
      withChatwootResilience<MetaItem[]>(
        async () => {
          const pool = getChatwootPool();
          const result = await pool.query<TeamRow>(
            `SELECT id, name FROM teams WHERE account_id = $1 ORDER BY name`,
            [accountId],
          );
          return result.rows.map((r) => ({
            id: r.id,
            name: r.name ?? `Team ${r.id}`,
          }));
        },
        { fallbackKey: key },
      ),
  });
}

/**
 * Lista de etiquetas (labels) da conta. Usadas pelo multi-select de filtro
 * em /relatorios/conversas. Espelha o padrão de getInboxes/getTeams/getUsers.
 *
 * Cache pull-through com TTL de 10 minutos — etiquetas mudam mais rápido
 * que outras metas (CRUD direto no Chatwoot), então o TTL é menor.
 * Stale tolerável; invalidação on-demand fica para evolução.
 */
export async function getLabels(accountId: number) {
  const key = cacheKey({
    scope: "meta",
    name: "labels",
    accountId,
  });
  return withCache<MetaItem[]>({
    key,
    ttlSeconds: LABEL_TTL_SECONDS,
    fetcher: () =>
      withChatwootResilience<MetaItem[]>(
        async () => {
          const pool = getChatwootPool();
          const result = await pool.query<LabelRow>(
            `SELECT id, title AS name FROM labels WHERE account_id = $1 ORDER BY title ASC`,
            [accountId],
          );
          return result.rows.map((r) => ({
            id: r.id,
            name: r.name ?? `Label ${r.id}`,
          }));
        },
        { fallbackKey: key },
      ),
  });
}

export async function getUsers(accountId: number) {
  const key = cacheKey({
    scope: "meta",
    name: "users",
    accountId,
  });
  return withCache<MetaItem[]>({
    key,
    ttlSeconds: META_TTL_SECONDS,
    fetcher: () =>
      withChatwootResilience<MetaItem[]>(
        async () => {
          const pool = getChatwootPool();
          // Usuários do Chatwoot que possuem account_user no account informado.
          const result = await pool.query<UserRow>(
            `
              SELECT u.id, u.name
              FROM users u
              JOIN account_users au ON au.user_id = u.id
              WHERE au.account_id = $1
              ORDER BY u.name
            `,
            [accountId],
          );
          return result.rows.map((r) => ({
            id: r.id,
            name: r.name ?? `User ${r.id}`,
          }));
        },
        { fallbackKey: key },
      ),
  });
}
