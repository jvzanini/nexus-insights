/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// jsdom não implementa PointerEvent — base-ui Switch escuta pointerdown.
if (typeof globalThis.PointerEvent === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).PointerEvent = MouseEvent;
}

const updateCompanyChatBinding = jest.fn();
const softDeleteCompanyChatBinding = jest.fn();
const refresh = jest.fn();

jest.mock("@/lib/actions/nexus-chat/bindings", () => ({
  updateCompanyChatBinding: (...args: unknown[]) =>
    updateCompanyChatBinding(...args),
  softDeleteCompanyChatBinding: (...args: unknown[]) =>
    softDeleteCompanyChatBinding(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
};
jest.mock("sonner", () => ({ toast: toastMock }));

import {
  BindingListSheet,
  type BindingListItem,
} from "../binding-list-sheet";

const sampleBinding = (
  overrides: Partial<BindingListItem> = {},
): BindingListItem => ({
  id: overrides.id ?? "bind-1",
  connectionId: overrides.connectionId ?? "conn-1",
  chatwootAccountId: overrides.chatwootAccountId ?? 42,
  displayName: overrides.displayName ?? "Matrix Fitness",
  enabled: overrides.enabled ?? true,
});

describe("<BindingListSheet />", () => {
  beforeEach(() => {
    updateCompanyChatBinding.mockReset();
    softDeleteCompanyChatBinding.mockReset();
    refresh.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it("aberto com lista vazia mostra empty state e CTA", () => {
    render(
      <BindingListSheet
        open
        onOpenChange={jest.fn()}
        connectionId="conn-1"
        connectionName="Padrão"
        bindings={[]}
      />,
    );
    expect(
      screen.getByText(/Nenhuma empresa cadastrada/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Nova empresa/i }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("renderiza linhas de bindings com displayName e accountId", () => {
    render(
      <BindingListSheet
        open
        onOpenChange={jest.fn()}
        connectionId="conn-1"
        connectionName="Padrão"
        bindings={[
          sampleBinding({ displayName: "Empresa A", chatwootAccountId: 1 }),
          sampleBinding({
            id: "bind-2",
            displayName: "Empresa B",
            chatwootAccountId: 2,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Empresa A")).toBeInTheDocument();
    expect(screen.getByText("Empresa B")).toBeInTheDocument();
    expect(screen.getByTestId("binding-account-bind-1")).toHaveTextContent("1");
  });

  it("toggle enabled chama updateCompanyChatBinding com novo valor", async () => {
    updateCompanyChatBinding.mockResolvedValue({ success: true });
    render(
      <BindingListSheet
        open
        onOpenChange={jest.fn()}
        connectionId="conn-1"
        connectionName="Padrão"
        bindings={[sampleBinding({ enabled: true })]}
      />,
    );
    const toggle = screen.getByTestId("binding-toggle-bind-1");
    await act(async () => {
      fireEvent.pointerDown(toggle);
      fireEvent.pointerUp(toggle);
      fireEvent.click(toggle);
    });
    await waitFor(() => {
      expect(updateCompanyChatBinding).toHaveBeenCalledWith("bind-1", {
        enabled: false,
      });
    });
    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalled();
    });
  });

  it("apagar binding pede confirmação e chama softDeleteCompanyChatBinding", async () => {
    softDeleteCompanyChatBinding.mockResolvedValue({ success: true });
    render(
      <BindingListSheet
        open
        onOpenChange={jest.fn()}
        connectionId="conn-1"
        connectionName="Padrão"
        bindings={[sampleBinding()]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Apagar empresa/i }));
    const confirm = await screen.findByTestId("binding-delete-confirm");
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(softDeleteCompanyChatBinding).toHaveBeenCalledWith("bind-1");
    });
  });
});
