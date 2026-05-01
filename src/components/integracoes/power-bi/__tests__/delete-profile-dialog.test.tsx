/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen } from "@testing-library/react";

const pushMock = jest.fn();
const refreshMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const toastMock = { success: jest.fn(), error: jest.fn() };
jest.mock("sonner", () => ({ toast: toastMock }));

jest.mock("@/lib/actions/integrations-power-bi", () => ({
  deleteProfileAction: jest.fn(),
}));

import { deleteProfileAction } from "@/lib/actions/integrations-power-bi";
import { DeleteProfileDialog } from "../delete-profile-dialog";

const profile = {
  id: "p-1",
  name: "Diretoria",
  pgUsername: "pbi_diretoria_a3f8c2",
};

describe("DeleteProfileDialog", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    (deleteProfileAction as jest.Mock).mockReset();
  });

  function renderOpen() {
    return render(
      <DeleteProfileDialog
        open
        onOpenChange={() => {}}
        profile={profile}
      />,
    );
  }

  it("renderiza dialog com nome do perfil em código", () => {
    renderOpen();
    expect(screen.getByTestId("delete-profile-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("delete-confirm-name")).toHaveTextContent(
      "Diretoria",
    );
  });

  it("botão deletar disabled quando typed vazio", () => {
    renderOpen();
    expect(screen.getByTestId("delete-confirm-button")).toBeDisabled();
  });

  it("botão deletar disabled quando typed difere (case-sensitive)", () => {
    renderOpen();
    const input = screen.getByTestId("delete-confirm-input");
    act(() => {
      fireEvent.change(input, { target: { value: "diretoria" } });
    });
    expect(screen.getByTestId("delete-confirm-button")).toBeDisabled();
  });

  it("botão deletar disabled quando typed tem espaço extra (sem trim)", () => {
    renderOpen();
    const input = screen.getByTestId("delete-confirm-input");
    act(() => {
      fireEvent.change(input, { target: { value: " Diretoria" } });
    });
    expect(screen.getByTestId("delete-confirm-button")).toBeDisabled();
  });

  it("botão deletar enabled quando typed === profile.name exato", () => {
    renderOpen();
    const input = screen.getByTestId("delete-confirm-input");
    act(() => {
      fireEvent.change(input, { target: { value: "Diretoria" } });
    });
    expect(screen.getByTestId("delete-confirm-button")).not.toBeDisabled();
  });

  it("clica em deletar chama action + toast + redirect", async () => {
    (deleteProfileAction as jest.Mock).mockResolvedValue({
      ok: true,
      data: { id: "p-1" },
    });

    renderOpen();
    const input = screen.getByTestId("delete-confirm-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "Diretoria" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("delete-confirm-button"));
    });

    expect(deleteProfileAction).toHaveBeenCalledWith("p-1");
    expect(toastMock.success).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/integracoes/power-bi");
  });

  it("toast.error quando action retorna ok=false", async () => {
    (deleteProfileAction as jest.Mock).mockResolvedValue({
      ok: false,
      error: "Falha simulada",
    });

    renderOpen();
    const input = screen.getByTestId("delete-confirm-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "Diretoria" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("delete-confirm-button"));
    });

    expect(toastMock.error).toHaveBeenCalledWith("Falha simulada");
  });
});
