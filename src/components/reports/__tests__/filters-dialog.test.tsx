/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

import { FiltersDialog } from "../filters-dialog";
import { EMPTY_FILTER_STATE } from "@/lib/reports/filter-state";

describe("FiltersDialog (modo simples)", () => {
  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
    applied: EMPTY_FILTER_STATE,
    onApply: jest.fn(),
    onClear: jest.fn(),
    inboxes: [{ id: 1, name: "Geral" }],
    teams: [],
    assignees: [],
    labels: [{ id: 5, name: "VIP" }],
  };

  beforeEach(() => jest.clearAllMocks());

  test("renderiza grupos incluindo Etiquetas", () => {
    render(<FiltersDialog {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /Etiquetas/i }),
    ).toBeInTheDocument();
  });

  test("Aplicar é desabilitado quando draft é igual ao applied", () => {
    render(<FiltersDialog {...defaultProps} />);
    const applyBtn = screen.getByRole("button", { name: /aplicar filtros/i });
    expect(applyBtn).toBeDisabled();
  });

  test("Cancelar fecha sem aplicar", () => {
    render(<FiltersDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    expect(defaultProps.onApply).not.toHaveBeenCalled();
  });

  test("alternar para tab Avançado mostra o query builder", () => {
    render(<FiltersDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /avançado/i }));
    // O ConditionalFilters renderiza o botão "Adicionar condição".
    expect(
      screen.getByRole("button", { name: /Adicionar condição/i }),
    ).toBeInTheDocument();
  });
});

describe("FiltersDialog v0.23 — sections fechadas + Limpar isolado + header dinâmico", () => {
  const baseProps = {
    open: true,
    onOpenChange: jest.fn(),
    applied: EMPTY_FILTER_STATE,
    onApply: jest.fn(),
    onClear: jest.fn(),
    inboxes: [{ id: 1, name: "Geral" }],
    teams: [{ id: 10, name: "Suporte" }],
    assignees: [{ id: 100, name: "Ana" }],
    labels: [{ id: 5, name: "VIP" }],
  };

  beforeEach(() => jest.clearAllMocks());

  test("todas as sections começam fechadas (nenhum aria-expanded=true)", () => {
    render(<FiltersDialog {...baseProps} />);
    const sectionTitles = [
      /Caixa de entrada/i,
      /Departamento/i,
      /Atendente/i,
      /^Status$/i,
      /Prioridade/i,
      /Etiquetas/i,
    ];
    for (const re of sectionTitles) {
      const btn = screen.getByRole("button", { name: re });
      expect(btn).toHaveAttribute("aria-expanded", "false");
    }
  });

  test("'Limpar todos' zera só os filtros e mantém modal aberto + período/mode", () => {
    const onApply = jest.fn();
    const onOpenChange = jest.fn();
    const onClear = jest.fn();
    const initial = {
      ...EMPTY_FILTER_STATE,
      inboxIds: [1],
      teamIds: [10],
      assigneeIds: [100],
      statuses: [0, 1],
      priorities: [0],
      labelIds: [5],
      period: "mes_atual" as const,
      mode: "advanced" as const,
    };
    render(
      <FiltersDialog
        {...baseProps}
        applied={initial}
        onApply={onApply}
        onClear={onClear}
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Limpar todos os filtros/i }),
    );

    // Modal NÃO fecha
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // onClear externo NÃO é chamado (não toca período/ordenação fora)
    expect(onClear).not.toHaveBeenCalled();

    // Aplicar fica habilitado (draft mudou). Clicar revela o draft via onApply.
    const applyBtn = screen.getByRole("button", { name: /aplicar filtros/i });
    expect(applyBtn).not.toBeDisabled();
    fireEvent.click(applyBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
    const next = onApply.mock.calls[0][0];
    expect(next.inboxIds).toEqual([]);
    expect(next.teamIds).toEqual([]);
    expect(next.assigneeIds).toEqual([]);
    expect(next.statuses).toEqual([]);
    expect(next.priorities).toEqual([]);
    expect(next.labelIds).toEqual([]);
    // Período e mode preservados
    expect(next.period).toBe("mes_atual");
    expect(next.mode).toBe("advanced");
  });

  test("header mostra 'Filtros simples' quando mode === 'simple'", () => {
    render(
      <FiltersDialog
        {...baseProps}
        applied={{ ...EMPTY_FILTER_STATE, mode: "simple" }}
      />,
    );
    expect(screen.getByText(/Filtros simples/i)).toBeInTheDocument();
  });

  test("header mostra 'Filtros avançados' quando mode === 'advanced'", () => {
    render(
      <FiltersDialog
        {...baseProps}
        applied={{ ...EMPTY_FILTER_STATE, mode: "advanced" }}
      />,
    );
    expect(screen.getByText(/Filtros avançados/i)).toBeInTheDocument();
  });

  test("trocar tab atualiza o header dinamicamente (draft.mode)", () => {
    render(
      <FiltersDialog
        {...baseProps}
        applied={{ ...EMPTY_FILTER_STATE, mode: "simple" }}
      />,
    );
    expect(screen.getByText(/Filtros simples/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /avançado/i }));
    expect(screen.getByText(/Filtros avançados/i)).toBeInTheDocument();
  });
});
