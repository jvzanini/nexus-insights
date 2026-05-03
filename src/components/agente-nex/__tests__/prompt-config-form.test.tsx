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

// jsdom não implementa PointerEvent — base-ui Switch escuta pointerdown.
// Polyfill mínimo: PointerEvent = MouseEvent.
if (typeof globalThis.PointerEvent === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).PointerEvent = MouseEvent;
}

const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

jest.mock("@/lib/actions/nex-prompt", () => ({
  saveNexPromptConfigAction: jest.fn(async () => ({ ok: true })),
  previewSystemPromptAction: jest.fn(async () => ({
    ok: true,
    data: { composedPrompt: "PROMPT" },
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

import {
  previewSystemPromptAction,
  saveNexPromptConfigAction,
} from "@/lib/actions/nex-prompt";
import { PromptConfigForm } from "../prompt-config-form";

const baseInitial: NexPromptConfig = {
  identityBase: null,
  personality: "",
  tone: "",
  guardrails: [],
  advancedOverride: null,
  audioInputEnabled: false,
  kbEnabled: true,
  terminology: {},
  suggestionsEnabled: false,
};

function getTrashButtons(): HTMLElement[] {
  return screen
    .queryAllByRole("button")
    .filter((b) => /Remover guardrail/i.test(b.getAttribute("aria-label") ?? ""));
}

describe("PromptConfigForm", () => {
  beforeEach(() => {
    refresh.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.warning.mockReset();
    toastMock.info.mockReset();
    (saveNexPromptConfigAction as jest.Mock).mockClear();
    (previewSystemPromptAction as jest.Mock).mockClear();
  });

  it("renderiza personalidade, tom e empty state de guardrails quando initial está vazio", () => {
    render(<PromptConfigForm initial={baseInitial} />);
    expect(screen.getByLabelText(/Personalidade/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Tom$/i)).toBeInTheDocument();
    expect(screen.getByText(/Nenhum guardrail definido/i)).toBeInTheDocument();
    expect(getTrashButtons()).toHaveLength(0);
  });

  it("adiciona e remove guardrails (count Trash buttons)", () => {
    render(<PromptConfigForm initial={baseInitial} />);

    const addBtn = screen.getByRole("button", { name: /Adicionar regra/i });

    fireEvent.click(addBtn);
    expect(getTrashButtons()).toHaveLength(1);

    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    expect(getTrashButtons()).toHaveLength(3);

    // Remove o do meio.
    const trashes = getTrashButtons();
    fireEvent.click(trashes[1]);
    expect(getTrashButtons()).toHaveLength(2);
  });

  it("override OFF não renderiza textarea de prompt completo", () => {
    render(<PromptConfigForm initial={baseInitial} />);
    expect(
      screen.queryByPlaceholderText(/prompt completo/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /Modo manual desativa identidade fixa, personalidade, tom, guardrails, base de conhecimento e URLs públicas/i,
      ),
    ).not.toBeInTheDocument();
  });

  it("override ON (via initial) revela textarea com placeholder 'prompt completo' e warning explicativo", () => {
    render(
      <PromptConfigForm
        initial={{ ...baseInitial, advancedOverride: "qualquer texto" }}
      />,
    );

    expect(
      screen.getByPlaceholderText(/prompt completo/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Modo manual desativa identidade fixa, personalidade, tom, guardrails, base de conhecimento e URLs públicas/i,
      ),
    ).toBeInTheDocument();
  });

  it("renderiza label 'Modo prompt manual' (não 'override')", () => {
    render(<PromptConfigForm initial={baseInitial} />);
    expect(screen.getByText(/Modo prompt manual/i)).toBeInTheDocument();
    expect(screen.queryByText(/Modo override avançado/i)).not.toBeInTheDocument();
  });

  it("badge 'MODO MANUAL ATIVO' aparece quando override está ON", () => {
    render(
      <PromptConfigForm
        initial={{ ...baseInitial, advancedOverride: "PROMPT BRUTO" }}
      />,
    );
    expect(screen.getByText(/MODO MANUAL ATIVO/)).toBeInTheDocument();
  });

  it("badge 'MODO MANUAL ATIVO' NÃO aparece quando override está OFF", () => {
    render(<PromptConfigForm initial={baseInitial} />);
    expect(screen.queryByText(/MODO MANUAL ATIVO/)).not.toBeInTheDocument();
  });

  it("override ON desabilita Personalidade/Tom/Guardrails e mostra texto auxiliar laranja", () => {
    render(
      <PromptConfigForm
        initial={{
          ...baseInitial,
          advancedOverride: "PROMPT",
          guardrails: ["Regra 1"],
        }}
      />,
    );

    const personality = screen.getByLabelText(/Personalidade/i) as HTMLTextAreaElement;
    const tone = screen.getByLabelText(/^Tom$/i) as HTMLTextAreaElement;
    expect(personality).toBeDisabled();
    expect(tone).toBeDisabled();

    // Texto auxiliar laranja informativo
    const helpers = screen.getAllByText(
      /Desativado pelo Modo manual ativo\. Desligue acima para editar\./i,
    );
    expect(helpers.length).toBeGreaterThanOrEqual(1);
  });

  it("toggle override OFF→ON abre AlertDialog de confirmação e Cancelar não ativa", async () => {
    render(<PromptConfigForm initial={baseInitial} />);

    // Pega o switch
    const toggle = screen.getByLabelText(/Ativar Modo prompt manual/i);
    await act(async () => {
      fireEvent.pointerDown(toggle);
      fireEvent.pointerUp(toggle);
      fireEvent.click(toggle);
    });

    // AlertDialog visível com texto explicativo
    expect(
      await screen.findByText(
        /Modo manual desativa identidade fixa, personalidade, tom, guardrails, base de conhecimento e URLs públicas/i,
      ),
    ).toBeInTheDocument();

    // Cancelar
    const cancel = screen.getByRole("button", { name: /^Cancelar$/i });
    await act(async () => {
      fireEvent.click(cancel);
    });

    // Override permanece OFF — placeholder do prompt completo não aparece
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText(/prompt completo/i),
      ).not.toBeInTheDocument(),
    );
  });

  it("toggle override OFF→ON + Confirmar ativa o modo manual", async () => {
    render(<PromptConfigForm initial={baseInitial} />);

    const toggle = screen.getByLabelText(/Ativar Modo prompt manual/i);
    await act(async () => {
      fireEvent.pointerDown(toggle);
      fireEvent.pointerUp(toggle);
      fireEvent.click(toggle);
    });

    const confirm = await screen.findByRole("button", { name: /^Ativar$/i });
    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(
      await screen.findByPlaceholderText(/prompt completo/i),
    ).toBeInTheDocument();
  });

  it("override ON com texto vazio: clicar Salvar dispara toast de erro e NÃO chama saveAction", async () => {
    render(
      <PromptConfigForm
        initial={{ ...baseInitial, advancedOverride: "" }}
      />,
    );

    // Estado: override ON via toggle inicial (advancedOverride === "" não dispara overrideOn).
    // Forçamos via toggle + confirm.
    const toggle = screen.getByLabelText(/Ativar Modo prompt manual/i);
    await act(async () => {
      fireEvent.pointerDown(toggle);
      fireEvent.pointerUp(toggle);
      fireEvent.click(toggle);
    });
    const confirm = await screen.findByRole("button", { name: /^Ativar$/i });
    await act(async () => {
      fireEvent.click(confirm);
    });

    // Agora override ON, override text vazio. Salvar deve falhar.
    const saveBtn = screen.getByRole("button", { name: /^Salvar$/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringMatching(/Modo manual ativo precisa de texto não-vazio/i),
      ),
    );
    expect(saveNexPromptConfigAction).not.toHaveBeenCalled();
  });

  it("clica em 'Pré-visualizar' chama previewSystemPromptAction e abre dialog com PROMPT", async () => {
    render(<PromptConfigForm initial={baseInitial} />);

    const previewBtn = screen.getByRole("button", {
      name: /Pré-visualizar prompt completo/i,
    });
    await act(async () => {
      fireEvent.click(previewBtn);
    });

    await waitFor(() =>
      expect(previewSystemPromptAction).toHaveBeenCalledTimes(1),
    );

    expect(await screen.findByText("PROMPT")).toBeInTheDocument();
  });

  it("clica em 'Salvar' chama saveNexPromptConfigAction com config atual + toast + router.refresh()", async () => {
    render(
      <PromptConfigForm
        initial={{
          ...baseInitial,
          personality: "Direto e prático.",
          tone: "Profissional",
          guardrails: ["Nunca invente números"],
        }}
      />,
    );

    const saveBtn = screen.getByRole("button", { name: /^Salvar$/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() =>
      expect(saveNexPromptConfigAction).toHaveBeenCalledTimes(1),
    );
    const callArg = (saveNexPromptConfigAction as jest.Mock).mock.calls[0][0];
    expect(callArg).toMatchObject({
      personality: "Direto e prático.",
      tone: "Profissional",
      guardrails: ["Nunca invente números"],
      advancedOverride: null,
    });

    expect(toastMock.success).toHaveBeenCalledWith(
      expect.stringMatching(/Configuração do Agente Nex salva/i),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("override ON envia advancedOverride preenchido no save", async () => {
    render(
      <PromptConfigForm
        initial={{
          ...baseInitial,
          advancedOverride: "PROMPT BRUTO",
        }}
      />,
    );

    const saveBtn = screen.getByRole("button", { name: /^Salvar$/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() =>
      expect(saveNexPromptConfigAction).toHaveBeenCalledTimes(1),
    );
    const callArg = (saveNexPromptConfigAction as jest.Mock).mock.calls[0][0];
    expect(callArg.advancedOverride).toBe("PROMPT BRUTO");
  });

  it("Adicionar regra fica desabilitado ao atingir 20 guardrails", () => {
    render(
      <PromptConfigForm
        initial={{
          ...baseInitial,
          guardrails: Array.from({ length: 20 }, (_, i) => `Regra ${i + 1}`),
        }}
      />,
    );

    const addBtn = screen.getByRole("button", { name: /Adicionar regra/i });
    expect(addBtn).toBeDisabled();
    expect(getTrashButtons()).toHaveLength(20);
  });

  it("save retornando ok=false dispara toast.error e NÃO chama router.refresh()", async () => {
    (saveNexPromptConfigAction as jest.Mock).mockResolvedValueOnce({
      ok: false,
      error: "Erro de teste",
    });

    render(<PromptConfigForm initial={baseInitial} />);
    const saveBtn = screen.getByRole("button", { name: /^Salvar$/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Erro de teste"),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("PromptConfigForm — Nomenclaturas (v0.31)", () => {
  beforeEach(() => {
    refresh.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.warning.mockReset();
    toastMock.info.mockReset();
    (saveNexPromptConfigAction as jest.Mock).mockClear();
    (previewSystemPromptAction as jest.Mock).mockClear();
  });

  it("renderiza section 'Nomenclaturas e termos'", () => {
    render(<PromptConfigForm initial={baseInitial} />);
    expect(screen.getByText(/Nomenclaturas e termos/i)).toBeInTheDocument();
  });

  it("Adicionar termo cria nova linha com inputs vazios", () => {
    render(<PromptConfigForm initial={baseInitial} />);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar termo/i }));
    expect(screen.getByPlaceholderText(/Termo \(ex/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Significa \(ex/i)).toBeInTheDocument();
  });

  it("max 50 termos: bloqueia + toast", () => {
    const filled: Record<string, string> = {};
    for (let i = 0; i < 50; i++) filled[`k${i}`] = "v";
    render(
      <PromptConfigForm initial={{ ...baseInitial, terminology: filled }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Adicionar termo/i }));
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/50/));
  });

  it("renderiza terminology inicial como linhas pré-populadas", () => {
    render(
      <PromptConfigForm
        initial={{ ...baseInitial, terminology: { estados: "inboxes" } }}
      />,
    );
    expect(screen.getByDisplayValue("estados")).toBeInTheDocument();
    expect(screen.getByDisplayValue("inboxes")).toBeInTheDocument();
  });
});

describe("PromptConfigForm — Sugestões em botões (v0.31)", () => {
  beforeEach(() => {
    refresh.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.warning.mockReset();
    toastMock.info.mockReset();
    (saveNexPromptConfigAction as jest.Mock).mockClear();
    (previewSystemPromptAction as jest.Mock).mockClear();
  });

  it("renderiza toggle 'Sugestões em botões'", () => {
    render(<PromptConfigForm initial={baseInitial} />);
    expect(
      screen.getByRole("switch", {
        name: /Sugestões em botões|Ativar sugestões|Desativar sugestões/i,
      }),
    ).toBeInTheDocument();
  });

  it("toggle reflete initial.suggestionsEnabled=true", () => {
    render(
      <PromptConfigForm
        initial={{ ...baseInitial, suggestionsEnabled: true }}
      />,
    );
    const toggle = screen.getByRole("switch", {
      name: /Sugestões em botões|Desativar sugestões/i,
    });
    expect(toggle).toBeChecked();
  });
});
