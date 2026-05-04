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
          ? "Conexão criada com sucesso."
          : "Conexão atualizada.",
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
