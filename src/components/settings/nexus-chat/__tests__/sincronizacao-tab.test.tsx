/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { act, render, screen, waitFor } from "@testing-library/react";

const listRecentSyncRuns = jest.fn();

jest.mock("@/lib/actions/nexus-chat/sync-stream", () => ({
  listRecentSyncRuns: (...args: unknown[]) => listRecentSyncRuns(...args),
}));

import { SincronizacaoTab } from "../tabs/sincronizacao-tab";

describe("<SincronizacaoTab />", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    listRecentSyncRuns.mockReset();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("renderiza header + texto explicativo do polling/UI", async () => {
    listRecentSyncRuns.mockResolvedValue({ success: true, data: [] });

    await act(async () => {
      render(
        <SincronizacaoTab
          connectionId="conn-1"
          lastSyncAt={null}
          pollingIntervalSeconds={30}
        />,
      );
    });

    expect(
      await screen.findByText(/Sincronização \(polling delta\)/i),
    ).toBeInTheDocument();
    // Texto explicativo MM-1: 5s na UI, Ns no worker.
    expect(
      screen.getByText(/Esta tela atualiza a cada 5s/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/30s/)).toBeInTheDocument();
  });

  it("empty state quando 0 runs e ação completou", async () => {
    listRecentSyncRuns.mockResolvedValue({ success: true, data: [] });

    await act(async () => {
      render(
        <SincronizacaoTab
          connectionId="conn-1"
          lastSyncAt={null}
          pollingIntervalSeconds={30}
        />,
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Sem runs registrados ainda/i),
      ).toBeInTheDocument();
    });
  });

  it("renderiza KPI 'Última sync' com 'Sem registro' quando lastSyncAt=null", async () => {
    listRecentSyncRuns.mockResolvedValue({ success: true, data: [] });

    await act(async () => {
      render(
        <SincronizacaoTab
          connectionId="conn-1"
          lastSyncAt={null}
          pollingIntervalSeconds={30}
        />,
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Última sync/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Sem registro/i)).toBeInTheDocument();
  });

  it("data-tour attrs estão presentes no header, kpis e runs", async () => {
    listRecentSyncRuns.mockResolvedValue({ success: true, data: [] });

    let container: HTMLElement | undefined;
    await act(async () => {
      const r = render(
        <SincronizacaoTab
          connectionId="conn-1"
          lastSyncAt={null}
          pollingIntervalSeconds={30}
        />,
      );
      container = r.container;
    });

    await waitFor(() => {
      expect(
        container!.querySelector('[data-tour="sincronizacao-header"]'),
      ).toBeInTheDocument();
    });
    expect(
      container!.querySelector('[data-tour="sincronizacao-kpis"]'),
    ).toBeInTheDocument();
    expect(
      container!.querySelector('[data-tour="sincronizacao-runs"]'),
    ).toBeInTheDocument();
  });
});
