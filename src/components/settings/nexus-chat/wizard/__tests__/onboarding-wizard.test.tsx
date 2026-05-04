/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const createCompanyChatBinding = jest.fn();
const refresh = jest.fn();

jest.mock("@/lib/actions/nexus-chat/bindings", () => ({
  createCompanyChatBinding: (...args: unknown[]) =>
    createCompanyChatBinding(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
};
jest.mock("sonner", () => ({ toast: toastMock }));

// Stub do ConnectionFormDialog (importado pelo wizard pra Step 1 "Criar nova").
jest.mock("../../connection-form-dialog", () => ({
  ConnectionFormDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="connection-form-dialog-stub">
        <button type="button" onClick={() => onOpenChange(false)}>
          Fechar mock
        </button>
      </div>
    ) : null,
}));

import { OnboardingWizard } from "../onboarding-wizard";

const SAMPLE_CONNECTIONS = [
  {
    id: "conn-1",
    name: "Padrão (legado)",
    status: "active",
  },
  {
    id: "conn-2",
    name: "Conexão B",
    status: "active",
  },
];

describe("<OnboardingWizard />", () => {
  beforeEach(() => {
    createCompanyChatBinding.mockReset();
    refresh.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it("renderiza Step Conexão com lista de connections e stepper marcando 1 ativo", () => {
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /Escolher conexão/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Padrão (legado)")).toBeInTheDocument();
    expect(screen.getByText("Conexão B")).toBeInTheDocument();
    const stepper = screen.getByRole("list", { name: /etapas/i });
    expect(stepper).toBeInTheDocument();
    const step1 = screen.getByRole("listitem", { name: /Etapa 1.*atual/i });
    expect(step1).toBeInTheDocument();
  });

  it("v0.41: NÃO renderiza Step Webhook entre Identidade e Conclusão", () => {
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    // Stepper só tem 3 entradas (Conexão, Identidade, Conclusão)
    const stepper = screen.getByRole("list", { name: /etapas/i });
    const stepItems = stepper.querySelectorAll(":scope > li");
    expect(stepItems).toHaveLength(3);
    // Nenhum label "Webhook" no stepper
    expect(
      screen.queryByText(/^Webhook$/, { selector: "span" }),
    ).not.toBeInTheDocument();
  });

  it("avança Step Conexão → Identidade ao selecionar e clicar Próximo", () => {
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    const next = screen.getByRole("button", { name: /Próximo/i });
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Padrão \(legado\)/i }));
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(
      screen.getByRole("heading", { name: /Identidade da empresa/i }),
    ).toBeInTheDocument();
  });

  it("Step Identidade valida accountId positivo e displayName não vazio", () => {
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Padrão \(legado\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    const finalize = screen.getByRole("button", { name: /Finalizar/i });
    expect(finalize).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Account ID/i), {
      target: { value: "42" },
    });
    expect(finalize).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Nome de exibição/i), {
      target: { value: "Empresa Foo" },
    });
    expect(finalize).toBeEnabled();
  });

  it("Step Identidade → Submit chama createCompanyChatBinding e mostra Step Conclusão", async () => {
    createCompanyChatBinding.mockResolvedValue({
      success: true,
      data: { id: "bind-new" },
    });
    const onSuccess = jest.fn();
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Padrão \(legado\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    fireEvent.change(screen.getByLabelText(/Account ID/i), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByLabelText(/Nome de exibição/i), {
      target: { value: "Empresa Foo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/i }));
    await waitFor(() => {
      expect(createCompanyChatBinding).toHaveBeenCalledWith({
        connectionId: "conn-1",
        chatwootAccountId: 42,
        displayName: "Empresa Foo",
        enabled: true,
      });
    });
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Empresa onboardada/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: /Ver sincronização/i }),
    ).toHaveAttribute("href", "/bancos-de-dados/conn-1?tab=sincronizacao");
    expect(
      screen.getByRole("link", { name: /Liberar acesso/i }),
    ).toHaveAttribute("href", "/usuarios");
    expect(onSuccess).toHaveBeenCalledWith("bind-new");
  });

  it("Submit com erro mostra mensagem inline e mantém Step Identidade", async () => {
    createCompanyChatBinding.mockResolvedValue({
      success: false,
      error: "Já existe uma empresa cadastrada com account_id=42",
    });
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Padrão \(legado\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    fireEvent.change(screen.getByLabelText(/Account ID/i), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByLabelText(/Nome de exibição/i), {
      target: { value: "Empresa Dup" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/i }));
    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalled();
    });
    expect(
      screen.getByRole("alert", { name: /Erro ao cadastrar empresa/i }),
    ).toHaveTextContent(/Já existe/);
    expect(
      screen.getByRole("heading", { name: /Identidade da empresa/i }),
    ).toBeInTheDocument();
  });

  it("Botão Voltar preserva state do Step Conexão", () => {
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Padrão \(legado\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    fireEvent.change(screen.getByLabelText(/Account ID/i), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByLabelText(/Nome de exibição/i), {
      target: { value: "Empresa Foo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(
      screen.getByRole("radio", { name: /Padrão \(legado\)/i }),
    ).toBeChecked();
  });

  it("Botão Cancelar chama onClose", () => {
    const onClose = jest.fn();
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={onClose}
        onSuccess={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Empty state quando connections=[] mostra CTA Criar conexão", () => {
    render(
      <OnboardingWizard
        connections={[]}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    expect(
      screen.getByText(/Nenhuma conexão cadastrada/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Criar conexão/i }),
    ).toBeInTheDocument();
  });

  it("Stepper mostra step Identidade ativo após avançar do Step Conexão", () => {
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Padrão \(legado\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(
      screen.getByRole("listitem", { name: /Etapa 2.*atual/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: /Etapa 1.*concluída/i }),
    ).toBeInTheDocument();
  });

  it("Step Conclusão → 'Cadastrar outra empresa' reseta wizard pro Step Conexão", async () => {
    createCompanyChatBinding.mockResolvedValue({
      success: true,
      data: { id: "bind-new" },
    });
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Padrão \(legado\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    fireEvent.change(screen.getByLabelText(/Account ID/i), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByLabelText(/Nome de exibição/i), {
      target: { value: "Empresa Foo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Empresa onboardada/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Cadastrar outra empresa/i }),
    );
    expect(
      screen.getByRole("heading", { name: /Escolher conexão/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Padrão \(legado\)/i }),
    ).not.toBeChecked();
  });

  /* -------------------- prefilledConnectionId -------------------- */

  it("quando prefilledConnectionId, pula direto para Step Identidade", () => {
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        prefilledConnectionId="conn-2"
      />,
    );
    // Step Conexão não aparece
    expect(
      screen.queryByRole("heading", { name: /Escolher conexão/i }),
    ).not.toBeInTheDocument();
    // Step Identidade visível
    expect(
      screen.getByRole("heading", { name: /Identidade da empresa/i }),
    ).toBeInTheDocument();
    // Texto "Etapa 1 de 2" no header (em vez de stepper)
    expect(screen.getByText(/Etapa 1 de 2/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: /etapas/i }),
    ).not.toBeInTheDocument();
  });

  it("após Identidade preenchida no modo prefilled, botão Finalizar fecha fluxo com a connection prefilled", async () => {
    createCompanyChatBinding.mockResolvedValue({
      success: true,
      data: { id: "bind-new" },
    });
    const onSuccess = jest.fn();
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={onSuccess}
        prefilledConnectionId="conn-2"
      />,
    );
    fireEvent.change(screen.getByLabelText(/Account ID/i), {
      target: { value: "13" },
    });
    fireEvent.change(screen.getByLabelText(/Nome de exibição/i), {
      target: { value: "Empresa Pré" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/i }));
    await waitFor(() => {
      expect(createCompanyChatBinding).toHaveBeenCalledWith({
        connectionId: "conn-2",
        chatwootAccountId: 13,
        displayName: "Empresa Pré",
        enabled: true,
      });
    });
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Empresa onboardada/i }),
      ).toBeInTheDocument();
    });
    // Não deve haver botão Voltar no modo prefilled.
    expect(
      screen.queryByRole("button", { name: /Voltar/i }),
    ).not.toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledWith("bind-new");
  });
});
