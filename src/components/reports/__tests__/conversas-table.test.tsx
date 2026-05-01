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
  initialCursor: null as string | null,
  accountId: 9,
  filters: { period: { start: new Date(), end: new Date() } } as any,
  sortStack: [],
  onSortStackChange: () => {},
  onRowCountChange: () => {},
};

describe("ConversasTable v2", () => {
  beforeEach(() => {
    localStorage.clear();
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

  it("notifica rowCount via onRowCountChange no mount + mudanças", () => {
    const cb = jest.fn();
    render(
      <ConversasTable
        {...baseProps}
        initialRows={[baseRow(1, 100), baseRow(2, 101)]}
        onRowCountChange={cb}
      />,
    );
    expect(cb).toHaveBeenCalledWith(2);
  });

  it("banner amarelo quando initialCursor != null (truncado em 10k)", () => {
    render(<ConversasTable {...baseProps} initialCursor="some-cursor" />);
    expect(screen.getByText(/refine os filtros/i)).toBeInTheDocument();
  });

  it("limpa localStorage 'conversas-table-page-size' no mount", () => {
    localStorage.setItem("conversas-table-page-size", "100");
    render(<ConversasTable {...baseProps} />);
    expect(localStorage.getItem("conversas-table-page-size")).toBeNull();
  });
});
