/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import {
  DonutWithCenter,
  DonutTooltipStacked,
  donutTooltipWrapperStyle,
} from "@/components/charts/donut-with-center";

// Recharts depende de medidas reais do container; mockamos `ResponsiveContainer`
// para um div com tamanho fixo de modo que o `<Pie>` seja renderizado.
jest.mock("recharts", () => {
  const actual = jest.requireActual("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="rc-container" style={{ width: 400, height: 320 }}>
        {children}
      </div>
    ),
  };
});

const SAMPLE = [
  { name: "OpenAI", value: 0.1234 },
  { name: "Anthropic", value: 0.4567 },
];

describe("DonutWithCenter — tooltipPosition prop", () => {
  it("renderiza centerValue e centerLabel", () => {
    render(
      <DonutWithCenter
        data={SAMPLE}
        centerLabel="Custo total"
        centerValue="R$ 0,5801"
      />,
    );
    expect(screen.getByText("R$ 0,5801")).toBeInTheDocument();
    expect(screen.getByText("Custo total")).toBeInTheDocument();
  });
});

describe("donutTooltipWrapperStyle()", () => {
  it("default top-right: top:8 right:8 sem left/bottom", () => {
    const style = donutTooltipWrapperStyle("top-right");
    expect(style.position).toBe("absolute");
    expect(style.zIndex).toBe(50);
    expect(style.top).toBe(8);
    expect(style.right).toBe(8);
    expect(style.left).toBeUndefined();
    expect(style.bottom).toBeUndefined();
    expect(style.pointerEvents).toBe("none");
  });

  it("top-left: top:8 left:8 sem right/bottom", () => {
    const style = donutTooltipWrapperStyle("top-left");
    expect(style.top).toBe(8);
    expect(style.left).toBe(8);
    expect(style.right).toBeUndefined();
    expect(style.bottom).toBeUndefined();
  });

  it("bottom-right: bottom:8 right:8 sem top/left", () => {
    const style = donutTooltipWrapperStyle("bottom-right");
    expect(style.bottom).toBe(8);
    expect(style.right).toBe(8);
    expect(style.top).toBeUndefined();
    expect(style.left).toBeUndefined();
  });

  it("bottom-left: bottom:8 left:8 sem top/right", () => {
    const style = donutTooltipWrapperStyle("bottom-left");
    expect(style.bottom).toBe(8);
    expect(style.left).toBe(8);
    expect(style.top).toBeUndefined();
    expect(style.right).toBeUndefined();
  });

  it("z-index 50 para ficar acima da legenda em todas as posições", () => {
    expect(donutTooltipWrapperStyle("top-left").zIndex).toBe(50);
    expect(donutTooltipWrapperStyle("top-right").zIndex).toBe(50);
    expect(donutTooltipWrapperStyle("bottom-left").zIndex).toBe(50);
    expect(donutTooltipWrapperStyle("bottom-right").zIndex).toBe(50);
  });
});

describe("DonutTooltipStacked", () => {
  it("não renderiza quando inactive", () => {
    const { container } = render(
      <DonutTooltipStacked
        active={false}
        payload={[{ name: "OpenAI", value: 0.1234, color: "#8b5cf6" }]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("não renderiza quando payload vazio", () => {
    const { container } = render(
      <DonutTooltipStacked active payload={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("quebra nome e valor em duas linhas (<p> separados)", () => {
    render(
      <DonutTooltipStacked
        active
        payload={[{ name: "OpenAI", value: 0.1234, color: "#8b5cf6" }]}
        formatValue={(v) => `R$ ${v.toFixed(4)} (10,5%)`}
      />,
    );
    const nameEl = screen.getByText("OpenAI");
    const valueEl = screen.getByText("R$ 0.1234 (10,5%)");
    expect(nameEl.tagName).toBe("P");
    expect(valueEl.tagName).toBe("P");
    expect(nameEl).not.toBe(valueEl);
  });

  it("aplica max-w-[180px], bg-popover, border-border, text-xs no container", () => {
    const { container } = render(
      <DonutTooltipStacked
        active
        payload={[{ name: "OpenAI", value: 0.1234, color: "#8b5cf6" }]}
        formatValue={(v) => `R$ ${v.toFixed(4)} (10,5%)`}
      />,
    );
    const root = container.firstElementChild as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root?.className).toContain("max-w-[180px]");
    expect(root?.className).toContain("bg-popover");
    expect(root?.className).toContain("border-border");
    expect(root?.className).toContain("text-xs");
  });

  it("nome em font-medium e valor em text-muted-foreground", () => {
    render(
      <DonutTooltipStacked
        active
        payload={[{ name: "OpenAI", value: 0.1234, color: "#8b5cf6" }]}
        formatValue={(v) => `R$ ${v.toFixed(4)} (10,5%)`}
      />,
    );
    const nameEl = screen.getByText("OpenAI");
    const valueEl = screen.getByText("R$ 0.1234 (10,5%)");
    expect(nameEl.className).toContain("font-medium");
    expect(valueEl.className).toContain("text-muted-foreground");
  });

  it("aplica role=tooltip para a11y", () => {
    render(
      <DonutTooltipStacked
        active
        payload={[{ name: "OpenAI", value: 0.1234, color: "#8b5cf6" }]}
      />,
    );
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("formata valor numérico em pt-BR quando formatValue não fornecido", () => {
    render(
      <DonutTooltipStacked
        active
        payload={[{ name: "OpenAI", value: 1234, color: "#8b5cf6" }]}
      />,
    );
    expect(screen.getByText("1.234")).toBeInTheDocument();
  });
});
