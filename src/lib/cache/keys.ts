import { createHash } from "crypto";

export interface CacheKeyArgs {
  scope: "report" | "kpi" | "meta";
  name: string;
  accountId: number;
  filtersHash?: string;
}

export function cacheKey(args: CacheKeyArgs): string {
  const hash = args.filtersHash ?? "no-filters";
  return `ni:${args.scope}:${args.name}:a${args.accountId}:${hash}`;
}

export function hashFilters(filters: unknown): string {
  return createHash("sha1").update(JSON.stringify(filters)).digest("hex").slice(0, 16);
}
