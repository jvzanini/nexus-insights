"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Clipboard,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  createNexusChatConnection,
  regenerateConnectionWebhookSecret,
  updateNexusChatConnection,
} from "@/lib/actions/nexus-chat/connections";
import type { ConnectionListItem } from "./connection-list";

type Mode = "create" | "edit";
type SslMode = "disable" | "prefer" | "require" | "verify-full";

interface Props {
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: ConnectionListItem | null;
}

const SSL_OPTIONS: { value: SslMode; label: string }[] = [
  { value: "disable", label: "disable" },
  { value: "prefer", label: "prefer (padrão)" },
  { value: "require", label: "require" },
  { value: "verify-full", label: "verify-full" },
];

const CHATWOOT_WEBHOOK_EVENTS = [
  "conversation_created",
  "conversation_updated",
  "conversation_resolved",
  "message_created",
  "conversation_status_changed",
];

interface FormState {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: SslMode;
  applicationName: string;
}

const DEFAULT_FORM: FormState = {
  name: "",
  host: "",
  port: 5432,
  database: "",
  username: "",
  password: "",
  sslMode: "prefer",
  applicationName: "nexus-insights",
};

/**
 * Dialog para criar/editar uma `nexus_chat_connection`.
 *
 * - Em `mode="edit"`, password vazio = manter senha atual (server action
 *   já trata).
 * - Submit usa `useTransition` para spinner sem bloquear UI; toast Sonner
 *   verde/vermelho via `toast.success/.error`; `router.refresh()` em sucesso.
 * - Em `mode="edit"` (com `webhookToken` populado) renderiza bloco Webhook
 *   abaixo do form: URL copiável, botão Regenerar secret (com confirmação),
 *   eventos Chatwoot a marcar e link para o runbook.
 * - Após criar ou regenerar, o secret em plain é mostrado UMA vez em Alert
 *   verde. Não há como recuperá-lo depois.
 */
