/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import { Sparkles } from "lucide-react";

import { EmptyChartState } from "@/components/charts/empty-chart-state";

describe("EmptyChartState", () => {
  it("renderiza mensagem default e role status para a11y", () => {
    render(<EmptyChartState />);
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Sem dados para exibir")).toBeInTheDocument();
  });

  it("renderiza mensagem custom e hint", () => {
    render(<EmptyChartState message="Nada por aqui" hint="Ajuste filtros" />);
    expect(screen.getByText("Nada por aqui")).toBeInTheDocument();
    expect(screen.getByText("Ajuste filtros")).toBeInTheDocument();
  });

  it("respeita prop height (number e string)", () => {
    const { rerender } = render(<EmptyChartState height={250} />);
    expect(screen.getByRole("status")).toHaveStyle({ height: "250px" });

    rerender(<EmptyChartState height="50vh" />);
    expect(screen.getByRole("status")).toHaveStyle({ height: "50vh" });
  });

  it("aceita ícone customizado via prop icon", () => {
    const { container } = render(<EmptyChartState icon={Sparkles} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
