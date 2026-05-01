/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import { StatusChip } from "../status-chip";

describe("StatusChip", () => {
  it("renderiza estado active com texto e ícone", () => {
    render(<StatusChip status="active" />);
    const chip = screen.getByTestId("status-chip");
    expect(chip).toHaveAttribute("data-status", "active");
    expect(chip).toHaveTextContent("Ativo");
  });

  it("renderiza estado disabled", () => {
    render(<StatusChip status="disabled" />);
    const chip = screen.getByTestId("status-chip");
    expect(chip).toHaveAttribute("data-status", "disabled");
    expect(chip).toHaveTextContent("Desativado");
  });

  it("renderiza estado error", () => {
    render(<StatusChip status="error" />);
    const chip = screen.getByTestId("status-chip");
    expect(chip).toHaveAttribute("data-status", "error");
    expect(chip).toHaveTextContent("Erro");
  });
});
