/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

import type { NexPromptConfig } from "@/lib/nex/prompt-compose";

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};
jest.mock("sonner", () => ({
  toast: toastMock,
}));

// Mock do PromptConfigForm — evita carregar Server Actions / next/navigation
// no jsdom; o teste de Editar só precisa garantir que o Dialog abre.
jest.mock("@/components/agente-nex/prompt-config-form", () => ({
  PromptConfigForm: () => <div data-testid="mocked-prompt-config-form" />,
}));

import { PromptPreviewCard } from "../prompt-preview-card";

const baseConfig: NexPromptConfig = {
  personality: "",
  tone: "",
  guardrails: [],
  advancedOverride: null,
  audioInputEnabled: false,
  kbEnabled: false,
};

describe("PromptPreviewCard — v0.26", () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it("oculta o prompt por default; revela ao clicar no collapse", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin
      />,
    );
    expect(screen.queryByTestId("prompt-preview")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /ver prompt completo/i }),
    );
    expect(screen.getByTestId("prompt-preview")).toBeInTheDocument();
  });

  it("super_admin vê Editar (e NÃO vê Maximizar)", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin
      />,
    );
    expect(
      screen.getByRole("button", { name: /editar/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /maximizar/i }),
    ).not.toBeInTheDocument();
  });

  it("não super_admin: NÃO vê Editar, mostra microcopy explicativo", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin={false}
      />,
    );
    expect(
      screen.getByRole("button", { name: /copiar/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /editar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Apenas super_admins podem editar/i),
    ).toBeInTheDocument();
  });

  it("clicar Editar (super_admin) abre Dialog max-edit", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText(/Editar prompt do Agente Nex/i),
    ).toBeInTheDocument();
  });

  it("pre do prompt-preview NÃO usa aria-readonly (atributo inválido em HTML)", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /ver prompt completo/i }),
    );
    const pre = screen.getByTestId("prompt-preview");
    expect(pre.getAttribute("aria-readonly")).toBeNull();
  });
});
