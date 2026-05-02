/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";

// Mocks para isolar o componente do server-action chain (pega next-auth via
// import transitivo) — alinhado com o pattern dos outros testes do diretório.
jest.mock("@/lib/actions/reports/conversas", () => ({
  fetchConversas: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { ConversasTable } from "../conversas-table";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const baseRow = (id: number, display: number): ConversaRow => ({
  id,
  display_id: display,
  contact: {
    id,
    name: `User ${id}`,
    phone_number: null,
    identifier: null,
    additional_attributes: null,
  },
  inbox: { id: 1, name: "WA" },
  team: { id: null, name: null },
  assignee: { id: null, name: null },
  status: 0,
  priority: 0,
  created_at: null,
  last_activity_at: null,
  last_message_type: null,
  last_message_at: null,
  last_incoming_at: null,
  last_outgoing_at: null,
  custom_attributes: null,
  waiting_seconds: null,
  open_seconds: null,
  labels: [],
});

const baseProps = {
  initialRows: [baseRow(1, 100)],
  total: 1,
  page: 1,
  pageSize: 1000,
  totalPages: 1,
  onPageChange: jest.fn(),
  accountId: 9,
  filters: { period: { start: new Date(), end: new Date() } } as any,
  sortStack: [],
  onSortStackChange: () => {},
};

describe("ConversasTable v3 (paginação)", () => {
  beforeEach(() => {
    localStorage.clear();
    baseProps.onPageChange = jest.fn();
  });

  it("#ID renderiza como link clicável (a target=_blank)", () => {
    render(<ConversasTable {...baseProps} />);
    const link = screen.getByRole("link", {
      name: /abrir conversa #100 no chatwoot/i,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("não renderiza coluna Etiquetas no <ColumnsToggle>", () => {
    render(<ConversasTable {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /colunas/i }));
    // toggle só lista colunas opcionais, sem "Etiquetas"
    expect(screen.queryByLabelText(/etiquetas/i)).not.toBeInTheDocument();
  });

  it("não renderiza coluna 'Ações' no header", () => {
    render(<ConversasTable {...baseProps} />);
    expect(screen.queryByText(/ações/i)).not.toBeInTheDocument();
  });

  it("não renderiza seletor de tamanho de página nem 'Carregar mais'", () => {
    render(<ConversasTable {...baseProps} />);
    expect(screen.queryByText(/por página/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /carregar mais/i }),
    ).not.toBeInTheDocument();
  });

  it("toolbar mostra 'Total: X conversas · página N de M'", () => {
    render(
      <ConversasTable
        {...baseProps}
        initialRows={[baseRow(1, 100), baseRow(2, 101)]}
        total={1234}
        page={2}
        totalPages={3}
      />,
    );
    expect(screen.getByText(/Total/)).toBeInTheDocument();
    expect(screen.getByText(/1\.234/)).toBeInTheDocument();
    expect(screen.getByText(/página 2 de 3/i)).toBeInTheDocument();
  });

  it("não renderiza mais o banner amarelo 'Mostrando primeiras 10000'", () => {
    render(<ConversasTable {...baseProps} totalPages={50} />);
    expect(screen.queryByText(/refine os filtros/i)).not.toBeInTheDocument();
  });

  it("renderiza ConversasPagination quando totalPages > 1", () => {
    render(<ConversasTable {...baseProps} totalPages={3} />);
    expect(
      screen.getByRole("navigation", { name: /paginação/i }),
    ).toBeInTheDocument();
  });

  it("não renderiza ConversasPagination quando totalPages <= 1", () => {
    render(<ConversasTable {...baseProps} totalPages={1} />);
    expect(
      screen.queryByRole("navigation", { name: /paginação/i }),
    ).not.toBeInTheDocument();
  });

  it("click em página chama onPageChange", () => {
    const cb = jest.fn();
    render(<ConversasTable {...baseProps} totalPages={3} onPageChange={cb} />);
    fireEvent.click(screen.getByRole("button", { name: /ir para página 2/i }));
    expect(cb).toHaveBeenCalledWith(2);
  });

  it("limpa localStorage 'conversas-table-page-size' no mount", () => {
    localStorage.setItem("conversas-table-page-size", "100");
    render(<ConversasTable {...baseProps} />);
    expect(localStorage.getItem("conversas-table-page-size")).toBeNull();
  });
});
