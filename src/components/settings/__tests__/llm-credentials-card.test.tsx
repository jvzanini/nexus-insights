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

import { LlmCredentialsCard } from "../llm-credentials-card";

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

describe("LlmCredentialsCard", () => {
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
      <LlmCredentialsCard initial={[]} activeCredentialId={null} />,
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

  it("ponto verde aparece somente na credencial ativa", () => {
    render(
      <LlmCredentialsCard
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
      <LlmCredentialsCard initial={[]} activeCredentialId={null} />,
    );

    // Clica no "+ Nova" do OpenAI.
    const novaBtn = screen.getByLabelText("Nova chave para OpenAI");
    fireEvent.click(novaBtn);

    // Dialog renderiza título.
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
      <LlmCredentialsCard
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
    // No modo rename, o campo API key NÃO é renderizado.
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
  });

  it("clicar 'Trocar' abre dialog em modo rotate e submit chama updateLlmCredentialAction com apiKey", async () => {
    updateLlmCredentialAction.mockResolvedValue({
      ok: true,
      data: { label: "Atual", last4: "wxyz" },
    });

    render(
      <LlmCredentialsCard
        initial={[cred({ id: "c1", label: "Atual", last4: "1234" })]}
        activeCredentialId={null}
      />,
    );

    fireEvent.click(screen.getByLabelText("Trocar chave Atual"));
    expect(
      await screen.findByText(/Trocar chave — OpenAI/i),
    ).toBeInTheDocument();

    // Modo rotate: campo Label NÃO é renderizado.
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

  it("clicar deletar (lixeira) na credencial ativa: action retorna erro → toast 'em uso'", async () => {
    deleteLlmCredentialAction.mockResolvedValue({
      ok: false,
      error:
        "Esta chave está em uso pelo Agente Nex. Selecione outra antes de deletar.",
    });

    // Mock window.confirm para retornar true.
    const confirmSpy = jest
      .spyOn(window, "confirm")
      .mockImplementation(() => true);

    render(
      <LlmCredentialsCard
        initial={[cred({ id: "active", label: "Em uso", last4: "0000" })]}
        activeCredentialId="active"
      />,
    );

    const trash = screen.getByLabelText("Deletar Em uso");
    await act(async () => {
      fireEvent.click(trash);
    });

    await waitFor(() =>
      expect(deleteLlmCredentialAction).toHaveBeenCalledWith("active"),
    );
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringMatching(/em uso/i),
      ),
    );

    confirmSpy.mockRestore();
  });
});
