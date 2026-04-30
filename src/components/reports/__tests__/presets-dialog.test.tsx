/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { PresetsDialog } from "@/components/reports/presets-dialog";
import { EMPTY_FILTER_STATE } from "@/lib/reports/filter-state";
import type { FilterPreset } from "@/lib/hooks/use-filter-presets";

function makePreset(name: string, id = name.toLowerCase()): FilterPreset {
  const now = new Date().toISOString();
  return {
    id,
    name,
    state: EMPTY_FILTER_STATE,
    sortStack: [],
    createdAt: now,
    updatedAt: now,
  };
}

interface HarnessProps {
  presets?: FilterPreset[];
  onApply?: (p: FilterPreset) => void;
  onRename?: (id: string, name: string) => boolean;
  onRemove?: (id: string) => void;
  validateName?: (name: string, ignoreId?: string) => string | null;
}

function Harness({
  presets = [],
  onApply = () => {},
  onRename = () => true,
  onRemove = () => {},
  validateName = () => null,
}: HarnessProps) {
  const [open, setOpen] = useState(true);
  return (
    <PresetsDialog
      open={open}
      onOpenChange={setOpen}
      presets={presets}
      onApply={onApply}
      onRename={onRename}
      onRemove={onRemove}
      validateName={validateName}
    />
  );
}

describe("PresetsDialog", () => {
  it("mostra empty state quando não há presets", () => {
    render(<Harness />);
    expect(screen.getByText(/Nenhum preset salvo/i)).toBeInTheDocument();
  });

  it("aplicar dispara callback com o preset", () => {
    const preset = makePreset("VIP");
    const onApply = jest.fn();
    render(<Harness presets={[preset]} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(onApply).toHaveBeenCalledWith(preset);
  });

  it("renomear inline dispara onRename com novo nome", () => {
    const preset = makePreset("VIP");
    const onRename = jest.fn(() => true);
    render(<Harness presets={[preset]} onRename={onRename} />);
    fireEvent.click(screen.getByRole("button", { name: /Renomear VIP/i }));
    const input = screen.getByLabelText(/novo nome/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Atendimentos urgentes" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onRename).toHaveBeenCalledWith(preset.id, "Atendimentos urgentes");
  });

  it("excluir pede confirmação e chama onRemove", () => {
    const preset = makePreset("VIP");
    const onRemove = jest.fn();
    render(<Harness presets={[preset]} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /Excluir VIP/i }));
    // Confirmação aparece com texto "Excluir <nome>?"
    expect(
      screen.getByText((_, el) => el?.textContent === "Excluir VIP?"),
    ).toBeInTheDocument();
    // Botão final "Excluir" (destructive) da confirmação — único botão
    // visível chamado exatamente "Excluir" (o anterior tem aria-label).
    const confirmBtn = screen.getByRole("button", { name: "Excluir" });
    fireEvent.click(confirmBtn);
    expect(onRemove).toHaveBeenCalledWith(preset.id);
  });
});
