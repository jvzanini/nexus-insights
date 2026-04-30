"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const DEBOUNCE_MS = 5_000;

/**
 * Escuta o canal SSE `/api/events` para eventos `facts:refreshed` da conta
 * informada e dispara `router.refresh()` (soft RSC re-render) quando
 * relevante. O refresh é debounced: nunca mais de 1 vez a cada 5 s.
 *
 * Passe `enabled={false}` para desabilitar (ex.: quando sse_enabled = false
 * em app_settings).
 */
export function useFactsRealtime(args: {
  accountId: number;
  enabled?: boolean;
}): void {
  const { accountId, enabled = true } = args;
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

      if (
        typeof payload !== "object" ||
        payload === null ||
        (payload as Record<string, unknown>).type !== "facts:refreshed" ||
        (payload as Record<string, unknown>).accountId !== accountId
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastCallRef.current < DEBOUNCE_MS) return;
      lastCallRef.current = now;
      router.refresh();
    };

    return () => {
      es.close();
    };
  }, [accountId, enabled, router]);
}
