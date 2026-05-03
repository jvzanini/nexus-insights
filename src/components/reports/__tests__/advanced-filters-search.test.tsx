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

  it("ExportButton continua habilitado quando search zera mas há rows no período", () => {
    // tableRowCount reflete count "natural" do período (sem search/conditions);
    // export é server-side e ignora searchClient — botão NÃO pode desabilitar
    // só porque a busca client zerou o resultado.
    render(
      <AdvancedFilters
        {...baseProps}
        searchClient="xpto-naoexiste"
        onSearchClientChange={() => {}}
        tableRowCount={10}
      />,
    );
    const exportBtn = screen.getByRole("button", { name: /Exportar/i });
    expect(exportBtn).not.toBeDisabled();
  });

  // v0.27 — T3: input search refator (lupa roxa + X canto direito + sem tag "Filtrando").
  it("ícone lupa fica violet quando searchClient ativo", () => {
    const { container } = render(
      <AdvancedFilters
        {...baseProps}
        searchClient="abc"
        onSearchClientChange={() => {}}
      />,
    );
    const icon = container.querySelector(".lucide-search");
    expect(icon?.getAttribute("class")).toMatch(/text-violet-500/);
  });

  it("ícone lupa fica muted quando searchClient vazio", () => {
    const { container } = render(
      <AdvancedFilters
        {...baseProps}
        searchClient=""
        onSearchClientChange={() => {}}
      />,
    );
    const icon = container.querySelector(".lucide-search");
    expect(icon?.getAttribute("class")).toMatch(/text-muted-foreground/);
  });

  it("X de limpar busca aparece e clica limpa", () => {
    const onSearchClientChange = jest.fn();
    render(
      <AdvancedFilters
        {...baseProps}
        searchClient="abc"
        onSearchClientChange={onSearchClientChange}
      />,
    );
    const x = screen.getByRole("button", { name: /Limpar busca/i });
    fireEvent.click(x);
    expect(onSearchClientChange).toHaveBeenCalledWith("");
  });

  it("não renderiza tag 'Filtrando' (removida v0.27)", () => {
    render(
      <AdvancedFilters
        {...baseProps}
        searchClient="abc"
        onSearchClientChange={() => {}}
      />,
    );
    expect(screen.queryByText(/Filtrando/i)).toBeNull();
  });

  it("X NÃO aparece quando search vazio", () => {
    render(
      <AdvancedFilters
        {...baseProps}
        searchClient=""
        onSearchClientChange={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /Limpar busca/i })).toBeNull();
  });
});
