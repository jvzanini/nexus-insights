"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Plug,
  KeyRound,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CustomSelect,
  type SelectOption,
} from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import {
  PROVIDER_LABELS,
  PROVIDER_MODELS,
} from "@/lib/llm/pricing";
import type { LlmProvider } from "@/lib/llm/types";
import {
  saveLlmConfig,
  setNexBubbleEnabled,
  testLlmConnection,
} from "@/lib/actions/llm-config";
import { cn } from "@/lib/utils";

interface LlmConfigCardProps {
  initial: {
    provider: LlmProvider;
    model: string;
    apiKeyMasked: string;
  } | null;
  initialNexEnabled: boolean;
}

const PROVIDER_OPTIONS: SelectOption[] = (
  Object.keys(PROVIDER_LABELS) as LlmProvider[]
).map((p) => ({
  value: p,
  label: PROVIDER_LABELS[p],
  description: p,
}));

function modelOptionsFor(provider: LlmProvider): SelectOption[] {
  return PROVIDER_MODELS[provider].map((m) => ({
    value: m,
    label: m,
  }));
}

interface TestState {
  status: "idle" | "ok" | "fail";
  message?: string;
}

export function LlmConfigCard({
  initial,
  initialNexEnabled,
}: LlmConfigCardProps) {
  const router = useRouter();
  const [provider, setProvider] = useState<LlmProvider>(
    initial?.provider ?? "openai",
  );
  const [model, setModel] = useState<string>(
    initial?.model ?? PROVIDER_MODELS[initial?.provider ?? "openai"][0],
  );
  const [apiKey, setApiKey] = useState<string>("");
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [isSaving, startSave] = useTransition();
  const [isTesting, startTest] = useTransition();
  const [nexEnabled, setNexEnabled] = useState<boolean>(initialNexEnabled);
  const [isTogglingNex, startNexToggle] = useTransition();

  const modelOptions = useMemo(() => modelOptionsFor(provider), [provider]);
  const isConfigured = Boolean(initial);

  function handleProviderChange(next: string) {
    const nextProvider = next as LlmProvider;
    setProvider(nextProvider);
    // Reset modelo ao trocar provider para garantir compatibilidade.
    setModel(PROVIDER_MODELS[nextProvider][0]);
    setTest({ status: "idle" });
  }

  function handleModelChange(next: string) {
    setModel(next);
    setTest({ status: "idle" });
  }

  function validateBeforeAction(): string | null {
    if (!provider || !model) return "Selecione provider e modelo";
    if (!apiKey || apiKey.trim().length < 10) {
      return "Cole uma API key válida";
    }
    return null;
  }

  function handleTest() {
    const err = validateBeforeAction();
    if (err) {
      toast.error(err);
      return;
    }
    startTest(async () => {
      const result = await testLlmConnection({
        provider,
        model,
        apiKey: apiKey.trim(),
      });
      if (!result.ok) {
        setTest({ status: "fail", message: result.error });
        toast.error(result.error ?? "Erro ao testar conexão");
        return;
      }
      if (result.data?.reachable) {
        setTest({ status: "ok", message: result.data.message });
        toast.success("Conexão OK");
      } else {
        setTest({
          status: "fail",
          message: result.data?.message ?? "Falha ao conectar",
        });
        toast.error(result.data?.message ?? "Falha ao conectar");
      }
    });
  }

  function handleNexToggle(checked: boolean) {
    if (!isConfigured) {
      toast.error("Configure um provedor antes de ativar o Agente Nex");
      return;
    }
    const previous = nexEnabled;
    setNexEnabled(checked);
    startNexToggle(async () => {
      const result = await setNexBubbleEnabled(checked);
      if (!result.ok) {
        setNexEnabled(previous);
        toast.error(result.error ?? "Erro ao salvar preferência");
        return;
      }
      toast.success(
        checked
          ? "Agente Nex ativado — bolha visível em todas as páginas"
          : "Agente Nex desativado — bolha oculta",
      );
      router.refresh();
    });
  }

  function handleSave() {
    const err = validateBeforeAction();
    if (err) {
      toast.error(err);
      return;
    }
    startSave(async () => {
      const result = await saveLlmConfig({
        provider,
        model,
        apiKey: apiKey.trim(),
      });
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao salvar configuração");
        return;
      }
      toast.success("Configuração de IA salva");
      setApiKey("");
      setTest({ status: "idle" });
      router.refresh();
    });
  }

  const busy = isSaving || isTesting;

  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <Sparkles className="h-[18px] w-[18px] text-violet-500" />
          </div>
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-foreground">
              Agente IA (Nex)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Configure o provedor de IA usado pelo agente de consultas. A
              chave é cifrada com AES-256 antes de ser persistida.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-6">
          {/* Toggle global da bolha do Agente Nex. */}
          <div
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/40 px-4 py-3"
            role="group"
            aria-labelledby="nex-bubble-toggle-title"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span
                aria-hidden
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full transition-[background-color,box-shadow] duration-200",
                  nexEnabled
                    ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]"
                    : "bg-zinc-400 dark:bg-zinc-600",
                )}
              />
              <div className="min-w-0">
                <p
                  id="nex-bubble-toggle-title"
                  className="text-sm font-medium text-foreground"
                >
                  {nexEnabled ? "Agente Nex ativo" : "Agente Nex desativado"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {!isConfigured
                    ? "Configure um provedor abaixo para liberar a bolha flutuante."
                    : nexEnabled
                      ? "A bolha flutuante aparece em todas as páginas autenticadas."
                      : "A bolha flutuante está oculta para todos os usuários."}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isTogglingNex ? (
                <Loader2
                  className="h-4 w-4 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              ) : null}
              <span
                className="relative inline-flex h-11 w-11 items-center justify-center"
                title={
                  !isConfigured
                    ? "Configure um provedor para ativar"
                    : undefined
                }
              >
                <Switch
                  checked={nexEnabled}
                  onCheckedChange={handleNexToggle}
                  disabled={isTogglingNex || !isConfigured}
                  aria-label={
                    nexEnabled
                      ? "Desativar Agente Nex"
                      : "Ativar Agente Nex"
                  }
                />
              </span>
            </div>
          </div>

          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
              isConfigured
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}
            role="status"
            aria-live="polite"
          >
            {isConfigured ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="leading-snug">
              {isConfigured
                ? `Configurado: ${PROVIDER_LABELS[initial!.provider]} · ${initial!.model} · chave ${initial!.apiKeyMasked}`
                : "Não configurado — selecione provider, modelo e cole a API key abaixo."}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="llm-provider">Provedor</Label>
              <CustomSelect
                value={provider}
                onChange={handleProviderChange}
                options={PROVIDER_OPTIONS}
                placeholder="Selecionar provedor"
                disabled={busy}
                triggerClassName="min-h-[44px]"
              />
              <p className="text-xs text-muted-foreground">
                Plataforma de IA que processará as consultas do agente.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="llm-model">Modelo</Label>
              <CustomSelect
                value={model}
                onChange={handleModelChange}
                options={modelOptions}
                placeholder="Selecionar modelo"
                disabled={busy}
                triggerClassName="min-h-[44px]"
              />
              <p className="text-xs text-muted-foreground">
                Modelos disponíveis no provedor selecionado.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="llm-api-key" className="gap-2">
              <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
              API key
            </Label>
            <PasswordInput
              id="llm-api-key"
              value={apiKey}
              onChange={setApiKey}
              placeholder={
                isConfigured
                  ? "Cole nova chave para substituir a atual"
                  : "Cole a chave fornecida pelo provedor"
              }
              autoComplete="off"
              ariaLabel="API key do provedor de IA"
              className="min-h-[44px]"
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              A chave nunca é exibida após salvar. Para trocar, basta colar uma
              nova.
            </p>

            {/* Honeypot — evita autofill em browsers que ignoram autocomplete=off. */}
            <Input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
              readOnly
              value=""
            />
          </div>

          {test.status !== "idle" && (
            <div
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                test.status === "ok"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-destructive/10 text-destructive"
              }`}
              role="status"
              aria-live="polite"
            >
              {test.status === "ok" ? (
                <CheckCircle2
                  className="h-4 w-4 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : (
                <XCircle
                  className="h-4 w-4 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              )}
              <div className="leading-snug">
                <p className="font-medium">
                  {test.status === "ok"
                    ? "Conexão verificada"
                    : "Falha ao conectar"}
                </p>
                {test.message && (
                  <p className="opacity-80 break-words">{test.message}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={busy}
              className="cursor-pointer min-h-[44px]"
            >
              {isTesting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plug className="mr-1.5 h-4 w-4" />
              )}
              Testar conexão
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="cursor-pointer min-h-[44px]"
            >
              {isSaving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              Salvar configuração
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
