/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { LoadingOverlay } from "@/components/reports/loading-overlay";

describe("LoadingOverlay", () => {
  it("não renderiza quando show=false", () => {
    render(<LoadingOverlay show={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renderiza com label default 'Carregando conversas...'", () => {
    render(<LoadingOverlay show={true} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-label", "Carregando conversas...");
  });

  it("aceita label customizado", () => {
    render(<LoadingOverlay show={true} label="Buscando..." />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Buscando...");
  });

  it("renderiza texto do label visível", () => {
    render(<LoadingOverlay show={true} label="Gerando planilha..." />);
    expect(screen.getByText("Gerando planilha...")).toBeInTheDocument();
  });
});
