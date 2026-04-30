/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { PROVIDER_CATALOG } from "@/lib/llm/catalog";
import type { CredentialSummary } from "@/lib/llm/credentials";

const saveLlmConfig = jest.fn();
const setNexBubbleEnabled = jest.fn();
const testLlmCredentialAction = jest.fn();
const createLlmCredentialAction = jest.fn();
const updateLlmCredentialAction = jest.fn();
const deleteLlmCredentialAction = jest.fn();
const setCardSpreadAction = jest.fn();
const refresh = jest.fn();

jest.mock("@/lib/actions/llm-config", () => ({
  saveLlmConfig: (...args: unknown[]) => saveLlmConfig(...args),
  setNexBubbleEnabled: (...args: unknown[]) => setNexBubbleEnabled(...args),
}));

jest.mock("@/lib/actions/llm-credentials", () => ({
  testLlmCredentialAction: (...args: unknown[]) =>
    testLlmCredentialAction(...args),
  createLlmCredentialAction: (...args: unknown[]) =>
    createLlmCredentialAction(...args),
  updateLlmCredentialAction: (...args: unknown[]) =>
    updateLlmCredentialAction(...args),
  deleteLlmCredentialAction: (...args: unknown[]) =>
    deleteLlmCredentialAction(...args),
}));

