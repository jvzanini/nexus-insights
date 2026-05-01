/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
  uploadKbDocumentAction,
} from "@/lib/actions/nex-prompt";
import { KbSection } from "../kb-section";

function makeDoc(overrides: Partial<KbSummary> = {}): KbSummary {
  return {
    id: "doc-1",
    name: "manual-treino.pdf",
    mimeType: "application/pdf",
    fileSize: 350 * 1024, // 350 KB
    charCount: 12_000,
    createdAt: new Date("2026-04-25T10:00:00Z"),
    updatedAt: new Date("2026-04-25T10:00:00Z"),
    uploadedById: "user-1",
    ...overrides,
  };
}

describe("KbSection", () => {
  beforeEach(() => {
    refresh.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    (uploadKbDocumentAction as jest.Mock).mockClear();
    (deleteKbDocumentAction as jest.Mock).mockClear();
    // confirm padrão: aceita
    jest.spyOn(window, "confirm").mockReturnValue(true);
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
      screen.getByRole("button", { name: /Adicionar documento/i }),
    ).toBeInTheDocument();
  });

  it("renderiza um documento com nome, tamanho e charCount", () => {
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

  it("clica em excluir → confirm → chama deleteKbDocumentAction + toast + refresh", async () => {
    const doc = makeDoc();
    render(<KbSection initial={[doc]} />);

    const trash = screen.getByRole("button", {
      name: /Excluir documento manual-treino\.pdf/i,
    });
    await act(async () => {
      fireEvent.click(trash);
    });

    await waitFor(() =>
      expect(deleteKbDocumentAction).toHaveBeenCalledWith("doc-1"),
    );
    expect(toastMock.success).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("delete cancelado pelo usuário não chama action", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    const doc = makeDoc();
    render(<KbSection initial={[doc]} />);

    const trash = screen.getByRole("button", {
      name: /Excluir documento manual-treino\.pdf/i,
    });
    fireEvent.click(trash);

    expect(deleteKbDocumentAction).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("delete retornando ok=false dispara toast.error e NÃO chama refresh", async () => {
    (deleteKbDocumentAction as jest.Mock).mockResolvedValueOnce({
      ok: false,
      error: "Falha ao excluir",
    });
    const doc = makeDoc();
    render(<KbSection initial={[doc]} />);

    const trash = screen.getByRole("button", {
      name: /Excluir documento manual-treino\.pdf/i,
    });
    await act(async () => {
      fireEvent.click(trash);
    });

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Falha ao excluir"),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("clicar em 'Adicionar documento' abre o dialog de upload", async () => {
    render(<KbSection initial={[]} />);
    const addBtn = screen.getByRole("button", { name: /Adicionar documento/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    // O dialog renderiza um título "Adicionar documento" (heading dentro do popup).
    await waitFor(() => {
      const headings = screen.getAllByText(/Adicionar documento/i);
      // botão original + heading do dialog
      expect(headings.length).toBeGreaterThanOrEqual(2);
    });
    expect(uploadKbDocumentAction).not.toHaveBeenCalled();
  });
});
