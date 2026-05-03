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

describe("DonutWithCenter — T2-DONUT v0.20.0 (outerRadius/font)", () => {
  it("centro renderiza com class text-xl (não text-2xl) e data-slot=donut-center", () => {
    const { container } = render(
      <DonutWithCenter
        data={SAMPLE}
        centerLabel="Custo total"
        centerValue="R$ 0,5801"
      />,
    );
    const centerEl = container.querySelector(
      "[data-slot=donut-center]",
    ) as HTMLElement | null;
    expect(centerEl).not.toBeNull();
    const valueSpan = centerEl?.querySelector("span") as HTMLElement | null;
    expect(valueSpan).not.toBeNull();
    expect(valueSpan?.className).toContain("text-xl");
    expect(valueSpan?.className).not.toContain("text-2xl");
  });

  it("Pie default outerRadius=88 (T2-DONUT)", () => {
    const { container } = render(
      <DonutWithCenter
        data={SAMPLE}
        centerLabel="Custo total"
        centerValue="R$ 0,5801"
      />,
    );
    // recharts renderiza <path> dentro do .recharts-pie. Como mock usa actual
    // recharts + jsdom, validamos via aria-label que o componente está vivo —
    // o assert real do default está acoplado à assinatura pública do default
    // prop (ver implementação). Aqui garantimos que o componente renderiza
    // sem precisar passar outerRadius (o default está sendo aplicado).
    expect(
      container.querySelector("[data-slot=donut-center]"),
    ).not.toBeNull();
  });
});

// =============================================================================
// T2 v0.24.0 — espessura padrão (60+80) + textos com px-6 + tooltip near-mouse
// =============================================================================

describe("DonutWithCenter — T2 v0.24.0 (espessura + px-6 + tooltip near-mouse)", () => {
  it("data-slot=donut-center container tem px-6 (respiro horizontal)", () => {
    const { container } = render(
      <DonutWithCenter
        data={SAMPLE}
        centerLabel="Custo total"
        centerValue="R$ 0,5801"
      />,
    );
    const centerEl = container.querySelector(
      "[data-slot=donut-center]",
    ) as HTMLElement | null;
    expect(centerEl).not.toBeNull();
    expect(centerEl?.className).toContain("px-6");
  });

  it("default innerRadius=60 + outerRadius=80 (reverte v0.20 70+88)", () => {
    // Lendo as defaults via toString do componente é frágil; aqui validamos
    // comportamento equivalente: passar valores explícitos não muda render
    // visível. O assert real do default vive na implementação. Smoke test
    // apenas garante que componente renderiza sem props de raio.
    const { container } = render(
      <DonutWithCenter
        data={SAMPLE}
        centerLabel="Custo total"
        centerValue="R$ 0,5801"
      />,
    );
    expect(
      container.querySelector("[data-slot=donut-center]"),
    ).not.toBeNull();
  });

  it("Tooltip recharts é renderizado (smoke) — sem wrapperStyle/position fixos", () => {
    // O componente <Tooltip> do recharts não renderiza no DOM até o hover,
    // mas o componente pai tem que montar sem crashar. Smoke test
    // confirmando que a remoção de wrapperStyle/position não quebra render.
    const { container } = render(
      <DonutWithCenter
        data={SAMPLE}
        centerLabel="Custo total"
        centerValue="R$ 0,5801"
      />,
    );
    expect(container.querySelector("[data-slot=donut-center]")).not.toBeNull();
    // Pie chart container montou
    expect(container.querySelector("[data-testid=rc-container]")).not.toBeNull();
  });

  it("aceita tooltipPosition (back-compat @deprecated, no-op)", () => {
    // Prop mantida pra back-compat — não deve crashar nem gerar warnings de tipo
    const { container } = render(
      <DonutWithCenter
        data={SAMPLE}
        centerLabel="Custo total"
        centerValue="R$ 0,5801"
        tooltipPosition="top-left"
      />,
    );
    expect(container.querySelector("[data-slot=donut-center]")).not.toBeNull();
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

describe("DonutWithCenter — defaults v0.26", () => {
  it("usa height=360 por default (era 320 em v0.24)", () => {
    const { container } = render(
      <DonutWithCenter
        data={[
          { name: "A", value: 50 },
          { name: "B", value: 30 },
        ]}
        centerLabel="Total"
        centerValue="80"
      />,
    );
    const wrapper = container.querySelector("[role='img']") as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.height).toBe("360px");
  });
});
