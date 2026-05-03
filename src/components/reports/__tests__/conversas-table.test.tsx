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

// v0.25: paginação é UI client-side, baseProps usa os novos props
// (pageClient, pageSizeClient, onPageClientChange, onFilteredCountChange,
// searchClient). pageSize default = 100 (o que ConversasPageClient usa).
const baseProps = {
  initialRows: [baseRow(1, 100)],
  pageClient: 1,
  pageSizeClient: 100,
  onPageClientChange: jest.fn(),
  onFilteredCountChange: jest.fn(),
  accountId: 9,
  filters: { period: { start: new Date(), end: new Date() } } as any,
  sortStack: [],
  onSortStackChange: () => {},
  searchClient: "",
};

describe("ConversasTable v3 (paginação)", () => {
  beforeEach(() => {
    localStorage.clear();
    baseProps.onPageClientChange = jest.fn();
    baseProps.onFilteredCountChange = jest.fn();
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
    // v0.25: pageSize=1000 + 1100 rows na primeira página → "1-1.000 de 1.100"
    const rows = Array.from({ length: 1100 }, (_, i) =>
      baseRow(i + 1, i + 100),
    );
    render(
      <ConversasTable
        {...baseProps}
        initialRows={rows}
        pageClient={1}
        pageSizeClient={1000}
      />,
    );
    expect(screen.getByText(/Mostrando/)).toBeInTheDocument();
    expect(screen.getByText("1-1.000")).toBeInTheDocument();
    expect(screen.getByText(/1\.100/)).toBeInTheDocument();
  });

  it("'Mostrando X-Y de Z' clampa Y no total na última página", () => {
    // v0.25: pageSize=1000 com 7183 rows na página 8 → "7.001-7.183"
    const rows = Array.from({ length: 7183 }, (_, i) =>
      baseRow(i + 1, i + 100),
    );
    render(
      <ConversasTable
        {...baseProps}
        initialRows={rows}
        pageClient={8}
        pageSizeClient={1000}
      />,
    );
    expect(screen.getByText("7.001-7.183")).toBeInTheDocument();
  });

  it("paginação está no topo (data-tour=pagination-top)", () => {
    // v0.25: 250 rows com pageSize=100 → 3 páginas
    const rows = Array.from({ length: 250 }, (_, i) =>
      baseRow(i + 1, i + 100),
    );
    render(<ConversasTable {...baseProps} initialRows={rows} />);
    const navs = screen.getAllByRole("navigation", { name: /paginação/i });
    expect(navs.length).toBe(1);
    const wrapper = navs[0]!.closest('[data-tour="pagination-top"]');
    expect(wrapper).toBeTruthy();
  });

  it("não tem paginação no rodapé (somente 1 nav role)", () => {
    const rows = Array.from({ length: 250 }, (_, i) =>
      baseRow(i + 1, i + 100),
    );
    render(<ConversasTable {...baseProps} initialRows={rows} />);
    expect(
      screen.getAllByRole("navigation", { name: /paginação/i }).length,
    ).toBe(1);
  });

  it("não renderiza ConversasPagination quando totalPages <= 1", () => {
    // v0.25: 50 rows com pageSize=100 → 1 página → sem nav.
    render(<ConversasTable {...baseProps} />);
    expect(
      screen.queryByRole("navigation", { name: /paginação/i }),
    ).not.toBeInTheDocument();
  });

  it("click em página chama onPageClientChange", () => {
    const cb = jest.fn();
    const rows = Array.from({ length: 250 }, (_, i) =>
      baseRow(i + 1, i + 100),
    );
    render(
      <ConversasTable
        {...baseProps}
        initialRows={rows}
        onPageClientChange={cb}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ir para página 2/i }));
    expect(cb).toHaveBeenCalledWith(2);
  });

  it("total=0 mostra '0 conversas' no toolbar", () => {
    render(<ConversasTable {...baseProps} initialRows={[]} />);
    expect(screen.getByText(/0 conversas/i)).toBeInTheDocument();
  });

  it("não renderiza mais o banner amarelo 'Mostrando primeiras 10000'", () => {
    const rows = Array.from({ length: 5000 }, (_, i) =>
      baseRow(i + 1, i + 100),
    );
    render(<ConversasTable {...baseProps} initialRows={rows} />);
    expect(screen.queryByText(/refine os filtros/i)).not.toBeInTheDocument();
  });

  it("limpa localStorage 'conversas-table-page-size' no mount", () => {
    localStorage.setItem("conversas-table-page-size", "100");
    render(<ConversasTable {...baseProps} />);
    expect(localStorage.getItem("conversas-table-page-size")).toBeNull();
  });
});

