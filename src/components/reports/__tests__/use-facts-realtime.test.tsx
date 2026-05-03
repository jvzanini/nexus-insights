/**
 * @jest-environment jsdom
 */

/**
 * Testes do hook `useFactsRealtime`.
 *
 * Cobre:
 *  - subscrição em /api/events ao montar
 *  - filtro por (connectionId, accountId) para `facts:refreshed`
 *  - debounce de 5s entre refreshes
 *  - cleanup (close) ao desmontar
 *  - listener `connection:deleted` → toast Sonner + redirect /dashboard após 3s
 *  - listener `connection:updated` → router.refresh()
 *
 * WHY: a partir de v0.35 (multi-tenant fase 1), a invalidação tem que ser
 * estritamente escopada por (connectionId, accountId) — caso contrário um
 * tenant veria refreshes disparados por outro.
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
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

// ── Mock sonner ─────────────────────────────────────────────────────────────
const mockToastInfo = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    info: (...args: unknown[]) => mockToastInfo(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Import AFTER mocks are in place
import { useFactsRealtime } from "../use-facts-realtime";

const CONN_A = "11111111-1111-1111-1111-111111111111";
const CONN_B = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  MockEventSource.instances = [];
  mockRefresh.mockReset();
  mockPush.mockReset();
  mockToastInfo.mockReset();
  mockToastError.mockReset();
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
    renderHook(() =>
      useFactsRealtime({ connectionId: CONN_A, accountId: 9 }),
    );
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/events");
  });

  it("chama router.refresh() para facts:refreshed com (connectionId, accountId) matching", () => {
    renderHook(() =>
      useFactsRealtime({ connectionId: CONN_A, accountId: 9 }),
    );
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, {
        type: "facts:refreshed",
        dimension: "by_account",
        connectionId: CONN_A,
        accountId: 9,
      });
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("NÃO chama router.refresh() para accountId diferente", () => {
    renderHook(() =>
      useFactsRealtime({ connectionId: CONN_A, accountId: 9 }),
    );
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, {
        type: "facts:refreshed",
        dimension: "by_account",
        connectionId: CONN_A,
        accountId: 42,
      });
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("NÃO chama router.refresh() para connectionId diferente (mesmo accountId)", () => {
    renderHook(() =>
      useFactsRealtime({ connectionId: CONN_A, accountId: 9 }),
    );
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, {
        type: "facts:refreshed",
        dimension: "by_account",
        connectionId: CONN_B,
        accountId: 9,
      });
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("NÃO chama router.refresh() para tipo de evento desconhecido", () => {
    renderHook(() =>
      useFactsRealtime({ connectionId: CONN_A, accountId: 9 }),
    );
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, { type: "settings:updated", key: "foo" });
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("debounce: 2 eventos facts:refreshed dentro de 5s chamam refresh apenas 1 vez", () => {
    renderHook(() =>
      useFactsRealtime({ connectionId: CONN_A, accountId: 9 }),
    );
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, {
        type: "facts:refreshed",
        dimension: "by_account",
        connectionId: CONN_A,
        accountId: 9,
      });
    });
    act(() => {
      jest.advanceTimersByTime(2_000);
      sendMessage(es, {
        type: "facts:refreshed",
        dimension: "by_inbox",
        connectionId: CONN_A,
        accountId: 9,
      });
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("debounce: após 5s, segundo evento dispara novo refresh", () => {
    renderHook(() =>
      useFactsRealtime({ connectionId: CONN_A, accountId: 9 }),
    );
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, {
        type: "facts:refreshed",
        dimension: "by_account",
        connectionId: CONN_A,
        accountId: 9,
      });
    });
    act(() => {
      jest.advanceTimersByTime(6_000);
      sendMessage(es, {
        type: "facts:refreshed",
        dimension: "by_account",
        connectionId: CONN_A,
        accountId: 9,
      });
    });
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });

  it("fecha EventSource ao desmontar", () => {
    const { unmount } = renderHook(() =>
      useFactsRealtime({ connectionId: CONN_A, accountId: 9 }),
    );
    const es = MockEventSource.instances[0];
    unmount();
    expect(es.close).toHaveBeenCalledTimes(1);
  });

  it("não abre EventSource quando enabled=false", () => {
    renderHook(() =>
      useFactsRealtime({
        connectionId: CONN_A,
        accountId: 9,
        enabled: false,
      }),
    );
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("ignora dados JSON inválidos sem lançar erro", () => {
    renderHook(() =>
      useFactsRealtime({ connectionId: CONN_A, accountId: 9 }),
    );
    const es = MockEventSource.instances[0];
    expect(() => {
      act(() => {
        if (es.onmessage) es.onmessage({ data: "not-json{{" });
      });
    }).not.toThrow();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  // ── Multi-tenant: connection lifecycle ────────────────────────────────────

  it("connection:deleted da própria conexão mostra toast e redireciona após 3s", () => {
    renderHook(() =>
      useFactsRealtime({ connectionId: CONN_A, accountId: 9 }),
    );
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, { type: "connection:deleted", connectionId: CONN_A });
    });

    // Toast disparado imediatamente.
    expect(mockToastInfo).toHaveBeenCalledTimes(1);
    expect(mockToastInfo.mock.calls[0][0]).toMatch(/removida/i);

    // Redirect só após 3s — antes disso, ainda na rota corrente.
    expect(mockPush).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("connection:deleted de outra conexão é ignorado", () => {
    renderHook(() =>
      useFactsRealtime({ connectionId: CONN_A, accountId: 9 }),
    );
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, { type: "connection:deleted", connectionId: CONN_B });
      jest.advanceTimersByTime(3_000);
    });
    expect(mockToastInfo).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("connection:updated da própria conexão chama router.refresh()", () => {
    renderHook(() =>
      useFactsRealtime({ connectionId: CONN_A, accountId: 9 }),
    );
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, { type: "connection:updated", connectionId: CONN_A });
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("connection:updated de outra conexão é ignorado", () => {
    renderHook(() =>
      useFactsRealtime({ connectionId: CONN_A, accountId: 9 }),
    );
    const es = MockEventSource.instances[0];
    act(() => {
      sendMessage(es, { type: "connection:updated", connectionId: CONN_B });
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
