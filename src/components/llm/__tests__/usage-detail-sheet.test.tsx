/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import type { UsageDetailRow } from "@/lib/llm/queries/usage-stats";

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
};
jest.mock("sonner", () => ({
  toast: toastMock,
}));

import { UsageDetailSheet } from "../usage-detail-sheet";

function makeRow(overrides: Partial<UsageDetailRow> = {}): UsageDetailRow {
  return {
    id: "abc-123",
    provider: "openai",
    model: "gpt-5.4",
    tokensInput: 100,
    tokensOutput: 200,
    costUsd: 0.001234,
    costBrl: 0.006789,
    usdToBrlRate: 5.5,
    durationMs: 1500,
    createdAt: "2026-04-29T12:34:56Z",
    promptChars: 800,
    responseChars: 1600,
    userId: "user-uuid-1",
    errorMessage: null,
    ...overrides,
  };
}

describe("UsageDetailSheet", () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(() => Promise.resolve()),
      },
    });
  });

  it("não renderiza conteúdo quando row é null", () => {
    render(
      <UsageDetailSheet
        open={false}
        onOpenChange={jest.fn()}
        row={null}
      />,
    );
    expect(screen.queryByText(/Identificação/i)).not.toBeInTheDocument();
  });

  it("renderiza as 5 seções com row típica (sem erro)", () => {
    render(
      <UsageDetailSheet
        open
        onOpenChange={jest.fn()}
        row={makeRow()}
        currentSpread={1.0}
      />,
    );

    // Identificação
    expect(screen.getByText(/Identificação/i)).toBeInTheDocument();
    expect(screen.getByText(/abc-123/)).toBeInTheDocument();
    expect(screen.getByText(/openai/)).toBeInTheDocument();
    expect(screen.getByText(/gpt-5\.4/)).toBeInTheDocument();
    expect(screen.getByText(/user-uuid-1/)).toBeInTheDocument();

    // Tokens
    expect(screen.getByText(/Tokens/i)).toBeInTheDocument();
    expect(screen.getByText(/Entrada/i)).toBeInTheDocument();
    expect(screen.getByText(/Saída/i)).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("800")).toBeInTheDocument();
    expect(screen.getByText("1.600")).toBeInTheDocument();

    // Duração
    expect(screen.getByText(/Duração/i)).toBeInTheDocument();
    // formatDuration(1500) = "2 s" (round)
    expect(screen.getByText(/2 s/)).toBeInTheDocument();

    // Custo (seção)
    expect(
      screen.getByRole("heading", { level: 3, name: /^Custo$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Custo bruto/i)).toBeInTheDocument();
    expect(screen.getByText(/Custo final/i)).toBeInTheDocument();

    // Sem erro
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Whisper (whisper-1): tokens '—' + nota informativa (legado)", () => {
    render(
      <UsageDetailSheet
        open
        onOpenChange={jest.fn()}
        row={makeRow({ model: "whisper-1", tokensInput: 0, tokensOutput: 0 })}
      />,
    );
    // Pelo menos dois "—" (entrada/saída)
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/cobrado por minuto/i)).toBeInTheDocument();
    expect(screen.getByText(/legado/i)).toBeInTheDocument();
  });

  it("gpt-4o-mini-transcribe: tokens reais aparecem sem nota especial (v0.20+)", () => {
    render(
      <UsageDetailSheet
        open
        onOpenChange={jest.fn()}
        row={makeRow({
          model: "gpt-4o-mini-transcribe",
          tokensInput: 150,
          tokensOutput: 80,
        })}
      />,
    );
    // Tokens reais renderizam (não "—" para entrada/saída)
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
    // NÃO deve haver nota sobre Whisper/cobrança por minuto
    expect(screen.queryByText(/cobrado por minuto/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/legado/i)).not.toBeInTheDocument();
  });

  it("modelo de chat (gpt-5.4-nano): tokens reais sem nota Whisper", () => {
    render(
      <UsageDetailSheet
        open
        onOpenChange={jest.fn()}
        row={makeRow({ model: "gpt-5.4-nano" })}
      />,
    );
    expect(screen.queryByText(/cobrado por minuto/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/legado/i)).not.toBeInTheDocument();
  });

  it("errorMessage não-null: mostra alert vermelho com a mensagem", () => {
    render(
      <UsageDetailSheet
        open
        onOpenChange={jest.fn()}
        row={makeRow({ errorMessage: "rate_limit_exceeded" })}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(within(alert).getByText(/rate_limit_exceeded/)).toBeInTheDocument();
  });

  it("usdToBrlRate null: mostra mensagem 'Cotação não armazenada'", () => {
    render(
      <UsageDetailSheet
        open
        onOpenChange={jest.fn()}
        row={makeRow({ usdToBrlRate: null, costBrl: null })}
      />,
    );
    expect(screen.getByText(/Cotação não armazenada/i)).toBeInTheDocument();
  });

  it("Copiar JSON: chama clipboard.writeText com row JSON e dispara toast.success", async () => {
    const row = makeRow();
    render(
      <UsageDetailSheet open onOpenChange={jest.fn()} row={row} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Copiar JSON/i }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1),
    );
    const written = (navigator.clipboard.writeText as jest.Mock).mock
      .calls[0][0];
    expect(typeof written).toBe("string");
    expect(JSON.parse(written)).toEqual(row);
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledTimes(1),
    );
  });

  it("botão Fechar chama onOpenChange(false)", () => {
    const onOpenChange = jest.fn();
    render(
      <UsageDetailSheet open onOpenChange={onOpenChange} row={makeRow()} />,
    );
    // Pode haver dois botões de fechar (header X + footer "Fechar")
    const closeButtons = screen.getAllByRole("button", { name: /Fechar/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
