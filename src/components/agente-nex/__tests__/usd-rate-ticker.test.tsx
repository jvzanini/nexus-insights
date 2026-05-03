/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { UsdRateTicker } from "../usd-rate-ticker";

const mockAction = jest.fn();
jest.mock("@/lib/actions/exchange-rate-refresh", () => ({
  getCurrentUsdBrlRateAction: (...args: unknown[]) => mockAction(...args),
}));

const mockToast = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    error: (msg: string) => mockToast("error", msg),
    success: (msg: string) => mockToast("success", msg),
  },
}));

describe("UsdRateTicker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renderiza commercial × spread = effective rate", () => {
    render(
      <UsdRateTicker
        commercialRate={5.5}
        spread={1.1}
        source="live"
        fetchedAt={new Date("2026-05-03T14:00:00Z")}
      />,
    );
    expect(screen.getByText(/6[,.]05/)).toBeInTheDocument();
    expect(screen.getByText(/Live/i)).toBeInTheDocument();
  });

  it("recalcula rate quando spread muda (reativo)", () => {
    const { rerender } = render(
      <UsdRateTicker
        commercialRate={5.0}
        spread={1.1}
        source="live"
        fetchedAt={new Date()}
      />,
    );
    expect(screen.getByText(/5[,.]50/)).toBeInTheDocument();
    rerender(
      <UsdRateTicker
        commercialRate={5.0}
        spread={1.2}
        source="live"
        fetchedAt={new Date()}
      />,
    );
    expect(screen.getByText(/6[,.]00/)).toBeInTheDocument();
  });

  it("clicar refresh dispara action e atualiza commercial", async () => {
    mockAction.mockResolvedValue({
      ok: true,
      data: {
        rate: 6.16,
        commercial: 5.6,
        spread: 1.1,
        source: "live",
        fetchedAt: new Date(),
      },
    });
    render(
      <UsdRateTicker
        commercialRate={5.5}
        spread={1.1}
        source="cache"
        fetchedAt={new Date()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /atualizar/i }));
    await waitFor(() => expect(mockAction).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText(/6[,.]16/)).toBeInTheDocument(),
    );
  });

  it("source 'cache' usa estilo amber", () => {
    render(
      <UsdRateTicker
        commercialRate={5.5}
        spread={1.1}
        source="cache"
        fetchedAt={new Date()}
      />,
    );
    const badge = screen.getByText(/Cache/i);
    expect(badge.className).toMatch(/amber/);
  });

  it("source 'fallback' usa estilo destrutivo", () => {
    render(
      <UsdRateTicker
        commercialRate={5.5}
        spread={1.1}
        source="fallback"
        fetchedAt={new Date()}
      />,
    );
    const badge = screen.getByText(/Fallback/i);
    expect(badge.className).toMatch(/destructive|red/);
  });

  it("erro do action manual mostra toast.error", async () => {
    mockAction.mockResolvedValue({ ok: false, error: "Sem permissão" });
    render(
      <UsdRateTicker
        commercialRate={5.5}
        spread={1.1}
        source="live"
        fetchedAt={new Date()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /atualizar/i }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith("error", "Sem permissão"),
    );
  });
});
