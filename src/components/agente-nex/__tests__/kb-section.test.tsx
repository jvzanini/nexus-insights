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
  within,
} from "@testing-library/react";

import type { KbSummary } from "@/lib/nex/kb";

const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

jest.mock("@/lib/actions/nex-prompt", () => ({
  listKbDocumentsAction: jest.fn(async () => ({ ok: true, data: [] })),
  uploadKbDocumentAction: jest.fn(async () => ({
    ok: true,
    data: { id: "new", charCount: 100 },
  })),
  deleteKbDocumentAction: jest.fn(async () => ({ ok: true })),
  addKbUrlAction: jest.fn(async () => ({
    ok: true,
    data: { id: "new", charCount: 100 },
  })),
  refreshKbUrlAction: jest.fn(async () => ({
    ok: true,
    data: { charCount: 200, truncated: false },
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
  deleteKbDocumentAction,
  refreshKbUrlAction,
  uploadKbDocumentAction,
} from "@/lib/actions/nex-prompt";
import { KbSection } from "../kb-section";

function makeDoc(overrides: Partial<KbSummary> = {}): KbSummary {
  return {
    id: "doc-1",
    name: "manual-treino.pdf",
    kind: "PDF",
    sourceUrl: null,
    mimeType: "application/pdf",
    fileSize: 350 * 1024, // 350 KB
    charCount: 12_000,
    createdAt: new Date("2026-04-25T10:00:00Z"),
    updatedAt: new Date("2026-04-25T10:00:00Z"),
    uploadedById: "user-1",
    ...overrides,
  };
}

function makeUrlDoc(overrides: Partial<KbSummary> = {}): KbSummary {
  return makeDoc({
    id: "doc-url-1",
    name: "Chatwoot API Reference",
    kind: "URL",
    sourceUrl: "https://www.chatwoot.com/developers/api/",
    mimeType: "text/plain",
    fileSize: 8 * 1024,
    charCount: 8_000,
    ...overrides,
  });
}

describe("KbSection", () => {
  beforeEach(() => {
    refresh.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    (uploadKbDocumentAction as jest.Mock).mockClear();
    (deleteKbDocumentAction as jest.Mock).mockClear();
    (refreshKbUrlAction as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renderiza empty state quando initial está vazio", () => {
    render(<KbSection initial={[]} />);
    expect(
      screen.getByText(/Nenhum documento adicionado ainda/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Adicionar conhecimento$/i }),
    ).toBeInTheDocument();
  });

  it("renderiza um documento PDF com nome, tamanho e charCount", () => {
    const doc = makeDoc();
    render(<KbSection initial={[doc]} />);

    expect(screen.getByText("manual-treino.pdf")).toBeInTheDocument();
    expect(screen.getByText(/350\.0 KB/)).toBeInTheDocument();
    expect(screen.getByText(/12\.000 chars/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Excluir documento manual-treino\.pdf/i,
      }),
    ).toBeInTheDocument();
    // PDF não deve ter botão "Atualizar conteúdo".
    expect(
      screen.queryByRole("button", { name: /Atualizar conteúdo de/i }),
    ).not.toBeInTheDocument();
  });

  it("renderiza um documento URL com link clicável e ação Atualizar", () => {
    const doc = makeUrlDoc();
    render(<KbSection initial={[doc]} />);

    expect(screen.getByText("Chatwoot API Reference")).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: /Abrir https:\/\/www\.chatwoot\.com\/developers\/api\/ em nova aba/i,
    });
    expect(link).toHaveAttribute("href", "https://www.chatwoot.com/developers/api/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    // hostname truncado visível no texto do link.
    expect(link).toHaveTextContent("www.chatwoot.com");
    // Ação Atualizar conteúdo presente.
    expect(
      screen.getByRole("button", {
        name: /Atualizar conteúdo de Chatwoot API Reference/i,
      }),
    ).toBeInTheDocument();
  });

  it("mostra warning amarelo quando total > 25.000 e ≤ 30.000", () => {
    render(
      <KbSection
        initial={[
          makeDoc({ id: "a", charCount: 14_000 }),
          makeDoc({ id: "b", charCount: 13_000 }),
        ]}
      />,
    );
    expect(screen.getByText(/Próximo do limite/i)).toBeInTheDocument();
    expect(screen.queryByText(/excedendo o limite/i)).not.toBeInTheDocument();
  });

  it("mostra warning vermelho com chars excedentes quando total > 30.000", () => {
    render(
      <KbSection
        initial={[
          makeDoc({ id: "a", charCount: 20_000 }),
          makeDoc({ id: "b", charCount: 15_000 }),
        ]}
      />,
    );
    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent(/excedendo o limite serão truncados/i);
    expect(warning).toHaveTextContent(/5\.000 chars/);
  });

  it("clicar em Excluir abre AlertDialog (não window.confirm)", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    const doc = makeDoc();
    render(<KbSection initial={[doc]} />);

    const trash = screen.getByRole("button", {
      name: /Excluir documento manual-treino\.pdf/i,
    });
    await act(async () => {
      fireEvent.click(trash);
    });

    // window.confirm NÃO é mais usado.
    expect(confirmSpy).not.toHaveBeenCalled();
    // AlertDialog renderiza título + descrição.
    await waitFor(() => {
      expect(
        screen.getByRole("alertdialog", { name: /Excluir documento/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/da base de conhecimento\? Essa ação não pode ser desfeita/i),
    ).toBeInTheDocument();
    // Action ainda não disparou.
    expect(deleteKbDocumentAction).not.toHaveBeenCalled();
  });

  it("Cancelar no AlertDialog NÃO chama deleteKbDocumentAction", async () => {
    const doc = makeDoc();
    render(<KbSection initial={[doc]} />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /Excluir documento manual-treino\.pdf/i,
        }),
      );
    });

    const cancelBtn = await screen.findByRole("button", { name: /Cancelar/i });
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    expect(deleteKbDocumentAction).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("Confirmar no AlertDialog chama deleteKbDocumentAction + toast + refresh", async () => {
    const doc = makeDoc();
    render(<KbSection initial={[doc]} />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /Excluir documento manual-treino\.pdf/i,
        }),
      );
    });

    // Botão "Excluir" dentro do AlertDialog (action).
    const dialog = await screen.findByRole("alertdialog", {
      name: /Excluir documento/i,
    });
    const confirmBtn = within(dialog).getByRole("button", { name: /^Excluir$/i });

    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() =>
      expect(deleteKbDocumentAction).toHaveBeenCalledWith("doc-1"),
    );
    expect(toastMock.success).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("delete retornando ok=false dispara toast.error e NÃO chama refresh", async () => {
    (deleteKbDocumentAction as jest.Mock).mockResolvedValueOnce({
      ok: false,
      error: "Falha ao excluir",
    });
    const doc = makeDoc();
    render(<KbSection initial={[doc]} />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /Excluir documento manual-treino\.pdf/i,
        }),
      );
    });
    const dialog = await screen.findByRole("alertdialog", {
      name: /Excluir documento/i,
    });
    const confirmBtn = within(dialog).getByRole("button", { name: /^Excluir$/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Falha ao excluir"),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("clicar em 'Adicionar conhecimento' abre o dialog de upload", async () => {
    render(<KbSection initial={[]} />);
    const addBtn = screen.getByRole("button", { name: /^Adicionar conhecimento$/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    await waitFor(() => {
      const headings = screen.getAllByText(/Adicionar conhecimento/i);
      expect(headings.length).toBeGreaterThanOrEqual(2);
    });
    expect(uploadKbDocumentAction).not.toHaveBeenCalled();
  });

  it("NÃO renderiza mais o atalho 'Adicionar API Chatwoot (sugerida)'", () => {
    render(<KbSection initial={[]} />);
    expect(
      screen.queryByRole("button", {
        name: /Adicionar API Chatwoot \(sugerida\)/i,
      }),
    ).toBeNull();
    expect(
      screen.queryByText(/Adicionar API Chatwoot/i),
    ).toBeNull();
  });

  it("clicar em 'Atualizar conteúdo' em URL doc dispara refreshKbUrlAction + toast + refresh", async () => {
    const doc = makeUrlDoc();
    render(<KbSection initial={[doc]} />);

    const refreshBtn = screen.getByRole("button", {
      name: /Atualizar conteúdo de Chatwoot API Reference/i,
    });
    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    await waitFor(() =>
      expect(refreshKbUrlAction).toHaveBeenCalledWith("doc-url-1"),
    );
    expect(toastMock.success).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refresh retornando ok=false dispara toast.error e NÃO chama refresh router", async () => {
    (refreshKbUrlAction as jest.Mock).mockResolvedValueOnce({
      ok: false,
      error: "Timeout ao baixar URL",
    });
    const doc = makeUrlDoc();
    render(<KbSection initial={[doc]} />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /Atualizar conteúdo de Chatwoot API Reference/i,
        }),
      );
    });

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Timeout ao baixar URL"),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});

