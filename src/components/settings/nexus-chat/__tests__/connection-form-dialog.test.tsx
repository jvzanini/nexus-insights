/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const createNexusChatConnection = jest.fn();
const updateNexusChatConnection = jest.fn();
const refresh = jest.fn();

jest.mock("@/lib/actions/nexus-chat/connections", () => ({
  createNexusChatConnection: (...args: unknown[]) =>
    createNexusChatConnection(...args),
  updateNexusChatConnection: (...args: unknown[]) =>
    updateNexusChatConnection(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
};
jest.mock("sonner", () => ({ toast: toastMock }));

import { ConnectionFormDialog } from "../connection-form-dialog";

const baseConnection = {
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
  pollingIntervalSeconds: 30,
  lastSyncAt: null,
} as const;

describe("<ConnectionFormDialog />", () => {
  beforeEach(() => {
    createNexusChatConnection.mockReset();
    updateNexusChatConnection.mockReset();
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
        connection={baseConnection}
      />,
    );
    expect(screen.getByLabelText(/^Nome$/i)).toHaveValue("Padrão");
    expect(screen.getByLabelText(/^Host$/i)).toHaveValue("db.example.com");
    expect(
      screen.getByPlaceholderText(/Deixe em branco para manter/i),
    ).toBeInTheDocument();
  });

  it("v0.41: NÃO renderiza bloco Webhook nem lista de eventos", () => {
    render(
      <ConnectionFormDialog
        mode="edit"
        open
        onOpenChange={jest.fn()}
        connection={baseConnection}
      />,
    );
    expect(screen.queryByTestId("webhook-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("webhook-events-list")).not.toBeInTheDocument();
  });

  it("renderiza campo Intervalo com default 30 e min 20", () => {
    render(
      <ConnectionFormDialog
        mode="create"
        open
        onOpenChange={jest.fn()}
        connection={null}
      />,
    );
    const input = screen.getByLabelText(
      /Intervalo de sincronização \(segundos\)/i,
    ) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe("number");
    expect(input.min).toBe("20");
    expect(input.step).toBe("1");
    expect(input.value).toBe("30");
    expect(
      screen.getByText(/Mínimo 20 segundos\. Padrão 30/i),
    ).toBeInTheDocument();
  });

  it("modo edit: campo Intervalo reflete pollingIntervalSeconds da connection", () => {
    render(
      <ConnectionFormDialog
        mode="edit"
        open
        onOpenChange={jest.fn()}
        connection={{ ...baseConnection, pollingIntervalSeconds: 45 }}
      />,
    );
    const input = screen.getByLabelText(
      /Intervalo de sincronização \(segundos\)/i,
    ) as HTMLInputElement;
    expect(input.value).toBe("45");
  });

  it("submit envia pollingIntervalSeconds 45 no payload", async () => {
    createNexusChatConnection.mockResolvedValue({
      success: true,
      data: { id: "new-id" },
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
    fireEvent.change(
      screen.getByLabelText(/Intervalo de sincronização \(segundos\)/i),
      { target: { value: "45" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/i }));
    await waitFor(() => {
      expect(createNexusChatConnection).toHaveBeenCalled();
    });
    const arg = createNexusChatConnection.mock.calls[0][0];
    expect(arg.pollingIntervalSeconds).toBe(45);
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
    expect(arg.pollingIntervalSeconds).toBe(30);
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
