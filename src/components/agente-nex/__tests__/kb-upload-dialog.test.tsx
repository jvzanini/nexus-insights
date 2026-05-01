/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

jest.mock("@/lib/actions/nex-prompt", () => ({
  uploadKbDocumentAction: jest.fn(async () => ({
    ok: true,
    data: { id: "new", charCount: 100 },
  })),
  addKbUrlAction: jest.fn(async () => ({
    ok: true,
    data: { id: "new-url", charCount: 800 },
  })),
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

import {
  addKbUrlAction,
  uploadKbDocumentAction,
} from "@/lib/actions/nex-prompt";
import { KbUploadDialog } from "../kb-upload-dialog";

describe("KbUploadDialog — tabs (Arquivo / URL)", () => {
  beforeEach(() => {
    refresh.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    (uploadKbDocumentAction as jest.Mock).mockClear();
    (addKbUrlAction as jest.Mock).mockClear();
  });

  it("renderiza com 2 tabs visíveis (Arquivo e URL)", () => {
    render(<KbUploadDialog open onOpenChange={() => {}} />);

    expect(
      screen.getByRole("tab", { name: /Arquivo/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /URL/i })).toBeInTheDocument();
  });

  it("tab Arquivo (default) mantém comportamento de upload", async () => {
    render(<KbUploadDialog open onOpenChange={() => {}} />);

    const fileInput = screen.getByLabelText(
      /Selecionar arquivo PDF ou TXT/i,
    ) as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    const file = new File(["conteudo"], "doc.txt", { type: "text/plain" });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(screen.getByTestId("kb-upload-preview")).toBeInTheDocument();
    expect(screen.getByText("doc.txt")).toBeInTheDocument();
  });

  it("tab URL mostra inputs de nome e URL e botão 'Adicionar URL'", async () => {
    render(<KbUploadDialog open onOpenChange={() => {}} />);

    const urlTab = screen.getByRole("tab", { name: /URL/i });
    await act(async () => {
      fireEvent.click(urlTab);
    });

    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    expect(document.getElementById("kb-url-input")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Adicionar URL/i }),
    ).toBeInTheDocument();
  });

  it("submit URL chama addKbUrlAction com payload correto e fecha dialog", async () => {
    const onOpenChange = jest.fn();
    render(<KbUploadDialog open onOpenChange={onOpenChange} />);

    const urlTab = screen.getByRole("tab", { name: /URL/i });
    await act(async () => {
      fireEvent.click(urlTab);
    });

    const nameInput = screen.getByLabelText("Nome") as HTMLInputElement;
    const urlInput = document.getElementById("kb-url-input") as HTMLInputElement;

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "Política Treino" } });
      fireEvent.change(urlInput, {
        target: { value: "https://exemplo.com/treino" },
      });
    });

    const submit = screen.getByRole("button", { name: /Adicionar URL/i });
    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(() =>
      expect(addKbUrlAction).toHaveBeenCalledWith({
        name: "Política Treino",
        url: "https://exemplo.com/treino",
      }),
    );
    expect(toastMock.success).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("erro do action mostra toast.error com mensagem específica", async () => {
    (addKbUrlAction as jest.Mock).mockResolvedValueOnce({
      ok: false,
      error: "URL inválida — use HTTPS.",
    });
    render(<KbUploadDialog open onOpenChange={() => {}} />);

    const urlTab = screen.getByRole("tab", { name: /URL/i });
    await act(async () => {
      fireEvent.click(urlTab);
    });

    const nameInput = screen.getByLabelText("Nome") as HTMLInputElement;
    const urlInput = document.getElementById("kb-url-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "Teste" } });
      fireEvent.change(urlInput, {
        target: { value: "https://exemplo.com/x" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Adicionar URL/i }));
    });

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("URL inválida — use HTTPS."),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("URL não-HTTPS é bloqueada client-side antes de chamar action", async () => {
    render(<KbUploadDialog open onOpenChange={() => {}} />);

    const urlTab = screen.getByRole("tab", { name: /URL/i });
    await act(async () => {
      fireEvent.click(urlTab);
    });

    const nameInput = screen.getByLabelText("Nome") as HTMLInputElement;
    const urlInput = document.getElementById("kb-url-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "Teste" } });
      fireEvent.change(urlInput, {
        target: { value: "http://exemplo.com/x" }, // HTTP não permitido
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Adicionar URL/i }));
    });

    expect(addKbUrlAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/HTTPS/i);
  });

  it("nome vazio bloqueia submit client-side", async () => {
    render(<KbUploadDialog open onOpenChange={() => {}} />);

    const urlTab = screen.getByRole("tab", { name: /URL/i });
    await act(async () => {
      fireEvent.click(urlTab);
    });

    const urlInput = document.getElementById("kb-url-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(urlInput, {
        target: { value: "https://exemplo.com/x" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Adicionar URL/i }));
    });

    expect(addKbUrlAction).not.toHaveBeenCalled();
  });
});
