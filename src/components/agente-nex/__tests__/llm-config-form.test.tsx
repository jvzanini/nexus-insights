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

const refresh = jest.fn();
const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
}));

jest.mock("@/lib/actions/llm-config", () => ({
  saveLlmConfig: jest.fn(async () => ({ ok: true })),
  setNexBubbleEnabled: jest.fn(async () => ({ ok: true })),
}));

jest.mock("@/lib/actions/llm-credentials", () => ({
  testLlmCredentialAction: jest.fn(async () => ({
    ok: true,
    data: { reachable: true, creditOk: true, message: "OK" },
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

import { LlmConfigForm } from "../llm-config-form";
import type { CredentialSummary } from "@/lib/llm/credentials";

const baseCreds: CredentialSummary[] = [
  {
    id: "cred-1",
    provider: "openai",
    label: "Minha chave",
    last4: "1234",
    createdAt: new Date("2026-04-01").toISOString(),
  } as unknown as CredentialSummary,
];

function renderForm(overrides?: Partial<Parameters<typeof LlmConfigForm>[0]>) {
  return render(
    <LlmConfigForm
      initial={null}
      initialNexEnabled={false}
      initialCredentials={baseCreds}
      {...overrides}
    />,
  );
}

describe("LlmConfigForm — customMode inline + 4 tiers", () => {
  beforeEach(() => {
    refresh.mockReset();
    push.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.warning.mockReset();
    toastMock.info.mockReset();
  });

  it("Não renderiza bloco separado 'Modelo customizado' quando seleção é catálogo", () => {
    renderForm();
    // Bloco separado tem label exata "Modelo customizado".
    expect(
      screen.queryByLabelText(/^Modelo customizado$/i),
    ).not.toBeInTheDocument();
  });

  it("Selecionar 'Outro' renderiza input editable INLINE no trigger (sem campo separado abaixo)", async () => {
    renderForm();

    // Abre dropdown e clica em "Outro".
    const triggers = screen.getAllByRole("button", { name: /Selecionar modelo|GPT-/i });
    // Pega o primeiro trigger do select de modelo (haverá vários botões; usamos placeholder sufixo).
    // Simplificamos: encontramos pelo texto do select ("aria-haspopup=listbox").
    const allButtons = screen.getAllByRole("button");
    const modelTrigger = allButtons.find((b) =>
      b.getAttribute("aria-haspopup") === "listbox" &&
      /GPT|Selecionar modelo/i.test(b.textContent ?? ""),
    );
    expect(modelTrigger).toBeTruthy();
    await act(async () => {
      fireEvent.click(modelTrigger!);
    });

    const otherOption = await screen.findByText(
      /Outro \(digitar manualmente\)/i,
    );
    await act(async () => {
      fireEvent.click(otherOption);
    });

    // Input inline com aria-label "ID do modelo customizado".
    const inlineInput = await screen.findByLabelText(
      /ID do modelo customizado/i,
    );
    expect(inlineInput).toBeInTheDocument();

    // NÃO existe bloco separado abaixo.
    expect(
      screen.queryByLabelText(/^Modelo customizado$/i),
    ).not.toBeInTheDocument();
  });

  it("Digitar no input inline atualiza o estado interno (refletido em aria-value/value)", async () => {
    renderForm();

    const allButtons = screen.getAllByRole("button");
    const modelTrigger = allButtons.find(
      (b) => b.getAttribute("aria-haspopup") === "listbox" &&
        /GPT|Selecionar modelo/i.test(b.textContent ?? ""),
    );
    await act(async () => {
      fireEvent.click(modelTrigger!);
    });
    const otherOption = await screen.findByText(
      /Outro \(digitar manualmente\)/i,
    );
    await act(async () => {
      fireEvent.click(otherOption);
    });

    const inlineInput = (await screen.findByLabelText(
      /ID do modelo customizado/i,
    )) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(inlineInput, { target: { value: "gpt-5.5-2026-04-15" } });
    });

    expect(inlineInput.value).toBe("gpt-5.5-2026-04-15");
  });

  it("Renderiza badges de tier no dropdown (4 tiers visíveis: $/$$/$$$/$$$$)", async () => {
    renderForm();

    const allButtons = screen.getAllByRole("button");
    const modelTrigger = allButtons.find(
      (b) => b.getAttribute("aria-haspopup") === "listbox" &&
        /GPT|Selecionar modelo/i.test(b.textContent ?? ""),
    );
    await act(async () => {
      fireEvent.click(modelTrigger!);
    });

    // Aguarda dropdown render.
    await screen.findByText(/Outro \(digitar manualmente\)/i);

    // Confere que os 4 símbolos aparecem em algum lugar do dropdown.
    // (No catálogo OpenAI temos low, medium, high e premium representados.)
    await waitFor(() => {
      const dollarBadges = screen.queryAllByTitle(/Consumo (baixo|médio|alto|premium)/);
      // Deve ter ao menos 4 (1 por tier visível na lista).
      expect(dollarBadges.length).toBeGreaterThanOrEqual(4);
    });

    // Confere por título exato de cada tier.
    expect(screen.queryAllByTitle(/Consumo baixo/).length).toBeGreaterThan(0);
    expect(screen.queryAllByTitle(/Consumo médio/).length).toBeGreaterThan(0);
    expect(screen.queryAllByTitle(/Consumo alto/).length).toBeGreaterThan(0);
    expect(screen.queryAllByTitle(/Consumo premium/).length).toBeGreaterThan(0);
  });

  it("Seleção de item de catálogo (não-Outro) reseta o estado de customModel", async () => {
    renderForm();

    const allButtons = screen.getAllByRole("button");
    const modelTrigger = allButtons.find(
      (b) => b.getAttribute("aria-haspopup") === "listbox" &&
        /GPT|Selecionar modelo/i.test(b.textContent ?? ""),
    );

    // Entra em customMode.
    await act(async () => {
      fireEvent.click(modelTrigger!);
    });
    const otherOption = await screen.findByText(
      /Outro \(digitar manualmente\)/i,
    );
    await act(async () => {
      fireEvent.click(otherOption);
    });
    const inlineInput = (await screen.findByLabelText(
      /ID do modelo customizado/i,
    )) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(inlineInput, { target: { value: "modelo-foo" } });
    });
    expect(inlineInput.value).toBe("modelo-foo");

    // Reabre dropdown e seleciona um item de catálogo.
    await act(async () => {
      fireEvent.click(modelTrigger!);
    });

    // Pega a primeira opção que NÃO é "Outro".
    const gptOptions = await screen.findAllByText(/^GPT-/i);
    expect(gptOptions.length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(gptOptions[0]);
    });

    // Input inline some.
    expect(
      screen.queryByLabelText(/ID do modelo customizado/i),
    ).not.toBeInTheDocument();
  });
});

describe("LlmConfigForm — v0.31 polish", () => {
  beforeEach(() => {
    refresh.mockReset();
    push.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.warning.mockReset();
    toastMock.info.mockReset();
  });

  it("NÃO renderiza UsdRateTicker", () => {
    renderForm();
    expect(screen.queryByText(/USD\/BRL com spread/i)).not.toBeInTheDocument();
  });

  it("NÃO renderiza Spread cartão input", () => {
    renderForm();
    expect(screen.queryByLabelText(/Spread cartão/i)).not.toBeInTheDocument();
  });

  it("NÃO renderiza botão 'Criar API key' inline", () => {
    renderForm();
    expect(
      screen.queryByRole("link", { name: /Criar API key/i }),
    ).not.toBeInTheDocument();
  });

  it("Toggle Nex ativo tem id='nex-bubble-toggle' e SEM role='group' aninhado", () => {
    const { container } = renderForm();
    // base-ui Switch renderiza <span role="switch"> + <input id="..."> hidden
    // dentro do mesmo wrapper. O id do prop vai parar no <input>; o role=switch
    // é aplicado ao <span> visual. Ambos vivem dentro do mesmo card linha-única.
    const hiddenInput = container.querySelector("#nex-bubble-toggle");
    expect(hiddenInput).not.toBeNull();

    const switchSpan = container.querySelector("[role='switch']");
    expect(switchSpan).not.toBeNull();

    // Sobe até o card (rounded-xl) — o switch e o input devem estar nele.
    const parent = switchSpan?.closest("div[class*='rounded-xl']");
    expect(parent).not.toBeNull();
    expect(parent).toContainElement(hiddenInput as HTMLElement);

    // Não há role="group" aninhado no card.
    expect(parent?.querySelector("[role='group']")).toBeNull();
  });

  it("Mantém botão 'Adicionar crédito' (topUpUrl) quando catalog tem topUpUrl", () => {
    renderForm();
    expect(
      screen.getByRole("link", { name: /Adicionar crédito/i }),
    ).toBeInTheDocument();
  });
});
