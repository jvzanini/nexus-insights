/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockSave = jest.fn();
const mockReset = jest.fn();
jest.mock("@/lib/actions/nex-prompt", () => ({
  saveIdentityBaseAction: (...args: unknown[]) => mockSave(...args),
  resetIdentityBaseAction: () => mockReset(),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));
const mockToast = { error: jest.fn(), success: jest.fn() };
jest.mock("sonner", () => ({ toast: mockToast }));

import { IdentityBaseEditor } from "../identity-base-editor";

describe("IdentityBaseEditor (v0.28)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToast.error.mockClear();
    mockToast.success.mockClear();
  });

  it("renderiza Textarea com texto current", () => {
    render(
      <IdentityBaseEditor current="Você é o agente." isCustom={false} onSaved={jest.fn()} />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("Você é o agente.");
  });

  it("Salvar disabled quando text === current (não-dirty)", () => {
    render(
      <IdentityBaseEditor current="abc" isCustom={false} onSaved={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: /salvar/i })).toBeDisabled();
  });

  it("Salvar enabled após editar (dirty)", () => {
    render(
      <IdentityBaseEditor current="abc" isCustom={false} onSaved={jest.fn()} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "abc!" } });
    expect(screen.getByRole("button", { name: /salvar/i })).not.toBeDisabled();
  });

  it("Restaurar padrão só aparece quando isCustom=true", () => {
    const { rerender } = render(
      <IdentityBaseEditor current="abc" isCustom={false} onSaved={jest.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /restaurar/i })).not.toBeInTheDocument();
    rerender(
      <IdentityBaseEditor current="abc" isCustom onSaved={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: /restaurar/i })).toBeInTheDocument();
  });

  it("Salvar chama saveIdentityBaseAction + onSaved + toast.success", async () => {
    mockSave.mockResolvedValue({ ok: true });
    const onSaved = jest.fn();
    render(
      <IdentityBaseEditor current="abc" isCustom={false} onSaved={onSaved} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "novo texto" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith("novo texto"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mockToast.success).toHaveBeenCalled();
  });

  it("Salvar com erro mostra toast.error e NÃO chama onSaved", async () => {
    mockSave.mockResolvedValue({ ok: false, error: "Sem permissão" });
    const onSaved = jest.fn();
    render(
      <IdentityBaseEditor current="abc" isCustom={false} onSaved={onSaved} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("Sem permissão"));
    expect(onSaved).not.toHaveBeenCalled();
  });
});
