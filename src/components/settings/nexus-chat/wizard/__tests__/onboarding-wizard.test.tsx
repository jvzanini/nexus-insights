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

// O ConnectionFormDialog é importado pelo wizard pra Step 1 ("Criar nova").
// Stub simplifica: ao abrir, expõe um botão "Salvar (mock)" que dispara onCreated.
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
    webhookToken: "tok-abc-123",
    status: "active",
  },
  {
    id: "conn-2",
    name: "Conexão B",
    webhookToken: "tok-def-456",
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

  it("renderiza Step 1 com lista de connections e stepper marcando 1 ativo", () => {
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    // Step 1 título
    expect(screen.getByRole("heading", { name: /Escolher conexão/i })).toBeInTheDocument();
    // Connections list
    expect(screen.getByText("Padrão (legado)")).toBeInTheDocument();
    expect(screen.getByText("Conexão B")).toBeInTheDocument();
    // Stepper indicador atual
    const stepper = screen.getByRole("list", { name: /etapas/i });
    expect(stepper).toBeInTheDocument();
    // Step ativo é "1"
    const step1 = screen.getByRole("listitem", { name: /Etapa 1.*atual/i });
    expect(step1).toBeInTheDocument();
  });

  it("avança Step 1 → 2 ao selecionar connection e clicar Próximo", () => {
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    // Botão Próximo desabilitado sem selecionar
    const next = screen.getByRole("button", { name: /Próximo/i });
    expect(next).toBeDisabled();
    // Selecionar conn-1
    fireEvent.click(screen.getByRole("radio", { name: /Padrão \(legado\)/i }));
    expect(next).toBeEnabled();
    fireEvent.click(next);
    // Step 2 visível
    expect(screen.getByRole("heading", { name: /Identidade da empresa/i })).toBeInTheDocument();
  });

  it("Step 2 valida accountId positivo e displayName não vazio", () => {
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Padrão \(legado\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    // Step 2: campos vazios → Próximo disabled
    const next = screen.getByRole("button", { name: /Próximo/i });
    expect(next).toBeDisabled();
    // accountId só → ainda disabled
    fireEvent.change(screen.getByLabelText(/Account ID/i), {
      target: { value: "42" },
    });
    expect(next).toBeDisabled();
    // ambos preenchidos → habilita
    fireEvent.change(screen.getByLabelText(/Nome de exibição/i), {
      target: { value: "Empresa Foo" },
    });
    expect(next).toBeEnabled();
  });

  it("Step 3 mostra URL com origin + token e Próximo só habilita após checkbox", () => {
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
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    // Step 3
    expect(screen.getByRole("heading", { name: /Webhook/i })).toBeInTheDocument();
    // jsdom default origin é http://localhost
    expect(
      screen.getByText(/\/api\/webhooks\/nexus-chat\/tok-abc-123$/),
    ).toBeInTheDocument();
    // Botão "Finalizar"
    const finalize = screen.getByRole("button", { name: /Finalizar/i });
    expect(finalize).toBeDisabled();
    // Marca checkbox
    fireEvent.click(screen.getByRole("checkbox", { name: /Já cadastrei/i }));
    expect(finalize).toBeEnabled();
  });

  it("Step 3 → Submit chama createCompanyChatBinding com payload correto e mostra Step 4", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Já cadastrei/i }));
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/i }));
    await waitFor(() => {
      expect(createCompanyChatBinding).toHaveBeenCalledWith({
        connectionId: "conn-1",
        chatwootAccountId: 42,
        displayName: "Empresa Foo",
        enabled: true,
      });
    });
    // Step 4 visível
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Empresa onboardada/i }),
      ).toBeInTheDocument();
    });
    // 2 CTAs lado-a-lado
    expect(
      screen.getByRole("link", { name: /Ver eventos chegando/i }),
    ).toHaveAttribute("href", "/bancos-de-dados/conn-1?tab=tempo-real");
    expect(
      screen.getByRole("link", { name: /Liberar acesso/i }),
    ).toHaveAttribute("href", "/usuarios");
    expect(onSuccess).toHaveBeenCalledWith("bind-new");
  });

  it("Submit com erro mostra mensagem inline e mantém Step 3", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Já cadastrei/i }));
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/i }));
    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalled();
    });
    // Mensagem inline
    expect(
      screen.getByRole("alert", { name: /Erro ao cadastrar empresa/i }),
    ).toHaveTextContent(/Já existe/);
    // Continua no Step 3
    expect(screen.getByRole("heading", { name: /Webhook/i })).toBeInTheDocument();
  });

  it("Botão Voltar preserva state dos steps anteriores", () => {
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    // Step 1 → seleciona conn-1 e avança
    fireEvent.click(screen.getByRole("radio", { name: /Padrão \(legado\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    // Step 2 → preenche e avança
    fireEvent.change(screen.getByLabelText(/Account ID/i), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByLabelText(/Nome de exibição/i), {
      target: { value: "Empresa Foo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    // Step 3 → Voltar → volta pra Step 2 com valores preservados
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(screen.getByLabelText(/Account ID/i)).toHaveValue(42);
    expect(screen.getByLabelText(/Nome de exibição/i)).toHaveValue(
      "Empresa Foo",
    );
    // Volta de novo → Step 1 com radio ainda selecionado
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(screen.getByRole("radio", { name: /Padrão \(legado\)/i })).toBeChecked();
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

  it("Stepper mostra step 2 ativo após avançar de 1 pra 2", () => {
    render(
      <OnboardingWizard
        connections={SAMPLE_CONNECTIONS}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Padrão \(legado\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    // Etapa 2 ativa, Etapa 1 concluída
    expect(
      screen.getByRole("listitem", { name: /Etapa 2.*atual/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: /Etapa 1.*concluída/i }),
    ).toBeInTheDocument();
  });

  it("Step 4 botão 'Cadastrar outra empresa' reseta wizard pro Step 1", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Já cadastrei/i }));
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Empresa onboardada/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Cadastrar outra empresa/i }),
    );
    // Volta pro Step 1 com tudo limpo
    expect(
      screen.getByRole("heading", { name: /Escolher conexão/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Padrão \(legado\)/i })).not.toBeChecked();
  });
});
