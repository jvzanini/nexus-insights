/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { act, render, screen, waitFor } from "@testing-library/react";

jest.mock("@/lib/actions/freshness", () => ({
  getFreshnessForAccount: jest.fn(),
}));

// useFactsRealtime abre EventSource — mockar para evitar efeito colateral no teste.
jest.mock("../use-facts-realtime", () => ({
  useFactsRealtime: jest.fn(),
}));

import { FactsFreshness } from "../facts-freshness";
import { useFactsRealtime } from "../use-facts-realtime";

const { getFreshnessForAccount } = jest.requireMock("@/lib/actions/freshness");

const REF_NOW = new Date("2026-04-30T12:00:00Z");
const CONN_ID = "11111111-1111-1111-1111-111111111111";

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

    const { container } = render(
      <FactsFreshness connectionId={CONN_ID} accountId={1} autoRefresh={false} />,
    );
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

    const { container } = render(
      <FactsFreshness connectionId={CONN_ID} accountId={1} autoRefresh={false} />,
    );
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

    const { container } = render(
      <FactsFreshness connectionId={CONN_ID} accountId={1} autoRefresh={false} />,
    );
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

    render(
      <FactsFreshness connectionId={CONN_ID} accountId={42} autoRefresh={true} />,
    );
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

  it("propaga connectionId pra useFactsRealtime", async () => {
    (getFreshnessForAccount as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        lagSeconds: 60,
        status: "fresh",
        lastRefreshAt: new Date(REF_NOW.getTime() - 60_000).toISOString(),
      },
    });

    render(
      <FactsFreshness connectionId={CONN_ID} accountId={7} autoRefresh={false} />,
    );
    await flushAndWait();

    // WHY: garantir que o filtro multi-tenant funciona end-to-end (props ->
    // hook); regressão aqui silenciosa = tenant vê refreshes alheios.
    expect(useFactsRealtime).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: CONN_ID, accountId: 7 }),
    );
  });
});
