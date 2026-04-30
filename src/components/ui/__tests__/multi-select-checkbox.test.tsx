/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

import { MultiSelectCheckbox } from "../multi-select-checkbox";

const OPTIONS = [
  { id: 1, name: "AC-Acre" },
  { id: 2, name: "AL-Alagoas" },
  { id: 3, name: "AM-Amazonas" },
  { id: 4, name: "BA-Bahia" },
];

describe("MultiSelectCheckbox", () => {
  it("renderiza inline com todas as opções", () => {
    render(
      <MultiSelectCheckbox
        label="Inbox"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        inline
      />,
    );
    OPTIONS.forEach((o) =>
      expect(screen.getByText(o.name)).toBeInTheDocument(),
    );
  });

  it("filtra por busca", () => {
    render(
      <MultiSelectCheckbox
        label="Inbox"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        inline
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Buscar/), {
      target: { value: "AL" },
    });
    expect(screen.getByText("AL-Alagoas")).toBeInTheDocument();
    expect(screen.queryByText("AC-Acre")).toBeNull();
  });

  it("Selecionar todos sem busca seleciona todas", () => {
    const onChange = jest.fn();
    render(
      <MultiSelectCheckbox
        label="Inbox"
        options={OPTIONS}
        value={[]}
        onChange={onChange}
        inline
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Selecionar todos/ }));
    expect(onChange).toHaveBeenCalledWith([1, 2, 3, 4]);
  });

  it("Selecionar visíveis com busca seleciona apenas filtradas", () => {
    const onChange = jest.fn();
    render(
      <MultiSelectCheckbox
        label="Inbox"
        options={OPTIONS}
        value={[]}
        onChange={onChange}
        inline
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Buscar/), {
      target: { value: "-A" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Selecionar visíveis/ }),
    );
    expect(onChange).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("Limpar visíveis remove apenas filtradas", () => {
    const onChange = jest.fn();
    render(
      <MultiSelectCheckbox
        label="Inbox"
        options={OPTIONS}
        value={[1, 2, 4]}
        onChange={onChange}
        inline
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Buscar/), {
      target: { value: "-A" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Limpar visíveis/ }));
    expect(onChange).toHaveBeenCalledWith([4]);
  });

  it("toggle adiciona e remove ID", () => {
    const onChange = jest.fn();
    render(
      <MultiSelectCheckbox
        label="Inbox"
        options={OPTIONS}
        value={[]}
        onChange={onChange}
        inline
      />,
    );
    fireEvent.click(screen.getByText("AC-Acre"));
    expect(onChange).toHaveBeenLastCalledWith([1]);
  });
});
