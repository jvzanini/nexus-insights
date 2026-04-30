/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

import { AppliedFiltersChips } from "../applied-filters-chips";
import {
  EMPTY_FILTER_STATE,
  type FilterState,
} from "@/lib/reports/filter-state";

const META = {
  inboxes: [
    { id: 1, name: "AC-Acre" },
    { id: 2, name: "BA-Bahia" },
  ],
  teams: [
    { id: 10, name: "Suporte" },
    { id: 20, name: "Vendas" },
  ],
  assignees: [
    { id: 100, name: "João" },
    { id: 200, name: "Maria" },
  ],
};

function makeApplied(overrides: Partial<FilterState> = {}): FilterState {
  return { ...EMPTY_FILTER_STATE, ...overrides };
}

describe("AppliedFiltersChips", () => {
  it("nada renderizado quando estado vazio", () => {
    const { container } = render(
      <AppliedFiltersChips
        meta={META}
        applied={EMPTY_FILTER_STATE}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("chip com 1 selecionado mostra nome", () => {
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({ inboxIds: [1] })}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByText(/AC-Acre/)).toBeInTheDocument();
    expect(screen.getByText(/Caixa de entrada:/)).toBeInTheDocument();
  });

  it("chip com 3 selecionados mostra '+2' (1 nome + sufixo)", () => {
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({ assigneeIds: [100, 200, 999] })}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    // Texto consolidado: "Atendente: João +2" (1 chip + sufixo numérico)
    expect(screen.getByText("Atendente: João +2")).toBeInTheDocument();
  });

  it("renderiza chips para todas as categorias com seleção", () => {
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({
          inboxIds: [1],
          teamIds: [10],
          assigneeIds: [100],
          statuses: [0],
          priorities: [1],
        })}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByText(/Caixa de entrada:/)).toBeInTheDocument();
    expect(screen.getByText(/Departamento:/)).toBeInTheDocument();
    expect(screen.getByText(/Atendente:/)).toBeInTheDocument();
    expect(screen.getByText(/Status:/)).toBeInTheDocument();
    expect(screen.getByText(/Prioridade:/)).toBeInTheDocument();
  });

  it("clicar no X chama onRemove com a chave correta", () => {
    const onRemove = jest.fn();
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({ inboxIds: [1] })}
        onRemove={onRemove}
        onClearAll={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Remover Caixa de entrada/ }),
    );
    expect(onRemove).toHaveBeenCalledWith("inboxIds");
  });

  it("clicar no X de Departamento chama onRemove('teamIds')", () => {
    const onRemove = jest.fn();
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({ teamIds: [10, 20] })}
        onRemove={onRemove}
        onClearAll={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Remover Departamento/ }));
    expect(onRemove).toHaveBeenCalledWith("teamIds");
  });

  it("Limpar filtros chama onClearAll quando há filtros aplicados", () => {
    const onClearAll = jest.fn();
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({ statuses: [0, 1] })}
        onRemove={() => {}}
        onClearAll={onClearAll}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Limpar filtros/ }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it("renderiza chips de ordenação separadamente quando sortStack tem critérios", () => {
    const onRemoveSort = jest.fn();
    const onClearAllSort = jest.fn();
    render(
      <AppliedFiltersChips
        meta={META}
        applied={EMPTY_FILTER_STATE}
        onRemove={() => {}}
        onClearAll={() => {}}
        sortStack={[
          { key: "status", direction: "asc" },
          { key: "waiting_seconds", direction: "desc" },
        ]}
        sortOptions={[
          { key: "status", label: "Status" },
          { key: "waiting_seconds", label: "Sem resposta há" },
        ]}
        onRemoveSort={onRemoveSort}
        onClearAllSort={onClearAllSort}
      />,
    );
    // Os labels aparecem como chips de ordem (ícone + número + texto).
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Sem resposta há")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Remover ordenação por Status/,
      }),
    );
    expect(onRemoveSort).toHaveBeenCalledWith("status");
    fireEvent.click(
      screen.getByRole("button", { name: /Limpar ordenação/ }),
    );
    expect(onClearAllSort).toHaveBeenCalled();
  });

  it("status mostra label legível (não o id numérico)", () => {
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({ statuses: [1] })}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByText(/Status: Resolvida/)).toBeInTheDocument();
  });

  it("renderiza chip de Etiquetas com contagem quando há labelIds", () => {
    const onRemove = jest.fn();
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({ labelIds: [1, 2, 3] })}
        onRemove={onRemove}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByText(/Etiquetas \(3\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Remover Etiquetas/ }));
    expect(onRemove).toHaveBeenCalledWith("labelIds");
  });
});
