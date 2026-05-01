/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render } from "@testing-library/react";

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
