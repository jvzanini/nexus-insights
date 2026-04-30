/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import { DonutWithCenter } from "@/components/charts/donut-with-center";
import { InteractiveAreaChart } from "@/components/charts/area-chart";
import { InteractiveBarChart } from "@/components/charts/bar-chart";
import { InteractivePieChart } from "@/components/charts/pie-chart";

/**
 * Smoke tests: garantem que os componentes "interativos" delegam corretamente
 * para o EmptyChartState quando recebem dataset vazio (ou todo zero/negativo).
 *
 * Não tentamos renderizar Recharts em jsdom (depende de width medida) — esse
 * caminho é validado em produção via storybook/visual e em testes de
 * integração futuros.
 */
describe("Charts (empty path)", () => {
  it("InteractivePieChart mostra empty state quando todos os valores são 0", () => {
    render(
      <InteractivePieChart
        data={[
          { name: "A", value: 0 },
          { name: "B", value: 0 },
        ]}
        emptyMessage="Nada aqui"
      />,
    );
    expect(screen.getByText("Nada aqui")).toBeInTheDocument();
  });

  it("DonutWithCenter mostra empty state quando data está vazio", () => {
    render(
      <DonutWithCenter
        data={[]}
        centerLabel="Total"
        centerValue="0"
        emptyMessage="Sem dados ainda"
      />,
    );
    expect(screen.getByText("Sem dados ainda")).toBeInTheDocument();
  });

  it("InteractiveBarChart mostra empty state quando todas séries somam 0", () => {
    render(
      <InteractiveBarChart
        data={[
          { name: "Jan", abertas: 0, resolvidas: 0 },
          { name: "Fev", abertas: 0, resolvidas: 0 },
        ]}
        series={[
          { key: "abertas", label: "Em aberto" },
          { key: "resolvidas", label: "Resolvidas" },
        ]}
        emptyMessage="Sem volume"
      />,
    );
    expect(screen.getByText("Sem volume")).toBeInTheDocument();
  });

  it("InteractiveAreaChart mostra empty state quando series está vazio", () => {
    render(
      <InteractiveAreaChart
        data={[{ name: "Jan", v: 1 }]}
        series={[]}
        emptyMessage="Configure séries"
      />,
    );
    expect(screen.getByText("Configure séries")).toBeInTheDocument();
  });
});
