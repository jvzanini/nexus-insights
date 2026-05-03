/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";

import { HighlightedText } from "@/lib/utils/highlight-text";

describe("HighlightedText", () => {
  it("sem term: texto original sem mark", () => {
    const { container } = render(<HighlightedText text="hello world" />);
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("hello world");
  });

  it("term vazio/whitespace: idem", () => {
    const { container } = render(<HighlightedText text="hello world" term="   " />);
    expect(container.querySelector("mark")).toBeNull();
  });

  it("text null: retorna null", () => {
    const { container } = render(<HighlightedText text={null} term="x" />);
    expect(container.firstChild).toBeNull();
  });

  it("term match único: envolve em <mark>", () => {
    const { container } = render(<HighlightedText text="hello world" term="world" />);
    const marks = container.querySelectorAll("mark");
    expect(marks.length).toBe(1);
    expect(marks[0]?.textContent).toBe("world");
  });

  it("case-insensitive", () => {
    const { container } = render(<HighlightedText text="HELLO World" term="hello" />);
    expect(container.querySelector("mark")?.textContent).toBe("HELLO");
  });

  it("multiple matches", () => {
    const { container } = render(<HighlightedText text="abc abc abc" term="abc" />);
    expect(container.querySelectorAll("mark").length).toBe(3);
  });

  it("substring match em ID hashtag (#1701 com term '170')", () => {
    const { container } = render(<HighlightedText text="#1701" term="170" />);
    expect(container.querySelector("mark")?.textContent).toBe("170");
  });

  it("term maior que texto: sem match", () => {
    const { container } = render(<HighlightedText text="abc" term="abcdef" />);
    expect(container.querySelector("mark")).toBeNull();
  });
});

describe("HighlightedText v0.25 — normalize NFD", () => {
  it("destaca match ignorando acentos (busca 'joao' destaca 'João')", () => {
    const { container } = render(
      <HighlightedText text="João Silva" term="joao" />,
    );
    const mark = container.querySelector("mark");
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe("João");
  });

  it("destaca match ignorando case (busca 'AçÃO' destaca 'ação')", () => {
    const { container } = render(
      <HighlightedText text="Plano de ação" term="AçÃO" />,
    );
    const mark = container.querySelector("mark");
    expect(mark?.textContent).toBe("ação");
  });

  it("preserva texto original com acentos no render", () => {
    const { container } = render(
      <HighlightedText text="São Paulo" term="sao" />,
    );
    expect(container.textContent).toBe("São Paulo");
  });

  it("texto sem term retorna texto cru", () => {
    const { container } = render(<HighlightedText text="abc" term="" />);
    expect(container.textContent).toBe("abc");
  });
});
