/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

import { SortingDialog } from "../sorting-dialog";

const options = [
  { key: "name", label: "Nome" },
  { key: "status", label: "Status" },
  { key: "waiting_seconds", label: "Sem resposta há" },
];

describe("SortingDialog", () => {
  test("Adicionar critério inclui novo item com direction=asc", () => {
    const onApply = jest.fn();
    render(
      <SortingDialog
        open
        onOpenChange={jest.fn()}
        applied={[]}
        options={options}
        onApply={onApply}
        onClear={jest.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /adicionar critério/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^aplicar$/i }));
    expect(onApply).toHaveBeenCalledWith([
      { key: "name", direction: "asc" },
    ]);
  });

  test("Limpar dispara onClear", () => {
    const onClear = jest.fn();
    render(
      <SortingDialog
        open
        onOpenChange={jest.fn()}
        applied={[{ key: "name", direction: "asc" }]}
        options={options}
        onApply={jest.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(onClear).toHaveBeenCalled();
  });
});
