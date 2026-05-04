"use client";

import { useMemo, useReducer, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Database,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Users,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { createCompanyChatBinding } from "@/lib/actions/nexus-chat/bindings";
import { ConnectionFormDialog } from "../connection-form-dialog";

/**
 * Connection minimal pro Step 1 do wizard. Recebe-se via prop do server
 * component (page `/bancos-de-dados`).
 */
export interface WizardConnection {
  id: string;
  name: string;
  webhookToken: string | null;
  status: string;
}

interface Props {
  connections: WizardConnection[];
  /** Fecha o wizard (geralmente desmonta o Dialog que o contém). */
  onClose: () => void;
  /** Callback após `createCompanyChatBinding` retornar success. */
  onSuccess?: (bindingId: string) => void;
}

const CHATWOOT_WEBHOOK_EVENTS = [
  "conversation_created",
  "conversation_updated",
  "conversation_resolved",
  "message_created",
  "conversation_status_changed",
];

const COMBOBOX_THRESHOLD = 20;

/* -------------------------------------------------------------------------- */
/*  Reducer                                                                   */
/* -------------------------------------------------------------------------- */

type WizardStep = 1 | 2 | 3 | 4;

interface WizardState {
  step: WizardStep;
  connectionId: string | null;
  accountId: string;
  displayName: string;
  webhookConfirmed: boolean;
  submitting: boolean;
  error: string | null;
  createdBindingId: string | null;
}

type WizardAction =
  | { type: "set_connection"; connectionId: string | null }
  | { type: "set_account_id"; value: string }
  | { type: "set_display_name"; value: string }
  | { type: "set_webhook_confirmed"; value: boolean }
  | { type: "next" }
  | { type: "back" }
  | { type: "submit_start" }
  | { type: "submit_success"; bindingId: string }
  | { type: "submit_error"; error: string }
  | { type: "reset" };

const INITIAL_STATE: WizardState = {
  step: 1,
  connectionId: null,
  accountId: "",
  displayName: "",
  webhookConfirmed: false,
  submitting: false,
  error: null,
  createdBindingId: null,
};

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "set_connection":
      return { ...state, connectionId: action.connectionId };
    case "set_account_id":
      return { ...state, accountId: action.value };
    case "set_display_name":
      return { ...state, displayName: action.value };
    case "set_webhook_confirmed":
      return { ...state, webhookConfirmed: action.value };
    case "next": {
      const next = Math.min(state.step + 1, 4) as WizardStep;
      return { ...state, step: next, error: null };
    }
    case "back": {
      const prev = Math.max(state.step - 1, 1) as WizardStep;
      return { ...state, step: prev, error: null };
    }
    case "submit_start":
      return { ...state, submitting: true, error: null };
    case "submit_success":
      return {
        ...state,
        submitting: false,
        step: 4,
        createdBindingId: action.bindingId,
      };
    case "submit_error":
      return { ...state, submitting: false, error: action.error };
    case "reset":
      return INITIAL_STATE;
    default:
      return state;
  }
}

/* -------------------------------------------------------------------------- */
/*  Stepper                                                                   */
/* -------------------------------------------------------------------------- */

const STEP_LABELS = [
  "Conexão",
  "Identidade",
  "Webhook",
  "Conclusão",
] as const;

