/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import {
  ChartTooltip,
  type ChartTooltipPayloadItem,
} from "@/components/charts/chart-tooltip";

const PAYLOAD: ChartTooltipPayloadItem[] = [
  { name: "Resolvidas", value: 120, color: "#10b981", dataKey: "resolvidas" },
  { name: "Em aberto", value: 30, color: "#f59e0b", dataKey: "abertas" },
];

describe("ChartTooltip", () => {
  it("não renderiza nada quando inactive", () => {
    const { container } = render(
      <ChartTooltip active={false} payload={PAYLOAD} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("não renderiza nada quando payload vazio", () => {
    const { container } = render(<ChartTooltip active payload={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renderiza role tooltip + label + entries com valor formatado pt-BR", () => {
    render(<ChartTooltip active payload={PAYLOAD} label="Hoje" />);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText("Hoje")).toBeInTheDocument();
    expect(screen.getByText("Resolvidas")).toBeInTheDocument();
    expect(screen.getByText("Em aberto")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("aplica formatValue customizado", () => {
    render(
      <ChartTooltip
        active
        payload={[{ name: "Taxa", value: 72.5, color: "#8b5cf6" }]}
        formatValue={(v) => `${v.toFixed(1)}%`}
      />,
    );
    expect(screen.getByText("72.5%")).toBeInTheDocument();
  });

  it("renderiza footer quando fornecido", () => {
    render(
      <ChartTooltip active payload={PAYLOAD} footer="Total: 150" label="Hoje" />,
    );
    expect(screen.getByText("Total: 150")).toBeInTheDocument();
  });

  it("converte values string para number antes de formatar", () => {
    render(
      <ChartTooltip
        active
        payload={[{ name: "X", value: "1234" as unknown as number, color: "#000" }]}
      />,
    );
    expect(screen.getByText("1.234")).toBeInTheDocument();
  });
});
