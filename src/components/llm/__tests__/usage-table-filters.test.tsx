/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen, within } from "@testing-library/react";

import { UsageTableFilters } from "../usage-table-filters";

const PROVIDERS = ["openai", "anthropic", "gemini", "openrouter"];
const MODELS_BY_PROVIDER: Record<string, string[]> = {
  openai: ["gpt-5.4", "gpt-4o-mini"],
  anthropic: ["claude-opus-4.7", "claude-sonnet-4.7"],
  gemini: ["gemini-2.5-pro"],
  openrouter: ["openrouter/auto"],
};

function setup(overrides: Partial<React.ComponentProps<typeof UsageTableFilters>> = {}) {
  const onProviderChange = jest.fn();
  const onModelChange = jest.fn();
  const utils = render(
    <UsageTableFilters
      providers={PROVIDERS}
      modelsByProvider={MODELS_BY_PROVIDER}
      selectedProvider={undefined}
      selectedModel={undefined}
      onProviderChange={onProviderChange}
      onModelChange={onModelChange}
      {...overrides}
    />,
  );
  return { ...utils, onProviderChange, onModelChange };
}

describe("UsageTableFilters", () => {
  it("renderiza dois selects com 'Todos' como default e botão limpar oculto", () => {
    setup();

    expect(screen.getByLabelText(/filtrar por provider/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filtrar por modelo/i)).toBeInTheDocument();
    // Triggers exibem o label default
    expect(screen.getAllByText(/todos os providers/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/todos os modelos/i).length).toBeGreaterThan(0);
    // Sem filtros ativos → sem botão "Limpar"
    expect(screen.queryByRole("button", { name: /limpar filtros/i })).not.toBeInTheDocument();
  });

  it("mostra apenas providers passados como prop no dropdown", () => {
    setup({ providers: ["openai", "anthropic"] });
    fireEvent.click(screen.getByLabelText(/filtrar por provider/i));

    const list = screen.getByRole("listbox");
    expect(within(list).getByRole("option", { name: /todos os providers/i })).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: /openai/i })).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: /anthropic/i })).toBeInTheDocument();
    expect(within(list).queryByRole("option", { name: /^gemini$/i })).not.toBeInTheDocument();
  });

  it("ao selecionar provider chama onProviderChange e reseta model", () => {
    const { onProviderChange, onModelChange } = setup({
      selectedModel: "gpt-5.4",
      selectedProvider: undefined,
    });

    fireEvent.click(screen.getByLabelText(/filtrar por provider/i));
    fireEvent.click(screen.getByRole("option", { name: /openai/i }));

    expect(onProviderChange).toHaveBeenCalledWith("openai");
    expect(onModelChange).toHaveBeenCalledWith(undefined);
  });

  it("selecionar 'Todos os providers' chama onProviderChange(undefined) e reseta model", () => {
    const { onProviderChange, onModelChange } = setup({
      selectedProvider: "openai",
      selectedModel: "gpt-5.4",
    });

    fireEvent.click(screen.getByLabelText(/filtrar por provider/i));
    fireEvent.click(screen.getByRole("option", { name: /todos os providers/i }));

    expect(onProviderChange).toHaveBeenCalledWith(undefined);
    expect(onModelChange).toHaveBeenCalledWith(undefined);
  });

  it("cascade: provider selecionado mostra apenas seus modelos", () => {
    setup({ selectedProvider: "anthropic" });

    fireEvent.click(screen.getByLabelText(/filtrar por modelo/i));
    const list = screen.getByRole("listbox");

    expect(within(list).getByRole("option", { name: /claude-opus-4\.7/i })).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: /claude-sonnet-4\.7/i })).toBeInTheDocument();
    expect(within(list).queryByRole("option", { name: /gpt-5\.4/i })).not.toBeInTheDocument();
    expect(within(list).queryByRole("option", { name: /gemini-2\.5-pro/i })).not.toBeInTheDocument();
  });

  it("sem provider: lista todos os modelos com label '(provider)'", () => {
    setup();

    fireEvent.click(screen.getByLabelText(/filtrar por modelo/i));
    const list = screen.getByRole("listbox");

    // Todos os modelos aparecem
    expect(within(list).getByRole("option", { name: /gpt-5\.4.*openai/i })).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: /claude-opus-4\.7.*anthropic/i })).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: /gemini-2\.5-pro.*gemini/i })).toBeInTheDocument();
  });

  it("selecionar modelo chama onModelChange (sem mexer em provider)", () => {
    const { onModelChange, onProviderChange } = setup({
      selectedProvider: "openai",
    });

    fireEvent.click(screen.getByLabelText(/filtrar por modelo/i));
    fireEvent.click(screen.getByRole("option", { name: /gpt-5\.4/i }));

    expect(onModelChange).toHaveBeenCalledWith("gpt-5.4");
    expect(onProviderChange).not.toHaveBeenCalled();
  });

  it("botão 'Limpar filtros' aparece quando algum filtro ativo e reseta ambos", () => {
    const { onProviderChange, onModelChange } = setup({
      selectedProvider: "openai",
      selectedModel: "gpt-5.4",
    });

    const clearBtn = screen.getByRole("button", { name: /limpar filtros/i });
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);

    expect(onProviderChange).toHaveBeenCalledWith(undefined);
    expect(onModelChange).toHaveBeenCalledWith(undefined);
  });

  it("botão limpar aparece quando só model está ativo (sem provider)", () => {
    setup({ selectedProvider: undefined, selectedModel: "gpt-5.4" });
    expect(screen.getByRole("button", { name: /limpar filtros/i })).toBeInTheDocument();
  });
});
