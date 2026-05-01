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

import type { CredentialSummary } from "@/lib/llm/credentials";

const createLlmCredentialAction = jest.fn();
const updateLlmCredentialAction = jest.fn();
const deleteLlmCredentialAction = jest.fn();
const testLlmCredentialAction = jest.fn();
const refresh = jest.fn();

jest.mock("@/lib/actions/llm-credentials", () => ({
  createLlmCredentialAction: (...args: unknown[]) =>
    createLlmCredentialAction(...args),
  updateLlmCredentialAction: (...args: unknown[]) =>
    updateLlmCredentialAction(...args),
  deleteLlmCredentialAction: (...args: unknown[]) =>
    deleteLlmCredentialAction(...args),
  testLlmCredentialAction: (...args: unknown[]) =>
    testLlmCredentialAction(...args),
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

import { LlmCredentialsManager } from "../llm-credentials-manager";

const cred = (
  overrides: Partial<CredentialSummary> = {},
): CredentialSummary => ({
  id: overrides.id ?? "cred-openai-1",
  provider: overrides.provider ?? "openai",
  label: overrides.label ?? "Chave Principal",
  last4: overrides.last4 ?? "Wxyz",
  createdAt: overrides.createdAt ?? "2026-04-01T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-04-30T00:00:00.000Z",
});

describe("LlmCredentialsManager", () => {
  beforeEach(() => {
    createLlmCredentialAction.mockReset();
    updateLlmCredentialAction.mockReset();
    deleteLlmCredentialAction.mockReset();
    testLlmCredentialAction.mockReset();
    refresh.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.warning.mockReset();
    toastMock.info.mockReset();
  });

  it("renderiza 4 seções (uma por provider)", () => {
    render(
      <LlmCredentialsManager initial={[]} activeCredentialId={null} />,
    );
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

  it("provider sem credenciais renderiza estado vazio com 2 CTAs", () => {
    render(
      <LlmCredentialsManager initial={[]} activeCredentialId={null} />,
    );
    // Card vazio com testid próprio
    expect(
      screen.getByTestId("credentials-empty-openai"),
    ).toBeInTheDocument();
    // Texto descritivo
    expect(
      screen.getByText(/Nenhuma chave cadastrada para OpenAI/i),
    ).toBeInTheDocument();
    // CTA externo (link)
    const externalCta = screen.getByTestId("credentials-empty-external-openai");
    expect(externalCta).toHaveAttribute(
      "href",
      "https://platform.openai.com/api-keys",
    );
    expect(externalCta).toHaveAttribute("target", "_blank");
    // CTA "Nova chave" (botão dentro do card vazio)
    expect(
      screen.getByTestId("credentials-empty-new-openai"),
    ).toBeInTheDocument();
  });

  it("ponto verde aparece somente na credencial ativa", () => {
    render(
      <LlmCredentialsManager
        initial={[
          cred({ id: "active", label: "Ativa", last4: "1111" }),
          cred({ id: "outra", label: "Outra", last4: "2222" }),
        ]}
        activeCredentialId="active"
      />,
    );

    expect(
      screen.getByTestId("credential-active-dot-active"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("credential-inactive-dot-outra"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("credential-active-dot-outra"),
    ).not.toBeInTheDocument();
  });

  it("clicar 'Nova' abre dialog → preencher label + apiKey → submit chama createLlmCredentialAction", async () => {
    createLlmCredentialAction.mockResolvedValue({
      ok: true,
      data: { id: "new-id", label: "Conta Beta", last4: "abcd" },
    });

    render(
      <LlmCredentialsManager initial={[]} activeCredentialId={null} />,
    );

    const novaBtn = screen.getByLabelText("Nova chave para OpenAI");
    fireEvent.click(novaBtn);

    expect(
      await screen.findByText(/Nova chave — OpenAI/i),
    ).toBeInTheDocument();

    const labelInput = screen.getByLabelText("Label") as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: "Conta Beta" } });

    const apiKeyInput = screen.getByLabelText("API key") as HTMLInputElement;
    fireEvent.change(apiKeyInput, { target: { value: "sk-test-123456789" } });

    const salvarBtn = screen.getByRole("button", { name: /^salvar$/i });
    await act(async () => {
      fireEvent.click(salvarBtn);
    });

    await waitFor(() =>
      expect(createLlmCredentialAction).toHaveBeenCalledTimes(1),
    );
    expect(createLlmCredentialAction).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        label: "Conta Beta",
        apiKey: "sk-test-123456789",
      }),
    );
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Chave criada"),
    );
  });

  it("clicar 'Renomear' abre dialog em modo rename pré-preenchido", async () => {
    render(
      <LlmCredentialsManager
        initial={[cred({ id: "c1", label: "Atual", last4: "1234" })]}
        activeCredentialId={null}
      />,
    );

    fireEvent.click(screen.getByLabelText("Renomear Atual"));
    expect(
      await screen.findByText(/Renomear chave — OpenAI/i),
    ).toBeInTheDocument();
    const labelInput = screen.getByLabelText("Label") as HTMLInputElement;
    expect(labelInput.value).toBe("Atual");
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
  });

  it("clicar 'Trocar' abre dialog em modo rotate e submit chama updateLlmCredentialAction com apiKey", async () => {
    updateLlmCredentialAction.mockResolvedValue({
      ok: true,
      data: { label: "Atual", last4: "wxyz" },
    });

    render(
      <LlmCredentialsManager
        initial={[cred({ id: "c1", label: "Atual", last4: "1234" })]}
        activeCredentialId={null}
      />,
    );

    fireEvent.click(screen.getByLabelText("Trocar chave Atual"));
    expect(
      await screen.findByText(/Trocar chave — OpenAI/i),
    ).toBeInTheDocument();

    expect(screen.queryByLabelText("Label")).not.toBeInTheDocument();

    const apiKeyInput = screen.getByLabelText("API key") as HTMLInputElement;
    fireEvent.change(apiKeyInput, { target: { value: "sk-NEW-9999999999" } });

    const salvarBtn = screen.getByRole("button", { name: /^salvar$/i });
    await act(async () => {
      fireEvent.click(salvarBtn);
    });

    await waitFor(() =>
      expect(updateLlmCredentialAction).toHaveBeenCalledTimes(1),
    );
    expect(updateLlmCredentialAction).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ apiKey: "sk-NEW-9999999999" }),
    );
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Chave atualizada"),
    );
  });

  it("clicar 'Excluir' abre AlertDialog (não chama window.confirm)", async () => {
    const confirmSpy = jest.spyOn(window, "confirm");

    render(
      <LlmCredentialsManager
        initial={[cred({ id: "c1", label: "Atual", last4: "1234" })]}
        activeCredentialId={null}
      />,
    );

    fireEvent.click(screen.getByLabelText("Excluir Atual"));

    expect(
      await screen.findByText(/Excluir chave "Atual"\?/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Essa ação remove permanentemente/i),
    ).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("AlertDialog: Cancelar NÃO dispara delete", async () => {
    render(
      <LlmCredentialsManager
        initial={[cred({ id: "c1", label: "Atual", last4: "1234" })]}
        activeCredentialId={null}
      />,
    );

    fireEvent.click(screen.getByLabelText("Excluir Atual"));
    await screen.findByText(/Excluir chave "Atual"\?/i);

    const cancelBtn = screen.getByRole("button", { name: /^cancelar$/i });
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    expect(deleteLlmCredentialAction).not.toHaveBeenCalled();
  });

  it("AlertDialog: Confirmar dispara deleteLlmCredentialAction + toast sucesso", async () => {
    deleteLlmCredentialAction.mockResolvedValue({ ok: true });

    render(
      <LlmCredentialsManager
        initial={[cred({ id: "c1", label: "Atual", last4: "1234" })]}
        activeCredentialId={null}
      />,
    );

    fireEvent.click(screen.getByLabelText("Excluir Atual"));
    await screen.findByText(/Excluir chave "Atual"\?/i);

    const excluirBtn = screen.getByRole("button", { name: /^excluir$/i });
    await act(async () => {
      fireEvent.click(excluirBtn);
    });

    await waitFor(() =>
      expect(deleteLlmCredentialAction).toHaveBeenCalledWith("c1"),
    );
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Chave deletada"),
    );
  });

  it("AlertDialog: erro 'em uso' chega como toast quando action falha", async () => {
    deleteLlmCredentialAction.mockResolvedValue({
      ok: false,
      error:
        "Esta chave está em uso pelo Agente Nex. Selecione outra antes de deletar.",
    });

    render(
      <LlmCredentialsManager
        initial={[cred({ id: "active", label: "Em uso", last4: "0000" })]}
        activeCredentialId="active"
      />,
    );

    fireEvent.click(screen.getByLabelText("Excluir Em uso"));
    await screen.findByText(/Excluir chave "Em uso"\?/i);

    const excluirBtn = screen.getByRole("button", { name: /^excluir$/i });
    await act(async () => {
      fireEvent.click(excluirBtn);
    });

    await waitFor(() =>
      expect(deleteLlmCredentialAction).toHaveBeenCalledWith("active"),
    );
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringMatching(/em uso/i),
      ),
    );
  });
});
