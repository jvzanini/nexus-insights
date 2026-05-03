/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { PromptPreviewCard } from "../prompt-preview-card";

jest.mock("../identity-base-editor", () => ({
  IdentityBaseEditor: ({ current, isCustom }: { current: string; isCustom: boolean }) => (
    <div data-testid="identity-editor">
      Editor mock - {isCustom ? "custom" : "default"} - len={current.length}
    </div>
  ),
}));

const mockClipboard = jest.fn();
Object.assign(navigator, {
  clipboard: { writeText: (t: string) => mockClipboard(t) },
});

const baseConfig = {
  identityBase: null,
  personality: "",
  tone: "",
  guardrails: [],
  advancedOverride: null,
  audioInputEnabled: false,
  kbEnabled: false,
};

describe("PromptPreviewCard — v0.28", () => {
  it("prompt SEMPRE visível (sem collapse)", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin
        currentIdentityBase="Você é o Agente Nex —"
        isIdentityBaseCustom={false}
      />,
    );
    expect(screen.getByTestId("prompt-preview")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ver prompt completo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /maximizar/i })).not.toBeInTheDocument();
  });

  it("Editar (super_admin) abre IdentityBaseEditor (não PromptConfigForm)", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin
        currentIdentityBase="texto"
        isIdentityBaseCustom={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByTestId("identity-editor")).toBeInTheDocument();
  });

  it("não-superadmin: Editar oculto + microcopy explicativo", () => {
    render(
      <PromptPreviewCard
        config={baseConfig}
        kbDocs={[]}
        accountUrls={[]}
        isSuperAdmin={false}
        currentIdentityBase="texto"
        isIdentityBaseCustom={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Apenas super_admins podem editar/i)).toBeInTheDocument();
  });
});
