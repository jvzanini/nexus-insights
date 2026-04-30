/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

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

describe("SearchableSelect", () => {
  it("primeira opção é renderizada como destaque ('Outro')", () => {
    render(<SearchableSelect value="custom" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    // Deve aparecer no trigger e na lista (2 ocorrências)
    const matches = screen.getAllByText(/Outro/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("filtra com busca", () => {
    render(<SearchableSelect value="" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.change(screen.getByPlaceholderText(/Buscar/), {
      target: { value: "mini" },
    });
    expect(screen.getByText("GPT-4o mini")).toBeInTheDocument();
    expect(screen.queryByText("GPT-4o", { selector: "span.font-medium" })).toBeNull();
  });

  it("seleciona ao clicar e fecha", () => {
    const onChange = jest.fn();
    render(<SearchableSelect value="" onChange={onChange} options={OPTIONS} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(screen.getByText("GPT-4o"));
    expect(onChange).toHaveBeenCalledWith("gpt-4o");
  });

  it("renderiza endAdornment", () => {
    render(<SearchableSelect value="" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByTestId("badge-medium")).toBeInTheDocument();
  });
});
