/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen, within } from "@testing-library/react";

// O CustomSelect real depende do Popover do base-ui, que não roda em jsdom
// (acessa arrowRef.current sem fallback). Mockamos por um <select> nativo
// expondo as mesmas options para podermos validar a lógica anti-duplicação
// que depende do conjunto de options passado para cada critério.
jest.mock("@/components/ui/custom-select", () => ({
  CustomSelect: ({
    value,
    onChange,
    options,
    placeholder,
    triggerClassName,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
    triggerClassName?: string;
  }) => {
    const hasMatch = options.some((o) => o.value === value);
    return (
      <select
        data-testid="custom-select"
        className={triggerClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {!hasMatch ? (
          <option value="" disabled>
            {placeholder ?? "Selecionar"}
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  },
}));

import { SortingDialog } from "../sorting-dialog";

const options = [
  { key: "name", label: "Nome" },
  { key: "status", label: "Status" },
  { key: "waiting_seconds", label: "Sem resposta há" },
];

function getOptionLabels(select: HTMLElement): string[] {
  return within(select)
    .getAllByRole("option")
    .map((o) => (o.textContent || "").trim());
}

describe("SortingDialog", () => {
  test("Adicionar critério + escolher coluna inclui novo item com direction=asc", () => {
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
    // v0.25: addRule cria critério com key vazio; usuário precisa escolher
    // a coluna antes de Aplicar (que fica desabilitado até lá).
    const select = screen.getByTestId("custom-select");
    fireEvent.change(select, { target: { value: "name" } });
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

describe("SortingDialog — anti-duplicação", () => {
  test("opção já usada em critério anterior NÃO aparece no select dos seguintes", () => {
    render(
      <SortingDialog
        open
        onOpenChange={jest.fn()}
        applied={[{ key: "name", direction: "asc" }]}
        options={options}
        onApply={jest.fn()}
        onClear={jest.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /adicionar critério/i }),
    );

    const selects = screen.getAllByTestId("custom-select");
    expect(selects.length).toBe(2);

    // Critério 2 não deve listar "Nome" (em uso pelo critério 1).
    const labels2 = getOptionLabels(selects[1]!);
    expect(labels2).not.toContain("Nome");
    // O próprio valor selecionado do critério 2 ("Status") segue listado.
    expect(labels2).toContain("Status");
  });

  test("a própria seleção do critério continua aparecendo no seu select", () => {
    render(
      <SortingDialog
        open
        onOpenChange={jest.fn()}
        applied={[
          { key: "name", direction: "asc" },
          { key: "status", direction: "asc" },
        ]}
        options={options}
        onApply={jest.fn()}
        onClear={jest.fn()}
      />,
    );

    const selects = screen.getAllByTestId("custom-select");
    const labels1 = getOptionLabels(selects[0]!);
    // Critério 1 = "Nome": "Nome" (auto) + "Sem resposta há" (livre);
    // "Status" está em uso pelo critério 2 e deve sumir aqui.
    expect(labels1).toContain("Nome");
    expect(labels1).toContain("Sem resposta há");
    expect(labels1).not.toContain("Status");
  });

});

describe("SortingDialog v0.25", () => {
  test("addRule cria critério com key vazio + placeholder visível", () => {
    render(
      <SortingDialog
        open
        onOpenChange={jest.fn()}
        applied={[]}
        options={options}
        onApply={jest.fn()}
        onClear={jest.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /adicionar critério/i }),
    );
    // O CustomSelect mockado é um <select> nativo; quando key="" e nenhuma
    // option corresponde, espera-se que uma option-placeholder esteja
    // disponível com o label "Selecione uma coluna".
    expect(
      screen.getByRole("option", { name: /selecione uma coluna/i }),
    ).toBeInTheDocument();
  });

  test("Aplicar desabilitado quando há critério com key vazio", () => {
    render(
      <SortingDialog
        open
        onOpenChange={jest.fn()}
        applied={[]}
        options={options}
        onApply={jest.fn()}
        onClear={jest.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /adicionar critério/i }),
    );
    expect(
      screen.getByRole("button", { name: /^aplicar$/i }),
    ).toBeDisabled();
  });

  test("anti-dup: 2 critérios com key vazio coexistem (React keys distintas)", () => {
    render(
      <SortingDialog
        open
        onOpenChange={jest.fn()}
        applied={[]}
        options={options}
        onApply={jest.fn()}
        onClear={jest.fn()}
      />,
    );
    const addBtn = screen.getByRole("button", {
      name: /adicionar critério/i,
    });
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    // Ambos os critérios renderizam o option-placeholder (key vazia).
    expect(
      screen.getAllByRole("option", { name: /selecione uma coluna/i }),
    ).toHaveLength(2);
  });
});

describe("SortingDialog — anti-duplicação (cont.)", () => {
  test("removendo critério N libera a opção pra outros critérios", () => {
    render(
      <SortingDialog
        open
        onOpenChange={jest.fn()}
        applied={[
          { key: "name", direction: "asc" },
          { key: "status", direction: "desc" },
        ]}
        options={options}
        onApply={jest.fn()}
        onClear={jest.fn()}
      />,
    );

    // Antes: critério 2 não enxerga "Nome".
    const selectsAntes = screen.getAllByTestId("custom-select");
    expect(getOptionLabels(selectsAntes[1]!)).not.toContain("Nome");

    // Remove o critério 1.
    const removeBtns = screen.getAllByRole("button", {
      name: /remover critério/i,
    });
    fireEvent.click(removeBtns[0]!);

    // Resta só o critério "Status" — agora "Nome" voltou a estar disponível.
    const selectsDepois = screen.getAllByTestId("custom-select");
    expect(selectsDepois.length).toBe(1);
    const labels = getOptionLabels(selectsDepois[0]!);
    expect(labels).toContain("Nome");
    expect(labels).toContain("Status");
    expect(labels).toContain("Sem resposta há");
  });
});
