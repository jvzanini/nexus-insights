/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockAction = jest.fn();
jest.mock("@/lib/actions/reports/conversas-export", () => ({
  exportConversasAction: (...args: unknown[]) => mockAction(...args),
}));

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
};
jest.mock("sonner", () => ({ toast: toastMock }));

import { ExportButton } from "@/components/reports/export-button";

const baseProps = {
  filters: { period: { start: new Date(), end: new Date() } } as any,
  accountId: 9,
  rowCount: 100,
};

describe("ExportButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // jsdom não implementa essas APIs por padrão.
    if (!global.URL.createObjectURL) {
      global.URL.createObjectURL = jest.fn(() => "blob:mock");
    }
    if (!global.URL.revokeObjectURL) {
      global.URL.revokeObjectURL = jest.fn();
    }
  });

  it("renderiza com aria-label e ícone Download", () => {
    render(<ExportButton {...baseProps} />);
    const btn = screen.getByRole("button", {
      name: /exportar conversas para planilha xlsx/i,
    });
    expect(btn).toBeInTheDocument();
  });

  it("disabled quando rowCount=0", () => {
    render(<ExportButton {...baseProps} rowCount={0} />);
    expect(
      screen.getByRole("button", {
        name: /exportar conversas para planilha xlsx/i,
      }),
    ).toBeDisabled();
  });

  it("dispatcha action no click e baixa o arquivo", async () => {
    mockAction.mockResolvedValue({
      base64: Buffer.from("xlsx").toString("base64"),
      filename: "conversas_9_x.xlsx",
    });
    render(<ExportButton {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /exportar conversas para planilha xlsx/i,
      }),
    );
    await waitFor(() => expect(mockAction).toHaveBeenCalledTimes(1));
    expect(mockAction).toHaveBeenCalledWith({
      filters: baseProps.filters,
      accountId: 9,
    });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
  });

  it("mostra toast erro em fail", async () => {
    mockAction.mockResolvedValue({ error: "Erro ao gerar planilha" });
    render(<ExportButton {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /exportar conversas para planilha xlsx/i,
      }),
    );
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Erro ao gerar planilha"),
    );
  });

  it("mostra toast warning quando truncated=true", async () => {
    mockAction.mockResolvedValue({
      base64: Buffer.from("xlsx").toString("base64"),
      filename: "conversas_9.xlsx",
      truncated: true,
    });
    render(<ExportButton {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /exportar conversas para planilha xlsx/i,
      }),
    );
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalled());
  });
});
