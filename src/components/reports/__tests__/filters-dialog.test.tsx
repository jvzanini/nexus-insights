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
});
