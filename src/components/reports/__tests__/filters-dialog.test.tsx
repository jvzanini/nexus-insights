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
    countries: [],
    estados: [],
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
    countries: [],
    estados: [],
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

  test("'Limpar todos' (mode=simple) zera os 7 arrays simples e mantém modal aberto + período", () => {
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
      documentTypes: ["cpf"] satisfies ("cpf" | "cnpj" | "none")[],
      period: "mes_atual" as const,
      mode: "simple" as const,
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
    expect(next.documentTypes).toEqual([]);
    // Período e mode preservados
    expect(next.period).toBe("mes_atual");
    expect(next.mode).toBe("simple");
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

describe("FiltersDialog v0.32 T8 — AlertDialog ao trocar de tab com dados", () => {
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
    countries: [],
    estados: [],
  };

  beforeEach(() => jest.clearAllMocks());

  test("trocar tab sem dados (Simples vazio → Avançado) troca direto sem AlertDialog", () => {
    render(<FiltersDialog {...baseProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /avançado/i }));
    expect(
      screen.queryByText(/Trocar para filtro/i),
    ).not.toBeInTheDocument();
    // Header refletiu mudança de modo
    expect(screen.getByText(/Filtros avançados/i)).toBeInTheDocument();
  });

  test("trocar tab COM dados no Simples abre AlertDialog", () => {
    render(
      <FiltersDialog
        {...baseProps}
        applied={{ ...EMPTY_FILTER_STATE, inboxIds: [1] }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /avançado/i }));
    expect(
      screen.getByText(/Trocar para filtro Avançado/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/só pode usar um modo por vez/i),
    ).toBeInTheDocument();
  });

  test("Cancelar do AlertDialog mantém o tab origem", () => {
    render(
      <FiltersDialog
        {...baseProps}
        applied={{ ...EMPTY_FILTER_STATE, inboxIds: [1] }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /avançado/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    // Header continua "Filtros simples"
    expect(screen.getByText(/Filtros simples/i)).toBeInTheDocument();
  });

  test("Confirmar do AlertDialog troca tab e zera dados do origem", () => {
    const onApply = jest.fn();
    render(
      <FiltersDialog
        {...baseProps}
        applied={{ ...EMPTY_FILTER_STATE, inboxIds: [1], teamIds: [10] }}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /avançado/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar/i }));
    // Header agora "Filtros avançados"
    expect(screen.getByText(/Filtros avançados/i)).toBeInTheDocument();
    // Aplicar revela o draft zerado
    fireEvent.click(screen.getByRole("button", { name: /aplicar filtros/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const next = onApply.mock.calls[0][0];
    expect(next.mode).toBe("advanced");
    expect(next.inboxIds).toEqual([]);
    expect(next.teamIds).toEqual([]);
  });
});

describe("FiltersDialog v0.32 T9 — Limpar todos respeita tab ativo", () => {
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
    countries: [],
    estados: [],
  };

  beforeEach(() => jest.clearAllMocks());

  test("Limpar todos no Simples zera só simples (preserva conditionGroup)", () => {
    const onApply = jest.fn();
    const initial = {
      ...EMPTY_FILTER_STATE,
      inboxIds: [1],
      mode: "simple" as const,
      conditionGroup: {
        items: [
          {
            connector: undefined,
            node: { field: "status", operator: "eq" as const, value: 0 },
          },
        ],
      },
    };
    render(
      <FiltersDialog {...baseProps} applied={initial} onApply={onApply} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Limpar todos os filtros/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /aplicar filtros/i }));
    const next = onApply.mock.calls[0][0];
    expect(next.inboxIds).toEqual([]);
    // conditionGroup preservado
    expect(next.conditionGroup).toBeDefined();
    expect(next.conditionGroup.items).toHaveLength(1);
  });

  test("Limpar todos no Avançado zera só conditionGroup (preserva simples)", () => {
    const onApply = jest.fn();
    const initial = {
      ...EMPTY_FILTER_STATE,
      inboxIds: [1],
      teamIds: [10],
      mode: "advanced" as const,
      conditionGroup: {
        items: [
          {
            connector: undefined,
            node: { field: "status", operator: "eq" as const, value: 0 },
          },
        ],
      },
    };
    render(
      <FiltersDialog {...baseProps} applied={initial} onApply={onApply} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Limpar todos os filtros/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /aplicar filtros/i }));
    const next = onApply.mock.calls[0][0];
    // T9: conditionGroup zerado (undefined OU items vazio depois do reset).
    const cg = next.conditionGroup;
    expect(cg === undefined || (cg.items?.length ?? 0) === 0).toBe(true);
    // arrays simples preservados
    expect(next.inboxIds).toEqual([1]);
    expect(next.teamIds).toEqual([10]);
  });

  test("Limpar todos é desabilitado no Simples vazio (mesmo com conditionGroup)", () => {
    const initial = {
      ...EMPTY_FILTER_STATE,
      mode: "simple" as const,
      conditionGroup: {
        items: [
          {
            connector: undefined,
            node: { field: "status", operator: "eq" as const, value: 0 },
          },
        ],
      },
    };
    render(<FiltersDialog {...baseProps} applied={initial} />);
    expect(
      screen.getByRole("button", { name: /Limpar todos os filtros/i }),
    ).toBeDisabled();
  });

  test("Limpar todos é desabilitado no Avançado vazio (mesmo com inboxIds)", () => {
    const initial = {
      ...EMPTY_FILTER_STATE,
      inboxIds: [1],
      mode: "advanced" as const,
    };
    render(<FiltersDialog {...baseProps} applied={initial} />);
    expect(
      screen.getByRole("button", { name: /Limpar todos os filtros/i }),
    ).toBeDisabled();
  });
});
