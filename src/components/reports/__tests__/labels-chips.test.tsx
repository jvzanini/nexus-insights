/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { LabelsChips } from "../labels-chips";

describe("LabelsChips", () => {
  it("renderiza '—' quando lista vazia", () => {
    render(<LabelsChips labels={[]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renderiza todas as labels (sem cap por padrão)", () => {
    render(
      <LabelsChips
        labels={[
          { name: "alpha" },
          { name: "beta" },
          { name: "gamma" },
          { name: "delta" },
          { name: "epsilon" },
        ]}
      />,
    );
    ["alpha", "beta", "gamma", "delta", "epsilon"].forEach((n) =>
      expect(screen.getByText(n)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });

  it("usa cap explícito quando `max` é definido", () => {
    render(
      <LabelsChips
        labels={[{ name: "a" }, { name: "b" }, { name: "c" }]}
        max={2}
      />,
    );
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
    expect(screen.queryByText("c")).toBeNull();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("não aplica cor inline (chip neutro)", () => {
    const { container } = render(<LabelsChips labels={[{ name: "x" }]} />);
    const chip = container.querySelector("span.bg-muted\\/40");
    expect(chip).toBeTruthy();
    // Garante que não há style inline com background-color (cor antiga).
    chip?.removeAttribute("title");
    expect((chip as HTMLElement).style.backgroundColor).toBe("");
  });
});
