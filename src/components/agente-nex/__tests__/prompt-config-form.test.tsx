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
  personality: "",
  tone: "",
  guardrails: [],
  advancedOverride: null,
  audioInputEnabled: false,
  kbEnabled: true,
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
        /Override desativa Personalidade, Tom, Guardrails e Base de conhecimento/i,
      ),
    ).not.toBeInTheDocument();
  });

  it("override ON (via initial) revela textarea com placeholder 'prompt completo' e warning amarelo", () => {
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
        /Override desativa Personalidade, Tom, Guardrails e Base de conhecimento/i,
      ),
    ).toBeInTheDocument();
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
