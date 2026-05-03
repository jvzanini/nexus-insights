/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render } from "@testing-library/react";
import type React from "react";

import { InteractiveBarChart } from "@/components/charts/bar-chart";

jest.mock("recharts", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");

  const captured: {
    xAxisProps: Array<Record<string, unknown>>;
    yAxisProps: Array<Record<string, unknown>>;
  } = { xAxisProps: [], yAxisProps: [] };

  function ResponsiveContainer({
    children,
  }: {
    children: React.ReactNode;
    width?: number | string;
    height?: number | string;
  }) {
    return ReactActual.createElement("div", {
      "data-testid": "responsive",
      children,
    });
  }

  function BarChart({ children }: { children: React.ReactNode }) {
    return ReactActual.createElement("div", {
      "data-testid": "bar-chart",
      children,
    });
  }

  function XAxis(props: Record<string, unknown>) {
    captured.xAxisProps.push(props);
    return null;
  }

  function YAxis(props: Record<string, unknown>) {
    captured.yAxisProps.push(props);
    return null;
  }

  function NoOp() {
    return null;
  }

  return {
    __esModule: true,
    __captured: captured,
    Bar: NoOp,
    BarChart,
    CartesianGrid: NoOp,
    Legend: NoOp,
    ResponsiveContainer,
    Tooltip: NoOp,
    XAxis,
    YAxis,
  };
});

type CapturedShape = {
  xAxisProps: Array<Record<string, unknown>>;
  yAxisProps: Array<Record<string, unknown>>;
};

function getCaptured(): CapturedShape {
  const mod = jest.requireMock("recharts") as {
    __captured: CapturedShape;
  };
  return mod.__captured;
}

beforeEach(() => {
  const cap = getCaptured();
  cap.xAxisProps.length = 0;
  cap.yAxisProps.length = 0;
});

describe("InteractiveBarChart — eixo X/Y props (vertical)", () => {
  const baseData = [
    { name: "Jan", v: 10 },
    { name: "Fev", v: 20 },
  ];
  const baseSeries = [{ key: "v", label: "Valor" }];

  it("defaults: xAxisFontSize=13, tickMargin=12", () => {
    render(<InteractiveBarChart data={baseData} series={baseSeries} />);
    const x = getCaptured().xAxisProps[0];
    expect(x.fontSize).toBe(13);
    expect(x.tickMargin).toBe(12);
  });

  it("aplica xAxisFontSize/xAxisPadding customizados", () => {
    render(
      <InteractiveBarChart
        data={baseData}
        series={baseSeries}
        xAxisFontSize={14}
        xAxisPadding={16}
      />,
    );
    const x = getCaptured().xAxisProps[0];
    expect(x.fontSize).toBe(14);
    expect(x.tickMargin).toBe(16);
  });

  it("yAxisCurrency='BRL' formata tick com R$ (pt-BR, 2 casas)", () => {
    render(
      <InteractiveBarChart
        data={baseData}
        series={baseSeries}
        yAxisCurrency="BRL"
      />,
    );
    const y = getCaptured().yAxisProps[0];
    const fmt = y.tickFormatter as (v: number) => string;
    const out = fmt(1234.5);
    expect(out).toMatch(/R\$/);
    expect(out).toMatch(/1\.234,50/);
  });

  it("yAxisCurrency='USD' formata tick com $ (en-US, 2 casas)", () => {
    render(
      <InteractiveBarChart
        data={baseData}
        series={baseSeries}
        yAxisCurrency="USD"
      />,
    );
    const y = getCaptured().yAxisProps[0];
    const fmt = y.tickFormatter as (v: number) => string;
    const out = fmt(1234.5);
    expect(out).toMatch(/\$/);
    expect(out).toMatch(/1,234\.50/);
  });

  it("sem yAxisCurrency mantém formatValue default (back-compat)", () => {
    render(<InteractiveBarChart data={baseData} series={baseSeries} />);
    const y = getCaptured().yAxisProps[0];
    const fmt = y.tickFormatter as (v: number) => string;
    const out = fmt(1234);
    expect(out).not.toMatch(/R\$/);
    expect(out).toMatch(/1\.234/);
  });
});

