/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

// AdvancedFilters → ExportButton → conversas-export action → next-auth.
// Mock cadeia para isolar render.
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
import { render, screen } from "@testing-library/react";
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
  initial: { ...EMPTY_FILTER_STATE, inboxIds: [1] },
  sortStack: [{ key: "name" as const, direction: "asc" as const }],
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
  searchClient: "",
  onSearchClientChange: () => {},
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

it("X dos chips Filtros e Ordenação: pouco maior (h-5) + adesivo (-right-2 -top-2) v0.30", () => {
  render(<AdvancedFilters {...baseProps} />);
  const xFilters = screen.getByRole("button", {
    name: /Limpar todos os filtros/i,
  });
  const xSort = screen.getByRole("button", { name: /Limpar ordenação/i });
  for (const el of [xFilters, xSort]) {
    const cls = el.getAttribute("class") ?? "";
    // Tamanho pouco maior (h-5 vs h-4 da v0.29)
    expect(cls).toMatch(/h-5 w-5/);
    expect(cls).not.toMatch(/h-4 w-4/);
    // Offset mais "fora" (adesivo na quina)
    expect(cls).toMatch(/-right-2/);
    expect(cls).toMatch(/-top-2/);
    // Idle discreto: text-muted-foreground, sem bg-destructive/border idle
    expect(cls).toMatch(/text-muted-foreground/);
    expect(cls).not.toMatch(/border-destructive/);
    // Hover destrutivo: bg-destructive/15 + text-destructive
    expect(cls).toMatch(/hover:bg-destructive\/15/);
    expect(cls).toMatch(/hover:text-destructive/);
  }
});
