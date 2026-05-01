/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

const toastMock = { success: jest.fn(), error: jest.fn() };
jest.mock("sonner", () => ({ toast: toastMock }));

jest.mock("@/lib/actions/integrations-power-bi", () => ({
  rotatePasswordAction: jest.fn(),
}));

import { rotatePasswordAction } from "@/lib/actions/integrations-power-bi";
import { RotatePasswordDialog } from "../rotate-password-dialog";

describe("RotatePasswordDialog", () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    (rotatePasswordAction as jest.Mock).mockReset();
  });

  it("renderiza dialog com aviso de impacto", () => {
    render(
      <RotatePasswordDialog
        open
        onOpenChange={() => {}}
        profileId="p-1"
        profileName="Diretoria"
        onSuccess={() => {}}
      />,
    );
    expect(screen.getByTestId("rotate-password-dialog")).toBeInTheDocument();
    expect(screen.getByText(/Rotacionar senha\?/)).toBeInTheDocument();
    expect(screen.getByText(/imediatamente/)).toBeInTheDocument();
  });

  it("clica em 'Rotacionar agora' chama action + toast + onSuccess(plain)", async () => {
    (rotatePasswordAction as jest.Mock).mockResolvedValue({
      ok: true,
      data: { password: "NEW-ROTATED-PWD" },
    });

    const onSuccess = jest.fn();
    const onOpenChange = jest.fn();

    render(
      <RotatePasswordDialog
        open
        onOpenChange={onOpenChange}
        profileId="p-1"
        profileName="Diretoria"
        onSuccess={onSuccess}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("rotate-confirm-button"));
    });

    expect(rotatePasswordAction).toHaveBeenCalledWith("p-1");
    expect(toastMock.success).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalledWith("NEW-ROTATED-PWD");
  });

  it("toast.error quando rate limit é atingido", async () => {
    (rotatePasswordAction as jest.Mock).mockResolvedValue({
      ok: false,
      error: "Limite de 10 rotações por dia atingido.",
    });

    render(
      <RotatePasswordDialog
        open
        onOpenChange={() => {}}
        profileId="p-1"
        profileName="Diretoria"
        onSuccess={() => {}}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("rotate-confirm-button"));
    });

    expect(toastMock.error).toHaveBeenCalledWith(
      "Limite de 10 rotações por dia atingido.",
    );
  });

  it("clica em 'Cancelar' chama onOpenChange(false)", () => {
    const onOpenChange = jest.fn();
    render(
      <RotatePasswordDialog
        open
        onOpenChange={onOpenChange}
        profileId="p-1"
        profileName="Diretoria"
        onSuccess={() => {}}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByTestId("rotate-cancel-button"));
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
