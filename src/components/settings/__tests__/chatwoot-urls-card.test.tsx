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

import type { ChatwootAccountUrl } from "@/lib/actions/settings";

const setChatwootAccountUrlAction = jest.fn();
const refresh = jest.fn();

jest.mock("@/lib/actions/settings", () => ({
  setChatwootAccountUrlAction: (...args: unknown[]) =>
    setChatwootAccountUrlAction(...args),
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

import { ChatwootUrlsCard } from "../chatwoot-urls-card";

describe("<ChatwootUrlsCard />", () => {
  beforeEach(() => {
    setChatwootAccountUrlAction.mockReset();
    refresh.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.warning.mockReset();
    toastMock.info.mockReset();
  });

  it("renderiza uma linha por accountId conhecido", () => {
    render(
      <ChatwootUrlsCard
        accounts={[{ accountId: 1 }, { accountId: 7 }]}
        initial={[]}
      />,
    );
    expect(screen.getByTestId("chatwoot-url-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("chatwoot-url-row-7")).toBeInTheDocument();
  });

  it("pré-preenche inputs com a URL/label salva", () => {
    const initial: ChatwootAccountUrl[] = [
      { accountId: 1, publicUrl: "https://chat.exemplo.com", label: "Matriz" },
    ];
    render(
      <ChatwootUrlsCard accounts={[{ accountId: 1 }]} initial={initial} />,
    );
    const url = screen.getByTestId(
      "chatwoot-url-input-1",
    ) as HTMLInputElement;
    const label = screen.getByTestId(
      "chatwoot-url-label-1",
    ) as HTMLInputElement;
    expect(url.value).toBe("https://chat.exemplo.com");
    expect(label.value).toBe("Matriz");
  });

  it("salvar com URL HTTPS válida chama setChatwootAccountUrlAction", async () => {
    setChatwootAccountUrlAction.mockResolvedValue({
      ok: true,
      data: { accountId: 1 },
    });

    render(
      <ChatwootUrlsCard accounts={[{ accountId: 1 }]} initial={[]} />,
    );

    const url = screen.getByTestId("chatwoot-url-input-1");
    fireEvent.change(url, { target: { value: "https://chat.exemplo.com" } });

    const label = screen.getByTestId("chatwoot-url-label-1");
    fireEvent.change(label, { target: { value: "Matriz" } });

    const saveBtn = screen.getByTestId("chatwoot-url-save-1");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() =>
      expect(setChatwootAccountUrlAction).toHaveBeenCalledTimes(1),
    );
    expect(setChatwootAccountUrlAction).toHaveBeenCalledWith({
      accountId: 1,
      publicUrl: "https://chat.exemplo.com",
      label: "Matriz",
    });
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(
        expect.stringMatching(/Salv/i),
      ),
    );
  });

  it("URL inválida (não HTTPS) bloqueia submit e mostra toast de erro", async () => {
    render(
      <ChatwootUrlsCard accounts={[{ accountId: 1 }]} initial={[]} />,
    );

    const url = screen.getByTestId("chatwoot-url-input-1");
    fireEvent.change(url, { target: { value: "http://chat.exemplo.com" } });

    const saveBtn = screen.getByTestId("chatwoot-url-save-1");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(setChatwootAccountUrlAction).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(
      expect.stringMatching(/HTTPS/i),
    );
  });

  it("URL malformada bloqueia submit e mostra toast de erro", async () => {
    render(
      <ChatwootUrlsCard accounts={[{ accountId: 1 }]} initial={[]} />,
    );

    const url = screen.getByTestId("chatwoot-url-input-1");
    fireEvent.change(url, { target: { value: "isso não é url" } });

    const saveBtn = screen.getByTestId("chatwoot-url-save-1");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(setChatwootAccountUrlAction).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalled();
  });

  it("URL vazia (com URL salva previamente) chama action com publicUrl='' (DELETE)", async () => {
    setChatwootAccountUrlAction.mockResolvedValue({
      ok: true,
      data: { accountId: 1 },
    });

    const initial: ChatwootAccountUrl[] = [
      { accountId: 1, publicUrl: "https://chat.exemplo.com", label: null },
    ];
    render(
      <ChatwootUrlsCard accounts={[{ accountId: 1 }]} initial={initial} />,
    );

    const url = screen.getByTestId("chatwoot-url-input-1");
    fireEvent.change(url, { target: { value: "" } });

    const saveBtn = screen.getByTestId("chatwoot-url-save-1");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() =>
      expect(setChatwootAccountUrlAction).toHaveBeenCalledWith({
        accountId: 1,
        publicUrl: "",
        label: null,
      }),
    );
  });

  it("renderiza empty state quando 0 accounts", () => {
    render(<ChatwootUrlsCard accounts={[]} initial={[]} />);
    expect(
      screen.getByText(/Nenhuma conta Chatwoot detectada/i),
    ).toBeInTheDocument();
  });

  it("trim de trailing slash antes de chamar action", async () => {
    setChatwootAccountUrlAction.mockResolvedValue({
      ok: true,
      data: { accountId: 1 },
    });

    render(
      <ChatwootUrlsCard accounts={[{ accountId: 1 }]} initial={[]} />,
    );

    const url = screen.getByTestId("chatwoot-url-input-1");
    fireEvent.change(url, {
      target: { value: "https://chat.exemplo.com/" },
    });

    const saveBtn = screen.getByTestId("chatwoot-url-save-1");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() =>
      expect(setChatwootAccountUrlAction).toHaveBeenCalledWith({
        accountId: 1,
        publicUrl: "https://chat.exemplo.com",
        label: null,
      }),
    );
  });

  it("erro do server (ok: false) mostra toast de erro", async () => {
    setChatwootAccountUrlAction.mockResolvedValue({
      ok: false,
      error: "Apenas super_admin pode editar URLs públicas Chatwoot",
    });

    render(
      <ChatwootUrlsCard accounts={[{ accountId: 1 }]} initial={[]} />,
    );

    const url = screen.getByTestId("chatwoot-url-input-1");
    fireEvent.change(url, { target: { value: "https://chat.exemplo.com" } });

    const saveBtn = screen.getByTestId("chatwoot-url-save-1");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringMatching(/super_admin/),
      ),
    );
  });

  it("botão Salvar fica disabled quando não há mudanças (estado limpo)", () => {
    const initial: ChatwootAccountUrl[] = [
      { accountId: 1, publicUrl: "https://chat.exemplo.com", label: "Matriz" },
    ];
    render(
      <ChatwootUrlsCard accounts={[{ accountId: 1 }]} initial={initial} />,
    );
    const saveBtn = screen.getByTestId("chatwoot-url-save-1");
    expect(saveBtn).toBeDisabled();
  });
});
