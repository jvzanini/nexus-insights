/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

import { CollapsibleSection } from "@/components/ui/collapsible-section";

describe("CollapsibleSection", () => {
  it("começa colapsado e abre ao clicar no header", () => {
    render(
      <CollapsibleSection title="Caixa de entrada" count={3}>
        <div>conteúdo</div>
      </CollapsibleSection>,
    );
    expect(screen.queryByText("conteúdo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Caixa de entrada/ }));
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });

  it("count badge aparece quando > 0", () => {
    render(<CollapsibleSection title="X" count={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("count badge oculto quando = 0", () => {
    render(<CollapsibleSection title="X" count={0} />);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("aria-expanded reflete estado", () => {
    render(
      <CollapsibleSection title="Header">
        <div>body</div>
      </CollapsibleSection>,
    );
    const btn = screen.getByRole("button", { name: /Header/ });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});
