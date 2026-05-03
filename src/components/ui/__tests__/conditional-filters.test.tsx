/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

import {
  ConditionalFilters,
  type ConditionFieldDef,
} from "@/components/ui/conditional-filters";

const fields: ConditionFieldDef[] = [
  { key: "name", label: "Nome", type: "string" },
  { key: "age", label: "Idade", type: "number" },
];

describe("ConditionalFilters v0.32", () => {
  it("empty state renderiza placeholder", () => {
    render(<ConditionalFilters fields={fields} />);
    expect(screen.getByText(/Nenhuma condição/i)).toBeInTheDocument();
  });

  it("Adicionar condição adiciona item à lista", () => {
    render(<ConditionalFilters fields={fields} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Adicionar condição/i }),
    );
    expect(screen.queryByText(/Nenhuma condição/i)).not.toBeInTheDocument();
  });

  it("2 items: aparece conector E entre eles (default)", () => {
    render(<ConditionalFilters fields={fields} />);
    const addBtn = screen.getByRole("button", {
      name: /Adicionar condição/i,
    });
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    // Chip aria-label "Mudar operador para OU" indica que connector atual = E
    expect(
      screen.getByRole("button", { name: /Mudar operador para OU/i }),
    ).toBeInTheDocument();
  });

  it("Click no conector alterna E↔OU", () => {
    render(<ConditionalFilters fields={fields} />);
    const addBtn = screen.getByRole("button", {
      name: /Adicionar condição/i,
    });
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    const conn = screen.getByRole("button", {
      name: /Mudar operador para OU/i,
    });
    fireEvent.click(conn);
    // Após click, connector vira OU e o aria-label inverte para "Mudar operador para E"
    expect(
      screen.getByRole("button", { name: /Mudar operador para E/i }),
    ).toBeInTheDocument();
  });

  it("Adicionar grupo cria sub-grupo aninhado", () => {
    render(<ConditionalFilters fields={fields} />);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar grupo/i }));
    expect(screen.getByText(/^Grupo$/i)).toBeInTheDocument();
  });

  it("hideActions remove rodapé Aplicar/Limpar", () => {
    render(<ConditionalFilters fields={fields} hideActions />);
    expect(
      screen.queryByRole("button", { name: /^Aplicar$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Limpar$/i }),
    ).not.toBeInTheDocument();
  });
});