// =====================================================================
// v0.25: pipeline client-side (search + paginação UI)
// =====================================================================

describe("ConversasTable v0.25 — pipeline client", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("filtra por searchClient e mostra contador correto", () => {
    const rows: ConversaRow[] = [
      { ...baseRow(1, 11), contact: { ...baseRow(1, 11).contact, name: "Ana" } },
      {
        ...baseRow(2, 22),
        contact: { ...baseRow(2, 22).contact, name: "Beto" },
      },
      {
        ...baseRow(3, 33),
        contact: { ...baseRow(3, 33).contact, name: "Carlos" },
      },
    ];
    render(
      <ConversasTable
        {...baseProps}
        initialRows={rows}
        searchClient="ana"
      />,
    );
    expect(screen.getByText("1-1")).toBeInTheDocument();
    // Total filtrado é 1 → "conversa" (singular). Verifica via label do <span>.
    const counter = screen.getByText(/Mostrando/i).closest("span");
    expect(counter?.textContent).toMatch(/Mostrando\s*1-1\s*de\s*1\s*conversa$/);
  });

  it("paginação client: 250 rows com pageSize=100 → atual=2 mostra 101-200", () => {
    const rows = Array.from({ length: 250 }, (_, i) =>
      baseRow(i + 1, i + 100),
    );
    render(
      <ConversasTable
        {...baseProps}
        initialRows={rows}
        pageClient={2}
        pageSizeClient={100}
      />,
    );
    expect(screen.getByText("101-200")).toBeInTheDocument();
    // Total fica espalhado em <strong> separado — verifica via textContent
    // do span pai do "Mostrando" pra evitar match ambíguo com "#250" do link.
    const counter = screen.getByText(/Mostrando/i).closest("span");
    expect(counter?.textContent).toMatch(/de\s*250/);
  });

  it("empty state com search ativa sugere limpar busca", () => {
    render(
      <ConversasTable
        {...baseProps}
        initialRows={[baseRow(1, 100)]}
        searchClient="zzznaoexiste"
      />,
    );
    expect(screen.getByText(/limpe a busca/i)).toBeInTheDocument();
  });

  it("tabela tem table-layout: fixed e <colgroup> (v0.27 T7)", () => {
    const { container } = render(
      <ConversasTable {...baseProps} initialRows={[baseRow(1, 100)]} />,
    );
    const table = container.querySelector("table");
    expect(table?.style.tableLayout).toBe("fixed");
    const colgroup = container.querySelector("colgroup");
    expect(colgroup).not.toBeNull();
    const cols = colgroup?.querySelectorAll("col");
    expect(cols && cols.length).toBeGreaterThan(0);
  });

  it("highlight roxo aparece em colunas matched", () => {
    const { container } = render(
      <ConversasTable
        {...baseProps}
        initialRows={[
          {
            ...baseRow(1, 100),
            contact: { ...baseRow(1, 100).contact, name: "João" },
          },
        ]}
        searchClient="João"
      />,
    );
    const marks = container.querySelectorAll("mark");
    expect(marks.length).toBeGreaterThan(0);
  });
});
