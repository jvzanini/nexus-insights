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

import { ConversasPagination } from "@/components/reports/conversas-pagination";

describe("ConversasPagination v0.23 — algoritmo simplificado + Popover", () => {
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

  it("totalPages=2: '1 2' sem elipsis", () => {
    render(
      <ConversasPagination page={1} totalPages={2} onPageChange={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /ir para página 1/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ir para página 2/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /selecionar página/i }),
    ).not.toBeInTheDocument();
  });

  it("totalPages=3: '1 2 3' sem elipsis", () => {
    render(
      <ConversasPagination page={2} totalPages={3} onPageChange={() => {}} />,
    );
    [1, 2, 3].forEach((p) => {
      expect(
        screen.getByRole("button", {
          name: new RegExp(`ir para página ${p}|página atual ${p}`, "i"),
        }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /selecionar página/i }),
    ).not.toBeInTheDocument();
  });

  it("totalPages=4: '1 2 3 4' sem elipsis", () => {
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
    expect(
      screen.queryByRole("button", { name: /selecionar página/i }),
    ).not.toBeInTheDocument();
  });

  it("totalPages=8 atual=1: '1 ... 8' (1 reticência)", () => {
    render(
      <ConversasPagination page={1} totalPages={8} onPageChange={() => {}} />,
    );
    expect(
      screen.queryByRole("button", { name: /ir para página 2/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ir para página 8/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /selecionar página/i }).length,
    ).toBe(1);
  });

  it("totalPages=8 atual=8: '1 ... 8' (1 reticência)", () => {
    render(
      <ConversasPagination page={8} totalPages={8} onPageChange={() => {}} />,
    );
    expect(
      screen.queryByRole("button", { name: /ir para página 7/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ir para página 1/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /selecionar página/i }).length,
    ).toBe(1);
  });

  it("totalPages=8 atual=4: '1 ... 4 ... 8' (2 reticências)", () => {
    render(
      <ConversasPagination page={4} totalPages={8} onPageChange={() => {}} />,
    );
    expect(
      screen.getAllByRole("button", { name: /selecionar página/i }).length,
    ).toBe(2);
    expect(
      screen.getByRole("button", { name: /página atual 4/i }),
    ).toBeInTheDocument();
  });

  it("setinha < disabled em page=1", () => {
    render(
      <ConversasPagination page={1} totalPages={5} onPageChange={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /página anterior/i }),
    ).toBeDisabled();
  });

  it("setinha > disabled em page=totalPages", () => {
    render(
      <ConversasPagination page={5} totalPages={5} onPageChange={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /próxima página/i }),
    ).toBeDisabled();
  });

  it("click em página simples chama onPageChange", () => {
    const cb = jest.fn();
    render(<ConversasPagination page={1} totalPages={4} onPageChange={cb} />);
    fireEvent.click(
      screen.getByRole("button", { name: /ir para página 3/i }),
    );
    expect(cb).toHaveBeenCalledWith(3);
  });

  it("click na reticência abre popover com lista de páginas no range", () => {
    render(
      <ConversasPagination page={1} totalPages={8} onPageChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /selecionar página/i }));
    expect(screen.getByRole("button", { name: /^2$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^7$/ })).toBeInTheDocument();
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
