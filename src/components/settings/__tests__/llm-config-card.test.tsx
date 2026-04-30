/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PROVIDER_CATALOG } from "@/lib/llm/catalog";

const saveLlmConfig = jest.fn();
const testLlmConnection = jest.fn();
const setNexBubbleEnabled = jest.fn();
const refresh = jest.fn();

jest.mock("@/lib/actions/llm-config", () => ({
  saveLlmConfig: (...args: unknown[]) => saveLlmConfig(...args),
  testLlmConnection: (...args: unknown[]) => testLlmConnection(...args),
  setNexBubbleEnabled: (...args: unknown[]) => setNexBubbleEnabled(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  },
}));

import { LlmConfigCard } from "../llm-config-card";

describe("LlmConfigCard", () => {
  beforeEach(() => {
    saveLlmConfig.mockReset();
    testLlmConnection.mockReset();
    setNexBubbleEnabled.mockReset();
    refresh.mockReset();
  });

  it("renderiza estado não configurado e mostra atalho 'Criar API key' do provider OpenAI", () => {
    render(<LlmConfigCard initial={null} initialNexEnabled={false} />);
    const apiKeyShortcut = screen.getByTestId("llm-shortcut-api-key");
    expect(apiKeyShortcut).toHaveAttribute(
      "href",
      PROVIDER_CATALOG.openai.apiKeyUrl,
    );
    expect(apiKeyShortcut).toHaveAttribute("target", "_blank");
    expect(apiKeyShortcut).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("mostra atalho 'Adicionar crédito' quando provider tem topUpUrl", () => {
    render(<LlmConfigCard initial={null} initialNexEnabled={false} />);
    const topUp = screen.getByTestId("llm-shortcut-top-up");
    expect(topUp).toHaveAttribute("href", PROVIDER_CATALOG.openai.topUpUrl);
  });

  it("seleciona 'Outro' habilita campo de modelo customizado", async () => {
    render(<LlmConfigCard initial={null} initialNexEnabled={false} />);

    // Abre o select de modelo
    const modelTrigger = screen.getAllByRole("button").find((b) =>
      b.getAttribute("aria-haspopup") === "listbox",
    );
    expect(modelTrigger).toBeTruthy();
    fireEvent.click(modelTrigger!);

    const customOption = await screen.findByText("Outro (digitar manualmente)");
    fireEvent.click(customOption);

    expect(screen.getByLabelText("Modelo customizado")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/gpt-4o-2024-08-06/)).toBeInTheDocument();
  });

  it("auto-save é chamado quando teste retorna reachable=true e creditOk!=false", async () => {
    testLlmConnection.mockResolvedValue({
      ok: true,
      data: { reachable: true, creditOk: true },
    });
    saveLlmConfig.mockResolvedValue({ ok: true });

    render(<LlmConfigCard initial={null} initialNexEnabled={false} />);

    // Cola API key longa o suficiente.
    const apiKeyInput = screen.getByLabelText(/API key do provedor de IA/i);
    fireEvent.change(apiKeyInput, { target: { value: "sk-test-1234567890abcdef" } });

    const testBtn = screen.getByRole("button", { name: /testar conexão/i });
    await act(async () => {
      fireEvent.click(testBtn);
    });

    await waitFor(() => expect(testLlmConnection).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(saveLlmConfig).toHaveBeenCalledTimes(1));
  });

  it("creditOk=false mostra warning + botão 'Salvar mesmo assim' e NÃO auto-salva", async () => {
    testLlmConnection.mockResolvedValue({
      ok: true,
      data: { reachable: true, creditOk: false, message: "Sem crédito" },
    });

    render(<LlmConfigCard initial={null} initialNexEnabled={false} />);
    const apiKeyInput = screen.getByLabelText(/API key do provedor de IA/i);
    fireEvent.change(apiKeyInput, { target: { value: "sk-test-1234567890abcdef" } });

    const testBtn = screen.getByRole("button", { name: /testar conexão/i });
    await act(async () => {
      fireEvent.click(testBtn);
    });

    await waitFor(() =>
      expect(screen.getByText(/Conexão OK · Sem crédito/i)).toBeInTheDocument(),
    );
    expect(saveLlmConfig).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Salvar mesmo assim/i }),
    ).toBeInTheDocument();
  });

  it("teste com errorKind invalid_key mostra mensagem amigável e não salva", async () => {
    testLlmConnection.mockResolvedValue({
      ok: true,
      data: {
        reachable: false,
        errorKind: "invalid_key",
        message: "API key inválida ou expirada.",
      },
    });

    render(<LlmConfigCard initial={null} initialNexEnabled={false} />);
    const apiKeyInput = screen.getByLabelText(/API key do provedor de IA/i);
    fireEvent.change(apiKeyInput, { target: { value: "sk-bad-1234567890" } });

    const testBtn = screen.getByRole("button", { name: /testar conexão/i });
    await act(async () => {
      fireEvent.click(testBtn);
    });

    await waitFor(() =>
      expect(screen.getByText(/Falha ao conectar/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/API key inválida ou expirada\./i)).toBeInTheDocument();
    expect(saveLlmConfig).not.toHaveBeenCalled();
  });

  it("'Salvar configuração' (manual) testa antes; falha no teste impede save", async () => {
    testLlmConnection.mockResolvedValue({
      ok: true,
      data: {
        reachable: false,
        errorKind: "invalid_key",
        message: "API key inválida ou expirada.",
      },
    });

    render(<LlmConfigCard initial={null} initialNexEnabled={false} />);
    const apiKeyInput = screen.getByLabelText(/API key do provedor de IA/i);
    fireEvent.change(apiKeyInput, { target: { value: "sk-bad-1234567890" } });

    const saveBtn = screen.getByRole("button", { name: /salvar configuração/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => expect(testLlmConnection).toHaveBeenCalledTimes(1));
    expect(saveLlmConfig).not.toHaveBeenCalled();
  });

  it("config inicial fora do catálogo carrega como 'Outro' com customModel preenchido", () => {
    render(
      <LlmConfigCard
        initial={{
          provider: "openai",
          model: "gpt-4o-2024-08-06-snapshot",
          apiKeyMasked: "sk-***",
        }}
        initialNexEnabled={true}
      />,
    );

    const customInput = screen.getByLabelText("Modelo customizado") as HTMLInputElement;
    expect(customInput.value).toBe("gpt-4o-2024-08-06-snapshot");
  });
});
