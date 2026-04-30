/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { FiltersDrawer } from "../filters-drawer";
import {
  EMPTY_FILTER_STATE,
  type FilterState,
} from "@/lib/reports/filter-state";

const INBOXES = [
  { id: 1, name: "AC-Acre" },
  { id: 2, name: "BA-Bahia" },
];
const TEAMS = [
  { id: 10, name: "Suporte" },
  { id: 20, name: "Vendas" },
];
const ASSIGNEES = [
  { id: 100, name: "João" },
  { id: 200, name: "Maria" },
];

interface HarnessProps {
  initialOpen?: boolean;
  initialApplied?: FilterState;
  onApply?: (next: FilterState) => void;
  onClear?: () => void;
}

function Harness({
  initialOpen = false,
  initialApplied = EMPTY_FILTER_STATE,
  onApply,
  onClear,
}: HarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  const [applied, setApplied] = useState<FilterState>(initialApplied);
  return (
    <>
      <button onClick={() => setOpen(true)}>OpenDrawer</button>
      <FiltersDrawer
        open={open}
        onOpenChange={setOpen}
        applied={applied}
        onApply={(next) => {
          setApplied(next);
          onApply?.(next);
        }}
        onClear={() => {
          setApplied(EMPTY_FILTER_STATE);
          onClear?.();
        }}
        inboxes={INBOXES}
        teams={TEAMS}
        assignees={ASSIGNEES}
      />
    </>
  );
}

describe("FiltersDrawer", () => {
  it("não renderiza conteúdo quando fechado", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("abre e mostra todas as seções colapsáveis", () => {
    render(<Harness initialOpen />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Caixa de entrada/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Departamento/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Atendente/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Status/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Prioridade/ }),
    ).toBeInTheDocument();
  });

  it("Aplicar é desabilitado quando não há mudança no draft", () => {
    render(<Harness initialOpen />);
    const apply = screen.getByRole("button", { name: /Aplicar filtros/ });
    expect(apply).toBeDisabled();
  });

  it("Aplicar promove draft → applied e fecha o drawer", () => {
    const onApply = jest.fn();
    render(<Harness initialOpen onApply={onApply} />);

    // Abre seção Status
    fireEvent.click(screen.getByRole("button", { name: /^Status/ }));
    // Marca "Aberto"
    fireEvent.click(screen.getByText("Aberto"));

    const apply = screen.getByRole("button", { name: /Aplicar filtros/ });
    expect(apply).not.toBeDisabled();
    fireEvent.click(apply);

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ statuses: [0] }),
    );
    // Fecha
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Limpar todos chama onClear e fecha", () => {
    const onClear = jest.fn();
    render(
      <Harness
        initialOpen
        initialApplied={{ ...EMPTY_FILTER_STATE, inboxIds: [1] }}
        onClear={onClear}
      />,
    );
    const clear = screen.getByRole("button", {
      name: /Limpar todos os filtros/,
    });
    expect(clear).not.toBeDisabled();
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ESC fecha sem aplicar (descarta draft)", () => {
    const onApply = jest.fn();
    render(<Harness initialOpen onApply={onApply} />);

    // Modifica draft
    fireEvent.click(screen.getByRole("button", { name: /^Status/ }));
    fireEvent.click(screen.getByText("Aberto"));

    // ESC
    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("seção com seleção pré-aplicada começa aberta", () => {
    render(
      <Harness
        initialOpen
        initialApplied={{ ...EMPTY_FILTER_STATE, inboxIds: [1] }}
      />,
    );
    // Como Caixa de entrada começa aberta com 1 selecionado, "AC-Acre" está
    // visível dentro da seção.
    expect(screen.getByText("AC-Acre")).toBeInTheDocument();
  });

  it("Limpar todos é desabilitado quando draft já está vazio", () => {
    render(<Harness initialOpen />);
    const clear = screen.getByRole("button", {
      name: /Limpar todos os filtros/,
    });
    expect(clear).toBeDisabled();
  });
});
