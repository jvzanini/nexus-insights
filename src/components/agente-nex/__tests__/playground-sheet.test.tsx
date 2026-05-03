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
  within,
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
  sendNexMessage: jest.fn(async () => ({
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

// Mock do AudioRecorder pra evitar cadeia getUserMedia no jsdom.
// Em mode="embedded" o componente real só renderiza conteúdo quando recording —
// idle retorna null. O mock replica esse comportamento (sempre null) e expõe
// um shape de Handle inerte via ref pra não quebrar o componente externo.
jest.mock("@/components/nex/audio-recorder", () => {
  const React = require("react");
  return {
    __esModule: true,
    AudioRecorder: React.forwardRef(function AudioRecorderMock(
      _props: unknown,
      ref: React.Ref<{
        start: () => Promise<void>;
        pauseOrResume: () => void;
        cancel: () => void;
        sendNow: () => void;
      }>,
    ) {
      React.useImperativeHandle(ref, () => ({
        start: async () => {},
        pauseOrResume: () => {},
        cancel: () => {},
        sendNow: () => {},
      }));
      return null;
    }),
  };
});

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};
jest.mock("sonner", () => ({
  toast: toastMock,
}));

import { sendNexMessage, testNexPromptAction } from "@/lib/actions/nex-chat";
import { previewSystemPromptAction } from "@/lib/actions/nex-prompt";
import { PlaygroundSheet, MAX_HISTORY_MSGS } from "../playground-sheet";

const baseConfig: NexPromptConfig = {
  identityBase: null,
  personality: "Direto",
  tone: "Profissional",
  guardrails: [],
  advancedOverride: null,
  audioInputEnabled: false,
  kbEnabled: true,
  terminology: {},
  suggestionsEnabled: false,
};

function ControlledHarness(props: {
  initialOpen?: boolean;
  providerKey?: "openai" | "anthropic" | "gemini" | "openrouter" | null;
  providerLabel?: string;
  modelLabel?: string;
  config?: NexPromptConfig;
}) {
  const [open, setOpen] = require("react").useState(props.initialOpen ?? true);
  return (
    <PlaygroundSheet
      open={open}
      onOpenChange={setOpen}
      currentConfig={props.config ?? baseConfig}
      providerKey={props.providerKey ?? "openai"}
      providerLabel={props.providerLabel}
      modelLabel={props.modelLabel}
    />
  );
}

describe("PlaygroundSheet", () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    (testNexPromptAction as jest.Mock).mockReset();
    (testNexPromptAction as jest.Mock).mockImplementation(async () => ({
      ok: true,
      message: "resposta do agente",
    }));
    (sendNexMessage as jest.Mock).mockReset();
    (sendNexMessage as jest.Mock).mockImplementation(async () => ({
      ok: true,
      message: "resposta do agente",
    }));
    (previewSystemPromptAction as jest.Mock).mockReset();
    (previewSystemPromptAction as jest.Mock).mockImplementation(async () => ({
      ok: true,
      data: { composedPrompt: "PROMPT COMPOSTO" },
    }));
  });

  it("renderiza header com provider/model + close + botões secundários quando open", () => {
    render(
      <ControlledHarness providerLabel="OpenAI" modelLabel="GPT-5.4" />,
    );
    expect(screen.getByText(/Playground/i)).toBeInTheDocument();
    expect(screen.getByText(/OpenAI/)).toBeInTheDocument();
    expect(screen.getByText(/GPT-5\.4/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Fechar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Limpar histórico/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ver prompt usado/i }),
    ).toBeInTheDocument();
  });

  it("fecha ao clicar no Fechar (onOpenChange chamado com false)", () => {
    const onOpenChange = jest.fn();
    render(
      <PlaygroundSheet
        open
        onOpenChange={onOpenChange}
        currentConfig={baseConfig}
        providerKey="openai"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Fechar/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("submit chama sendNexMessage e adiciona user + assistant na lista", async () => {
    render(<ControlledHarness />);
    const textarea = screen.getByPlaceholderText(/Pergunte ao agente Nex/i);
    fireEvent.change(textarea, { target: { value: "olá Nex" } });

    const sendBtn = screen.getByRole("button", { name: /Enviar/i });
    expect(sendBtn).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() =>
      expect(sendNexMessage).toHaveBeenCalledTimes(1),
    );
    expect((sendNexMessage as jest.Mock).mock.calls[0][0]).toEqual([
      { role: "user", content: "olá Nex" },
    ]);

    expect(await screen.findByText("olá Nex")).toBeInTheDocument();
    expect(await screen.findByText(/resposta do agente/i)).toBeInTheDocument();
    // input limpa após submit ok
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("erro do action mostra toast.error e mantém histórico", async () => {
    (sendNexMessage as jest.Mock).mockResolvedValueOnce({
      ok: false,
      error: "modelo indisponível",
    });
    render(<ControlledHarness />);
    fireEvent.change(screen.getByPlaceholderText(/Pergunte ao agente Nex/i), {
      target: { value: "ping" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));
    });

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(toastMock.error.mock.calls[0][0]).toMatch(/modelo indisponível/i);
    // user msg ainda visível
    expect(screen.getByText("ping")).toBeInTheDocument();
  });

  it(`cap ${MAX_HISTORY_MSGS} mensagens FIFO — primeira sai quando excede`, async () => {
    // Cada submit adiciona 2 msgs (user + assistant). Pra ultrapassar 20,
    // basta enviar 11 mensagens (=22 → mantém últimas 20 → primeira user some).
    render(<ControlledHarness />);
    const textarea = screen.getByPlaceholderText(/Pergunte ao agente Nex/i);
    const sendBtn = screen.getByRole("button", { name: /Enviar/i });

    for (let i = 0; i < 11; i++) {
      fireEvent.change(textarea, { target: { value: `msg-${i}` } });
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        fireEvent.click(sendBtn);
      });
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() =>
        expect(sendNexMessage).toHaveBeenCalledTimes(i + 1),
      );
      // eslint-disable-next-line no-await-in-loop
      await screen.findByText(`msg-${i}`);
    }

    // msg-0 (a primeira) deve ter saído via FIFO; msg-1 ainda presente.
    expect(screen.queryByText("msg-0")).not.toBeInTheDocument();
    expect(screen.getByText("msg-1")).toBeInTheDocument();
    expect(screen.getByText("msg-10")).toBeInTheDocument();
  });

  it("Limpar histórico reseta state das mensagens", async () => {
    render(<ControlledHarness />);
    fireEvent.change(screen.getByPlaceholderText(/Pergunte ao agente Nex/i), {
      target: { value: "olá" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));
    });
    await screen.findByText(/resposta do agente/i);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Limpar histórico/i }),
      );
    });

    expect(screen.queryByText(/resposta do agente/i)).not.toBeInTheDocument();
    expect(screen.queryByText("olá")).not.toBeInTheDocument();
    // Empty state visível novamente
    expect(
      screen.getByText(/Comece uma conversa de teste/i),
    ).toBeInTheDocument();
  });

  it("Ver prompt usado abre Dialog com previewSystemPromptAction", async () => {
    render(<ControlledHarness />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Ver prompt usado/i }),
      );
    });

    await waitFor(() =>
      expect(previewSystemPromptAction).toHaveBeenCalledTimes(1),
    );

    const dialog = await screen.findByRole("dialog", {
      name: /Prompt usado nesta sessão/i,
    });
    expect(within(dialog).getByText("PROMPT COMPOSTO")).toBeInTheDocument();
  });
});

