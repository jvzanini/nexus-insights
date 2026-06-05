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

  it("T15 v0.23: NÃO renderiza mais botões 'Limpar filtros' e 'Limpar ordenação' (movidos para X adesivo no chip do toolbar)", () => {
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({ statuses: [0, 1] })}
        onRemove={() => {}}
        onClearAll={() => {}}
        sortStack={[{ key: "status", direction: "asc" }]}
        sortOptions={[{ key: "status", label: "Status" }]}
        onRemoveSort={() => {}}
        onClearAllSort={() => {}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Limpar filtros/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Limpar ordenação/ }),
    ).not.toBeInTheDocument();
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
    // T15 v0.23: botão "Limpar ordenação" foi removido — agora vive como X
    // adesivo no chip do toolbar (advanced-filters.tsx).
    expect(
      screen.queryByRole("button", { name: /Limpar ordenação/ }),
    ).not.toBeInTheDocument();
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

  it("renderiza chip Documento quando documentTypes preenchido (1 tipo)", () => {
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({ documentTypes: ["cpf"] })}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByText(/Documento: Com CPF/)).toBeInTheDocument();
  });

  it("renderiza chip Documento com sufixo +N quando 2+ tipos", () => {
    const onRemoveOne = jest.fn();
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({ documentTypes: ["cpf", "cnpj"] })}
        onRemove={() => {}}
        onClearAll={() => {}}
        onRemoveOne={onRemoveOne}
      />,
    );
    const trigger = screen
      .getAllByRole("button")
      .find((b) => /Documento: Com CPF/.test(b.textContent ?? ""));
    expect(trigger).toBeTruthy();
    expect(trigger?.textContent).toMatch(/\+1/);
  });

  it("X do chip Documento chama onRemove('documentTypes')", () => {
    const onRemove = jest.fn();
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({ documentTypes: ["none"] })}
        onRemove={onRemove}
        onClearAll={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Remover Documento/ }));
    expect(onRemove).toHaveBeenCalledWith("documentTypes");
  });

  it("renderiza chip País quando countries preenchido (1 valor)", () => {
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({ countries: ["Brasil"] })}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByText(/País: Brasil/)).toBeInTheDocument();
  });

  it("renderiza chip Estado/Cidade quando estados preenchido (1 valor)", () => {
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({ estados: ["MG-Minas Gerais"] })}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByText(/Estado\/Cidade: MG-Minas Gerais/)).toBeInTheDocument();
  });

  it("renderiza chip Estado/Cidade com sufixo +N quando 2+ valores", () => {
    const onRemoveOneString = jest.fn();
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({
          estados: ["MG-Minas Gerais", "SP-São Paulo", "RJ-Rio de Janeiro"],
        })}
        onRemove={() => {}}
        onClearAll={() => {}}
        onRemoveOneString={onRemoveOneString}
      />,
    );
    const trigger = screen
      .getAllByRole("button")
      .find((b) => /Estado\/Cidade: MG-Minas Gerais/.test(b.textContent ?? ""));
    expect(trigger).toBeTruthy();
    expect(trigger?.textContent).toMatch(/\+2/);
  });

  it("X do chip País chama onRemove('countries')", () => {
    const onRemove = jest.fn();
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({ countries: ["Brasil"] })}
        onRemove={onRemove}
        onClearAll={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Remover País/ }));
    expect(onRemove).toHaveBeenCalledWith("countries");
  });

  it("popover +N de estados remove valor string via onRemoveOneString", () => {
    const onRemoveOneString = jest.fn();
    render(
      <AppliedFiltersChips
        meta={META}
        applied={makeApplied({
          estados: ["MG-Minas Gerais", "SP-São Paulo"],
        })}
        onRemove={() => {}}
        onClearAll={() => {}}
        onRemoveOneString={onRemoveOneString}
      />,
    );
    const trigger = screen
      .getAllByRole("button")
      .find((b) => /Estado\/Cidade: MG-Minas Gerais/.test(b.textContent ?? ""));
    fireEvent.click(trigger!);
    fireEvent.click(
      screen.getByRole("button", { name: /Remover SP-São Paulo/ }),
    );
    expect(onRemoveOneString).toHaveBeenCalledWith("estados", "SP-São Paulo");
  });

  it("Etiquetas seguem padrão summarize (sem parênteses)", () => {
    render(
      <AppliedFiltersChips
        meta={{
          inboxes: [],
          teams: [],
          assignees: [],
          labels: [
            { id: 1, name: "hg" },
            { id: 2, name: "vip" },
            { id: 3, name: "novo" },
            { id: 4, name: "bloqueado" },
          ],
        }}
        applied={{ ...EMPTY_FILTER_STATE, labelIds: [1, 2, 3, 4] }}
        onRemove={() => {}}
        onClearAll={() => {}}
        onRemoveOne={() => {}}
      />,
    );
    expect(screen.queryByText(/Etiquetas \(4\)/)).toBeNull();
    // "Etiquetas: hg" + "+3" são spans separados — verificar texto agregado
    // do botão (popover trigger).
    const trigger = screen
      .getAllByRole("button")
      .find((b) => /Etiquetas: hg/.test(b.textContent ?? ""));
    expect(trigger).toBeTruthy();
    expect(trigger?.textContent).toMatch(/Etiquetas: hg/);
    expect(trigger?.textContent).toMatch(/\+3/);
  });

});
