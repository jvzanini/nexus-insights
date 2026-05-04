"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clipboard, Info, Loader2, Webhook } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * - Em `mode="edit"`, password vazio = manter senha atual.
 * - Submit usa `useTransition` para spinner sem bloquear UI.
 * - Em `mode="edit"` (com `webhookToken` populado), renderiza bloco Webhook
 *   com URL copiável + lista de eventos a marcar no painel do Nexus Chat.
 *   Account Webhooks no Chatwoot self-hosted **não suportam HMAC** — não
 *   há campo de secret para colar lá. Token único na URL é a única
 *   autenticação (32 bytes random).
 */
export function ConnectionFormDialog({
  mode,
  open,
  onOpenChange,
  connection,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  // Sincroniza form quando abrir em modo edit ou trocar a connection alvo.
  useEffect(() => {
    if (!open) return;
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

      toast.success(
        mode === "create"
          ? "Conexão criada. Edite agora para ver a URL do webhook."
          : "Conexão atualizada.",
      );
      onOpenChange(false);
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

            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
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
                  value={form.port}
                  onChange={(e) =>
                    update("port", Number(e.target.value) || 5432)
                  }
                  min={1}
                  max={65535}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="conn-database">Banco</Label>
                <Input
                  id="conn-database"
                  value={form.database}
                  onChange={(e) => update("database", e.target.value)}
                  placeholder="chatwoot"
                  autoComplete="off"
                  required
                  disabled={pending}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="conn-username">Usuário</Label>
                <Input
                  id="conn-username"
                  value={form.username}
                  onChange={(e) => update("username", e.target.value)}
                  placeholder="chatwoot_leitura"
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

          {showWebhookBlock && webhookUrl ? (
            <WebhookSection webhookUrl={webhookUrl} />
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="cursor-pointer"
            >
              Cancelar
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
    </Dialog>
  );
}

/**
 * Bloco Webhook em modo Edit: URL copiável + texto explicando que Account
 * Webhooks não têm campo Secret + lista de eventos canônicos a marcar.
 */
function WebhookSection({ webhookUrl }: { webhookUrl: string }) {
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
        <Label className="text-xs text-muted-foreground">URL do webhook</Label>
        <CopyableCode value={webhookUrl} label="URL do webhook" />
        <p className="text-xs text-muted-foreground">
          Cole esta URL no painel admin do Nexus Chat ao cadastrar o webhook
          (Configurações → Integrações → Webhooks).
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3">
        <Info
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          O painel do Nexus Chat não tem campo de secret —{" "}
          <strong>
            a autenticação acontece pelo token único embutido na URL
          </strong>{" "}
          (32 bytes random, não-enumerável). Tráfego trafega via HTTPS.
        </p>
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
    </section>
  );
}

/**
 * Caixa monoespaçada com botão Copy. String longa fica com scroll
 * horizontal interno (não estoura layout em mobile); botão fixo à direita.
 */
function CopyableCode({ value, label }: { value: string; label: string }) {
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
    <div className="flex items-stretch gap-2 rounded-md border border-border bg-background/60">
      <code
        aria-label={label}
        className={cn(
          "min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap px-3 py-2 font-mono text-xs leading-relaxed text-foreground",
        )}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copiar ${label}`}
        title="Copiar para área de transferência"
        className="inline-flex w-9 shrink-0 cursor-pointer items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
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
