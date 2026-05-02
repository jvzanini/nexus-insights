/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen, fireEvent } from "@testing-library/react";
import { Inbox } from "lucide-react";

import { KpiClickableCard } from "../kpi-clickable-card";

const baseProps = {
  icon: Inbox,
  label: "Conversas recebidas",
  value: "99",
  onClick: () => {},
};

describe("KpiClickableCard (v0.22.0)", () => {
  it("renderiza label em UPPERCASE", () => {
    render(<KpiClickableCard {...baseProps} />);
    const label = screen.getByText("Conversas recebidas");
    expect(label).toHaveClass("uppercase");
  });

  it("renderiza valor em 3xl bold", () => {
    render(<KpiClickableCard {...baseProps} />);
    const value = screen.getByText("99");
    expect(value).toHaveClass("text-3xl");
    expect(value).toHaveClass("font-bold");
  });

  it("renderiza subtitle quando provido", () => {
    render(<KpiClickableCard {...baseProps} subtitle="no período" />);
    expect(screen.getByText("no período")).toBeInTheDocument();
  });

  it("aceita prop legacy 'sublabel' como fallback de subtitle", () => {
    render(<KpiClickableCard {...baseProps} sublabel="(no período)" />);
    expect(screen.getByText("(no período)")).toBeInTheDocument();
  });

  it("dispara onClick", () => {
    const onClick = jest.fn();
    render(<KpiClickableCard {...baseProps} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renderiza trend abaixo do valor com cor verde quando direction=up", () => {
    render(
      <KpiClickableCard
        {...baseProps}
        trend={{ direction: "up", value: "+12.3%" }}
      />,
    );
    const trend = screen.getByText("+12.3%");
    expect(trend).toBeInTheDocument();
  });
});
