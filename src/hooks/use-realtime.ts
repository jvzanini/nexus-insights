"use client";

import { useEffect, useRef } from "react";
import type { RealtimeEvent } from "@/lib/realtime";

type EventHandler = (event: RealtimeEvent) => void;

export function useRealtime(onEvent: EventHandler) {
  const handlerRef = useRef(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      eventSource = new EventSource("/api/events");

      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as RealtimeEvent;
          handlerRef.current(event);
        } catch {
          // Ignorar mensagens malformadas
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        if (!closed) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);
}
