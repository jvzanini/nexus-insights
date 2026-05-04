/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const testNexusChatConnection = jest.fn();
const softDeleteNexusChatConnection = jest.fn();
const refresh = jest.fn();
const push = jest.fn();

jest.mock("@/lib/actions/nexus-chat/connections", () => ({
  testNexusChatConnection: (...args: unknown[]) =>
    testNexusChatConnection(...args),
  softDeleteNexusChatConnection: (...args: unknown[]) =>
    softDeleteNexusChatConnection(...args),
  createNexusChatConnection: jest.fn(),
  updateNexusChatConnection: jest.fn(),
}));

// Bindings action — mockado pra não puxar next-auth via cadeia de import
// (BindingListSheet → bindings.ts → @/lib/auth → next-auth).
jest.mock("@/lib/actions/nexus-chat/bindings", () => ({
  createCompanyChatBinding: jest.fn(),
  updateCompanyChatBinding: jest.fn(),
  softDeleteCompanyChatBinding: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
}));

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};
jest.mock("sonner", () => ({ toast: toastMock }));

import {
  ConnectionList,
  type ConnectionListItem,
} from "../connection-list";

const sampleConn = (
  overrides: Partial<ConnectionListItem> = {},
): ConnectionListItem => ({
  id: overrides.id ?? "conn-1",
  name: overrides.name ?? "Padrão (legado)",
  host: overrides.host ?? "db.example.com",
  port: overrides.port ?? 5432,
  database: overrides.database ?? "chatwoot_production",
  username: overrides.username ?? "chatwoot_ro",
  sslMode: overrides.sslMode ?? "prefer",
  applicationName: overrides.applicationName ?? "nexus-insights",
  status: overrides.status ?? "active",
  lastTestAt: overrides.lastTestAt ?? null,
  lastTestError: overrides.lastTestError ?? null,
  bindingsCount: overrides.bindingsCount ?? 0,
  pollingIntervalSeconds: overrides.pollingIntervalSeconds ?? 30,
  lastSyncAt: overrides.lastSyncAt ?? null,
});

describe("<ConnectionList />", () => {
  beforeEach(() => {
    testNexusChatConnection.mockReset();
    softDeleteNexusChatConnection.mockReset();
    refresh.mockReset();
    push.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.info.mockReset();
  });

  it("renderiza estado vazio quando não há connections", () => {
    render(<ConnectionList connections={[]} />);
    expect(
      screen.getByText(/Nenhuma conexão cadastrada ainda/i),
    ).toBeInTheDocument();
    // CTA "Nova conexão" aparece no card vazio.
    expect(
      screen.getAllByRole("button", { name: /Nova conexão/i }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("renderiza linha da connection com host masked e dados", () => {
    render(
      <ConnectionList
        connections={[
          sampleConn({
            host: "db.example.com",
            database: "chatwoot",
            bindingsCount: 3,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Padrão (legado)")).toBeInTheDocument();
    // Host masked: 3 primeiros + bullets + 4 últimos do hostname.
    // "db.example.com" hostname → "db." + bullets + ".com"
    expect(screen.getByTestId("conn-host-conn-1")).toHaveTextContent(/db\./);
    expect(screen.getByTestId("conn-host-conn-1")).toHaveTextContent(/\.com:5432$/);
    // Garante que parte do meio do hostname é mascarada (não aparece "example").
    expect(
      screen.getByTestId("conn-host-conn-1").textContent ?? "",
    ).not.toContain("example");
    expect(screen.getByText("chatwoot")).toBeInTheDocument();
    expect(screen.getByText(/3 empresas/i)).toBeInTheDocument();
  });

  it("status badge muda de cor por status", () => {
    render(
      <ConnectionList
        connections={[
          sampleConn({ id: "conn-a", status: "active" }),
          sampleConn({ id: "conn-b", status: "paused" }),
          sampleConn({ id: "conn-c", status: "error" }),
        ]}
      />,
    );
    expect(screen.getByTestId("conn-status-conn-a")).toHaveTextContent(/Ativa/i);
    expect(screen.getByTestId("conn-status-conn-b")).toHaveTextContent(
      /Pausada/i,
    );
    expect(screen.getByTestId("conn-status-conn-c")).toHaveTextContent(/Erro/i);
  });

  it("clicar em Testar dispara testNexusChatConnection e mostra toast verde em sucesso", async () => {
    testNexusChatConnection.mockResolvedValue({
      success: true,
      data: { durationMs: 42 },
    });
    render(<ConnectionList connections={[sampleConn()]} />);
    const btn = screen.getByRole("button", { name: /Testar conexão/i });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(testNexusChatConnection).toHaveBeenCalledWith("conn-1");
    });
    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalled();
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("clicar em Testar mostra toast vermelho em erro", async () => {
    testNexusChatConnection.mockResolvedValue({
      success: false,
      error: "Connection refused",
    });
    render(<ConnectionList connections={[sampleConn()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Testar conexão/i }));
    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringContaining("Connection refused"),
      );
    });
  });

  it("apagar conexão dispara softDeleteNexusChatConnection após confirmação", async () => {
    softDeleteNexusChatConnection.mockResolvedValue({ success: true });
    render(<ConnectionList connections={[sampleConn()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Apagar conexão/i }));
    // AlertDialog abre — botão "Apagar" dentro do diálogo.
    const confirmBtn = await screen.findByTestId("conn-delete-confirm");
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(softDeleteNexusChatConnection).toHaveBeenCalledWith("conn-1");
    });
    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalled();
    });
  });

  it("v0.41: badge Webhook removido — não há indicador webhook na linha", () => {
    render(<ConnectionList connections={[sampleConn({ id: "conn-x" })]} />);
    expect(
      screen.queryByTestId("conn-webhook-conn-x"),
    ).not.toBeInTheDocument();
  });

  it("apagar mostra toast vermelho com mensagem do backend (bindings vinculadas)", async () => {
    softDeleteNexusChatConnection.mockResolvedValue({
      success: false,
      error: "Existem 2 empresas vinculadas a esta conexão. Desabilite os bindings primeiro.",
    });
    render(<ConnectionList connections={[sampleConn()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Apagar conexão/i }));
    const confirmBtn = await screen.findByTestId("conn-delete-confirm");
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringContaining("vinculadas"),
      );
    });
  });

  it("v0.41: linha INTEIRA da connection é um Link clicável para /bancos-de-dados/[id]", () => {
    render(
      <ConnectionList connections={[sampleConn({ id: "conn-link-1" })]} />,
    );
    const link = screen.getByRole("link", {
      name: /Abrir detalhes da conexão/i,
    });
    expect(link).toHaveAttribute("href", "/bancos-de-dados/conn-link-1");
  });

  it("v0.41: clique no botão Activity (testar) tem stopPropagation — não dispara navegação", async () => {
    testNexusChatConnection.mockResolvedValue({
      success: true,
      data: { durationMs: 10 },
    });
    render(<ConnectionList connections={[sampleConn()]} />);
    const btn = screen.getByRole("button", { name: /Testar conexão/i });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(testNexusChatConnection).toHaveBeenCalled();
    });
    // router.push NÃO deve ser chamado — Link.href só dispara em click "real"
    // do anchor, e o botão usa stopPropagation+preventDefault.
    expect(push).not.toHaveBeenCalled();
  });
});
