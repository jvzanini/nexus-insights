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

  it("não renderiza chip 'Ordenação · N' duplicado no toolbar", () => {
    render(
      <ConversasTable
        {...baseProps}
        sortStack={[
          { key: "name", direction: "asc" },
          { key: "status", direction: "desc" },
          { key: "priority", direction: "asc" },
        ]}
      />,
    );
    // O chip antigo era um <button aria-label="Limpar ordenação"> que continha
    // a palavra "Ordenação". AppliedFiltersChips passou a cobrir esse caso.
    expect(
      screen.queryByRole("button", { name: /limpar ordenação/i }),
    ).not.toBeInTheDocument();
  });

  it("renderiza 'Mostrando X-Y de Z' com formato pt-BR", () => {
    render(
      <ConversasTable
        {...baseProps}
        initialRows={[baseRow(1, 100), baseRow(2, 101)]}
        total={7183}
        page={1}
        pageSize={1000}
        totalPages={8}
      />,
    );
    expect(screen.getByText(/Mostrando/)).toBeInTheDocument();
    expect(screen.getByText("1-1.000")).toBeInTheDocument();
    expect(screen.getByText(/7\.183/)).toBeInTheDocument();
  });

  it("'Mostrando X-Y de Z' clampa Y no total na última página", () => {
    render(
      <ConversasTable
        {...baseProps}
        initialRows={[baseRow(1, 100)]}
        total={7183}
        page={8}
        pageSize={1000}
        totalPages={8}
      />,
    );
    // Última página: de 7001 até 7183 (não 8000).
    expect(screen.getByText("7.001-7.183")).toBeInTheDocument();
  });

  it("paginação está no topo (data-tour=pagination-top)", () => {
    render(<ConversasTable {...baseProps} totalPages={3} />);
    const navs = screen.getAllByRole("navigation", { name: /paginação/i });
    expect(navs.length).toBe(1);
    const wrapper = navs[0]!.closest('[data-tour="pagination-top"]');
    expect(wrapper).toBeTruthy();
  });

  it("não tem paginação no rodapé (somente 1 nav role)", () => {
    render(<ConversasTable {...baseProps} totalPages={3} />);
    expect(
      screen.getAllByRole("navigation", { name: /paginação/i }).length,
    ).toBe(1);
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

  it("total=0 mostra '0 conversas' no toolbar", () => {
    render(
      <ConversasTable
        {...baseProps}
        initialRows={[]}
        total={0}
        totalPages={0}
      />,
    );
    expect(screen.getByText(/0 conversas/i)).toBeInTheDocument();
  });

  it("não renderiza mais o banner amarelo 'Mostrando primeiras 10000'", () => {
    render(<ConversasTable {...baseProps} totalPages={50} />);
    expect(screen.queryByText(/refine os filtros/i)).not.toBeInTheDocument();
  });

  it("limpa localStorage 'conversas-table-page-size' no mount", () => {
    localStorage.setItem("conversas-table-page-size", "100");
    render(<ConversasTable {...baseProps} />);
    expect(localStorage.getItem("conversas-table-page-size")).toBeNull();
  });
});
