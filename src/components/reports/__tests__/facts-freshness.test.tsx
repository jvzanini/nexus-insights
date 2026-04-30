/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { act, render, screen, waitFor } from "@testing-library/react";

jest.mock("@/lib/actions/freshness", () => ({
  getFreshnessForAccount: jest.fn(),
}));

import { FactsFreshness } from "../facts-freshness";

const { getFreshnessForAccount } = jest.requireMock("@/lib/actions/freshness");

const REF_NOW = new Date("2026-04-30T12:00:00Z");

describe("FactsFreshness", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(REF_NOW);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function flushAndWait() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("renderiza status fresh com cor emerald quando lagSeconds < 600", async () => {
    (getFreshnessForAccount as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        lagSeconds: 120,
        status: "fresh",
        lastRefreshAt: new Date(REF_NOW.getTime() - 120_000).toISOString(),
      },
    });

    const { container } = render(<FactsFreshness accountId={1} autoRefresh={false} />);
    await flushAndWait();
    await waitFor(() => {
      expect(screen.getByText(/Atualizado/)).toBeInTheDocument();
    });
    expect(container.querySelector(".text-emerald-600")).not.toBeNull();
  });

  it("renderiza status lagging com cor rose quando lagSeconds > 1800", async () => {
    (getFreshnessForAccount as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        lagSeconds: 3600,
        status: "lagging",
        lastRefreshAt: new Date(REF_NOW.getTime() - 3_600_000).toISOString(),
      },
    });

    const { container } = render(<FactsFreshness accountId={1} autoRefresh={false} />);
    await flushAndWait();
    await waitFor(() => {
      expect(screen.getByText(/pode estar desatualizado/)).toBeInTheDocument();
    });
    expect(container.querySelector(".text-rose-600")).not.toBeNull();
  });

  it("renderiza status never quando lastRefreshAt é null", async () => {
    (getFreshnessForAccount as jest.Mock).mockResolvedValue({
      ok: true,
      data: { lagSeconds: null, status: "never", lastRefreshAt: null },
    });

    const { container } = render(<FactsFreshness accountId={1} autoRefresh={false} />);
    await flushAndWait();
    await waitFor(() => {
      expect(screen.getByText(/Sem dados de pré-agregação/)).toBeInTheDocument();
    });
    expect(container.querySelector(".text-muted-foreground")).not.toBeNull();
  });

  it("chama action no mount e a cada 30s quando autoRefresh=true", async () => {
    (getFreshnessForAccount as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        lagSeconds: 60,
        status: "fresh",
        lastRefreshAt: new Date(REF_NOW.getTime() - 60_000).toISOString(),
      },
    });

    render(<FactsFreshness accountId={42} autoRefresh={true} />);
    await flushAndWait();
    expect(getFreshnessForAccount).toHaveBeenCalledTimes(1);
    expect(getFreshnessForAccount).toHaveBeenLastCalledWith(42);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(getFreshnessForAccount).toHaveBeenCalledTimes(2);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(getFreshnessForAccount).toHaveBeenCalledTimes(3);
  });
});