describe("PlaygroundSheet — v0.26 bubble UX", () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    (testNexPromptAction as jest.Mock).mockReset();
    (testNexPromptAction as jest.Mock).mockImplementation(async () => ({
      ok: true,
      message: "resposta do agente",
    }));
    (sendNexMessage as jest.Mock).mockReset();
    (sendNexMessage as jest.Mock).mockImplementation(async () => ({
      ok: true,
      message: "resposta do agente",
    }));
    (previewSystemPromptAction as jest.Mock).mockReset();
    (previewSystemPromptAction as jest.Mock).mockImplementation(async () => ({
      ok: true,
      data: { composedPrompt: "PROMPT COMPOSTO" },
    }));
  });

  const audioConfig: NexPromptConfig = {
    identityBase: null,
    personality: "",
    tone: "",
    guardrails: [],
    advancedOverride: null,
    audioInputEnabled: true,
    kbEnabled: false,
    terminology: {},
    suggestionsEnabled: false,
  };

  it("renderiza Mic externo quando audioInputEnabled + provider OpenAI + idle", () => {
    render(
      <PlaygroundSheet
        open
        onOpenChange={jest.fn()}
        currentConfig={audioConfig}
        providerKey="openai"
        providerLabel="OpenAI"
        modelLabel="gpt-5.4-nano"
      />,
    );
    expect(
      screen.getByRole("button", { name: /gravar áudio/i }),
    ).toBeInTheDocument();
  });

  it("não renderiza Mic se providerKey !== 'openai'", () => {
    render(
      <PlaygroundSheet
        open
        onOpenChange={jest.fn()}
        currentConfig={audioConfig}
        providerKey="anthropic"
        providerLabel="Anthropic"
        modelLabel="claude-3"
      />,
    );
    expect(
      screen.queryByRole("button", { name: /gravar áudio/i }),
    ).not.toBeInTheDocument();
  });

  it("não renderiza Mic se audioInputEnabled = false (mesmo com OpenAI)", () => {
    render(
      <PlaygroundSheet
        open
        onOpenChange={jest.fn()}
        currentConfig={{ ...audioConfig, audioInputEnabled: false }}
        providerKey="openai"
        providerLabel="OpenAI"
        modelLabel="gpt-5.4-nano"
      />,
    );
    expect(
      screen.queryByRole("button", { name: /gravar áudio/i }),
    ).not.toBeInTheDocument();
  });

  it("Send button usa gradient violet", () => {
    render(
      <PlaygroundSheet
        open
        onOpenChange={jest.fn()}
        currentConfig={audioConfig}
        providerKey="openai"
        providerLabel="OpenAI"
        modelLabel="gpt-5.4-nano"
      />,
    );
    const sendBtn = screen.getByRole("button", {
      name: /enviar pergunta|enviar áudio|^enviar$/i,
    });
    expect(sendBtn.className).toMatch(/bg-gradient/);
    expect(sendBtn.className).toMatch(/violet/);
  });

  it("Dialog 'Ver prompt usado' tem className z-[60] no DialogContent", async () => {
    render(
      <PlaygroundSheet
        open
        onOpenChange={jest.fn()}
        currentConfig={audioConfig}
        providerKey="openai"
        providerLabel="OpenAI"
        modelLabel="gpt-5.4-nano"
      />,
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /ver prompt usado/i }),
      );
    });
    const dialog = await screen.findByRole("dialog", {
      name: /Prompt usado nesta sessão/i,
    });
    // v0.28.0: subiu de z-[60] (v0.26) pra z-[70] junto com Sheet suppress
    // — Sheet desaparece quando preview abre, evitando dispute de z-index.
    expect(dialog.className).toMatch(/z-\[70\]/);
  });
});

