/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";

// O Popover do base-ui depende de arrowRef que não roda em jsdom puro.
// Mockamos por uma versão simplificada que renderiza o conteúdo inline
// quando aberto, mantendo a API (open/onOpenChange + render prop no Trigger).
jest.mock("@/components/ui/popover", () => {
  const PopoverContext = React.createContext<{
    open: boolean;
    setOpen: (v: boolean) => void;
  }>({ open: false, setOpen: () => {} });

  const Popover = ({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
    children: React.ReactNode;
  }) => {
    const [internalOpen, setInternalOpen] = React.useState(false);
    const isControlled = open !== undefined;
    const value = isControlled ? open : internalOpen;
    const setOpen = (v: boolean) => {
      if (!isControlled) setInternalOpen(v);
      onOpenChange?.(v);
    };
    return (
      <PopoverContext.Provider value={{ open: value, setOpen }}>
        {children}
      </PopoverContext.Provider>
    );
  };

  const PopoverTrigger = ({
    render: renderProp,
  }: {
    render: (props: Record<string, unknown>) => React.ReactElement;
  }) => {
    const { open, setOpen } = React.useContext(PopoverContext);
    return renderProp({
      onClick: () => setOpen(!open),
      "aria-expanded": open,
    });
  };

  const PopoverContent = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => {
    const { open } = React.useContext(PopoverContext);
    if (!open) return null;
    return (
      <div data-testid="popover-content" className={className}>
        {children}
      </div>
    );
  };

  return { Popover, PopoverTrigger, PopoverContent };
});

import {
  buildPageItems,
  ConversasPagination,
} from "@/components/reports/conversas-pagination";

describe("buildPageItems v0.25 (simplificado, sem ellipsis)", () => {
  it("totalPages 0: []", () => expect(buildPageItems(1, 0)).toEqual([]));
  it("totalPages 1: [1]", () => expect(buildPageItems(1, 1)).toEqual([1]));
  it("totalPages 2: [1,2]", () => expect(buildPageItems(1, 2)).toEqual([1, 2]));
  it("totalPages 3: [1,2,3]", () =>
    expect(buildPageItems(2, 3)).toEqual([1, 2, 3]));
  it("totalPages 4: [1,2,3,4]", () =>
    expect(buildPageItems(3, 4)).toEqual([1, 2, 3, 4]));
  it("atual=1 com 8 págs: [1,8]", () =>
    expect(buildPageItems(1, 8)).toEqual([1, 8]));
  it("atual=8 com 8 págs: [1,8]", () =>
    expect(buildPageItems(8, 8)).toEqual([1, 8]));
  it("atual=5 com 8 págs: [1,5,8]", () =>
    expect(buildPageItems(5, 8)).toEqual([1, 5, 8]));
  it("atual=2 com 5 págs: [1,2,5]", () =>
    expect(buildPageItems(2, 5)).toEqual([1, 2, 5]));
});

describe("ConversasPagination v0.25 (render)", () => {
  it("totalPages=0: null", () => {
    const { container } = render(
      <ConversasPagination page={1} totalPages={0} onPageChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("totalPages=1: null", () => {
    const { container } = render(
      <ConversasPagination page={1} totalPages={1} onPageChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("não renderiza dropdown de reticência", () => {
    render(
      <ConversasPagination page={5} totalPages={8} onPageChange={() => {}} />,
    );
    expect(
      screen.queryByRole("button", { name: /Selecionar página/i }),
    ).toBeNull();
  });

  it("atual no meio é Popover dropdown (chevron)", () => {
    render(
      <ConversasPagination page={5} totalPages={8} onPageChange={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /Página atual 5/i }),
    ).toBeInTheDocument();
  });

  it("totalPages=2: '1 2' sem reticência", () => {
    render(
      <ConversasPagination page={1} totalPages={2} onPageChange={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /ir para página 1|página atual 1/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ir para página 2/i }),
    ).toBeInTheDocument();
  });

  it("totalPages=4: '1 2 3 4' sem reticência", () => {
    render(
      <ConversasPagination page={2} totalPages={4} onPageChange={() => {}} />,
    );
    [1, 2, 3, 4].forEach((p) => {
      expect(
        screen.getByRole("button", {
          name: new RegExp(`ir para página ${p}|página atual ${p}`, "i"),
        }),
      ).toBeInTheDocument();
    });
  });

  it("setinha < disabled em page=1 com cursor-not-allowed", () => {
    render(
      <ConversasPagination page={1} totalPages={5} onPageChange={() => {}} />,
    );
    const prev = screen.getByRole("button", { name: /página anterior/i });
    expect(prev).toBeDisabled();
    expect(prev.className).toMatch(/disabled:cursor-not-allowed/);
    expect(prev.className).toMatch(/cursor-pointer/);
  });

  it("setinha > disabled em page=totalPages com cursor-not-allowed", () => {
    render(
      <ConversasPagination page={5} totalPages={5} onPageChange={() => {}} />,
    );
    const next = screen.getByRole("button", { name: /próxima página/i });
    expect(next).toBeDisabled();
    expect(next.className).toMatch(/disabled:cursor-not-allowed/);
    expect(next.className).toMatch(/cursor-pointer/);
  });

  it("click em página simples chama onPageChange", () => {
    const cb = jest.fn();
    render(<ConversasPagination page={1} totalPages={4} onPageChange={cb} />);
    fireEvent.click(
      screen.getByRole("button", { name: /ir para página 3/i }),
    );
    expect(cb).toHaveBeenCalledWith(3);
  });

  it("click na atual no meio abre popover com 1..N e atual destacada", () => {
    render(
      <ConversasPagination page={4} totalPages={8} onPageChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /página atual 4/i }));
    expect(screen.getByRole("button", { name: /^5$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^1$/ })).toBeInTheDocument();
  });

  it("aria-current='page' no atual (edge ou meio)", () => {
    render(
      <ConversasPagination page={3} totalPages={5} onPageChange={() => {}} />,
    );
    const atual = screen.getByRole("button", {
      name: /ir para página 3|página atual 3/i,
    });
    expect(atual).toHaveAttribute("aria-current", "page");
  });

  it("nav role + aria-label", () => {
    render(
      <ConversasPagination page={1} totalPages={5} onPageChange={() => {}} />,
    );
    expect(
      screen.getByRole("navigation", { name: /paginação/i }),
    ).toBeInTheDocument();
  });
});
