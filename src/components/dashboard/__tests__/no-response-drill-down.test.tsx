/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";

import { NoResponseDrillDownContent } from "../no-response-drill-down";

jest.mock("@/lib/actions/dashboard-drill-down", () => ({
  getNoResponseDrillDownAction: jest.fn().mockResolvedValue({
    success: true,
    data: {
      total: 31,
      oldestSeconds: 4 * 86400,
      items: Array.from({ length: 31 }, (_, i) => ({
        id: i + 1,
        displayId: 100 + i,
        contactName: `Contato ${i + 1}`,
        inboxName: i % 2 === 0 ? "SP-São Paulo" : "BA-Bahia",
        teamName: i % 2 === 0 ? "Vendas" : "Suporte",
        assigneeName: "Hevelyn",
        waitingSeconds:
          i < 5 ? 3 * 3600 : i < 12 ? 12 * 3600 : i < 24 ? 2 * 86400 : 5 * 86400,
        lastIncomingAt: new Date().toISOString(),
        snippet: null,
      })),
      byInbox: [{ id: 1, name: "SP-São Paulo", count: 16 }],
      byAssignee: [{ id: 1, name: "Hevelyn", count: 31 }],
    },
  }),
}));

describe("NoResponseDrillDownContent (v0.22.0)", () => {
  it("substitui 'Resumo / Snapshot atual' por 'Faixa de espera'", async () => {
    render(<NoResponseDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() =>
      expect(screen.getByText(/Faixa de espera/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Snapshot atual/i)).not.toBeInTheDocument();
  });

  it("renderiza header 'Estado' na distribuição (não 'Inbox')", async () => {
    render(<NoResponseDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() =>
      expect(screen.getByText(/Veja por estado ou por atendente/i)).toBeInTheDocument(),
    );
  });

  it("toggle Estado/Atendente (era Inbox/Atendente)", async () => {
    render(<NoResponseDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() => {
      const estadoBtn = screen.getByRole("radio", { name: /Estado/i });
      expect(estadoBtn).toBeInTheDocument();
      expect(estadoBtn).toHaveAttribute("aria-checked", "true");
    });
  });

  it("remove coluna 'Última msg' e adiciona 'Departamento'", async () => {
    render(<NoResponseDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() => screen.getByText("Departamento"));
    expect(screen.queryByText(/Última msg/i)).not.toBeInTheDocument();
  });

  it("renderiza TotalBadge com total formatado pt-BR", async () => {
    render(<NoResponseDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() => {
      const matches = screen.getAllByText("31");
      // TotalBadge usa classe font-mono tabular-nums no <span>
      const badge = matches.find((el) =>
        el.className.includes("font-mono") &&
        el.className.includes("tabular-nums"),
      );
      expect(badge).toBeDefined();
      expect(badge).toBeInTheDocument();
    });
  });
});
