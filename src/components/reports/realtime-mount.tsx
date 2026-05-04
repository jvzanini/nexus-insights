"use client";

import { useFactsRealtime } from "@/components/reports/use-facts-realtime";

/**
 * Wrapper client invisível que monta `useFactsRealtime` dado
 * `connectionId` e `accountId` resolvidos no server component pai.
 *
 * Uso em pages que NÃO renderizam `<FactsFreshness>` (que já monta o hook):
 *
 * ```tsx
 * // page.tsx (server)
 * const connectionId = await getActiveConnectionId(user);
 * const accountId = await getActiveAccountId(user);
 * return (
 *   <>
 *     <RealtimeMount connectionId={connectionId} accountId={accountId} />
 *     ...resto da page
 *   </>
 * );
 * ```
 *
 * Não renderiza nada (retorna null).
 */
export function RealtimeMount({
  connectionId,
  accountId,
}: {
  connectionId: string;
  accountId: number;
}): null {
  useFactsRealtime({ connectionId, accountId });
  return null;
}
