/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Crown, Eye, Shield, ShieldCheck } from "lucide-react";

import {
  BadgeSelect,
  type BadgeOption,
  type BadgeStyle,
} from "@/components/ui/badge-select";

type Role = "super_admin" | "admin" | "manager" | "viewer";

const OPTIONS: BadgeOption<Role>[] = [
  {
    value: "super_admin",
    label: "Super Admin",
    description: "Acesso total a toda a plataforma",
    bg: "bg-purple-500/10 border-purple-500/30 text-purple-600",
    icon: Crown,
  },
  {
    value: "admin",
    label: "Admin",
    description: "Gerencia empresas e usuários",
    bg: "bg-blue-500/10 border-blue-500/30 text-blue-600",
    icon: ShieldCheck,
  },
  {
    value: "manager",
    label: "Gerente",
    description: "Gerencia rotas e webhooks",
    bg: "bg-amber-500/10 border-amber-500/30 text-amber-600",
    icon: Shield,
  },
  {
    value: "viewer",
    label: "Visualizador",
    description: "Apenas visualização",
    bg: "bg-zinc-200 border-zinc-300 text-zinc-600",
    icon: Eye,
  },
];

function getBadgeStyle(value: Role): BadgeStyle {
  const opt = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
  return { bg: opt.bg, icon: opt.icon };
}

function ControlledHarness({
  initial,
  disabled,
  useFixed,
  onChange,
}: {
  initial: Role;
  disabled?: boolean;
  useFixed?: boolean;
  onChange?: (value: Role) => void;
}) {
  const [value, setValue] = useState<Role>(initial);
  return (
    <BadgeSelect<Role>
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      options={OPTIONS}
      getBadgeStyle={getBadgeStyle}
      disabled={disabled}
      useFixed={useFixed}
    />
  );
}

describe("BadgeSelect", () => {
  it("renderiza trigger com label da option corrente", () => {
    render(<ControlledHarness initial="admin" />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Admin");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("aplica classes de bg correspondentes a cada value", () => {
    const { rerender } = render(
      <ControlledHarness key="a" initial="super_admin" />,
    );
    expect(screen.getByRole("combobox").className).toContain("bg-purple-500/10");

    rerender(<ControlledHarness key="b" initial="manager" />);
    expect(screen.getByRole("combobox").className).toContain("bg-amber-500/10");
  });

  it("click no trigger abre listbox com todas as options", () => {
    render(<ControlledHarness initial="viewer" />);
    fireEvent.click(screen.getByRole("combobox"));

    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();
    const opts = screen.getAllByRole("option");
    expect(opts).toHaveLength(OPTIONS.length);
    expect(opts[0]).toHaveTextContent("Super Admin");
    expect(opts[0]).toHaveTextContent("Acesso total a toda a plataforma");
  });

  it("option selecionada possui aria-selected e indicador Check", () => {
    render(<ControlledHarness initial="manager" />);
    fireEvent.click(screen.getByRole("combobox"));

    const opts = screen.getAllByRole("option");
    const selected = opts.find((o) => o.getAttribute("aria-selected") === "true");
    expect(selected).toBeTruthy();
    expect(selected).toHaveTextContent("Gerente");
  });

  it("click em outra option dispara onChange e fecha o popover", () => {
    const onChange = jest.fn();
    render(<ControlledHarness initial="viewer" onChange={onChange} />);

    fireEvent.click(screen.getByRole("combobox"));
    const opts = screen.getAllByRole("option");
    const adminOption = opts.find((o) => {
      const labelEl = within(o).queryByText("Admin", { selector: "span" });
      return Boolean(labelEl);
    })!;
    fireEvent.click(adminOption);

    expect(onChange).toHaveBeenCalledWith("admin");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("Admin");
  });

  it("disabled bloqueia abertura e esconde chevron", () => {
    render(<ControlledHarness initial="admin" disabled />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeDisabled();

    fireEvent.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Escape fecha o popover", () => {
    render(<ControlledHarness initial="viewer" />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("click fora fecha o popover", () => {
    render(
      <div>
        <button>fora</button>
        <ControlledHarness initial="viewer" />
      </div>,
    );
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText("fora"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("useFixed renderiza popover via portal no document.body", () => {
    const { container } = render(<ControlledHarness initial="viewer" useFixed />);
    fireEvent.click(screen.getByRole("combobox"));

    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();
    // O portal monta fora do container do componente.
    expect(container.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
  });

  it("listbox aberto NÃO carrega classes que zerariam o estado final (opacity-0 / scale-95)", () => {
    // Regressão: classes estáticas de estado inicial mantinham o popover invisível
    // após a animação devido a fill-mode-forwards.
    render(<ControlledHarness initial="viewer" />);
    fireEvent.click(screen.getByRole("combobox"));

    const listbox = screen.getByRole("listbox");
    const cls = listbox.className;
    expect(cls).not.toMatch(/(^|\s)opacity-0(\s|$)/);
    expect(cls).not.toMatch(/(^|\s)scale-95(\s|$)/);
    expect(cls).not.toContain("fill-mode-forwards");
  });

  it("ArrowDown + Enter seleciona via teclado", () => {
    const onChange = jest.fn();
    render(<ControlledHarness initial="super_admin" onChange={onChange} />);

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("admin");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
