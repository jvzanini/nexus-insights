/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen } from "@testing-library/react";

import { WizardStepIdentity } from "../wizard-step-identity";
import { EMPTY_WIZARD_FORM, deriveSlug } from "../wizard-types";

describe("deriveSlug", () => {
  it("normaliza nome para slug PostgreSQL-safe", () => {
    expect(deriveSlug("Diretoria")).toBe("diretoria");
    expect(deriveSlug("Marketing-Geral")).toBe("marketing_geral");
    expect(deriveSlug("Time   de   Vendas!!!")).toBe("time_de_vendas");
    expect(deriveSlug("   Espaços ao redor   ")).toBe("espa_os_ao_redor");
    expect(deriveSlug("123 numbers")).toBe("123_numbers");
  });

  it("trunca para 30 chars máximo", () => {
    const long = "a".repeat(60);
    expect(deriveSlug(long).length).toBe(30);
  });
});

describe("WizardStepIdentity", () => {
  function renderStep(name = "") {
    const onChange = jest.fn();
    const utils = render(
      <WizardStepIdentity
        data={{ ...EMPTY_WIZARD_FORM, name }}
        onChange={onChange}
      />,
    );
    return { onChange, ...utils };
  }

  it("filtra caracteres inválidos no input de nome (regex live)", () => {
    const { onChange } = renderStep("Marketing");
    const input = screen.getByTestId("wizard-name-input") as HTMLInputElement;

    // Simula digitação de "@" — não deve aceitar.
    act(() => {
      fireEvent.change(input, { target: { value: "Marketing@" } });
    });
    expect(onChange).not.toHaveBeenCalled();

    // Aceita "_"
    act(() => {
      fireEvent.change(input, { target: { value: "Marketing_NEW" } });
    });
    expect(onChange).toHaveBeenCalledWith({ name: "Marketing_NEW" });
  });

  it("mostra slug preview readonly derivado do nome", () => {
    renderStep("Diretoria de Vendas");
    const preview = screen.getByTestId("wizard-slug-preview");
    expect(preview).toHaveTextContent("pbi_diretoria_de_vendas_______");
  });

  it("mostra placeholder no slug quando nome vazio", () => {
    renderStep("");
    const preview = screen.getByTestId("wizard-slug-preview");
    expect(preview.textContent ?? "").toContain("pbi_<slug>_______");
  });

  it("propaga erro inline com aria-invalid e role=alert", () => {
    render(
      <WizardStepIdentity
        data={{ ...EMPTY_WIZARD_FORM, name: "ab" }}
        onChange={() => {}}
        error="Nome deve ter ao menos 3 caracteres."
      />,
    );
    const input = screen.getByTestId("wizard-name-input");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText(/Nome deve ter ao menos 3 caracteres\./),
    ).toBeInTheDocument();
  });
});
