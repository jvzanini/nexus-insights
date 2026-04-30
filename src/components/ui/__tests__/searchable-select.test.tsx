/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { useState, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

// Mock leve do Popover (base-ui exige jsdom + DOM real do positioner; aqui basta
// validar lógica de seleção/busca/render — render inline quando `open=true`).
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
        const original = (render.props as { onClick?: (e: React.MouseEvent) => void }).onClick;
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

import { SearchableSelect } from "../searchable-select";

const OPTIONS = [
  { value: "custom", label: "Outro (digitar manualmente)" },
  {
    value: "gpt-4o",
    label: "GPT-4o",
    endAdornment: <span data-testid="badge-medium">$$</span>,
  },
  {
    value: "gpt-4o-mini",
    label: "GPT-4o mini",
    endAdornment: <span data-testid="badge-low">$</span>,
  },
];

function Harness({
  initial = "",
  onChange,
}: {
  initial?: string;
  onChange?: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <SearchableSelect
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      options={OPTIONS}
    />
  );
}

describe("SearchableSelect", () => {
  it("primeira opção é renderizada como destaque ('Outro')", () => {
    render(<Harness initial="custom" />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    const matches = screen.getAllByText(/Outro/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("filtra com busca", () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.change(screen.getByPlaceholderText(/Buscar/), {
      target: { value: "mini" },
    });
    expect(screen.getByText("GPT-4o mini")).toBeInTheDocument();
    expect(
      screen.queryByText("GPT-4o", { selector: "span.font-medium" }),
    ).toBeNull();
  });

  it("seleciona ao clicar e fecha", () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(screen.getByText("GPT-4o"));
    expect(onChange).toHaveBeenCalledWith("gpt-4o");
  });

  it("renderiza endAdornment", () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByTestId("badge-medium")).toBeInTheDocument();
  });
});
