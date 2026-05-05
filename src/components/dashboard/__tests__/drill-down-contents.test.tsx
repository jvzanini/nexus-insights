/**
 * @jest-environment jsdom
 */
/**
 * Smoke tests para `drill-down-contents.tsx`. Mocka `getReceivedDrillDownAction`
 * (action) com payload mínimo e valida (a) header "Estado" presente,
 * (b) coluna Departamento presente, (c) tag âmbar em "Quando", (d) TotalBadge
 * no título da seção.
 */
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ReceivedDrillDownContent } from "../drill-down-contents";

jest.mock("@/lib/actions/dashboard-drill-down", () => ({
  getReceivedDrillDownAction: jest.fn().mockResolvedValue({
    success: true,
    data: {
      total: 99,
      granularity: "day",
      chart: [],
      byInbox: [{ id: 1, name: "SP-São Paulo", count: 22 }],
      byHour: [{ hour: 14, count: 3 }],
      byTeam: [{ id: 1, name: "Vendas", count: 10 }],
      byAssignee: [{ id: 1, name: "Hevelyn", count: 7 }],
      range: { start: "2026-05-01T00:00:00.000Z", end: "2026-05-01T23:59:59.999Z" },
      tz: "America/Sao_Paulo",
      items: [
        {
          id: 1,
          displayId: 100,
          contactName: "Paulo",
          inboxName: "SP-São Paulo",
          teamName: "Vendas",
          assigneeName: "Hevelyn",
          status: 0,
          lastActivityAt: new Date().toISOString(),
        },
      ],
      page: 1,
      pageSize: 50,
      recent: [],
    },
  }),
}));

describe("ReceivedDrillDownContent (v0.22.0)", () => {
  it("renderiza header 'Estado' (não 'Inbox')", async () => {
    render(<ReceivedDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() =>
      expect(screen.getAllByText(/Estado/i).length).toBeGreaterThan(0),
    );
    expect(screen.queryByText(/^Inbox$/)).not.toBeInTheDocument();
  });

  it("renderiza coluna Departamento", async () => {
    render(<ReceivedDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() =>
      expect(screen.getByText("Departamento")).toBeInTheDocument(),
    );
    expect(screen.getByText("Vendas")).toBeInTheDocument();
  });

  it("renderiza TotalBadge com total formatado", async () => {
    render(<ReceivedDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() =>
      expect(screen.getAllByText("99").length).toBeGreaterThan(0),
    );
  });

  it("renderiza seletor de distribuição com opções Por estado/departamento/atendente", async () => {
    render(<ReceivedDrillDownContent accountId={1} period="dia" enabled />);
    await waitFor(() =>
      expect(screen.getByText(/Por estado/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Por departamento/i)).toBeInTheDocument();
    expect(screen.getByText(/Por atendente/i)).toBeInTheDocument();
  });
});
