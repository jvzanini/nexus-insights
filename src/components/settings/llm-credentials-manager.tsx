"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  RefreshCw,
  Trash2,
  Sparkles,
  Loader2,
  Plug,
  KeyRound,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getProviderIcon } from "@/components/icons/providers";
import { PROVIDER_CATALOG } from "@/lib/llm/catalog";
import type { CredentialSummary } from "@/lib/llm/credentials";
import {
  createLlmCredentialAction,
  deleteLlmCredentialAction,
  testLlmCredentialAction,
  updateLlmCredentialAction,
} from "@/lib/actions/llm-credentials";
import type { LlmProvider } from "@/lib/llm/types";
import { cn } from "@/lib/utils";

const PROVIDERS: LlmProvider[] = [
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
];

interface Props {
  initial: CredentialSummary[];
  activeCredentialId: string | null;
}

type DialogState =
  | { mode: "closed" }
  | { mode: "create"; provider: LlmProvider }
  | { mode: "rename"; cred: CredentialSummary }
  | { mode: "rotate"; cred: CredentialSummary };

/**
 * Gerencia a lista de credenciais por provider + dialogs de criar/renomear/trocar.
 *
 * Refactor T6a (v0.16.0):
 *  - Header de cada provedor padronizado: ícone violet + label, botão "Nova chave" gradient violet, link "Criar API key".
 *  - AlertDialog substitui window.confirm na exclusão (UX consistente).
 *  - Card vazio com 2 CTAs (link externo + botão Nova chave).
 */
