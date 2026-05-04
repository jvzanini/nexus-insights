/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const createNexusChatConnection = jest.fn();
const updateNexusChatConnection = jest.fn();
const regenerateConnectionWebhookSecret = jest.fn();
const refresh = jest.fn();

jest.mock("@/lib/actions/nexus-chat/connections", () => ({
  createNexusChatConnection: (...args: unknown[]) =>
    createNexusChatConnection(...args),
  updateNexusChatConnection: (...args: unknown[]) =>
    updateNexusChatConnection(...args),
  regenerateConnectionWebhookSecret: (...args: unknown[]) =>
    regenerateConnectionWebhookSecret(...args),
}));

// Mock clipboard para testes de copy.
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn().mockResolvedValue(undefined),
  },
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
};
jest.mock("sonner", () => ({ toast: toastMock }));

import { ConnectionFormDialog } from "../connection-form-dialog";

describe("<ConnectionFormDialog />", () => {
  beforeEach(() => {
    createNexusChatConnection.mockReset();
    updateNexusChatConnection.mockReset();
    regenerateConnectionWebhookSecret.mockReset();
    refresh.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it("modo create: campos vazios e password obrigatório", async () => {
    const onOpenChange = jest.fn();
    render(
      <ConnectionFormDialog
        mode="create"
        open
        onOpenChange={onOpenChange}
        connection={null}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /Nova conexão/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Senha do banco/i),
    ).toBeInTheDocument();
  });

  it("modo edit: pre-preenche campos e password com placeholder de manter", () => {
    render(
      <ConnectionFormDialog
        mode="edit"
        open
        onOpenChange={jest.fn()}
        connection={{
          id: "conn-1",
          name: "Padrão",
          host: "db.example.com",
          port: 5432,
          database: "chatwoot",
          username: "ro_user",
          sslMode: "prefer",
          applicationName: "nexus-insights",
          status: "active",
          lastTestAt: null,
          lastTestError: null,
          bindingsCount: 0,
          webhookToken: "a".repeat(64),
        }}
      />,
    );
    expect(screen.getByLabelText(/^Nome$/i)).toHaveValue("Padrão");
    expect(screen.getByLabelText(/^Host$/i)).toHaveValue("db.example.com");
    expect(
      screen.getByPlaceholderText(/Deixe em branco para manter/i),
    ).toBeInTheDocument();
  });

  it("modo edit + webhookToken: renderiza bloco Webhook com URL e eventos", () => {
    render(
      <ConnectionFormDialog
        mode="edit"
        open
        onOpenChange={jest.fn()}
        connection={{
          id: "conn-1",
          name: "Padrão",
          host: "db.example.com",
          port: 5432,
          database: "chatwoot",
          username: "ro_user",
          sslMode: "prefer",
          applicationName: "nexus-insights",
          status: "active",
          lastTestAt: null,
          lastTestError: null,
          bindingsCount: 0,
          webhookToken: "f".repeat(64),
        }}
      />,
    );
    const section = screen.getByTestId("webhook-section");
    expect(section).toBeInTheDocument();
    // URL do webhook montada com o token.
    expect(section.textContent ?? "").toMatch(
      /\/api\/webhooks\/nexus-chat\/f{64}/,
    );
    // Lista de eventos canônicos do Chatwoot.
    const events = screen.getByTestId("webhook-events-list");
    expect(events).toHaveTextContent(/conversation_created/);
    expect(events).toHaveTextContent(/message_created/);
    expect(events).toHaveTextContent(/conversation_status_changed/);
    // Botão Regenerar visível.
    expect(screen.getByTestId("webhook-regen-btn")).toBeInTheDocument();
  });

  it("modo edit sem webhookToken: bloco Webhook não renderiza", () => {
    render(
      <ConnectionFormDialog
        mode="edit"
        open
        onOpenChange={jest.fn()}
        connection={{
          id: "conn-legacy",
          name: "Legado",
          host: "db.example.com",
          port: 5432,
          database: "chatwoot",
          username: "ro_user",
          sslMode: "prefer",
          applicationName: "nexus-insights",
          status: "active",
          lastTestAt: null,
          lastTestError: null,
          bindingsCount: 0,
          webhookToken: null,
        }}
      />,
    );
    expect(screen.queryByTestId("webhook-section")).not.toBeInTheDocument();
  });

  it("clicar em Regenerar abre AlertDialog de confirmação", () => {
    render(
      <ConnectionFormDialog
        mode="edit"
        open
        onOpenChange={jest.fn()}
        connection={{
          id: "conn-1",
          name: "Padrão",
          host: "db.example.com",
          port: 5432,
          database: "chatwoot",
          username: "ro_user",
          sslMode: "prefer",
          applicationName: "nexus-insights",
          status: "active",
          lastTestAt: null,
          lastTestError: null,
          bindingsCount: 0,
          webhookToken: "a".repeat(64),
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("webhook-regen-btn"));
    expect(
      screen.getByRole("alertdialog", { name: /Regenerar secret/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("webhook-regen-confirm")).toBeInTheDocument();
  });

  it("confirmar regeneração chama action e mostra Alert com novo secret", async () => {
    regenerateConnectionWebhookSecret.mockResolvedValue({
      success: true,
      data: { webhookSecretPlain: "b".repeat(64) },
    });
    render(
      <ConnectionFormDialog
        mode="edit"
        open
        onOpenChange={jest.fn()}
        connection={{
          id: "conn-1",
          name: "Padrão",
          host: "db.example.com",
          port: 5432,
          database: "chatwoot",
          username: "ro_user",
          sslMode: "prefer",
          applicationName: "nexus-insights",
          status: "active",
          lastTestAt: null,
          lastTestError: null,
          bindingsCount: 0,
          webhookToken: "a".repeat(64),
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("webhook-regen-btn"));
    fireEvent.click(screen.getByTestId("webhook-regen-confirm"));
    await waitFor(() => {
      expect(regenerateConnectionWebhookSecret).toHaveBeenCalledWith("conn-1");
    });
    await waitFor(() => {
      const alert = screen.getByTestId("webhook-secret-alert");
      expect(alert).toBeInTheDocument();
      expect(alert.textContent ?? "").toContain("b".repeat(64));
    });
    expect(toastMock.success).toHaveBeenCalled();
  });

  it("create com retorno webhookSecretPlain mostra Alert e mantém Dialog aberto", async () => {
    createNexusChatConnection.mockResolvedValue({
      success: true,
      data: { id: "new-id", webhookSecretPlain: "c".repeat(64) },
    });
    const onOpenChange = jest.fn();
    render(
      <ConnectionFormDialog
        mode="create"
        open
        onOpenChange={onOpenChange}
        connection={null}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Nome$/i), {
      target: { value: "Nova" },
    });
    fireEvent.change(screen.getByLabelText(/^Host$/i), {
      target: { value: "h" },
    });
    fireEvent.change(screen.getByLabelText(/^Banco$/i), {
      target: { value: "b" },
    });
    fireEvent.change(screen.getByLabelText(/^Usuário$/i), {
      target: { value: "u" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Senha do banco/i), {
      target: { value: "p" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/i }));
    await waitFor(() => {
      const alert = screen.getByTestId("webhook-secret-alert");
      expect(alert).toBeInTheDocument();
      expect(alert.textContent ?? "").toContain("c".repeat(64));
    });
    // Dialog NÃO fecha — super_admin precisa copiar antes.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("submit em create chama createNexusChatConnection e fecha", async () => {
    createNexusChatConnection.mockResolvedValue({
      success: true,
      data: { id: "new-id" },
    });
    const onOpenChange = jest.fn();
    render(
      <ConnectionFormDialog
        mode="create"
        open
        onOpenChange={onOpenChange}
        connection={null}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Nome$/i), {
      target: { value: "Cliente A" },
    });
    fireEvent.change(screen.getByLabelText(/^Host$/i), {
      target: { value: "10.0.0.1" },
    });
    fireEvent.change(screen.getByLabelText(/^Banco$/i), {
      target: { value: "chatwoot_a" },
    });
    fireEvent.change(screen.getByLabelText(/^Usuário$/i), {
      target: { value: "user_a" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Senha do banco/i), {
      target: { value: "supersecret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/i }));
    await waitFor(() => {
      expect(createNexusChatConnection).toHaveBeenCalled();
    });
    const arg = createNexusChatConnection.mock.calls[0][0];
    expect(arg.name).toBe("Cliente A");
    expect(arg.host).toBe("10.0.0.1");
    expect(arg.password).toBe("supersecret");
    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalled();
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("submit erro mostra toast vermelho", async () => {
    createNexusChatConnection.mockResolvedValue({
      success: false,
      error: "Senha obrigatória ao criar conexão.",
    });
    render(
      <ConnectionFormDialog
        mode="create"
        open
        onOpenChange={jest.fn()}
        connection={null}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Nome$/i), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByLabelText(/^Host$/i), {
      target: { value: "h" },
    });
    fireEvent.change(screen.getByLabelText(/^Banco$/i), {
      target: { value: "b" },
    });
    fireEvent.change(screen.getByLabelText(/^Usuário$/i), {
      target: { value: "u" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/i }));
    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringContaining("Senha obrigatória"),
      );
    });
  });
});
