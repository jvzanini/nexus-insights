/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";

import { SuggestionsBar } from "../suggestions-bar";

describe("SuggestionsBar (v0.31)", () => {
  it("renderiza nada quando suggestions=[]", () => {
    const { container } = render(<SuggestionsBar suggestions={[]} onPick={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renderiza um botão por sugestão", () => {
    render(<SuggestionsBar suggestions={["A", "B", "C"]} onPick={jest.fn()} />);
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "B" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "C" })).toBeInTheDocument();
  });

  it("click chama onPick com a sugestão", () => {
    const onPick = jest.fn();
    render(<SuggestionsBar suggestions={["A"]} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    expect(onPick).toHaveBeenCalledWith("A");
  });

  it("group tem aria-label 'Sugestões clicáveis'", () => {
    render(<SuggestionsBar suggestions={["A"]} onPick={jest.fn()} />);
    expect(screen.getByRole("group", { name: /Sugestões clicáveis/i })).toBeInTheDocument();
  });

  it("botões usam classes violet (chip outline)", () => {
    render(<SuggestionsBar suggestions={["A"]} onPick={jest.fn()} />);
    const btn = screen.getByRole("button", { name: "A" });
    expect(btn.className).toMatch(/violet/);
    expect(btn.className).toMatch(/rounded-full/);
  });
});
