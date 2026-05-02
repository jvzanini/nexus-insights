/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

// Mock leve do Popover (base-ui exige jsdom + DOM real do positioner; aqui
// basta validar a lógica de abrir/fechar e renderizar a lista quando aberto).
jest.mock("@/components/ui/popover", () => {
  const PopoverCtx = jest.requireActual("react").createContext({
    open: false,
    setOpen: (_v: boolean) => {},
  });
  function Popover({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (next: boolean) => void;
    children: ReactNode;
  }) {
    return (
      <PopoverCtx.Provider value={{ open, setOpen: onOpenChange }}>
        {children}
      </PopoverCtx.Provider>
    );
  }
  function PopoverTrigger({ render }: { render: React.ReactElement }) {
    const ctx = jest.requireActual("react").useContext(PopoverCtx);
    const cloneElement = jest.requireActual("react").cloneElement;
    return cloneElement(render, {
      onClick: (e: React.MouseEvent) => {
        const original = (
          render.props as { onClick?: (e: React.MouseEvent) => void }
        ).onClick;
        original?.(e);
        ctx.setOpen(!ctx.open);
      },
    });
  }
  function PopoverContent({ children }: { children: ReactNode }) {
    const ctx = jest.requireActual("react").useContext(PopoverCtx);
    if (!ctx.open) return null;
    return <div data-slot="popover-content">{children}</div>;
  }
  return { Popover, PopoverTrigger, PopoverContent };
});

import { FilterChipListPopover } from "../filter-chip-list-popover";

const items = [
  { id: 1, name: "AL-Alagoas" },
  { id: 2, name: "BA-Bahia" },
  { id: 3, name: "CE-Ceará" },
];

describe("FilterChipListPopover", () => {
  it("renderiza chip 'Caixa de entrada: AL-Alagoas +2'", () => {
    render(
      <FilterChipListPopover
        groupLabel="Caixa de entrada"
        items={items}
        onRemoveOne={() => {}}
        onRemoveAll={() => {}}
      />,
    );
    expect(screen.getByText(/AL-Alagoas/)).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("trigger tem aria-haspopup='dialog'", () => {
    render(
      <FilterChipListPopover
        groupLabel="X"
        items={items}
        onRemoveOne={() => {}}
        onRemoveAll={() => {}}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: /caixa|x/i })
        .getAttribute("aria-haspopup"),
    ).toBe("dialog");
  });

  it("click abre popover com lista (3 items)", () => {
    render(
      <FilterChipListPopover
        groupLabel="X"
        items={items}
        onRemoveOne={() => {}}
        onRemoveAll={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("AL-Alagoas")).toBeVisible();
    expect(screen.getByText("BA-Bahia")).toBeVisible();
    expect(screen.getByText("CE-Ceará")).toBeVisible();
  });

  it("click no X individual chama onRemoveOne(id)", () => {
    const cb = jest.fn();
    render(
      <FilterChipListPopover
        groupLabel="X"
        items={items}
        onRemoveOne={cb}
        onRemoveAll={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByLabelText(/Remover BA-Bahia/));
    expect(cb).toHaveBeenCalledWith(2);
  });

  it("click 'Remover todos' chama onRemoveAll", () => {
    const cb = jest.fn();
    render(
      <FilterChipListPopover
        groupLabel="X"
        items={items}
        onRemoveOne={() => {}}
        onRemoveAll={cb}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(/Remover todos/));
    expect(cb).toHaveBeenCalled();
  });
});