function Stepper({ current }: { current: WizardStep }) {
  return (
    <ol
      role="list"
      aria-label="Etapas do onboarding"
      className="grid grid-cols-4 gap-2"
    >
      {STEP_LABELS.map((label, idx) => {
        const stepNumber = (idx + 1) as WizardStep;
        const isActive = current === stepNumber;
        const isDone = current > stepNumber;
        const ariaLabel = isActive
          ? `Etapa ${stepNumber}: ${label} (atual)`
          : isDone
            ? `Etapa ${stepNumber}: ${label} (concluída)`
            : `Etapa ${stepNumber}: ${label} (pendente)`;
        return (
          <li
            key={stepNumber}
            aria-label={ariaLabel}
            aria-current={isActive ? "step" : undefined}
            className="flex flex-col items-stretch gap-1.5"
          >
            <div className="flex items-center gap-2">
              {/* Indicador (dot/número) */}
              <div
                aria-hidden
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition-colors",
                  "motion-safe:transition-all motion-safe:duration-200",
                  isDone
                    ? "bg-emerald-500/15 text-emerald-600 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-400"
                    : isActive
                      ? "bg-violet-500 text-white shadow-sm shadow-violet-500/30"
                      : "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
                )}
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  stepNumber
                )}
              </div>
              {/* Linha de progresso (oculta no último) */}
              {stepNumber < 4 ? (
                <div
                  aria-hidden
                  className={cn(
                    "h-0.5 min-w-0 flex-1 rounded-full transition-colors",
                    "motion-safe:transition-all motion-safe:duration-300",
                    isDone
                      ? "bg-emerald-500/40"
                      : isActive
                        ? "bg-gradient-to-r from-violet-500/60 to-border"
                        : "bg-border",
                  )}
                />
              ) : null}
            </div>
            <span
              className={cn(
                "hidden text-[11px] font-medium leading-tight sm:block",
                isActive
                  ? "text-foreground"
                  : isDone
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*  Wizard root                                                               */
/* -------------------------------------------------------------------------- */

export function OnboardingWizard({ connections, onClose, onSuccess }: Props) {
  const router = useRouter();
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_STATE);
  const [pending, startTransition] = useTransition();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const selectedConnection = useMemo(
    () => connections.find((c) => c.id === state.connectionId) ?? null,
    [connections, state.connectionId],
  );

  const webhookUrl = useMemo(() => {
    if (!selectedConnection?.webhookToken) return null;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}/api/webhooks/nexus-chat/${selectedConnection.webhookToken}`;
  }, [selectedConnection]);

  /* ---------- Validação por step ---------- */

  const accountIdNum = Number(state.accountId);
  const isValidStep1 = state.connectionId !== null;
  const isValidStep2 =
    Number.isInteger(accountIdNum) &&
    accountIdNum > 0 &&
    state.displayName.trim().length > 0;
  const isValidStep3 = state.webhookConfirmed;

  const canAdvance =
    state.step === 1
      ? isValidStep1
      : state.step === 2
        ? isValidStep2
        : state.step === 3
          ? isValidStep3
          : false;

  /* ---------- Submit ---------- */

  function handleFinalize() {
    if (!isValidStep3 || !state.connectionId) return;
    dispatch({ type: "submit_start" });
    startTransition(async () => {
      const result = await createCompanyChatBinding({
        connectionId: state.connectionId!,
        chatwootAccountId: accountIdNum,
        displayName: state.displayName.trim(),
        enabled: true,
      });
      if (!result.success || !result.data) {
        const msg = result.error ?? "Falha ao onboardar empresa.";
        dispatch({ type: "submit_error", error: msg });
        toast.error(msg);
        return;
      }
      dispatch({ type: "submit_success", bindingId: result.data.id });
      toast.success("Empresa onboardada com sucesso.");
      router.refresh();
      onSuccess?.(result.data.id);
    });
  }

  /* ---------- Render ---------- */

  return (
    <div className="grid gap-5">
      <header className="grid gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <Sparkles
              className="h-[18px] w-[18px] text-violet-500"
              aria-hidden
            />
          </div>
          <div className="grid gap-0.5">
            <h2 className="font-heading text-base font-semibold text-foreground">
              Onboardar empresa
            </h2>
            <p className="text-xs text-muted-foreground">
              Vincule uma conta do Nexus Chat (account_id) a uma conexão
              Postgres.
            </p>
          </div>
        </div>
        <Stepper current={state.step} />
      </header>

      {/* Painel do step (fade entre steps; respeita reduced-motion) */}
      <div
        key={state.step}
        className={cn(
          "min-h-[260px]",
          "motion-safe:animate-in motion-safe:fade-in-50 motion-safe:duration-200",
        )}
      >
        {state.step === 1 ? (
          <StepConnection
            connections={connections}
            selectedId={state.connectionId}
            onSelect={(id) =>
              dispatch({ type: "set_connection", connectionId: id })
            }
            onCreateNew={() => setCreateDialogOpen(true)}
          />
        ) : null}

        {state.step === 2 ? (
          <StepIdentity
            accountId={state.accountId}
            displayName={state.displayName}
            onAccountIdChange={(value) =>
              dispatch({ type: "set_account_id", value })
            }
            onDisplayNameChange={(value) =>
              dispatch({ type: "set_display_name", value })
            }
          />
        ) : null}

        {state.step === 3 ? (
          <StepWebhook
            webhookUrl={webhookUrl}
            connectionName={selectedConnection?.name ?? null}
            confirmed={state.webhookConfirmed}
            onConfirmedChange={(value) =>
              dispatch({ type: "set_webhook_confirmed", value })
            }
            error={state.error}
          />
        ) : null}

        {state.step === 4 && state.connectionId ? (
          <StepDone
            connectionId={state.connectionId}
            displayName={state.displayName}
            onReset={() => dispatch({ type: "reset" })}
          />
        ) : null}
      </div>

      {/* Footer com Voltar/Próximo/Finalizar/Cancelar */}
      {state.step < 4 ? (
        <footer className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {state.step > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => dispatch({ type: "back" })}
                disabled={state.submitting || pending}
                className="cursor-pointer"
              >
                <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
                Voltar
              </Button>
            ) : null}
            {state.step < 3 ? (
              <Button
                type="button"
                onClick={() => dispatch({ type: "next" })}
                disabled={!canAdvance}
                className="cursor-pointer"
              >
                Próximo
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleFinalize}
                disabled={!canAdvance || state.submitting || pending}
                className="cursor-pointer"
              >
                {state.submitting || pending ? (
                  <Loader2
                    className="mr-1.5 h-4 w-4 animate-spin"
                    aria-hidden
                  />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />
                )}
                Finalizar
              </Button>
            )}
          </div>
        </footer>
      ) : null}

      {/* Dialog "Criar nova conexão" — embutido aqui para Step 1 */}
      <ConnectionFormDialog
        mode="create"
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          // Server Action do create já refreshea a page; quando ela
          // remontar, `connections` chega via prop atualizada.
        }}
        connection={null}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 1 — Escolher connection                                              */
/* -------------------------------------------------------------------------- */

function StepConnection({
  connections,
  selectedId,
  onSelect,
  onCreateNew,
}: {
  connections: WizardConnection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
}) {
  const useCombobox = connections.length > COMBOBOX_THRESHOLD;

  if (connections.length === 0) {
    return (
      <section className="grid gap-4">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          Escolher conexão
        </h3>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/40 px-6 py-10 text-center">
          <Database
            className="h-7 w-7 text-muted-foreground"
            aria-hidden
          />
          <p className="text-sm font-medium text-foreground">
            Nenhuma conexão cadastrada
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Crie uma conexão Postgres ao banco do Nexus Chat antes de
            onboardar a primeira empresa.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={onCreateNew}
            className="mt-2 cursor-pointer"
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Criar conexão
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h3 className="font-heading text-sm font-semibold text-foreground">
            Escolher conexão
          </h3>
          <p className="text-xs text-muted-foreground">
            Selecione o banco Postgres onde a empresa está hospedada.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCreateNew}
          className="cursor-pointer"
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          Criar nova
        </Button>
      </div>

      {useCombobox ? (
        <ConnectionCombobox
          connections={connections}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : (
        <fieldset className="grid gap-1.5">
          <legend className="sr-only">Conexões cadastradas</legend>
          <ul
            role="radiogroup"
            aria-label="Conexões cadastradas"
            className="grid gap-1.5"
          >
            {connections.map((c) => (
              <li key={c.id}>
                <ConnectionRadioRow
                  connection={c}
                  selected={selectedId === c.id}
                  onSelect={() => onSelect(c.id)}
                />
              </li>
            ))}
          </ul>
        </fieldset>
      )}
    </section>
  );
}

function ConnectionRadioRow({
  connection,
  selected,
  onSelect,
}: {
  connection: WizardConnection;
  selected: boolean;
  onSelect: () => void;
}) {
  const id = `wizard-conn-${connection.id}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        "group flex min-h-[52px] cursor-pointer items-center gap-3 rounded-lg border bg-background/40 px-3 py-2.5 text-sm transition-colors",
        "hover:bg-muted/40",
        selected
          ? "border-violet-500/40 bg-violet-500/5 ring-1 ring-violet-500/20"
          : "border-border",
      )}
    >
      <input
        id={id}
        type="radio"
        name="wizard-connection"
        checked={selected}
        onChange={onSelect}
        aria-label={connection.name}
        className="sr-only"
      />
      <div
        aria-hidden
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
          selected
            ? "border-violet-500 bg-violet-500"
            : "border-muted-foreground/40 bg-background group-hover:border-muted-foreground/70",
        )}
      >
        {selected ? (
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Database
          className={cn(
            "h-4 w-4 shrink-0",
            selected ? "text-violet-500" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <span className="truncate font-medium text-foreground">
          {connection.name}
        </span>
        {connection.webhookToken === null ? (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300">
            <Webhook className="h-2.5 w-2.5" aria-hidden />
            sem webhook
          </span>
        ) : null}
      </div>
    </label>
  );
}

function ConnectionCombobox({
  connections,
  selectedId,
  onSelect,
}: {
  connections: WizardConnection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return connections;
    return connections.filter((c) => c.name.toLowerCase().includes(q));
  }, [connections, query]);

  const selected = connections.find((c) => c.id === selectedId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex h-11 w-full cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        }
      >
        <Database className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="flex-1 truncate text-left">
          {selected ? selected.name : "Selecione uma conexão"}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--popover-trigger-width)] p-0">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar conexão…"
            className="h-7 border-0 px-0 text-xs shadow-none focus-visible:ring-0"
            autoFocus
          />
        </div>
        <ul
          role="listbox"
          aria-label="Conexões"
          className="max-h-60 overflow-y-auto p-1"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhuma conexão corresponde à busca.
            </li>
          ) : (
            filtered.map((c) => {
              const isSelected = c.id === selectedId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelect(c.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      isSelected
                        ? "bg-violet-500/10 text-foreground"
                        : "hover:bg-muted text-foreground",
                    )}
                  >
                    <Database
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isSelected
                          ? "text-violet-500"
                          : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="truncate">{c.name}</span>
                    {isSelected ? (
                      <Check
                        className="ml-auto h-4 w-4 text-violet-500"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 2 — Identidade da empresa                                            */
/* -------------------------------------------------------------------------- */

function StepIdentity({
  accountId,
  displayName,
  onAccountIdChange,
  onDisplayNameChange,
}: {
  accountId: string;
  displayName: string;
  onAccountIdChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
}) {
  return (
    <section className="grid gap-3">
      <div className="grid gap-0.5">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          Identidade da empresa
        </h3>
        <p className="text-xs text-muted-foreground">
          Dados que identificam a conta no Nexus Chat e o nome amigável usado
          em todo o dashboard.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="wizard-account-id">Account ID</Label>
          <Input
            id="wizard-account-id"
            type="number"
            inputMode="numeric"
            min={1}
            value={accountId}
            onChange={(e) => onAccountIdChange(e.target.value)}
            placeholder="ex.: 42"
            autoComplete="off"
          />
          <p className="text-[11px] text-muted-foreground">
            ID numérico da conta no Nexus Chat.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="wizard-display-name">Nome de exibição</Label>
          <Input
            id="wizard-display-name"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="ex.: Matrix Fitness — Unidade Centro"
            autoComplete="off"
            maxLength={150}
          />
          <p className="text-[11px] text-muted-foreground">
            Nome curto que aparece nos relatórios e seletor de empresa.
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 3 — Webhook                                                          */
/* -------------------------------------------------------------------------- */

function StepWebhook({
  webhookUrl,
  connectionName,
  confirmed,
  onConfirmedChange,
  error,
}: {
  webhookUrl: string | null;
  connectionName: string | null;
  confirmed: boolean;
  onConfirmedChange: (value: boolean) => void;
  error: string | null;
}) {
  return (
    <section className="grid gap-3">
      <div className="grid gap-0.5">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          Webhook do Nexus Chat
        </h3>
        <p className="text-xs text-muted-foreground">
          Cole esta URL no painel admin do Nexus Chat
          {connectionName ? (
            <>
              {" "}para a conexão <strong>{connectionName}</strong>
            </>
          ) : null}
          .
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">URL do webhook</Label>
        {webhookUrl ? (
          <CopyableCode value={webhookUrl} />
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
            Esta conexão ainda não tem webhook gerado. Edite-a antes para criar
            o token.
          </div>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">
          Eventos a marcar no painel do Nexus Chat
        </Label>
        <ul className="grid gap-1 rounded-md border border-border bg-muted/30 p-3 font-mono text-xs text-muted-foreground">
          {CHATWOOT_WEBHOOK_EVENTS.map((evt) => (
            <li key={evt} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-1 w-1 rounded-full bg-muted-foreground/50"
              />
              {evt}
            </li>
          ))}
        </ul>
      </div>

      <label
        htmlFor="wizard-webhook-confirmed"
        className={cn(
          "flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-md border bg-background/40 px-3 py-2.5 text-sm transition-colors",
          confirmed
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-border hover:bg-muted/40",
        )}
      >
        <span className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          <input
            id="wizard-webhook-confirmed"
            type="checkbox"
            checked={confirmed}
            onChange={(e) => onConfirmedChange(e.target.checked)}
            aria-label="Já cadastrei o webhook no painel do Nexus Chat"
            className={cn(
              "peer h-4 w-4 cursor-pointer appearance-none rounded-[4px] border transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring/50",
              confirmed
                ? "border-violet-500 bg-violet-500"
                : "border-input bg-background",
            )}
          />
          <Check
            aria-hidden
            className={cn(
              "pointer-events-none absolute h-3 w-3 text-white transition-opacity",
              confirmed ? "opacity-100" : "opacity-0",
            )}
          />
        </span>
        <div className="grid gap-0.5">
          <span className="font-medium text-foreground">
            Já cadastrei o webhook no painel do Nexus Chat
          </span>
          <span className="text-[11px] font-normal text-muted-foreground">
            Marque após colar a URL acima e selecionar os 5 eventos no painel
            admin.
          </span>
        </div>
      </label>

      {error ? (
        <div
          role="alert"
          aria-label="Erro ao onboardar"
          className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-700 dark:text-rose-300"
        >
          <AlertCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden
          />
          <span>{error}</span>
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 4 — Conclusão                                                        */
/* -------------------------------------------------------------------------- */

function StepDone({
  connectionId,
  displayName,
  onReset,
}: {
  connectionId: string;
  displayName: string;
  onReset: () => void;
}) {
  return (
    <section className="grid gap-4">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-6 py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/30">
          <CheckCircle2
            className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
        </div>
        <h3 className="font-heading text-base font-semibold text-foreground">
          Empresa onboardada
        </h3>
        <p className="max-w-sm text-xs text-muted-foreground">
          <strong>{displayName}</strong> foi vinculada à conexão. Os eventos
          começam a chegar assim que o painel do Nexus Chat dispara o primeiro
          webhook.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Link
          href={`/bancos-de-dados/${connectionId}?tab=tempo-real`}
          className="group flex min-h-[64px] flex-col items-start gap-1 rounded-lg border border-border bg-background/40 p-3 text-left transition-colors hover:border-violet-500/40 hover:bg-violet-500/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <div className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400">
            <Webhook className="h-4 w-4" aria-hidden />
            <span className="text-sm font-medium">Ver eventos chegando</span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Aba Tempo real desta conexão.
          </span>
        </Link>
        <Link
          href="/usuarios"
          className="group flex min-h-[64px] flex-col items-start gap-1 rounded-lg border border-border bg-background/40 p-3 text-left transition-colors hover:border-violet-500/40 hover:bg-violet-500/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <div className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400">
            <Users className="h-4 w-4" aria-hidden />
            <span className="text-sm font-medium">Liberar acesso</span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Conceda permissão a usuários nessa empresa.
          </span>
        </Link>
      </div>

      <div className="flex justify-center pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={onReset}
          className="cursor-pointer"
        >
          <Building2 className="mr-1.5 h-4 w-4" aria-hidden />
          Onboardar outra empresa
        </Button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Copy URL pattern                                                          */
/* -------------------------------------------------------------------------- */

function CopyableCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("URL copiada");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  }
  return (
    <div className="flex items-stretch gap-2 rounded-md border border-border bg-background/60">
      <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
        {value}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copiar URL do webhook"
        title="Copiar para área de transferência"
        className="inline-flex w-11 shrink-0 cursor-pointer items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {copied ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : (
          <Clipboard className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );
}
