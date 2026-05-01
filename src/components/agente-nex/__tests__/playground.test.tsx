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

import type { NexPromptConfig } from "@/lib/nex/prompt";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("@/lib/actions/nex-chat", () => ({
  testNexPromptAction: jest.fn(async () => ({
    ok: true,
    message: "resposta do agente",
  })),
}));

jest.mock("@/lib/actions/nex-prompt", () => ({
  previewSystemPromptAction: jest.fn(async () => ({
    ok: true,
    data: { composedPrompt: "PROMPT COMPOSTO" },
  })),
}));

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};
jest.mock("sonner", () => ({
  toast: toastMock,
}));

import { testNexPromptAction } from "@/lib/actions/nex-chat";
import { previewSystemPromptAction } from "@/lib/actions/nex-prompt";
import { Playground } from "../playground";

const baseConfig: NexPromptConfig = {
  personality: "Direto",
  tone: "Profissional",
  guardrails: [],
  advancedOverride: null,
  audioInputEnabled: false,
  kbEnabled: true,
};

describe("Playground", () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    (testNexPromptAction as jest.Mock).mockClear();
    (previewSystemPromptAction as jest.Mock).mockClear();
  });

  it("renderiza textarea com contador 0/1000 e botão Enviar desabilitado quando vazio", () => {
    render(<Playground currentConfig={baseConfig} />);
    expect(screen.getByLabelText(/Sua pergunta/i)).toBeInTheDocument();
    expect(screen.getByText(/0\/1000/)).toBeInTheDocument();
    const sendBtn = screen.getByRole("button", { name: /Enviar/i });
    expect(sendBtn).toBeDisabled();
  });

  it("digitar atualiza contador e habilita Enviar", () => {
    render(<Playground currentConfig={baseConfig} />);
    const textarea = screen.getByLabelText(/Sua pergunta/i);
    fireEvent.change(textarea, { target: { value: "olá" } });
    expect(screen.getByText(/3\/1000/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enviar/i })).not.toBeDisabled();
  });

  it("submit chama testNexPromptAction e mostra resposta", async () => {
    render(<Playground currentConfig={baseConfig} />);
    const textarea = screen.getByLabelText(/Sua pergunta/i);
    fireEvent.change(textarea, {
      target: { value: "qual a média da semana?" },
    });

    const sendBtn = screen.getByRole("button", { name: /Enviar/i });
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() =>
      expect(testNexPromptAction).toHaveBeenCalledTimes(1),
    );
    const [arg0, arg1] = (testNexPromptAction as jest.Mock).mock.calls[0];
    expect(arg0).toBe("qual a média da semana?");
    expect(arg1).toMatchObject({
      personality: "Direto",
      tone: "Profissional",
    });

    expect(await screen.findByText(/resposta do agente/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Nova pergunta/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ver prompt usado/i }),
    ).toBeInTheDocument();
  });

  it("submit com erro mostra mensagem técnica + sugestão", async () => {
    (testNexPromptAction as jest.Mock).mockResolvedValueOnce({
      ok: false,
      error: "modelo indisponível",
    });
    render(<Playground currentConfig={baseConfig} />);
    fireEvent.change(screen.getByLabelText(/Sua pergunta/i), {
      target: { value: "ping" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/modelo indisponível/i);
    expect(alert).toHaveTextContent(
      /Verifique chave\/modelo em Configuração/i,
    );
  });

  it("Nova pergunta reseta input + response", async () => {
    render(<Playground currentConfig={baseConfig} />);
    fireEvent.change(screen.getByLabelText(/Sua pergunta/i), {
      target: { value: "olá" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));
    });

    await screen.findByText(/resposta do agente/i);

    const resetBtn = screen.getByRole("button", { name: /Nova pergunta/i });
    await act(async () => {
      fireEvent.click(resetBtn);
    });

    expect(screen.queryByText(/resposta do agente/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nova pergunta/i }))
      .not.toBeInTheDocument();
    expect(
      (screen.getByLabelText(/Sua pergunta/i) as HTMLTextAreaElement).value,
    ).toBe("");
  });

  it("ver prompt usado abre dialog com previewSystemPromptAction", async () => {
    render(<Playground currentConfig={baseConfig} />);
    fireEvent.change(screen.getByLabelText(/Sua pergunta/i), {
      target: { value: "olá" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));
    });
    await screen.findByText(/resposta do agente/i);

    const previewBtn = screen.getByRole("button", {
      name: /ver prompt usado/i,
    });
    await act(async () => {
      fireEvent.click(previewBtn);
    });

    await waitFor(() =>
      expect(previewSystemPromptAction).toHaveBeenCalledTimes(1),
    );
    expect(await screen.findByText("PROMPT COMPOSTO")).toBeInTheDocument();
  });
});
