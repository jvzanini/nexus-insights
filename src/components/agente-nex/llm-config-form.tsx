"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
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
  Coins,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { TierBadge } from "@/components/llm/tier-badge";
import { PROVIDER_CATALOG } from "@/lib/llm/catalog";
import type { LlmProvider } from "@/lib/llm/types";
import {
  saveLlmConfig,
  setNexBubbleEnabled,
} from "@/lib/actions/llm-config";
import {
  testLlmCredentialAction,
  type TestLlmConnectionResult,
} from "@/lib/actions/llm-credentials";
import { setCardSpreadAction } from "@/lib/actions/exchange-rate";
import type { CredentialSummary } from "@/lib/llm/credentials";
import type { PublicLlmConfig } from "@/lib/llm/get-active-config";
import { cn } from "@/lib/utils";

interface LlmConfigFormProps {
  initial: PublicLlmConfig | null;
  initialNexEnabled: boolean;
  initialCredentials: CredentialSummary[];
  initialSpread: number;
}

const CUSTOM_MODEL_VALUE = "__custom__";
const NEW_CREDENTIAL_VALUE = "__new__";
const SPREAD_DEBOUNCE_MS = 500;

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

function buildCredentialOptions(
  credentials: CredentialSummary[],
): SelectOption[] {
  const opts: SelectOption[] = credentials.map((c) => ({
    value: c.id,
    label: `${c.label} · ••••${c.last4}`,
  }));
  opts.push({
    value: NEW_CREDENTIAL_VALUE,
    label: "+ Nova chave",
    description: "Cadastre na seção 'Chaves de API'",
  });
  return opts;
}

interface TestState {
  status: "idle" | "ok" | "warn" | "fail";
  message?: string;
  errorKind?: TestLlmConnectionResult["errorKind"];
  creditOk?: boolean;
}

