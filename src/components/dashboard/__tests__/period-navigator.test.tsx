/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

import { PeriodNavigator } from "../period-navigator";

const baseProps = {
  period: "dia" as const,
  range: { start: "2026-05-01T03:00:00Z", end: "2026-05-02T02:59:59Z" },
  tz: "America/Sao_Paulo",
  weekStartsOn: 1,
  referenceDate: null,
  nextAvailable: true,
};

describe("PeriodNavigator (tag-style v0.22.0)", () => {
  it("renderiza label do dia", () => {
    render(<PeriodNavigator {...baseProps} onChange={() => {}} />);
    expect(screen.getByText("01/05")).toBeInTheDocument();
  });

  it("usa tipografia text-sm font-medium (size match com checkboxes)", () => {
    render(<PeriodNavigator {...baseProps} onChange={() => {}} />);
    const label = screen.getByText("01/05");
    expect(label).toHaveClass("text-sm");
    expect(label).toHaveClass("font-medium");
  });

  it("desabilita botão next quando nextAvailable=false", () => {
    render(
      <PeriodNavigator {...baseProps} nextAvailable={false} onChange={() => {}} />,
    );
    const next = screen.getByLabelText("Próximo período");
    expect(next).toBeDisabled();
  });

  it("dispara onChange ao clicar prev", () => {
    const onChange = jest.fn();
    render(<PeriodNavigator {...baseProps} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Período anterior"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
