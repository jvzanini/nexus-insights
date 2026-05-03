"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const DEBOUNCE_MS = 5_000;
const REDIRECT_DELAY_MS = 3_000;

/**
 * Escuta o canal SSE `/api/events` para eventos relevantes ao binding ativo
 * e dispara `router.refresh()` (soft RSC re-render) quando há mudança de
 * dados pré-agregados ou de configuração da conexão.
 *
 * Filtragem (multi-tenant):
 *  - `facts:refreshed` exige BOTH `connectionId` AND `accountId` matching —
 *    sem isso, um tenant veria refreshes disparados por outro.
 *  - `connection:updated` da mesma `connectionId` força `router.refresh()`
 *    porque o pool foi invalidado server-side e dados podem ter mudado.
 *  - `connection:deleted` da mesma `connectionId` mostra toast e redireciona
 *    pra `/dashboard` após 3 s — o binding morreu, queries vão quebrar.
 *
 * Debounce: `facts:refreshed` é debounced em 5 s (refreshes burst do worker
 * de pré-agregação não devem floodar o RSC stream).
 *
 * Passe `enabled={false}` para desabilitar (ex.: quando sse_enabled = false
 * em app_settings).
 */
export function useFactsRealtime(args: {
  connectionId: string;
  accountId: number;
  enabled?: boolean;
}): void {
  const { connectionId, accountId, enabled = true } = args;
  const router = useRouter();
  const lastCallRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource("/api/events");

    es.onmessage = (event: MessageEvent<string>) => {
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (typeof payload !== "object" || payload === null) return;
      const evt = payload as Record<string, unknown>;

      // facts:refreshed — exige (connectionId, accountId) matching, com debounce.
      if (
        evt.type === "facts:refreshed" &&
        evt.connectionId === connectionId &&
        evt.accountId === accountId
      ) {
        const now = Date.now();
        if (now - lastCallRef.current < DEBOUNCE_MS) return;
        lastCallRef.current = now;
        router.refresh();
        return;
      }

      // connection:updated — pool invalidado server-side; re-renderiza pra
      // pegar dados frescos. Sem debounce: updates de connection são raros.
      if (
        evt.type === "connection:updated" &&
        evt.connectionId === connectionId
      ) {
        router.refresh();
        return;
      }

      // connection:deleted — binding morto; avisa user e leva pra /dashboard
      // (que tem fallback safe). Delay de 3 s pra dar tempo de ler o toast.
      if (
        evt.type === "connection:deleted" &&
        evt.connectionId === connectionId
      ) {
        toast.info(
          "Conexão removida pelo administrador. Redirecionando para o dashboard...",
        );
        setTimeout(() => {
          router.push("/dashboard");
        }, REDIRECT_DELAY_MS);
        return;
      }
    };

    return () => {
      es.close();
    };
  }, [connectionId, accountId, enabled, router]);
}
