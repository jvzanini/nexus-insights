/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
};
jest.mock("sonner", () => ({ toast: toastMock }));

import { SnippetBlock } from "../snippet-block";

describe("SnippetBlock", () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renderiza valor e botão copy", () => {
    render(<SnippetBlock value="hello world" />);
    expect(screen.getByTestId("snippet-block")).toBeInTheDocument();
    expect(screen.getByTestId("snippet-block-content")).toHaveTextContent(
      "hello world",
    );
    expect(screen.getByTestId("snippet-block-copy")).toBeInTheDocument();
  });

  it("renderiza label opcional acima quando provido", () => {
    render(<SnippetBlock label="Server" value="db.example.com:5432" />);
    expect(screen.getByText("Server")).toBeInTheDocument();
    expect(screen.getByLabelText("Copiar Server")).toBeInTheDocument();
  });

  it("aria-label fallback é 'Copiar valor' quando sem label", () => {
    render(<SnippetBlock value="abc" />);
    expect(screen.getByLabelText("Copiar valor")).toBeInTheDocument();
  });

  it("clicar no botão Copy chama clipboard.writeText e dispara toast 'Copiado!'", async () => {
    render(<SnippetBlock label="Server" value="db.example.com:5432" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("snippet-block-copy"));
    });

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "db.example.com:5432",
      );
    });
    expect(toastMock.success).toHaveBeenCalledWith("Copiado!");
  });

  it("toast.error quando clipboard falha", async () => {
    (navigator.clipboard.writeText as jest.Mock).mockRejectedValue(
      new Error("denied"),
    );
    // Remover document.execCommand para forçar falha total
    const orig = document.execCommand;
    document.execCommand = jest.fn().mockReturnValue(false);

    render(<SnippetBlock value="abc" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("snippet-block-copy"));
    });

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalled();
    });

    document.execCommand = orig;
  });
});
