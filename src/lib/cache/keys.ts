import { createHash } from "crypto";

export interface CacheKeyArgs {
  scope: "report" | "kpi" | "meta";
  name: string;
  accountId: number;
  filtersHash?: string;
  /**
   * v0.37 — connectionId da `nexus_chat_connection`. Quando presente, entra
   * na chave entre `name` e `accountId` para evitar colisão entre
   * connections que compartilham o mesmo `account_id` legado do Chatwoot.
   * Mantém-se opcional para compat com call-sites legados em transição.
   */
  connectionId?: string;
}

export function cacheKey(args: CacheKeyArgs): string {
  const hash = args.filtersHash ?? "no-filters";
  const connSegment = args.connectionId ? `c${args.connectionId}:` : "";
  return `ni:${args.scope}:${args.name}:${connSegment}a${args.accountId}:${hash}`;
}

export function hashFilters(filters: unknown): string {
  return createHash("sha1").update(JSON.stringify(filters)).digest("hex").slice(0, 16);
}