describe("InteractiveBarChart — layout horizontal", () => {
  const data = [
    { name: "A", v: 10 },
    { name: "B", v: 20 },
  ];
  const series = [{ key: "v", label: "V" }];

  it("aplica xAxisFontSize/xAxisPadding em XAxis numérico (horizontal)", () => {
    render(
      <InteractiveBarChart
        data={data}
        series={series}
        layout="horizontal"
        xAxisFontSize={15}
        xAxisPadding={14}
      />,
    );
    const x = getCaptured().xAxisProps[0];
    expect(x.fontSize).toBe(15);
    expect(x.tickMargin).toBe(14);
  });

  it("yAxisCurrency='BRL' aplica em XAxis numérico (horizontal)", () => {
    render(
      <InteractiveBarChart
        data={data}
        series={series}
        layout="horizontal"
        yAxisCurrency="BRL"
      />,
    );
    // No layout horizontal, o eixo numérico é o XAxis.
    const x = getCaptured().xAxisProps[0];
    const fmt = x.tickFormatter as (v: number) => string;
    const out = fmt(2000);
    expect(out).toMatch(/R\$/);
  });
});

describe("InteractiveBarChart — modo subcent (max < R$ 0,01)", () => {
  it("subcent BRL no eixo Y vertical: domain/ticks [0, 0.01], '< R$ 0,01' no topo", () => {
    const data = [
      { name: "Jan", cost: 0.005 },
      { name: "Fev", cost: 0.002 },
    ];
    const series = [{ key: "cost", label: "Custo" }];
    render(
      <InteractiveBarChart
        data={data}
        series={series}
        yAxisCurrency="BRL"
      />,
    );
    const y = getCaptured().yAxisProps[0];
    expect(y.domain).toEqual([0, 0.01]);
    expect(y.ticks).toEqual([0, 0.01]);
    const fmt = y.tickFormatter as (v: number) => string;
    expect(fmt(0)).toMatch(/R\$\s?0,00/);
    expect(fmt(0.01)).toMatch(/<\s?R\$\s?0,01/);
  });

  it("subcent USD no eixo X horizontal: domain/ticks [0, 0.01], '< $0.01'", () => {
    const data = [
      { name: "A", cost: 0.004 },
      { name: "B", cost: 0.001 },
    ];
    const series = [{ key: "cost", label: "Cost" }];
    render(
      <InteractiveBarChart
        data={data}
        series={series}
        layout="horizontal"
        yAxisCurrency="USD"
      />,
    );
    const x = getCaptured().xAxisProps[0];
    expect(x.domain).toEqual([0, 0.01]);
    expect(x.ticks).toEqual([0, 0.01]);
    const fmt = x.tickFormatter as (v: number) => string;
    expect(fmt(0)).toBe("$0.00");
    expect(fmt(0.01)).toBe("< $0.01");
  });

  it("max >= 0.01 NÃO ativa subcent (mantém formatter padrão)", () => {
    const data = [
      { name: "Jan", cost: 5 },
    ];
    const series = [{ key: "cost", label: "Custo" }];
    render(
      <InteractiveBarChart
        data={data}
        series={series}
        yAxisCurrency="BRL"
      />,
    );
    const y = getCaptured().yAxisProps[0];
    expect(y.domain).toBeUndefined();
    expect(y.ticks).toBeUndefined();
  });
});

