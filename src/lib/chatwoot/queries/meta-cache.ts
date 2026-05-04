/**
 * Metadados raramente mutáveis (inboxes, teams, users, labels) — cache 24h
 * (10 min para labels). Usado para popular filtros, seletores e legendas.
 *
 * v0.37 (Fase 1 multi-tenant): assinatura ganha `connectionId` como 1º
 * parâmetro. Lê do pool dinâmico via `queryNexusChat` em vez do pool global
 * legado (`getChatwootPool`). `cacheKey()` inclui `connectionId` (segmento
 * `cUUID:`) para evitar colisão entre connections com mesmo `account_id`,
 * e o sufixo `-v2` no `name` força invalidação natural do cache antigo no
 * deploy.
 */

import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey } from "@/lib/cache/keys";

export interface MetaItem {
  id: number;
  name: string;
}

const META_TTL_SECONDS = 86_400; // 24h

// Index signature exigida por `queryNexusChat<T extends Record<string, unknown>>`.
interface InboxRow {
  id: number;
  name: string | null;
  [key: string]: unknown;
}
interface TeamRow {
  id: number;
  name: string | null;
  [key: string]: unknown;
}
interface UserRow {
  id: number;
  name: string | null;
  [key: string]: unknown;
}
interface LabelRow {
  id: number;
  name: string | null;
  [key: string]: unknown;
}

// Etiquetas (labels) mudam com mais frequência que inbox/team/user.
// TTL menor (10 min) reduz a janela de cache stale após CRUD no Chatwoot.
const LABEL_TTL_SECONDS = 600;

export async function getInboxes(connectionId: string, accountId: number) {
  const key = cacheKey({
    scope: "meta",
    name: "inboxes-v2",
    connectionId,
    accountId,
  });
  return withCache<MetaItem[]>({
    key,
    ttlSeconds: META_TTL_SECONDS,
    fetcher: () =>
      withChatwootResilience<MetaItem[]>(
        async () => {
          const result = await queryNexusChat<InboxRow>(
            connectionId,
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

export async function getTeams(connectionId: string, accountId: number) {
  const key = cacheKey({
    scope: "meta",
    name: "teams-v2",
    connectionId,
    accountId,
  });
  return withCache<MetaItem[]>({
    key,
    ttlSeconds: META_TTL_SECONDS,
    fetcher: () =>
      withChatwootResilience<MetaItem[]>(
        async () => {
          const result = await queryNexusChat<TeamRow>(
            connectionId,
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
export async function getLabels(connectionId: string, accountId: number) {
  const key = cacheKey({
    scope: "meta",
    name: "labels-v2",
    connectionId,
    accountId,
  });
  return withCache<MetaItem[]>({
    key,
    ttlSeconds: LABEL_TTL_SECONDS,
    fetcher: () =>
      withChatwootResilience<MetaItem[]>(
        async () => {
          const result = await queryNexusChat<LabelRow>(
            connectionId,
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

export async function getUsers(connectionId: string, accountId: number) {
  const key = cacheKey({
    scope: "meta",
    name: "users-v2",
    connectionId,
    accountId,
  });
  return withCache<MetaItem[]>({
    key,
    ttlSeconds: META_TTL_SECONDS,
    fetcher: () =>
      withChatwootResilience<MetaItem[]>(
        async () => {
          // Usuários do Chatwoot que possuem account_user no account informado.
          const result = await queryNexusChat<UserRow>(
            connectionId,
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