describe("PlaygroundSheet — v0.28 sendNexMessage com histórico", () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    (sendNexMessage as jest.Mock).mockReset();
    (sendNexMessage as jest.Mock).mockImplementation(async () => ({
      ok: true,
      message: "ola",
    }));
    (previewSystemPromptAction as jest.Mock).mockReset();
    (previewSystemPromptAction as jest.Mock).mockImplementation(async () => ({
      ok: true,
      data: { composedPrompt: "PROMPT COMPOSTO" },
    }));
  });

  it("usa sendNexMessage (não testNexPromptAction) com histórico completo", async () => {
    render(<ControlledHarness />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Quantas conversas?" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    });
    await waitFor(() => expect(sendNexMessage).toHaveBeenCalled());

    expect((sendNexMessage as jest.Mock).mock.calls[0][0]).toEqual([
      { role: "user", content: "Quantas conversas?" },
    ]);
  });

  it("placeholder 'Pergunte ao agente Nex'", () => {
    render(<ControlledHarness />);
    expect(
      screen.getByPlaceholderText(/Pergunte ao agente Nex/i),
    ).toBeInTheDocument();
  });
});

describe("PlaygroundSheet — isPlayground + SuggestionsBar (v0.31)", () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    (sendNexMessage as jest.Mock).mockReset();
    (sendNexMessage as jest.Mock).mockImplementation(async () => ({
      ok: true,
      message: "ok",
      suggestions: [],
    }));
    (previewSystemPromptAction as jest.Mock).mockReset();
    (previewSystemPromptAction as jest.Mock).mockImplementation(async () => ({
      ok: true,
      data: { composedPrompt: "PROMPT COMPOSTO" },
    }));
  });

  it("envia isPlayground=true via sendNexMessage options", async () => {
    (sendNexMessage as jest.Mock).mockResolvedValue({
      ok: true,
      message: "ok",
      suggestions: [],
    });
    render(<ControlledHarness />);
    fireEvent.change(screen.getByPlaceholderText(/Pergunte ao agente Nex/i), {
      target: { value: "x" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));
    });
    await waitFor(() => expect(sendNexMessage).toHaveBeenCalled());
    expect((sendNexMessage as jest.Mock).mock.calls[0][1]).toEqual({
      isPlayground: true,
    });
  });

  it("renderiza SuggestionsBar quando assistant retorna suggestions", async () => {
    (sendNexMessage as jest.Mock).mockResolvedValue({
      ok: true,
      message: "12 resolvidas",
      suggestions: ["A", "B"],
    });
    render(<ControlledHarness />);
    fireEvent.change(screen.getByPlaceholderText(/Pergunte ao agente Nex/i), {
      target: { value: "x" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));
    });
    await waitFor(() => screen.getByText(/12 resolvidas/i));
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "B" })).toBeInTheDocument();
  });

  it("click numa sugestão envia como nova msg + consome botões + isPlayground=true", async () => {
    (sendNexMessage as jest.Mock).mockResolvedValueOnce({
      ok: true,
      message: "12 resolvidas",
      suggestions: ["Ver as abertas"],
    });
    render(<ControlledHarness />);
    fireEvent.change(screen.getByPlaceholderText(/Pergunte ao agente Nex/i), {
      target: { value: "x" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));
    });
    await waitFor(() =>
      screen.getByRole("button", { name: /Ver as abertas/i }),
    );

    (sendNexMessage as jest.Mock).mockResolvedValueOnce({
      ok: true,
      message: "5 abertas",
      suggestions: [],
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Ver as abertas/i }),
      );
    });
    await waitFor(() =>
      expect(sendNexMessage).toHaveBeenCalledTimes(2),
    );
    expect((sendNexMessage as jest.Mock).mock.calls[1][1]).toEqual({
      isPlayground: true,
    });
  });
});
