/**
 * @jest-environment jsdom
 */

/**
 * Testes do hook `useFactsRealtime` (T13 — SSE de invalidação).
 *
 * Moca EventSource e useRouter para verificar:
 *  - subscrição em /api/events ao montar
 *  - router.refresh() chamado para evento matching
 *  - nenhum refresh para evento não matching
 *  - debounce: 2 eventos dentro de 5s → apenas 1 refresh
 *  - cleanup (close) ao desmontar
 */

import { renderHook, act } from "@testing-library/react";

// ── Mock EventSource ────────────────────────────────────────────────────────
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: ((e: { data: string }) => void) | null = null;
  close = jest.fn();
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
}

(global as unknown as { EventSource: typeof MockEventSource }).EventSource =
  MockEventSource;

// ── Mock useRouter ──────────────────────────────────────────────────────────
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// Import AFTER mocks are in place
import { useFactsRealtime } from "../use-facts-realtime";

beforeEach(() => {
  MockEventSource.instances = [];
  mockRefresh.mockReset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function sendMessage(es: MockEventSource, data: unknown) {
  if (es.onmessage) {
    es.onmessage({ data: JSON.stringify(data) });
  }
}

describe("useFactsRealtime", () => {
  it("abre EventSource em /api/events ao montar", () => {
    renderHook(() => useFactsRealtime({ accountId: 9 }));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/events");
  });

  it("chama router.refresh() para evento facts:refreshed com accountId matching", () => {
    renderHook(() => useFactsRealtime({ accountId: 9 }));
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, { type: "facts:refreshed", dimension: "by_account", accountId: 9 });
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("NÃO chama router.refresh() para accountId diferente", () => {
    renderHook(() => useFactsRealtime({ accountId: 9 }));
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, { type: "facts:refreshed", dimension: "by_account", accountId: 42 });
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("NÃO chama router.refresh() para tipo de evento diferente", () => {
    renderHook(() => useFactsRealtime({ accountId: 9 }));
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, { type: "settings:updated", key: "foo" });
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("debounce: 2 eventos dentro de 5s chamam refresh apenas 1 vez", () => {
    renderHook(() => useFactsRealtime({ accountId: 9 }));
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, { type: "facts:refreshed", dimension: "by_account", accountId: 9 });
    });
    // Avança 2s (< 5s) e dispara de novo
    act(() => {
      jest.advanceTimersByTime(2_000);
      sendMessage(es, { type: "facts:refreshed", dimension: "by_inbox", accountId: 9 });
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("debounce: após 5s, segundo evento dispara novo refresh", () => {
    renderHook(() => useFactsRealtime({ accountId: 9 }));
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, { type: "facts:refreshed", dimension: "by_account", accountId: 9 });
    });
    // Avança 6s (> 5s)
    act(() => {
      jest.advanceTimersByTime(6_000);
      sendMessage(es, { type: "facts:refreshed", dimension: "by_account", accountId: 9 });
    });
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });

  it("fecha EventSource ao desmontar", () => {
    const { unmount } = renderHook(() => useFactsRealtime({ accountId: 9 }));
    const es = MockEventSource.instances[0];
    unmount();
    expect(es.close).toHaveBeenCalledTimes(1);
  });

  it("não abre EventSource quando enabled=false", () => {
    renderHook(() => useFactsRealtime({ accountId: 9, enabled: false }));
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("ignora dados JSON inválidos sem lançar erro", () => {
    renderHook(() => useFactsRealtime({ accountId: 9 }));
    const es = MockEventSource.instances[0];
    expect(() => {
      act(() => {
        if (es.onmessage) es.onmessage({ data: "not-json{{" });
      });
    }).not.toThrow();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
