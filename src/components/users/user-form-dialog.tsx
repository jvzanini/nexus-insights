"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, RefreshCw, Copy, Check } from "lucide-react";
import { nanoid } from "nanoid";
import { PLATFORM_ROLE_OPTIONS } from "@/lib/constants/roles";
import { createUser } from "@/lib/actions/users";
import type { PlatformRole } from "@/generated/prisma/client";

interface AccountOption { id: number; name: string }
interface TeamOption { id: number; name: string }

export function UserFormDialog({
  open,
  onOpenChange,
  onCreated,
  allowedRoles,
  accountOptions,
  teamOptions,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
  allowedRoles: PlatformRole[];
  accountOptions: AccountOption[];
  teamOptions: TeamOption[];
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => nanoid(16));
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [role, setRole] = useState<PlatformRole>(allowedRoles[allowedRoles.length - 1] ?? "viewer");
  const [accountIds, setAccountIds] = useState<number[]>([]);
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [sendEmail, setSendEmail] = useState(true);
  const [pending, start] = useTransition();

  function reset() {
    setName("");
    setEmail("");
    setPassword(nanoid(16));
    setRole(allowedRoles[allowedRoles.length - 1] ?? "viewer");
    setAccountIds([]);
    setTeamIds([]);
    setSendEmail(true);
  }

  function close(v: boolean) {
    onOpenChange(v);
    if (!v) reset();
  }

  function copyPassword() {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function submit() {
    if (!name.trim() || !email.trim() || !password) {
      toast.error("Preencha nome, email e senha");
      return;
    }
    const showsAccounts = role !== "super_admin";
    const showsTeams = role === "manager" || role === "viewer";
    if (showsAccounts && accountIds.length === 0) {
      toast.error("Selecione pelo menos uma conta");
      return;
    }
    if (showsTeams && teamIds.length === 0) {
      toast.error("Selecione pelo menos um departamento");
      return;
    }

    start(async () => {
      const result = await createUser({
        name,
        email,
        password,
        platformRole: role,
        accountIds: showsAccounts ? accountIds : [],
        teamIds: showsTeams ? teamIds : [],
        sendWelcomeEmail: sendEmail,
      });
      if (result.success) {
        toast.success("Usuário criado");
        if (onCreated) onCreated();
        close(false);
      } else {
        toast.error(result.error ?? "Erro");
      }
    });
  }

  const showsAccounts = role !== "super_admin";
  const showsTeams = role === "manager" || role === "viewer";
  const selectableRoles = PLATFORM_ROLE_OPTIONS.filter((r) => allowedRoles.includes(r.value));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            Crie um novo usuário e defina seu nível e escopo de acesso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="user-name">Nome</Label>
            <Input
              id="user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-email">E-mail</Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-password">Senha temporária</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="user-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPassword(nanoid(16))}
                title="Gerar nova senha"
                className="cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyPassword}
                title="Copiar"
                className="cursor-pointer"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              O usuário receberá esta senha por e-mail e será solicitado a trocá-la no primeiro login.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Nível de acesso</Label>
            <div className="grid grid-cols-2 gap-2">
              {selectableRoles.map((r) => {
                const Icon = r.icon;
                const active = role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all duration-150 cursor-pointer ${
                      active
                        ? "border-violet-500/60 bg-violet-500/10"
                        : "border-border bg-muted/20 hover:border-foreground/20"
                    }`}
                  >
                    <Icon className={`h-4 w-4 mt-0.5 ${active ? "text-violet-500" : "text-muted-foreground"}`} />
                    <div>
                      <div className="text-xs font-medium">{r.label}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">
                        {r.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {showsAccounts && (
            <div className="space-y-2">
              <Label>Contas que poderá ver</Label>
              <div className="rounded-lg border border-border bg-muted/20 p-2 space-y-1 max-h-40 overflow-y-auto">
                {accountOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    Nenhuma conta disponível
                  </p>
                ) : (
                  accountOptions.map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={accountIds.includes(a.id)}
                        onCheckedChange={(v) => {
                          setAccountIds((prev) =>
                            v ? [...prev, a.id] : prev.filter((x) => x !== a.id),
                          );
                        }}
                      />
                      <span className="text-sm">{a.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {showsTeams && (
            <div className="space-y-2">
              <Label>Departamentos que poderá ver</Label>
              <div className="rounded-lg border border-border bg-muted/20 p-2 space-y-1 max-h-40 overflow-y-auto">
                {teamOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    Nenhum departamento disponível
                  </p>
                ) : (
                  teamOptions.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={teamIds.includes(t.id)}
                        onCheckedChange={(v) => {
                          setTeamIds((prev) =>
                            v ? [...prev, t.id] : prev.filter((x) => x !== t.id),
                          );
                        }}
                      />
                      <span className="text-sm">{t.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="send-email"
              checked={sendEmail}
              onCheckedChange={(v) => setSendEmail(!!v)}
            />
            <Label htmlFor="send-email" className="text-xs font-normal cursor-pointer">
              Enviar e-mail de boas-vindas com a senha temporária
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={pending} className="cursor-pointer">
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending} className="cursor-pointer">
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar usuário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