export function LlmCredentialsManager({ initial, activeCredentialId }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<CredentialSummary[]>(initial);
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Sincroniza estado local quando o pai re-renderiza com lista nova
  // (router.refresh() depois de uma mutação).
  useEffect(() => {
    setItems(initial);
  }, [initial]);

  const grouped = useMemo(() => {
    const map: Record<LlmProvider, CredentialSummary[]> = {
      openai: [],
      anthropic: [],
      gemini: [],
      openrouter: [],
    };
    for (const c of items) {
      if (PROVIDERS.includes(c.provider)) {
        map[c.provider].push(c);
      }
    }
    // Ordena por label dentro de cada provider para estabilidade.
    for (const p of PROVIDERS) {
      map[p].sort((a, b) => a.label.localeCompare(b.label));
    }
    return map;
  }, [items]);

  const [dialogState, setDialogState] = useState<DialogState>({
    mode: "closed",
  });

  function close() {
    setDialogState({ mode: "closed" });
  }

  function refreshFromServer() {
    router.refresh();
  }

  function confirmDelete(c: CredentialSummary) {
    startTransition(async () => {
      const r = await deleteLlmCredentialAction(c.id);
      if (!r.ok) {
        toast.error(r.error ?? "Erro ao deletar");
        setDeletingId(null);
        return;
      }
      toast.success("Chave deletada");
      setItems((arr) => arr.filter((x) => x.id !== c.id));
      setDeletingId(null);
      refreshFromServer();
    });
  }

  return (
    <div className="space-y-4">
      {PROVIDERS.map((p) => {
        const list = grouped[p] ?? [];
        const catalog = PROVIDER_CATALOG[p];
        const ProviderIcon = getProviderIcon(p);
        return (
          <section
            key={p}
            data-testid={`credentials-section-${p}`}
            className="rounded-xl border border-border bg-background/40 p-4"
          >
            <header className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden
                  data-testid={`provider-icon-${p}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/10 text-violet-500 dark:text-violet-400"
                >
                  {ProviderIcon ? (
                    <ProviderIcon className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-semibold">
                      {catalog.label.charAt(0)}
                    </span>
                  )}
                </span>
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {catalog.label}
                </h3>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={catalog.apiKeyUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer"
                  aria-label={`Criar API key no painel do ${catalog.label}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Criar API key
                </a>
                {list.length > 0 ? (
                  <Button
                    size="sm"
                    variant="default"
                    className="cursor-pointer"
                    onClick={() =>
                      setDialogState({ mode: "create", provider: p })
                    }
                    disabled={pending}
                    aria-label={`Nova chave para ${catalog.label}`}
                  >
                    <Plus className="mr-1 h-4 w-4" /> Nova chave
                  </Button>
                ) : null}
              </div>
            </header>

            {list.length === 0 ? (
              <div
                data-testid={`credentials-empty-${p}`}
                className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center"
              >
                <KeyRound
                  aria-hidden
                  className="mx-auto h-7 w-7 text-muted-foreground"
                />
                <p className="mt-2 text-sm font-medium text-foreground">
                  Nenhuma chave cadastrada para {catalog.label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Crie uma chave no painel do {catalog.label} e cadastre-a aqui
                  para usar nos modelos.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <a
                    href={catalog.apiKeyUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    data-testid={`credentials-empty-external-${p}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Criar API key no painel do {catalog.label}
                  </a>
                  <Button
                    size="sm"
                    variant="default"
                    data-testid={`credentials-empty-new-${p}`}
                    className="cursor-pointer"
                    onClick={() =>
                      setDialogState({ mode: "create", provider: p })
                    }
                    disabled={pending}
                  >
                    <Plus className="mr-1 h-4 w-4" /> Nova chave
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {list.map((c) => {
                  const isActive = c.id === activeCredentialId;
                  return (
                    <li
                      key={c.id}
                      data-testid={`credential-row-${c.id}`}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          data-testid={
                            isActive
                              ? `credential-active-dot-${c.id}`
                              : `credential-inactive-dot-${c.id}`
                          }
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            isActive
                              ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                              : "bg-zinc-400 dark:bg-zinc-600",
                          )}
                          aria-hidden
                          title={
                            isActive ? "Chave em uso pelo Agente Nex" : ""
                          }
                        />
                        <span className="truncate text-sm font-medium">
                          {c.label}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          ••••••{c.last4}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="cursor-pointer"
                          disabled={pending}
                          onClick={() =>
                            setDialogState({ mode: "rename", cred: c })
                          }
                          aria-label={`Renomear ${c.label}`}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Renomear
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="cursor-pointer"
                          disabled={pending}
                          onClick={() =>
                            setDialogState({ mode: "rotate", cred: c })
                          }
                          aria-label={`Trocar chave ${c.label}`}
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Trocar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="cursor-pointer text-destructive hover:text-destructive"
                          disabled={pending}
                          aria-label={`Excluir ${c.label}`}
                          onClick={() => setDeletingId(c.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>

                        <AlertDialog
                          open={deletingId === c.id}
                          onOpenChange={(open) => {
                            if (!open && !pending) setDeletingId(null);
                          }}
                        >
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Excluir chave &quot;{c.label}&quot;?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Essa ação remove permanentemente a credencial e
                                não pode ser desfeita. Configurações que usavam
                                essa chave precisarão ser refeitas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={pending}>
                                Cancelar
                              </AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                disabled={pending}
                                onClick={(e) => {
                                  e.preventDefault();
                                  confirmDelete(c);
                                }}
                              >
                                {pending ? (
                                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                ) : null}
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <CredentialDialog
        state={dialogState}
        onClose={close}
        onSaved={(updated) => {
          setItems((arr) => {
            const without = arr.filter((c) => c.id !== updated.id);
            return [...without, updated].sort((a, b) =>
              a.provider === b.provider
                ? a.label.localeCompare(b.label)
                : a.provider.localeCompare(b.provider),
            );
          });
          refreshFromServer();
        }}
      />
    </div>
  );
}

interface CredentialDialogProps {
  state: DialogState;
  onClose: () => void;
  onSaved: (cred: CredentialSummary) => void;
}

function CredentialDialog({ state, onClose, onSaved }: CredentialDialogProps) {
  const open = state.mode !== "closed";
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");

  // Reset/preencher inputs sempre que o dialog abre num modo diferente.
  // useEffect (não useMemo) — isto é side-effect, não derived value.
  const dialogKey =
    state.mode === "closed"
      ? "closed"
      : state.mode === "create"
        ? `create:${state.provider}`
        : `${state.mode}:${state.cred.id}`;

  useEffect(() => {
    if (state.mode === "closed") return;
    if (state.mode === "rename") {
      setLabel(state.cred.label);
    } else {
      setLabel("");
    }
    setApiKey("");
    // dependência por chave estável evita reset entre keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogKey]);

  if (!open) return null;

  const provider =
    state.mode === "create"
      ? state.provider
      : (state.cred.provider as LlmProvider);

  function submit() {
    // Captura o `state` atual numa variável local pra preservar o narrowing
    // dentro do closure async (TS perde o narrow na fronteira do await).
    const current = state;
    if (current.mode === "closed") return;
    startTransition(async () => {
      if (current.mode === "create") {
        const r = await createLlmCredentialAction({
          provider: current.provider,
          label: label.trim() || undefined,
          apiKey: apiKey.trim(),
        });
        if (!r.ok || !r.data) {
          toast.error(r.error ?? "Erro ao criar");
          return;
        }
        const created: CredentialSummary = {
          id: r.data.id,
          provider: current.provider,
          label: r.data.label,
          last4: r.data.last4,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        onSaved(created);
        toast.success("Chave criada");
        onClose();
        return;
      }
      if (current.mode === "rename") {
        const trimmed = label.trim();
        if (!trimmed) {
          toast.error("Informe um nome para a chave");
          return;
        }
        const r = await updateLlmCredentialAction(current.cred.id, {
          label: trimmed,
        });
        if (!r.ok || !r.data) {
          toast.error(r.error ?? "Erro ao renomear");
          return;
        }
        onSaved({
          ...current.cred,
          label: r.data.label,
          last4: r.data.last4,
          updatedAt: new Date().toISOString(),
        });
        toast.success("Chave renomeada");
        onClose();
        return;
      }
      // rotate
      const trimmedKey = apiKey.trim();
      if (!trimmedKey) {
        toast.error("Cole a nova chave de API");
        return;
      }
      const r = await updateLlmCredentialAction(current.cred.id, {
        apiKey: trimmedKey,
      });
      if (!r.ok || !r.data) {
        toast.error(r.error ?? "Erro ao trocar chave");
        return;
      }
      onSaved({
        ...current.cred,
        label: r.data.label,
        last4: r.data.last4,
        updatedAt: new Date().toISOString(),
      });
      toast.success("Chave atualizada");
      onClose();
    });
  }

  function test() {
    const current = state;
    if (current.mode !== "rotate") return;
    startTransition(async () => {
      const r = await testLlmCredentialAction(
        current.cred.id,
        current.cred.provider as LlmProvider,
        PROVIDER_CATALOG[current.cred.provider as LlmProvider].models[0].id,
      );
      if (!r.ok || !r.data) {
        toast.error(r.error ?? "Falha ao testar conexão");
        return;
      }
      toast.success(r.data.reachable ? "Conexão OK" : "Falha ao conectar");
    });
  }

  const title =
    state.mode === "create"
      ? "Nova chave"
      : state.mode === "rename"
        ? "Renomear chave"
        : "Trocar chave";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogTitle>
          {title} — {PROVIDER_CATALOG[provider].label}
        </DialogTitle>
        <div className="space-y-3 py-2">
          {state.mode !== "rotate" ? (
            <div className="space-y-1.5">
              <Label htmlFor="cred-label">Label</Label>
              <Input
                id="cred-label"
                value={label}
                onChange={(e) => setLabel(e.currentTarget.value)}
                placeholder={
                  state.mode === "create"
                    ? "ex: Conta principal (opcional)"
                    : "ex: Conta principal"
                }
                maxLength={60}
                disabled={pending}
                autoComplete="off"
              />
              {state.mode === "create" ? (
                <p className="text-xs text-muted-foreground">
                  Se vazio, geramos automaticamente.
                </p>
              ) : null}
            </div>
          ) : null}
          {state.mode !== "rename" ? (
            <div className="space-y-1.5">
              <Label htmlFor="cred-api-key">API key</Label>
              <PasswordInput
                id="cred-api-key"
                value={apiKey}
                onChange={setApiKey}
                placeholder="Cole a chave"
                ariaLabel="API key"
                disabled={pending}
              />
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          {state.mode === "rotate" ? (
            <Button
              variant="ghost"
              onClick={test}
              disabled={pending || !apiKey.trim()}
              className="cursor-pointer"
              aria-label="Testar conexão"
            >
              {pending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Plug className="mr-1 h-4 w-4" />
              )}
              Testar
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={onClose}
            disabled={pending}
            className="cursor-pointer"
          >
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={pending}
            className="cursor-pointer"
          >
            {pending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-4 w-4" />
            )}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