export function ConnectionFormDialog({
  mode,
  open,
  onOpenChange,
  connection,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [regenPending, startRegenTransition] = useTransition();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  // Sincroniza form quando abrir em modo edit ou trocar a connection alvo.
  useEffect(() => {
    if (!open) {
      // Limpa secret revelado ao fechar — segurança: nunca persiste em
      // estado entre aberturas do Dialog.
      setRevealedSecret(null);
      return;
    }
    if (mode === "edit" && connection) {
      setForm({
        name: connection.name,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        username: connection.username,
        password: "",
        sslMode: connection.sslMode as SslMode,
        applicationName: connection.applicationName,
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [open, mode, connection]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const input = {
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number(form.port) || 5432,
        database: form.database.trim(),
        username: form.username.trim(),
        password: form.password,
        sslMode: form.sslMode,
        applicationName: form.applicationName.trim() || "nexus-insights",
      };
      const result =
        mode === "create"
          ? await createNexusChatConnection(input)
          : await updateNexusChatConnection(connection!.id, input);

      if (!result.success) {
        toast.error(result.error ?? "Falha ao salvar conexão.");
        return;
      }

      // Em create, server action devolve secretPlain UMA vez. Mostra Alert e
      // mantém Dialog aberto para o super_admin copiar antes de fechar.
      if (
        mode === "create" &&
        result.data &&
        "webhookSecretPlain" in result.data
      ) {
        setRevealedSecret(
          (result.data as { webhookSecretPlain: string }).webhookSecretPlain,
        );
        toast.success(
          "Conexão criada. Copie o secret antes de fechar — ele não será mostrado novamente.",
        );
        router.refresh();
        return;
      }

      toast.success(
        mode === "create"
          ? "Conexão criada com sucesso."
          : "Conexão atualizada.",
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  function handleRegenerate() {
    if (!connection) return;
    startRegenTransition(async () => {
      const result = await regenerateConnectionWebhookSecret(connection.id);
      setConfirmRegenerate(false);
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Falha ao regenerar secret.");
        return;
      }
      setRevealedSecret(result.data.webhookSecretPlain);
      toast.success(
        "Novo secret gerado. Copie agora — ele não será mostrado novamente.",
      );
      router.refresh();
    });
  }

  // URL completa do webhook. Computada client-side para refletir o origin
  // da instância onde o super_admin está logado (dev/staging/prod sem
  // hardcode). Renderizada apenas em modo edit + com token.
  const webhookUrl = useMemo(() => {
    if (mode !== "edit" || !connection?.webhookToken) return null;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}/api/webhooks/nexus-chat/${connection.webhookToken}`;
  }, [mode, connection?.webhookToken]);

  const showWebhookBlock =
    mode === "edit" && Boolean(connection?.webhookToken);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Nova conexão" : "Editar conexão"}
            </DialogTitle>
            <DialogDescription>
              Banco Postgres do Nexus Chat. As credenciais são cifradas em
              repouso (AES-256-GCM).
            </DialogDescription>
          </DialogHeader>

          {revealedSecret ? (
            <SecretRevealedAlert secret={revealedSecret} />
          ) : null}

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="conn-name">Nome</Label>
              <Input
                id="conn-name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="ex.: Padrão (legado)"
                autoComplete="off"
                required
                disabled={pending}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
              <div className="grid gap-1.5">
                <Label htmlFor="conn-host">Host</Label>
                <Input
                  id="conn-host"
                  value={form.host}
                  onChange={(e) => update("host", e.target.value)}
                  placeholder="db.example.com"
                  autoComplete="off"
                  required
                  disabled={pending}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="conn-port">Porta</Label>
                <Input
                  id="conn-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={form.port}
                  onChange={(e) => update("port", Number(e.target.value))}
                  required
                  disabled={pending}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="conn-db">Banco</Label>
                <Input
                  id="conn-db"
                  value={form.database}
                  onChange={(e) => update("database", e.target.value)}
                  placeholder="chatwoot_production"
                  autoComplete="off"
                  required
                  disabled={pending}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="conn-user">Usuário</Label>
                <Input
                  id="conn-user"
                  value={form.username}
                  onChange={(e) => update("username", e.target.value)}
                  placeholder="ro_user"
                  autoComplete="off"
                  required
                  disabled={pending}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="conn-password">Senha</Label>
              <PasswordInput
                id="conn-password"
                value={form.password}
                onChange={(value) => update("password", value)}
                placeholder={
                  mode === "edit"
                    ? "Deixe em branco para manter a senha atual"
                    : "Senha do banco"
                }
                ariaLabel="Senha do banco"
                autoComplete="new-password"
                disabled={pending}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="conn-ssl">SSL Mode</Label>
              <Select
                value={form.sslMode}
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    update("sslMode", value as SslMode);
                  }
                }}
              >
                <SelectTrigger
                  id="conn-ssl"
                  className="w-full cursor-pointer"
                  disabled={pending}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SSL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {showWebhookBlock && webhookUrl && connection ? (
            <WebhookSection
              webhookUrl={webhookUrl}
              regenerating={regenPending}
              onRegenerate={() => setConfirmRegenerate(true)}
            />
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="cursor-pointer"
            >
              {revealedSecret ? "Fechar" : "Cancelar"}
            </Button>
            <Button type="submit" disabled={pending} className="cursor-pointer">
              {pending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <AlertDialog
        open={confirmRegenerate}
        onOpenChange={(o) => {
          if (!o) setConfirmRegenerate(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle
                className="h-4 w-4 text-amber-500"
                aria-hidden
              />
              Regenerar secret?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Isso invalidará o secret atual. Você precisará cadastrar o novo
              secret no painel do Nexus Chat antes que os webhooks voltem a ser
              aceitos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="webhook-regen-confirm"
              variant="destructive"
              onClick={handleRegenerate}
              disabled={regenPending}
              className="cursor-pointer"
            >
              {regenPending ? (
                <Loader2
                  className="mr-1.5 h-4 w-4 animate-spin"
                  aria-hidden
                />
              ) : null}
              Regenerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

/**
 * Alert verde que mostra o secret recém-gerado UMA vez. O super_admin
 * precisa copiar antes de fechar — não há recuperação posterior. Cor
 * emerald reforça sucesso (e não alarme), ícone ShieldCheck reforça que é
 * material sensível.
 */
function SecretRevealedAlert({ secret }: { secret: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="webhook-secret-alert"
      className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/40"
    >
      <div className="flex items-start gap-2">
        <ShieldCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden
        />
        <div className="grid gap-0.5">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Secret gerado. Salve agora — você não verá esta chave novamente.
          </p>
          <p className="text-xs text-emerald-800/90 dark:text-emerald-200/80">
            Cole no painel do Nexus Chat ao cadastrar o webhook.
          </p>
        </div>
      </div>
      <CopyableCode
        value={secret}
        label="Secret HMAC"
        toneEmerald
      />
    </div>
  );
}

/**
 * Bloco fixo no Dialog em modo Edit: URL do webhook + Regenerar + eventos.
 */
function WebhookSection({
  webhookUrl,
  regenerating,
  onRegenerate,
}: {
  webhookUrl: string;
  regenerating: boolean;
  onRegenerate: () => void;
}) {
  return (
    <section
      data-testid="webhook-section"
      className="grid gap-3 border-t border-border pt-4"
    >
      <header className="flex items-center gap-2">
        <Webhook
          className="h-4 w-4 text-violet-500 dark:text-violet-400"
          aria-hidden
        />
        <h3 className="font-heading text-sm font-medium text-foreground">
          Webhook do Nexus Chat
        </h3>
      </header>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">URL</Label>
        <CopyableCode value={webhookUrl} label="URL do webhook" />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">
          Eventos a marcar no painel do Nexus Chat
        </Label>
        <ul
          data-testid="webhook-events-list"
          className="grid gap-1 rounded-md border border-border bg-muted/30 p-3 font-mono text-xs text-muted-foreground"
        >
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

      <div className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
        <p className="text-xs text-muted-foreground">
          O secret nunca é mostrado depois de criado. Se perder, regenere
          aqui e cole o novo no painel do Nexus Chat.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          disabled={regenerating}
          data-testid="webhook-regen-btn"
          className="cursor-pointer self-start text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/15 dark:hover:text-rose-300 sm:self-auto"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Regenerar secret
        </Button>
      </div>
    </section>
  );
}

/**
 * Caixa monoespaçada com botão Copy. Em mobile a string longa fica com
 * scroll horizontal interno (não estoura layout); botão fixo à direita.
 */
function CopyableCode({
  value,
  label,
  toneEmerald = false,
}: {
  value: string;
  label: string;
  toneEmerald?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copiado");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  }

  return (
    <div
      className={cn(
        "flex items-stretch gap-2 rounded-md border bg-background/60",
        toneEmerald
          ? "border-emerald-200 dark:border-emerald-900/60"
          : "border-border",
      )}
    >
      <code
        aria-label={label}
        className={cn(
          "min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap px-3 py-2 font-mono text-xs leading-relaxed text-foreground",
          toneEmerald && "text-emerald-900 dark:text-emerald-100",
        )}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copiar ${label}`}
        title="Copiar para área de transferência"
        className={cn(
          "inline-flex w-9 shrink-0 cursor-pointer items-center justify-center border-l text-muted-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          toneEmerald
            ? "border-emerald-200 hover:bg-emerald-100 hover:text-emerald-700 dark:border-emerald-900/60 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-200"
            : "border-border hover:bg-muted hover:text-foreground",
        )}
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

