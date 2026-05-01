/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
};
jest.mock("sonner", () => ({ toast: toastMock }));

jest.mock("@/lib/actions/integrations-power-bi", () => ({
  revealPasswordAction: jest.fn(),
  rotatePasswordAction: jest.fn(),
}));

import {
  revealPasswordAction,
  rotatePasswordAction,
} from "@/lib/actions/integrations-power-bi";
import { ProfileCredentialsCard } from "../profile-credentials-card";

const baseProfile = {
  id: "p-1",
  name: "Diretoria",
  pgUsername: "pbi_diretoria_a3f8c2",
  passwordLast4: "x123",
};

describe("ProfileCredentialsCard", () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    (revealPasswordAction as jest.Mock).mockReset();
    (rotatePasswordAction as jest.Mock).mockReset();
  });

  it("renderiza card com host/porta/banco/usuario e senha mascarada", () => {
    render(<ProfileCredentialsCard profile={baseProfile} />);
    expect(screen.getByTestId("profile-credentials-card")).toBeInTheDocument();
    expect(screen.getByText("Credenciais")).toBeInTheDocument();
    expect(screen.getByText("5432")).toBeInTheDocument();
    expect(screen.getByText("nexus_insights")).toBeInTheDocument();
    expect(screen.getByText("pbi_diretoria_a3f8c2")).toBeInTheDocument();
    expect(screen.getByTestId("masked-password-field")).toHaveTextContent(
      "••••••••x123",
    );
  });

  it("clica em 'Mostrar senha completa' chama revealPasswordAction", async () => {
    (revealPasswordAction as jest.Mock).mockResolvedValue({
      ok: true,
      data: { password: "REVEALED-FULL-PWD" },
    });

    render(<ProfileCredentialsCard profile={baseProfile} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("reveal-password-button"));
    });

    await waitFor(() => {
      expect(revealPasswordAction).toHaveBeenCalledWith("p-1");
    });
    expect(toastMock.success).toHaveBeenCalled();
  });

  it("toast.error quando revealPasswordAction retorna rate limit", async () => {
    (revealPasswordAction as jest.Mock).mockResolvedValue({
      ok: false,
      error: "Limite de 5 revelações por dia atingido.",
    });

    render(<ProfileCredentialsCard profile={baseProfile} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("reveal-password-button"));
    });

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        "Limite de 5 revelações por dia atingido.",
      );
    });
  });

  it("botão 'Rotacionar senha' está renderizado", () => {
    render(<ProfileCredentialsCard profile={baseProfile} />);
    expect(screen.getByTestId("rotate-password-button")).toBeInTheDocument();
  });
});
