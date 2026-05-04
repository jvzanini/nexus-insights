/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const createCompanyChatBinding = jest.fn();
const updateCompanyChatBinding = jest.fn();
const refresh = jest.fn();

jest.mock("@/lib/actions/nexus-chat/bindings", () => ({
  createCompanyChatBinding: (...args: unknown[]) =>
    createCompanyChatBinding(...args),
  updateCompanyChatBinding: (...args: unknown[]) =>
    updateCompanyChatBinding(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
};
jest.mock("sonner", () => ({ toast: toastMock }));

import { BindingFormDialog } from "../binding-form-dialog";

describe("<BindingFormDialog />", () => {
  beforeEach(() => {
    createCompanyChatBinding.mockReset();
    updateCompanyChatBinding.mockReset();
    refresh.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it("modo create chama createCompanyChatBinding com input correto", async () => {
    createCompanyChatBinding.mockResolvedValue({
      success: true,
      data: { id: "bind-new" },
    });
    const onOpenChange = jest.fn();
    render(
      <BindingFormDialog
        mode="create"
        open
        onOpenChange={onOpenChange}
        connectionId="conn-1"
        binding={null}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Account ID/i), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByLabelText(/Nome de exibição/i), {
      target: { value: "Empresa Z" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/i }));
    await waitFor(() => {
      expect(createCompanyChatBinding).toHaveBeenCalled();
    });
    const arg = createCompanyChatBinding.mock.calls[0][0];
    expect(arg.connectionId).toBe("conn-1");
    expect(arg.chatwootAccountId).toBe(42);
    expect(arg.displayName).toBe("Empresa Z");
    expect(arg.enabled).toBe(true);
    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalled();
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("modo edit chama updateCompanyChatBinding e não envia chatwootAccountId", async () => {
    updateCompanyChatBinding.mockResolvedValue({ success: true });
    render(
      <BindingFormDialog
        mode="edit"
        open
        onOpenChange={jest.fn()}
        connectionId="conn-1"
        binding={{
          id: "bind-1",
          connectionId: "conn-1",
          chatwootAccountId: 7,
          displayName: "Antiga",
          enabled: true,
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Nome de exibição/i), {
      target: { value: "Nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/i }));
    await waitFor(() => {
      expect(updateCompanyChatBinding).toHaveBeenCalledWith("bind-1", {
        displayName: "Nova",
        enabled: true,
      });
    });
  });

  it("submit erro mostra toast vermelho com mensagem do backend", async () => {
    createCompanyChatBinding.mockResolvedValue({
      success: false,
      error: "Já existe uma empresa cadastrada com account_id=42",
    });
    render(
      <BindingFormDialog
        mode="create"
        open
        onOpenChange={jest.fn()}
        connectionId="conn-1"
        binding={null}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Account ID/i), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByLabelText(/Nome de exibição/i), {
      target: { value: "Dup" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/i }));
    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringContaining("Já existe"),
      );
    });
  });
});
