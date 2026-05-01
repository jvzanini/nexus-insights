/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import { DollarSign } from "lucide-react";

import { KpiCard } from "@/components/reports/kpi-card";

describe("KpiCard", () => {
  it("renderiza label, value e ícone (smoke test back-compat)", () => {
    render(<KpiCard icon={DollarSign} label="Custo total" value="R$ 12,34" />);
    expect(screen.getByText("Custo total")).toBeInTheDocument();
    expect(screen.getByText("R$ 12,34")).toBeInTheDocument();
  });

  it("renderiza hint quando fornecido (back-compat)", () => {
    render(
      <KpiCard
        icon={DollarSign}
        label="Custo"
        value="R$ 1,00"
        hint="Conversão BRL/USD"
      />,
    );
    expect(screen.getByText("Conversão BRL/USD")).toBeInTheDocument();
  });

  it("renderiza subtitle quando fornecido como string", () => {
    render(
      <KpiCard
        icon={DollarSign}
        label="Custo"
        value="R$ 12,34"
        subtitle="≈ 2,30 USD"
      />,
    );
    expect(screen.getByText("≈ 2,30 USD")).toBeInTheDocument();
  });

  it("renderiza subtitle quando fornecido como ReactNode complexo", () => {
    render(
      <KpiCard
        icon={DollarSign}
        label="Custo"
        value="R$ 12,34"
        subtitle={
          <>
            ≈ <strong data-testid="usd-value">2,30 USD</strong>
          </>
        }
      />,
    );
    expect(screen.getByTestId("usd-value")).toBeInTheDocument();
    expect(screen.getByTestId("usd-value")).toHaveTextContent("2,30 USD");
  });

  it("não renderiza subtitle quando ausente (back-compat)", () => {
    const { container } = render(
      <KpiCard icon={DollarSign} label="Custo" value="R$ 12,34" />,
    );
    // Sanity: não há texto adicional além de label + value.
    expect(container.querySelector('[data-slot="kpi-subtitle"]')).toBeNull();
  });

  it("aplica min-h-[128px] no container principal pra estabilidade em grid", () => {
    const { container } = render(
      <KpiCard icon={DollarSign} label="Custo" value="R$ 12,34" />,
    );
    expect(container.firstChild).toHaveClass("min-h-[128px]");
  });
});