export function LlmConfigForm({
  initial,
  initialNexEnabled,
  initialCredentials,
  initialSpread,
}: LlmConfigFormProps) {
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

  const credentialsForProvider = useMemo(
    () => initialCredentials.filter((c) => c.provider === provider),
    [initialCredentials, provider],
  );

  // `selectedCredentialIdByUser` é null quando o usuário ainda não interagiu
  // explicitamente OU quando a credencial escolhida sumiu (delete/troca de
  // provider). O efetivo `credentialId` é derivado: usa a escolha do usuário
  // quando ainda existe no provider atual; senão cai pro initial; senão pra
  // primeira; senão null.
  const [selectedCredentialIdByUser, setSelectedCredentialIdByUser] = useState<
    string | null
  >(null);

  const credentialId: string | null = useMemo(() => {
    if (
      selectedCredentialIdByUser &&
      credentialsForProvider.some((c) => c.id === selectedCredentialIdByUser)
    ) {
      return selectedCredentialIdByUser;
    }
    if (
      initial?.credentialId &&
      credentialsForProvider.some((c) => c.id === initial.credentialId)
    ) {
      return initial.credentialId;
    }
    return credentialsForProvider[0]?.id ?? null;
  }, [selectedCredentialIdByUser, credentialsForProvider, initial]);

  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [isSaving, startSave] = useTransition();
  const [isTesting, startTest] = useTransition();
  const [nexEnabled, setNexEnabled] = useState<boolean>(initialNexEnabled);
  const [isTogglingNex, startNexToggle] = useTransition();

  // Spread cartão.
  const [spreadInput, setSpreadInput] = useState<string>(
    initialSpread.toFixed(2),
  );
  const [isSavingSpread, setIsSavingSpread] = useState<boolean>(false);
  const lastSavedSpreadRef = useRef<number>(initialSpread);
  const spreadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const credentialOptions = useMemo<SelectOption[]>(
    () => buildCredentialOptions(credentialsForProvider),
    [credentialsForProvider],
  );

  const isConfigured = Boolean(initial);
  const usingCustom = modelSelect === CUSTOM_MODEL_VALUE;
  const resolvedModel = (usingCustom ? customModel : modelSelect).trim();
  const hasNoCredentials = credentialsForProvider.length === 0;
  const selectedCredential = credentialId
    ? credentialsForProvider.find((c) => c.id === credentialId) ?? null
    : null;

  function handleProviderChange(next: string) {
    const nextProvider = next as LlmProvider;
    setProvider(nextProvider);
    setModelSelect(PROVIDER_CATALOG[nextProvider].models[0].id);
    setCustomModel("");
    // Reseta a seleção do usuário — `credentialId` derivado vai cair no
    // fallback automaticamente (initial.credentialId se compatível, senão a
    // primeira do novo provider).
    setSelectedCredentialIdByUser(null);
    setTest({ status: "idle" });
  }

  function handleModelSelectChange(next: string) {
    setModelSelect(next);
    if (next !== CUSTOM_MODEL_VALUE) {
      setCustomModel("");
    }
    setTest({ status: "idle" });
  }

  function handleCredentialChange(next: string) {
    if (next === NEW_CREDENTIAL_VALUE) {
      // Na nova arquitetura, o gerenciamento de chaves vive em rota dedicada.
      router.push("/agente-nex/chaves");
      toast.info("Cadastre a nova chave em 'Chaves de API'.");
      return;
    }
    setSelectedCredentialIdByUser(next);
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
    if (!credentialId) {
      return "Cadastre uma chave de API antes de continuar";
    }
    return null;
  }

  async function persistConfig(): Promise<boolean> {
    if (!credentialId) return false;
    const result = await saveLlmConfig({
      provider,
      model: resolvedModel,
      credentialId,
    });
    if (!result.ok) {
      toast.error(result.error ?? "Erro ao salvar configuração");
      return false;
    }
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
    if (!credentialId) return;
    startTest(async () => {
      const result = await testLlmCredentialAction(
        credentialId,
        provider,
        resolvedModel,
      );
      if (!result.ok) {
        setTest({ status: "fail", message: result.error });
        toast.error(result.error ?? "Erro ao testar conexão");
        return;
      }
      const data = result.data!;

      if (data.reachable && data.creditOk !== false) {
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
    if (!credentialId) return;
    startSave(async () => {
      // Sempre testa antes de salvar manualmente.
      const testResult = await testLlmCredentialAction(
        credentialId,
        provider,
        resolvedModel,
      );
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

  function commitSpread(rawValue: string) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      toast.error("Spread inválido");
      setSpreadInput(lastSavedSpreadRef.current.toFixed(2));
      return;
    }
    if (parsed <= 0) {
      toast.error("Spread deve ser maior que zero");
      setSpreadInput(lastSavedSpreadRef.current.toFixed(2));
      return;
    }
    if (Math.abs(parsed - lastSavedSpreadRef.current) < 1e-9) {
      // Sem mudança real — apenas re-formata.
      setSpreadInput(parsed.toFixed(2));
      return;
    }
    setIsSavingSpread(true);
    void (async () => {
      try {
        const result = await setCardSpreadAction(parsed);
        if (!result.ok) {
          toast.error(result.error ?? "Erro ao salvar spread");
          setSpreadInput(lastSavedSpreadRef.current.toFixed(2));
          return;
        }
        lastSavedSpreadRef.current = parsed;
        setSpreadInput(parsed.toFixed(2));
        toast.success("Spread atualizado");
        router.refresh();
      } finally {
        setIsSavingSpread(false);
      }
    })();
  }

  function handleSpreadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.currentTarget.value;
    setSpreadInput(next);
    if (spreadDebounceRef.current) clearTimeout(spreadDebounceRef.current);
    spreadDebounceRef.current = setTimeout(() => {
      commitSpread(next);
    }, SPREAD_DEBOUNCE_MS);
  }

  function handleSpreadBlur() {
    if (spreadDebounceRef.current) {
      clearTimeout(spreadDebounceRef.current);
      spreadDebounceRef.current = null;
    }
    commitSpread(spreadInput);
  }

  useEffect(() => {
    return () => {
      if (spreadDebounceRef.current) clearTimeout(spreadDebounceRef.current);
    };
  }, []);

  const busy = isSaving || isTesting;
  const actionsDisabled = busy || hasNoCredentials || !credentialId;

  const selectedCredentialValue =
    credentialId ?? (hasNoCredentials ? NEW_CREDENTIAL_VALUE : "");

  return (
    <div className="space-y-8">
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

      {/* Section: Conexão LLM. Wrapper com divisor sutil pra separar do toggle. */}
      <div className="space-y-6 border-t border-border/50 pt-6">
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
            ? `Configurado: ${PROVIDER_CATALOG[initial!.provider].label} · ${initial!.model}${
                initial!.credentialLabel
                  ? ` · ${initial!.credentialLabel} ${initial!.apiKeyMasked.slice(-6)}`
                  : ` · ${initial!.apiKeyMasked}`
              }`
            : "Não configurado — selecione provedor, modelo e chave abaixo."}
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
            customMode={{
              sentinel: CUSTOM_MODEL_VALUE,
              customValue: customModel,
              onCustomChange: (next) => {
                setCustomModel(next);
                setTest({ status: "idle" });
              },
              placeholder: "ex: gpt-5.5-2026-04-15",
              inputAriaLabel: "ID do modelo customizado",
            }}
            placeholder="Selecionar modelo"
            disabled={busy}
            searchPlaceholder="Buscar modelo..."
            triggerClassName="min-h-[44px]"
          />
          <p className="text-xs text-muted-foreground">
            {usingCustom
              ? "Modelo customizado — útil pra snapshots datados ou novos não listados."
              : "Tier $ / $$ / $$$ / $$$$ indica custo aproximado por milhão de tokens."}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="llm-credential" className="gap-2">
          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
          Chave de API
        </Label>
        <CustomSelect
          value={selectedCredentialValue}
          onChange={handleCredentialChange}
          options={credentialOptions}
          placeholder={
            hasNoCredentials
              ? "Sem chaves cadastradas"
              : "Selecionar chave"
          }
          disabled={busy}
          triggerClassName="min-h-[44px]"
        />
        <p className="text-xs text-muted-foreground">
          {hasNoCredentials
            ? `Nenhuma chave cadastrada para ${catalog.label}. Use 'Chaves de API' para adicionar.`
            : "Selecione qual chave salva o agente deve usar. As chaves são gerenciadas em 'Chaves de API'."}
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

      </div>

      {/* Section: Spread cartão + ações. */}
      <div className="space-y-6 border-t border-border/50 pt-6">
      {/* Spread cartão. */}
      <div className="space-y-1.5">
        <Label htmlFor="llm-card-spread" className="gap-2">
          <Coins className="h-3.5 w-3.5 text-muted-foreground" />
          Spread cartão
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="llm-card-spread"
            type="number"
            step="0.01"
            value={spreadInput}
            onChange={handleSpreadChange}
            onBlur={handleSpreadBlur}
            disabled={isSavingSpread}
            className="min-h-[44px] w-32"
            aria-describedby="llm-card-spread-help"
            aria-label="Spread cartão (multiplicador USD/BRL)"
          />
          {isSavingSpread ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <p
          id="llm-card-spread-help"
          className="text-xs text-muted-foreground"
        >
          Multiplicador aplicado sobre a cotação comercial USD/BRL (default
          1.10 ≈ IOF + spread Visa/Master). Sem limite superior — escolha o
          valor real do seu cartão.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={handleTest}
          disabled={actionsDisabled}
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
          disabled={actionsDisabled}
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

      {/* Hint para o leitor de tela / debug visual quando sem credenciais. */}
      {hasNoCredentials ? (
        <p
          className="text-xs text-amber-600 dark:text-amber-400"
          role="note"
        >
          Sem chaves cadastradas para {catalog.label} — botões desativados.
        </p>
      ) : selectedCredential ? (
        <p className="sr-only" aria-live="polite">
          Chave selecionada: {selectedCredential.label}
        </p>
      ) : null}
      </div>
    </div>
  );
}