jest.mock("@/lib/actions/exchange-rate", () => ({
  setCardSpreadAction: (...args: unknown[]) => setCardSpreadAction(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};
jest.mock("sonner", () => ({
  toast: toastMock,
}));

import { LlmConfigCard } from "../llm-config-card";

const cred = (overrides: Partial<CredentialSummary> = {}): CredentialSummary => ({
  id: overrides.id ?? "cred-openai-1",
  provider: overrides.provider ?? "openai",
  label: overrides.label ?? "Chave Principal",
  last4: overrides.last4 ?? "Wxyz",
  createdAt: overrides.createdAt ?? "2026-04-01T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-04-30T00:00:00.000Z",
});

describe("LlmConfigCard", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    saveLlmConfig.mockReset();
    setNexBubbleEnabled.mockReset();
    testLlmCredentialAction.mockReset();
    setCardSpreadAction.mockReset();
    refresh.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.warning.mockReset();
    toastMock.info.mockReset();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it("renderiza atalho 'Criar API key' do provider OpenAI", () => {
    render(
      <LlmConfigCard
        initial={null}
        initialNexEnabled={false}
        initialCredentials={[cred()]}
        initialSpread={1.1}
      />,
    );
    const apiKeyShortcut = screen.getByTestId("llm-shortcut-api-key");
    expect(apiKeyShortcut).toHaveAttribute(
      "href",
      PROVIDER_CATALOG.openai.apiKeyUrl,
    );
    expect(apiKeyShortcut).toHaveAttribute("target", "_blank");
    expect(apiKeyShortcut).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("mostra atalho 'Adicionar crédito' quando provider tem topUpUrl", () => {
    render(
      <LlmConfigCard
        initial={null}
        initialNexEnabled={false}
        initialCredentials={[cred()]}
        initialSpread={1.1}
      />,
    );
    const topUp = screen.getByTestId("llm-shortcut-top-up");
    expect(topUp).toHaveAttribute("href", PROVIDER_CATALOG.openai.topUpUrl);
  });

  it("seleciona 'Outro' habilita campo de modelo customizado", async () => {
    render(
      <LlmConfigCard
        initial={null}
        initialNexEnabled={false}
        initialCredentials={[cred()]}
        initialSpread={1.1}
      />,
    );

    // O `SearchableSelect` (Modelo) é o único trigger com aria-haspopup="listbox".
    const modelTrigger = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-haspopup") === "listbox");
    expect(modelTrigger).toBeTruthy();
    fireEvent.click(modelTrigger!);

    const customOption = await screen.findByText("Outro (digitar manualmente)");
    fireEvent.click(customOption);

    expect(screen.getByLabelText("Modelo customizado")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/gpt-4o-2024-08-06/),
    ).toBeInTheDocument();
  });

  it("renderiza select de credenciais com opções para o provider", async () => {
    render(
      <LlmConfigCard
        initial={null}
        initialNexEnabled={false}
        initialCredentials={[
          cred({ id: "c1", label: "Principal", last4: "1234" }),
          cred({ id: "c2", label: "Backup", last4: "abcd" }),
        ]}
        initialSpread={1.1}
      />,
    );

    // Mesmo fechado, o trigger do CustomSelect mostra o label da seleção atual
    // (primeira credencial). Clica nele para abrir as opções.
    const credentialTrigger = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("Principal · ••••1234"));
    expect(credentialTrigger).toBeTruthy();
    fireEvent.click(credentialTrigger!);

    // Após abrir, "Backup" e "+ Nova chave" aparecem na lista.
    expect(await screen.findByText(/Backup · ••••abcd/)).toBeInTheDocument();
    expect(screen.getByText(/\+ Nova chave/)).toBeInTheDocument();
  });

  it("auto-save é chamado com credentialId quando teste retorna reachable=true e creditOk!=false", async () => {
    testLlmCredentialAction.mockResolvedValue({
      ok: true,
      data: { reachable: true, creditOk: true },
    });
    saveLlmConfig.mockResolvedValue({ ok: true });

    render(
      <LlmConfigCard
        initial={null}
        initialNexEnabled={false}
        initialCredentials={[cred({ id: "cred-1" })]}
        initialSpread={1.1}
      />,
    );

    const testBtn = screen.getByRole("button", { name: /testar conexão/i });
    await act(async () => {
      fireEvent.click(testBtn);
    });

    await waitFor(() =>
      expect(testLlmCredentialAction).toHaveBeenCalledTimes(1),
    );
    const [credId, prov] = testLlmCredentialAction.mock.calls[0];
    expect(credId).toBe("cred-1");
    expect(prov).toBe("openai");

    await waitFor(() => expect(saveLlmConfig).toHaveBeenCalledTimes(1));
    expect(saveLlmConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        credentialId: "cred-1",
      }),
    );
  });

  it("creditOk=false mostra warning + botão 'Salvar mesmo assim' e NÃO auto-salva", async () => {
    testLlmCredentialAction.mockResolvedValue({
      ok: true,
      data: { reachable: true, creditOk: false, message: "Sem crédito" },
    });

    render(
      <LlmConfigCard
        initial={null}
        initialNexEnabled={false}
        initialCredentials={[cred()]}
        initialSpread={1.1}
      />,
    );

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
    testLlmCredentialAction.mockResolvedValue({
      ok: true,
      data: {
        reachable: false,
        errorKind: "invalid_key",
        message: "API key inválida ou expirada.",
      },
    });

    render(
      <LlmConfigCard
        initial={null}
        initialNexEnabled={false}
        initialCredentials={[cred()]}
        initialSpread={1.1}
      />,
    );

    const testBtn = screen.getByRole("button", { name: /testar conexão/i });
    await act(async () => {
      fireEvent.click(testBtn);
    });

    await waitFor(() =>
      expect(screen.getByText(/Falha ao conectar/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/API key inválida ou expirada\./i),
    ).toBeInTheDocument();
    expect(saveLlmConfig).not.toHaveBeenCalled();
  });

  it("'Salvar configuração' (manual) testa antes; falha no teste impede save", async () => {
    testLlmCredentialAction.mockResolvedValue({
      ok: true,
      data: {
        reachable: false,
        errorKind: "invalid_key",
        message: "API key inválida ou expirada.",
      },
    });

    render(
      <LlmConfigCard
        initial={null}
        initialNexEnabled={false}
        initialCredentials={[cred()]}
        initialSpread={1.1}
      />,
    );

    const saveBtn = screen.getByRole("button", { name: /salvar configuração/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() =>
      expect(testLlmCredentialAction).toHaveBeenCalledTimes(1),
    );
    expect(saveLlmConfig).not.toHaveBeenCalled();
  });

  it("config inicial fora do catálogo carrega como 'Outro' com customModel preenchido", () => {
    render(
      <LlmConfigCard
        initial={{
          provider: "openai",
          model: "gpt-4o-2024-08-06-snapshot",
          apiKeyMasked: "••••••••sk-x",
          credentialId: "cred-1",
          credentialLabel: "Chave 1",
        }}
        initialNexEnabled={true}
        initialCredentials={[cred({ id: "cred-1" })]}
        initialSpread={1.1}
      />,
    );

    const customInput = screen.getByLabelText(
      "Modelo customizado",
    ) as HTMLInputElement;
    expect(customInput.value).toBe("gpt-4o-2024-08-06-snapshot");
  });

  it("sem credenciais → botões desabilitados + mensagem 'Sem chaves cadastradas'", () => {
    render(
      <LlmConfigCard
        initial={null}
        initialNexEnabled={false}
        initialCredentials={[]}
        initialSpread={1.1}
      />,
    );

    expect(
      screen.getByRole("button", { name: /testar conexão/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /salvar configuração/i }),
    ).toBeDisabled();
    expect(screen.getByText(/Sem chaves cadastradas/i)).toBeInTheDocument();
  });

  it("input de spread dispara setCardSpreadAction após debounce", async () => {
    setCardSpreadAction.mockResolvedValue({ ok: true });

    render(
      <LlmConfigCard
        initial={null}
        initialNexEnabled={false}
        initialCredentials={[cred()]}
        initialSpread={1.1}
      />,
    );

    const spreadInput = screen.getByLabelText(
      /Spread cartão \(multiplicador USD\/BRL\)/i,
    ) as HTMLInputElement;
    expect(spreadInput.value).toBe("1.10");

    fireEvent.change(spreadInput, { target: { value: "1.15" } });

    // Antes do debounce não deve ter chamado.
    expect(setCardSpreadAction).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    await waitFor(() => expect(setCardSpreadAction).toHaveBeenCalledTimes(1));
    expect(setCardSpreadAction).toHaveBeenCalledWith(1.15);
  });

  it("spread negativo exibe erro e não chama setCardSpreadAction", async () => {
    render(
      <LlmConfigCard
        initial={null}
        initialNexEnabled={false}
        initialCredentials={[cred()]}
        initialSpread={1.1}
      />,
    );

    const spreadInput = screen.getByLabelText(
      /Spread cartão \(multiplicador USD\/BRL\)/i,
    ) as HTMLInputElement;
    fireEvent.change(spreadInput, { target: { value: "-1" } });

    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(setCardSpreadAction).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalled();
  });

  it("spread positivo qualquer (2.5) é aceito sem upper bound", async () => {
    setCardSpreadAction.mockResolvedValue({ ok: true });

    render(
      <LlmConfigCard
        initial={null}
        initialNexEnabled={false}
        initialCredentials={[cred()]}
        initialSpread={1.1}
      />,
    );

    const spreadInput = screen.getByLabelText(
      /Spread cartão \(multiplicador USD\/BRL\)/i,
    ) as HTMLInputElement;
    fireEvent.change(spreadInput, { target: { value: "2.5" } });

    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    await waitFor(() => expect(setCardSpreadAction).toHaveBeenCalledTimes(1));
    expect(setCardSpreadAction).toHaveBeenCalledWith(2.5);
  });

  it("trocar modelo (sem trocar credencial) dispara save com mesmo credentialId", async () => {
    testLlmCredentialAction.mockResolvedValue({
      ok: true,
      data: { reachable: true, creditOk: true },
    });
    saveLlmConfig.mockResolvedValue({ ok: true });

    render(
      <LlmConfigCard
        initial={{
          provider: "openai",
          model: PROVIDER_CATALOG.openai.models[0].id,
          apiKeyMasked: "••••••••abcd",
          credentialId: "cred-fixed",
          credentialLabel: "Fixa",
        }}
        initialNexEnabled={false}
        initialCredentials={[cred({ id: "cred-fixed", label: "Fixa" })]}
        initialSpread={1.1}
      />,
    );

    // Trocar para outro modelo do catálogo (se houver mais de 1).
    const targetModel = PROVIDER_CATALOG.openai.models[1];
    if (!targetModel) return; // catálogo só com 1 modelo: pula sem falhar
    const modelTrigger = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-haspopup") === "listbox");
    expect(modelTrigger).toBeTruthy();
    fireEvent.click(modelTrigger!);
    const opt = await screen.findByText(targetModel.label);
    fireEvent.click(opt);

    const saveBtn = screen.getByRole("button", { name: /salvar configuração/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => expect(saveLlmConfig).toHaveBeenCalledTimes(1));
    expect(saveLlmConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: targetModel.id,
        credentialId: "cred-fixed",
      }),
    );
  });

  it("aba 'Configuração' está ativa por padrão e aba 'Chaves de API' renderiza o manager ao clicar", () => {
    render(
      <LlmConfigCard
        initial={null}
        initialNexEnabled={false}
        initialCredentials={[cred()]}
        initialSpread={1.1}
      />,
    );

    const tabConfig = screen.getByTestId("llm-tab-config");
    const tabCreds = screen.getByTestId("llm-tab-credentials");

    expect(tabConfig).toHaveAttribute("aria-selected", "true");
    expect(tabCreds).toHaveAttribute("aria-selected", "false");

    // Spread cartão (campo único da aba "Configuração") deve estar presente.
    expect(
      screen.getByLabelText(/Spread cartão \(multiplicador USD\/BRL\)/i),
    ).toBeInTheDocument();

    // Manager de credenciais NÃO renderiza enquanto a aba está fechada.
    expect(
      screen.queryByTestId("credentials-section-openai"),
    ).not.toBeInTheDocument();

    fireEvent.click(tabCreds);

    expect(tabCreds).toHaveAttribute("aria-selected", "true");
    expect(tabConfig).toHaveAttribute("aria-selected", "false");
    // Agora as 4 seções por provider aparecem.
    expect(
      screen.getByTestId("credentials-section-openai"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("credentials-section-anthropic"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("credentials-section-gemini"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("credentials-section-openrouter"),
    ).toBeInTheDocument();
  });

  it("selecionar '+ Nova chave' no select de credenciais alterna pra aba 'Chaves de API'", async () => {
    render(
      <LlmConfigCard
        initial={null}
        initialNexEnabled={false}
        initialCredentials={[cred({ id: "c1", label: "Principal", last4: "1234" })]}
        initialSpread={1.1}
      />,
    );

    const tabCreds = screen.getByTestId("llm-tab-credentials");
    expect(tabCreds).toHaveAttribute("aria-selected", "false");

    // Abre o select de credenciais (mostra "Principal · ••••1234").
    const credentialTrigger = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("Principal · ••••1234"));
    expect(credentialTrigger).toBeTruthy();
    fireEvent.click(credentialTrigger!);

    const novaItem = await screen.findByText(/\+ Nova chave/);
    fireEvent.click(novaItem);

    // Aba Chaves passa a ativa + manager renderizado.
    expect(tabCreds).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByTestId("credentials-section-openai"),
    ).toBeInTheDocument();
    expect(toastMock.info).toHaveBeenCalled();
  });
});
