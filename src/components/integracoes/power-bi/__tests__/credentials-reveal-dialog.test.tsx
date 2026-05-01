/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};
jest.mock("sonner", () => ({ toast: toastMock }));

jest.mock("@/lib/actions/integrations-power-bi", () => ({
  revealPasswordAction: jest.fn(async () => ({
    ok: true,
    data: { password: "P@ssw0rd-FullSecret-123" },
  })),
}));

import { revealPasswordAction } from "@/lib/actions/integrations-power-bi";
import { CredentialsRevealDialog } from "../credentials-reveal-dialog";

const baseProfile = {
  id: "p-1",
  name: "Diretoria",
  pgUsername: "pbi_diretoria_a3f8c2",
  passwordLast4: "x123",
};

describe("CredentialsRevealDialog", () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    (revealPasswordAction as jest.Mock).mockClear();
  });

  it("modo criação: mostra plainPassword inline imediatamente", async () => {
    render(
      <CredentialsRevealDialog
        open
        onOpenChange={() => {}}
        profile={baseProfile}
        plainPassword="My-NewLY-Created-Password!"
      />,
    );

    await waitFor(() => {
      const code = screen.getByTestId("creds-password");
      expect(code).toHaveTextContent("My-NewLY-Created-Password!");
    });
  });

  it("modo pós-criação: exibe botão 'Mostrar senha completa' quando plainPassword é null", () => {
    render(
      <CredentialsRevealDialog
        open
        onOpenChange={() => {}}
        profile={baseProfile}
        plainPassword={null}
      />,
    );

    const code = screen.getByTestId("creds-password");
    // Exibe placeholder mascarado com last4.
    expect(code.textContent).toContain("x123");
    expect(screen.getByTestId("creds-reveal-btn")).toBeInTheDocument();
  });

  it("clicar em 'Mostrar senha completa' chama revealPasswordAction e mostra a senha", async () => {
    render(
      <CredentialsRevealDialog
        open
        onOpenChange={() => {}}
        profile={baseProfile}
        plainPassword={null}
      />,
    );

    const btn = screen.getByTestId("creds-reveal-btn");
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(revealPasswordAction).toHaveBeenCalledWith("p-1");
    });
    await waitFor(() => {
      const code = screen.getByTestId("creds-password");
      expect(code).toHaveTextContent("P@ssw0rd-FullSecret-123");
    });
    expect(toastMock.success).toHaveBeenCalled();
  });

  it("fechar o dialog limpa plainPassword interno (segurança)", async () => {
    const onOpenChange = jest.fn();
    const { rerender } = render(
      <CredentialsRevealDialog
        open
        onOpenChange={onOpenChange}
        profile={baseProfile}
        plainPassword="initialSecret"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("creds-password")).toHaveTextContent(
        "initialSecret",
      );
    });

    // Re-render com open=false e plainPassword=null
    rerender(
      <CredentialsRevealDialog
        open={false}
        onOpenChange={onOpenChange}
        profile={baseProfile}
        plainPassword={null}
      />,
    );

    // Reabrir sem plainPassword — interno deve estar limpo (mascarado).
    rerender(
      <CredentialsRevealDialog
        open
        onOpenChange={onOpenChange}
        profile={baseProfile}
        plainPassword={null}
      />,
    );

    await waitFor(() => {
      const code = screen.getByTestId("creds-password");
      expect(code.textContent).toContain("x123");
      expect(code.textContent).not.toContain("initialSecret");
    });
  });
});
