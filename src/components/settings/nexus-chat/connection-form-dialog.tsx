"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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

interface FormState {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: SslMode;
  applicationName: string;
  pollingIntervalSeconds: number;
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
  pollingIntervalSeconds: 30,
};

/**
 * Dialog para criar/editar uma `nexus_chat_connection`.
 *
 * - Em `mode="edit"`, password vazio = manter senha atual.
 * - Submit usa `useTransition` para spinner sem bloquear UI.
 * - v0.41 (polling delta): substitui o bloco Webhook por um campo
 *   "Intervalo de sincronização (segundos)". Valor mínimo 20s, default 30s.
 *   O polling delta consulta o banco do Nexus Chat e detecta mudanças
 *   incrementalmente — não precisa mais de webhook configurado externamente.
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
        pollingIntervalSeconds: connection.pollingIntervalSeconds ?? 30,
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
        pollingIntervalSeconds: Number(form.pollingIntervalSeconds) || 30,
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
        mode === "create" ? "Conexão criada." : "Conexão atualizada.",
      );
      onOpenChange(false);
      router.refresh();
    });
  }

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

            <div className="grid gap-1.5">
              <Label htmlFor="conn-polling">
                Intervalo de sincronização (segundos)
              </Label>
              <Input
                id="conn-polling"
                type="number"
                inputMode="numeric"
                min={20}
                step={1}
                value={form.pollingIntervalSeconds}
                onChange={(e) =>
                  update(
                    "pollingIntervalSeconds",
                    Number(e.target.value) || 30,
                  )
                }
                disabled={pending}
              />
              <p className="text-[11px] text-muted-foreground">
                Frequência com que o Nexus Insights consulta o banco do Nexus
                Chat para detectar mudanças. Mínimo 20 segundos. Padrão 30.
              </p>
            </div>
          </div>

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
