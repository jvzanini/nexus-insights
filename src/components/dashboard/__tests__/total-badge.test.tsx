/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import { TotalBadge } from "../total-badge";

describe("TotalBadge", () => {
  it("renderiza número formatado em pt-BR (separador milhar)", () => {
    render(<TotalBadge n={1234} />);
    expect(screen.getByText("1.234")).toBeInTheDocument();
  });

  it("aplica classe de pill violeta", () => {
    render(<TotalBadge n={5} />);
    const el = screen.getByText("5");
    expect(el).toHaveClass("bg-violet-500/10");
    expect(el).toHaveClass("text-violet-300");
  });

  it("renderiza 0 sem fallback", () => {
    render(<TotalBadge n={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("usa font-mono tabular-nums para alinhamento numérico", () => {
    render(<TotalBadge n={42} />);
    const el = screen.getByText("42");
    expect(el).toHaveClass("font-mono");
    expect(el).toHaveClass("tabular-nums");
  });
});
