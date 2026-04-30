/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import { InteractiveRadialBarChart } from "@/components/charts/radial-bar-chart";

describe("InteractiveRadialBarChart", () => {
  it("renderiza valor central como percentual arredondado", () => {
    render(<InteractiveRadialBarChart value={73.4} max={100} />);
    expect(screen.getByText("73%")).toBeInTheDocument();
  });

  it("renderiza label quando fornecida", () => {
    render(
      <InteractiveRadialBarChart value={50} max={100} label="SLA cumprido" />,
    );
    expect(screen.getByText("SLA cumprido")).toBeInTheDocument();
  });

  it("usa formatValue customizado quando fornecido", () => {
    render(
      <InteractiveRadialBarChart
        value={42}
        max={50}
        formatValue={(v, m) => `${v}/${m}`}
      />,
    );
    expect(screen.getByText("42/50")).toBeInTheDocument();
  });

  it("clipa value > max em max", () => {
    render(<InteractiveRadialBarChart value={150} max={100} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("clipa value negativo em 0", () => {
    render(<InteractiveRadialBarChart value={-5} max={100} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("aplica role img + aria-label descritivo", () => {
    render(
      <InteractiveRadialBarChart value={80} max={100} label="CSAT" />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("aria-label", expect.stringContaining("CSAT"));
    expect(img).toHaveAttribute("aria-label", expect.stringContaining("80%"));
  });
});