describe("InteractiveBarChart — providersByModel custom XAxis tick", () => {
  const data = [
    { name: "gpt-5.4-nano", v: 100 },
    { name: "claude-haiku-4-5", v: 50 },
  ];
  const series = [{ key: "v", label: "Tokens" }];

  it("sem providersByModel, XAxis usa tick padrão (objeto com fill/fontSize)", () => {
    render(<InteractiveBarChart data={data} series={series} />);
    const x = getCaptured().xAxisProps[0];
    // tick é um objeto literal de estilo (não função)
    expect(typeof x.tick).toBe("object");
    expect(x.height).toBeUndefined();
  });

  it("com providersByModel, XAxis recebe tick como função e height=50", () => {
    const providersByModel = {
      "gpt-5.4-nano": "openai",
      "claude-haiku-4-5": "anthropic",
    };
    render(
      <InteractiveBarChart
        data={data}
        series={series}
        providersByModel={providersByModel}
      />,
    );
    const x = getCaptured().xAxisProps[0];
    expect(typeof x.tick).toBe("function");
    expect(x.height).toBe(50);
  });

  it("custom tick renderiza nome do modelo + Badge SVG com provider em uppercase (sem parênteses)", () => {
    const providersByModel = { "gpt-5.4-nano": "openai" };
    render(
      <InteractiveBarChart
        data={data}
        series={series}
        providersByModel={providersByModel}
      />,
    );
    const x = getCaptured().xAxisProps[0];
    const TickFn = x.tick as (props: {
      x: number;
      y: number;
      payload: { value: string };
    }) => React.ReactElement;
    const node = TickFn({ x: 10, y: 20, payload: { value: "gpt-5.4-nano" } });
    const { container } = render(<svg>{node}</svg>);
    const html = container.innerHTML;
    expect(html).toContain("gpt-5.4-nano");
    // Badge: provider em uppercase, sem parênteses
    expect(html).toContain("OPENAI");
    expect(html).not.toContain("(OpenAI)");
    expect(html).not.toContain("(openai)");
    // Badge container <rect> sem fill (transparent) + stroke currentColor
    expect(html).toMatch(/<rect[^>]*fill="transparent"/);
    expect(html).toMatch(/<rect[^>]*stroke="currentColor"/);
  });

  it("custom tick trunca nome de modelo > 24 chars com ellipsis", () => {
    const longName = "gpt-super-mega-ultra-long-model-name-extra";
    const providersByModel = { [longName]: "openai" };
    render(
      <InteractiveBarChart
        data={[{ name: longName, v: 1 }]}
        series={series}
        providersByModel={providersByModel}
      />,
    );
    const x = getCaptured().xAxisProps[0];
    const TickFn = x.tick as (props: {
      x: number;
      y: number;
      payload: { value: string };
    }) => React.ReactElement;
    const node = TickFn({ x: 0, y: 0, payload: { value: longName } });
    const { container } = render(<svg>{node}</svg>);
    const html = container.innerHTML;
    // Truncado para 21 chars + ellipsis "…"
    expect(html).toContain(`${longName.slice(0, 21)}…`);
    expect(html).not.toContain(longName); // nome completo NÃO está renderizado
  });

  it("custom tick: modelo sem provider mapeado NÃO renderiza Badge", () => {
    const providersByModel = { "outro-modelo": "openai" };
    render(
      <InteractiveBarChart
        data={[{ name: "gpt-5.4-nano", v: 1 }]}
        series={series}
        providersByModel={providersByModel}
      />,
    );
    const x = getCaptured().xAxisProps[0];
    const TickFn = x.tick as (props: {
      x: number;
      y: number;
      payload: { value: string };
    }) => React.ReactElement;
    const node = TickFn({ x: 0, y: 0, payload: { value: "gpt-5.4-nano" } });
    const { container } = render(<svg>{node}</svg>);
    const html = container.innerHTML;
    expect(html).toContain("gpt-5.4-nano");
    expect(html).not.toContain("OPENAI");
    expect(html).not.toContain("(OpenAI)");
    expect(html).not.toContain("(openai)");
    // Sem Badge: nenhum <rect> renderizado
    expect(html).not.toMatch(/<rect[^>]*stroke="currentColor"/);
  });
});
