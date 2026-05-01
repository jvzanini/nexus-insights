/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

import type { NexPromptConfig } from "@/lib/nex/prompt-compose";
import { IDENTITY_BASE } from "@/lib/nex/prompt-compose";

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};
jest.mock("sonner", () => ({
  toast: toastMock,
}));

import { PromptPreviewCard } from "../prompt-preview-card";

const baseConfig: NexPromptConfig = {
  personality: "Direto",
  tone: "Profissional, mas amigável",
  guardrails: ["Nunca invente dados"],
  advancedOverride: null,
  audioInputEnabled: false,
  kbEnabled: true,
};

const baseDocs = [
  { name: "manual.pdf", extractedText: "conteúdo do manual" },
];

const baseUrls = [
  { accountId: 7, publicUrl: "https://chat.example.com", label: "Matrix" },
];

describe("PromptPreviewCard", () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it("renderiza preview com personality, tom e KB", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={baseDocs}
        accountUrls={baseUrls}
      />,
    );

    const preview = screen.getByTestId("prompt-preview");
    expect(preview).toBeInTheDocument();
    expect(preview.textContent).toContain("Personalidade: Direto");
    expect(preview.textContent).toContain("Tom: Profissional, mas amigável");
    expect(preview.textContent).toContain("Nunca invente dados");
    expect(preview.textContent).toContain("manual.pdf");
    expect(preview.textContent).toContain("Conta 7");
  });

  it("não exibe IDENTITY_BASE em destaque por padrão (collapsible default closed)", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={baseDocs}
        accountUrls={baseUrls}
      />,
    );

    // Botão do toggle deve dizer "Mostrar identidade fixa"
    expect(
      screen.getByRole("button", { name: /Mostrar identidade fixa/i }),
    ).toBeInTheDocument();

    // Bloco em destaque com IDENTITY_BASE não está renderizado.
    expect(screen.queryByTestId("identity-base")).not.toBeInTheDocument();
  });

  it("toggle revela e oculta IDENTITY_BASE em destaque", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={baseDocs}
        accountUrls={baseUrls}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: /Mostrar identidade fixa/i,
    });
    fireEvent.click(toggle);

    const identityEl = screen.getByTestId("identity-base");
    expect(identityEl).toBeInTheDocument();
    expect(identityEl.textContent).toContain(IDENTITY_BASE.slice(0, 40));

    // botão muda pra "Ocultar"
    expect(
      screen.getByRole("button", { name: /Ocultar identidade fixa/i }),
    ).toBeInTheDocument();

    // Clica de novo: oculta
    fireEvent.click(
      screen.getByRole("button", { name: /Ocultar identidade fixa/i }),
    );
    expect(screen.queryByTestId("identity-base")).not.toBeInTheDocument();
  });

  it("Botão Copiar dispara navigator.clipboard.writeText e toast de sucesso", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={baseDocs}
        accountUrls={baseUrls}
      />,
    );

    const copyBtn = screen.getByRole("button", { name: /Copiar/i });
    fireEvent.click(copyBtn);

    // aguarda microtask do await
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledTimes(1);
    const arg = writeText.mock.calls[0][0] as string;
    expect(arg).toContain("Personalidade: Direto");
    expect(toastMock.success).toHaveBeenCalledWith("Prompt copiado!");
  });

  it("Botão Copiar dispara toast.error em caso de falha", async () => {
    const writeText = jest.fn().mockRejectedValue(new Error("boom"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={baseDocs}
        accountUrls={baseUrls}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Copiar/i }));

    await Promise.resolve();
    await Promise.resolve();

    expect(toastMock.error).toHaveBeenCalled();
  });

  it("Botão Maximizar abre Sheet (dialog) com prompt", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={baseDocs}
        accountUrls={baseUrls}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Maximizar/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog.textContent).toContain("Personalidade: Direto");
  });
});
