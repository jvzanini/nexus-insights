/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render } from "@testing-library/react";

import { InteractiveAreaChart } from "@/components/charts/area-chart";

// Mock recharts para capturar props passadas a XAxis/YAxis sem precisar de
// medidas reais de SVG (jsdom não fornece bbox/width).
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

  function AreaChart({ children }: { children: React.ReactNode }) {
    return ReactActual.createElement("div", {
      "data-testid": "area-chart",
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
    Area: NoOp,
    AreaChart,
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

describe("InteractiveAreaChart — eixo X/Y props", () => {
  const baseData = [
    { name: "01/ABR", v: 10 },
    { name: "02/ABR", v: 20 },
  ];
  const baseSeries = [{ key: "v", label: "Valor" }];

  it("usa defaults: xAxisFontSize=13, tickMargin=12 (xAxisPadding default)", () => {
    render(<InteractiveAreaChart data={baseData} series={baseSeries} />);
    const cap = getCaptured();
    expect(cap.xAxisProps.length).toBeGreaterThan(0);
    const x = cap.xAxisProps[0];
    expect(x.fontSize).toBe(13);
    expect(x.tickMargin).toBe(12);
  });

  it("aplica xAxisFontSize e xAxisPadding customizados", () => {
    render(
      <InteractiveAreaChart
        data={baseData}
        series={baseSeries}
        xAxisFontSize={15}
        xAxisPadding={20}
      />,
    );
    const x = getCaptured().xAxisProps[0];
    expect(x.fontSize).toBe(15);
    expect(x.tickMargin).toBe(20);
  });

  it("yAxisCurrency='BRL' formata tick com R$ e 2 casas (pt-BR)", () => {
    render(
      <InteractiveAreaChart
        data={baseData}
        series={baseSeries}
        yAxisCurrency="BRL"
      />,
    );
    const y = getCaptured().yAxisProps[0];
    const fmt = y.tickFormatter as (v: number) => string;
    expect(typeof fmt).toBe("function");
    const out = fmt(1234.5);
    // pt-BR retorna "R$ 1.234,50" (com NBSP entre R$ e número em alguns runtimes)
    expect(out).toMatch(/R\$/);
    expect(out).toMatch(/1\.234,50/);
  });

  it("yAxisCurrency='USD' formata tick com $ e 2 casas (en-US)", () => {
    render(
      <InteractiveAreaChart
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

  it("sem yAxisCurrency, mantém formatValue padrão (back-compat)", () => {
    render(<InteractiveAreaChart data={baseData} series={baseSeries} />);
    const y = getCaptured().yAxisProps[0];
    const fmt = y.tickFormatter as (v: number) => string;
    const out = fmt(1234);
    expect(out).not.toMatch(/R\$/);
    expect(out).not.toMatch(/^\$/);
    // pt-BR locale: "1.234"
    expect(out).toMatch(/1\.234/);
  });
});

describe("InteractiveAreaChart — modo subcent (max < R$ 0,01)", () => {
  it("subcent BRL: 2 ticks [0, 0.01], labels 'R$ 0,00' e '< R$ 0,01'", () => {
    const data = [
      { name: "01", cost: 0.005 },
      { name: "02", cost: 0.003 },
    ];
    const series = [{ key: "cost", label: "Custo" }];
    render(
      <InteractiveAreaChart
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

  it("subcent USD: 2 ticks [0, 0.01], labels '$0.00' e '< $0.01'", () => {
    const data = [
      { name: "01", cost: 0.005 },
      { name: "02", cost: 0.001 },
    ];
    const series = [{ key: "cost", label: "Cost" }];
    render(
      <InteractiveAreaChart
        data={data}
        series={series}
        yAxisCurrency="USD"
      />,
    );
    const y = getCaptured().yAxisProps[0];
    expect(y.domain).toEqual([0, 0.01]);
    expect(y.ticks).toEqual([0, 0.01]);
    const fmt = y.tickFormatter as (v: number) => string;
    expect(fmt(0)).toBe("$0.00");
    expect(fmt(0.01)).toBe("< $0.01");
  });

  it("max >= 0.01 NÃO ativa subcent (mantém formatter padrão)", () => {
    const data = [
      { name: "01", cost: 5 },
      { name: "02", cost: 3 },
    ];
    const series = [{ key: "cost", label: "Custo" }];
    render(
      <InteractiveAreaChart
        data={data}
        series={series}
        yAxisCurrency="BRL"
      />,
    );
    const y = getCaptured().yAxisProps[0];
    expect(y.domain).toBeUndefined();
    expect(y.ticks).toBeUndefined();
    const fmt = y.tickFormatter as (v: number) => string;
    // Sem subcent, 0.01 é formatado como "R$ 0,01" (não "< R$ 0,01")
    expect(fmt(0.01)).toMatch(/R\$\s?0,01/);
    expect(fmt(0.01)).not.toMatch(/</);
  });

  it("sem yAxisCurrency NÃO ativa subcent (precisa flag de moeda)", () => {
    const data = [
      { name: "01", cost: 0.005 },
    ];
    const series = [{ key: "cost", label: "Custo" }];
    render(<InteractiveAreaChart data={data} series={series} />);
    const y = getCaptured().yAxisProps[0];
    expect(y.domain).toBeUndefined();
    expect(y.ticks).toBeUndefined();
  });
});
