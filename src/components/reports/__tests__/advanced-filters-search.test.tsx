/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

// Mock cadeia (idêntico aos outros tests do AdvancedFilters).
jest.mock("@/lib/actions/reports/conversas-export", () => ({
  exportConversasAction: jest.fn(),
}));
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/actions/reports/period", () => ({
  fetchEarliestActivityDate: jest.fn(),
}));
jest.mock("@/lib/chatwoot/pool", () => ({
  getChatwootPool: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

import * as React from "react";
import { render, screen, fireEvent, createEvent } from "@testing-library/react";
import { describe, it, expect, jest } from "@jest/globals";
import { AdvancedFilters } from "@/components/reports/advanced-filters";
import { EMPTY_FILTER_STATE } from "@/lib/reports/filter-state";

const stubPresetsApi = {
  presets: [],
  isAtCap: false,
  create: jest.fn(),
  rename: jest.fn(),
  remove: jest.fn(),
  validateName: () => null,
};

const baseProps = {
  inboxes: [],
  teams: [],
  assignees: [],
  labels: [],
  initial: EMPTY_FILTER_STATE,
  sortStack: [],
  onSortStackChange: () => {},
  quickFilters: new Set<never>(),
  onToggleQuick: () => {},
  onRemoveQuick: () => {},
  currentChatwootUserId: null,
  presetsApi: stubPresetsApi,
  onApplyPreset: () => {},
  onOpenPresetsManager: () => {},
  appliedReportFilters: { period: { start: "2026-04-01", end: "2026-04-30" } },
  tableRowCount: 10,
} as unknown as React.ComponentProps<typeof AdvancedFilters>;

// Stub matchMedia + ResizeObserver (jsdom não implementa).
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
});

describe("AdvancedFilters search v0.25", () => {
  it("onChange chama onSearchClientChange a cada keystroke", () => {
    const onSearchClientChange = jest.fn();
    render(
      <AdvancedFilters
        {...baseProps}
        searchClient=""
        onSearchClientChange={onSearchClientChange}
      />,
    );
    const input = screen.getByLabelText(/Buscar conversas/i);
    fireEvent.change(input, { target: { value: "070" } });
    expect(onSearchClientChange).toHaveBeenLastCalledWith("070");
  });

  it("Esc limpa searchClient (preventDefault)", () => {
    const onSearchClientChange = jest.fn();
    render(
      <AdvancedFilters
        {...baseProps}
        searchClient="070"
        onSearchClientChange={onSearchClientChange}
      />,
    );
    const input = screen.getByLabelText(/Buscar conversas/i);
    const event = createEvent.keyDown(input, { key: "Escape" });
    fireEvent(input, event);
    expect(onSearchClientChange).toHaveBeenCalledWith("");
    expect(event.defaultPrevented).toBe(true);
  });

  it("ExportButton tem title quando searchClient ativa", () => {
    render(
      <AdvancedFilters
        {...baseProps}
        searchClient="joao"
        onSearchClientChange={() => {}}
      />,
    );
    const exportBtn = screen.getByRole("button", { name: /Exportar/i });
    const title = exportBtn.getAttribute("title");
    expect(title).not.toBeNull();
    expect(title!).toMatch(/inclui os filtros aplicados, não a busca/i);
  });
});
