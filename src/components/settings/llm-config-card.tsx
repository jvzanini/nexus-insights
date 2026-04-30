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
  ExternalLink,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CustomSelect,
  type SelectOption,
} from "@/components/ui/custom-select";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import { TierBadge } from "@/components/llm/tier-badge";
import { PROVIDER_CATALOG } from "@/lib/llm/catalog";
import type { LlmProvider } from "@/lib/llm/types";
import {
  saveLlmConfig,
  setNexBubbleEnabled,
  testLlmConnection,
  type TestLlmConnectionResult,
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

const CUSTOM_MODEL_VALUE = "__custom__";

const PROVIDER_OPTIONS: SelectOption[] = (
  Object.keys(PROVIDER_CATALOG) as LlmProvider[]
).map((p) => ({
  value: p,
  label: PROVIDER_CATALOG[p].label,
  description: p,
}));

function findInitialModelValue(
  provider: LlmProvider,
  model: string | undefined,
): { selectValue: string; customModel: string } {
  if (!model) {
    return { selectValue: PROVIDER_CATALOG[provider].models[0].id, customModel: "" };
  }
  const inCatalog = PROVIDER_CATALOG[provider].models.some(
    (m) => m.id === model,
  );
  if (inCatalog) return { selectValue: model, customModel: "" };
  return { selectValue: CUSTOM_MODEL_VALUE, customModel: model };
}

interface TestState {
  status: "idle" | "ok" | "warn" | "fail";
  message?: string;
  errorKind?: TestLlmConnectionResult["errorKind"];
  creditOk?: boolean;
}

export function LlmConfigCard({
  initial,
  initialNexEnabled,
}: LlmConfigCardProps) {
  const router = useRouter();
  const [provider, setProvider] = useState<LlmProvider>(
    initial?.provider ?? "openai",
  );

  const initialResolved = useMemo(
    () => findInitialModelValue(initial?.provider ?? "openai", initial?.model),
    [initial],
  );

  const [modelSelect, setModelSelect] = useState<string>(
    initialResolved.selectValue,
  );
  const [customModel, setCustomModel] = useState<string>(
    initialResolved.customModel,
  );
  const [apiKey, setApiKey] = useState<string>("");
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [isSaving, startSave] = useTransition();
  const [isTesting, startTest] = useTransition();
  const [nexEnabled, setNexEnabled] = useState<boolean>(initialNexEnabled);
  const [isTogglingNex, startNexToggle] = useTransition();

  const catalog = PROVIDER_CATALOG[provider];

  const modelOptions = useMemo<SearchableSelectOption[]>(() => {
    const customOption: SearchableSelectOption = {
      value: CUSTOM_MODEL_VALUE,
      label: "Outro (digitar manualmente)",
      notes: "Especifique um ID de modelo customizado",
    };
    const fromCatalog: SearchableSelectOption[] = catalog.models.map((m) => ({
      value: m.id,
      label: m.label,
      notes: m.notes,
      endAdornment: <TierBadge tier={m.tier} />,
    }));
    return [customOption, ...fromCatalog];
  }, [catalog]);

  const isConfigured = Boolean(initial);
  const usingCustom = modelSelect === CUSTOM_MODEL_VALUE;
  const resolvedModel = (usingCustom ? customModel : modelSelect).trim();

  function handleProviderChange(next: string) {
    const nextProvider = next as LlmProvider;
    setProvider(nextProvider);
    setModelSelect(PROVIDER_CATALOG[nextProvider].models[0].id);
    setCustomModel("");
    setTest({ status: "idle" });
  }

  function handleModelSelectChange(next: string) {
    setModelSelect(next);
    if (next !== CUSTOM_MODEL_VALUE) {
      setCustomModel("");
    }
    setTest({ status: "idle" });
  }

  function validateBeforeAction(): string | null {
    if (!provider) return "Selecione um provedor";
    if (!modelSelect) return "Selecione um modelo";
    if (resolvedModel.length < 3) {
      return usingCustom
        ? "Informe o ID do modelo customizado"
        : "Modelo inválido";
    }
    if (resolvedModel.length > 100) {
      return "ID de modelo muito longo (máx 100 chars)";
    }
    if (!apiKey || apiKey.trim().length < 10) {
      return "Cole uma API key válida";
    }
    return null;
  }

  async function persistConfig(): Promise<boolean> {
    const result = await saveLlmConfig({
      provider,
      model: resolvedModel,
      apiKey: apiKey.trim(),
    });
    if (!result.ok) {
      toast.error(result.error ?? "Erro ao salvar configuração");
      return false;
    }
    setApiKey("");
    setTest({ status: "idle" });
    router.refresh();
    return true;
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
        model: resolvedModel,
        apiKey: apiKey.trim(),
      });
      if (!result.ok) {
        setTest({ status: "fail", message: result.error });
        toast.error(result.error ?? "Erro ao testar conexão");
        return;
      }
      const data = result.data!;

      if (data.reachable && data.creditOk !== false) {
        // Auto-save após teste OK.
        const saved = await persistConfig();
        if (saved) {
          setTest({ status: "ok", message: "Conexão OK" });
          toast.success("Conexão OK · Configuração salva");
        }
        return;
      }

      if (data.reachable && data.creditOk === false) {
        setTest({
          status: "warn",
          message:
            "Conexão OK, mas a conta está sem crédito. Você pode salvar mesmo assim.",
          creditOk: false,
        });
        toast.warning("Conexão OK, mas sem crédito");
        return;
      }

      setTest({
        status: "fail",
        message: data.message ?? "Falha ao conectar",
        errorKind: data.errorKind,
      });
      toast.error(data.message ?? "Falha ao conectar");
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
      // Sempre testa antes de salvar manualmente.
      const testResult = await testLlmConnection({
        provider,
        model: resolvedModel,
        apiKey: apiKey.trim(),
      });
      if (!testResult.ok) {
        toast.error(testResult.error ?? "Erro ao testar conexão");
        return;
      }
      const data = testResult.data!;

      if (!data.reachable) {
        setTest({
          status: "fail",
          message: data.message ?? "Falha ao conectar",
          errorKind: data.errorKind,
        });
        toast.error(data.message ?? "Falha ao conectar — não foi salvo");
        return;
      }

      if (data.creditOk === false) {
        const ok =
          typeof window !== "undefined"
            ? window.confirm(
                "Conexão OK, mas a conta está sem crédito. Salvar mesmo assim?",
              )
            : true;
        if (!ok) return;
      }

      const saved = await persistConfig();
      if (saved) toast.success("Configuração salva");
    });
  }

  function handleSaveAnyway() {
    const err = validateBeforeAction();
    if (err) {
      toast.error(err);
      return;
    }
    startSave(async () => {
      const saved = await persistConfig();
      if (saved) toast.success("Configuração salva (sem crédito verificado)");
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
            <CardTitle className="text-foreground">Agente Nex</CardTitle>
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
                    nexEnabled ? "Desativar Agente Nex" : "Ativar Agente Nex"
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
                ? `Configurado: ${PROVIDER_CATALOG[initial!.provider].label} · ${initial!.model} · chave ${initial!.apiKeyMasked}`
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
              <SearchableSelect
                value={modelSelect}
                onChange={handleModelSelectChange}
                options={modelOptions}
                placeholder="Selecionar modelo"
                disabled={busy}
                searchPlaceholder="Buscar modelo..."
                triggerClassName="min-h-[44px]"
              />
              <p className="text-xs text-muted-foreground">
                Tier $ / $$ / $$$ indica custo aproximado por milhão de tokens.
              </p>
            </div>
          </div>

          {usingCustom ? (
            <div className="space-y-1.5">
              <Label htmlFor="llm-custom-model">Modelo customizado</Label>
              <Input
                id="llm-custom-model"
                value={customModel}
                onChange={(e) => {
                  setCustomModel(e.currentTarget.value);
                  setTest({ status: "idle" });
                }}
                placeholder="ex: gpt-4o-2024-08-06"
                autoComplete="off"
                disabled={busy}
                className="min-h-[44px]"
                aria-describedby="llm-custom-model-help"
              />
              <p id="llm-custom-model-help" className="text-xs text-muted-foreground">
                Útil para snapshots datados ou modelos novos não listados ainda.
              </p>
            </div>
          ) : null}

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

            {/* Atalhos: criar API key + adicionar crédito (URLs do catálogo). */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <a
                href={catalog.apiKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="llm-shortcut-api-key"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1 font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Criar API key
              </a>
              {catalog.topUpUrl ? (
                <a
                  href={catalog.topUpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="llm-shortcut-top-up"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1 font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                  Adicionar crédito
                </a>
              ) : null}
            </div>

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
              className={cn(
                "flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
                test.status === "ok" &&
                  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                test.status === "warn" &&
                  "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                test.status === "fail" && "bg-destructive/10 text-destructive",
              )}
              role="status"
              aria-live="polite"
            >
              {test.status === "ok" ? (
                <CheckCircle2
                  className="h-4 w-4 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : test.status === "warn" ? (
                <AlertTriangle
                  className="h-4 w-4 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : (
                <XCircle
                  className="h-4 w-4 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              )}
              <div className="leading-snug flex-1">
                <p className="font-medium">
                  {test.status === "ok"
                    ? "Conexão verificada · Configuração salva"
                    : test.status === "warn"
                      ? "Conexão OK · Sem crédito"
                      : "Falha ao conectar"}
                </p>
                {test.message && (
                  <p className="opacity-80 break-words">{test.message}</p>
                )}
                {test.status === "warn" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSaveAnyway}
                    disabled={busy}
                    className="mt-2 cursor-pointer"
                  >
                    Salvar mesmo assim
                  </Button>
                ) : null}
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
