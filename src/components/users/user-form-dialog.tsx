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
import {
  Loader2,
  Copy,
  Check,
  IdCard,
  KeyRound,
  CheckCircle2,
} from "lucide-react";
import { PLATFORM_ROLE_OPTIONS } from "@/lib/constants/roles";
import { createUser } from "@/lib/actions/users";
import type { PlatformRole } from "@/generated/prisma/client";

interface AccountOption {
  id: number;
  name: string;
}
interface TeamOption {
  id: number;
  name: string;
}

type Step = 1 | 2 | 3;

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
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PlatformRole>(
    allowedRoles[allowedRoles.length - 1] ?? "viewer",
  );
  const [accountIds, setAccountIds] = useState<number[]>([]);
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [sendEmail, setSendEmail] = useState(true);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const showsAccounts = role !== "super_admin";
  const showsTeams = role === "manager" || role === "viewer";

  function reset() {
    setStep(1);
    setName("");
    setEmail("");
    setRole(allowedRoles[allowedRoles.length - 1] ?? "viewer");
    setAccountIds([]);
    setTeamIds([]);
    setSendEmail(true);
    setCreatedPassword(null);
    setCopied(false);
  }

  function close(v: boolean) {
    onOpenChange(v);
    if (!v) reset();
  }

  function copyPassword() {
    if (!createdPassword) return;
    navigator.clipboard.writeText(createdPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function validateStep1() {
    if (!name.trim()) {
      toast.error("Informe o nome");
      return false;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("E-mail inválido");
      return false;
    }
    return true;
  }

  function validateStep2() {
    if (showsAccounts && accountIds.length === 0) {
      toast.error("Selecione pelo menos uma conta");
      return false;
    }
    if (showsTeams && teamIds.length === 0) {
      toast.error("Selecione pelo menos um departamento");
      return false;
    }
    return true;
  }

  function nextStep() {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => (s === 1 ? 2 : 3) as Step);
  }

  function prevStep() {
    setStep((s) => (s === 3 ? 2 : 1) as Step);
  }

  function submit() {
    start(async () => {
      const result = await createUser({
        name,
        email,
        platformRole: role,
        accountIds: showsAccounts ? accountIds : [],
        teamIds: showsTeams ? teamIds : [],
        sendWelcomeEmail: sendEmail,
        // password omitido: server gera via generateTempPassword()
      });
      if (result.success && result.data) {
        setCreatedPassword(result.data.tempPassword ?? null);
        toast.success("Usuário criado");
        if (onCreated) onCreated();
      } else {
        toast.error(result.error ?? "Erro ao criar usuário");
      }
    });
  }

  const selectableRoles = PLATFORM_ROLE_OPTIONS.filter((r) =>
    allowedRoles.includes(r.value),
  );

  function accountName(id: number) {
    return accountOptions.find((a) => a.id === id)?.name ?? `Conta ${id}`;
  }
  function teamName(id: number) {
    return teamOptions.find((t) => t.id === id)?.name ?? `Time ${id}`;
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {createdPassword ? "Usuário criado" : "Novo usuário"}
          </DialogTitle>
          <DialogDescription>
            {createdPassword
              ? "Compartilhe a senha temporária com o usuário."
              : "Crie um novo usuário em 3 passos."}
          </DialogDescription>
        </DialogHeader>

        {!createdPassword && (
          <Stepper step={step} />
        )}

        {createdPassword ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-500 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {name} foi adicionado
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Senha temporária
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={createdPassword}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={copyPassword}
                    aria-label="Copiar senha"
                    className="cursor-pointer"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Esta senha não será exibida novamente. O usuário será
                  solicitado a trocá-la no primeiro login.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {step === 1 && (
              <>
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
                          <Icon
                            className={`h-4 w-4 mt-0.5 ${active ? "text-violet-500" : "text-muted-foreground"}`}
                          />
                          <div>
                            <div className="text-xs font-medium">
                              {r.label}
                            </div>
                            <div className="text-[10px] text-muted-foreground leading-tight">
                              {r.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                {showsAccounts ? (
                  <div className="space-y-2">
                    <Label>Contas que poderá ver</Label>
                    <div className="rounded-lg border border-border bg-muted/20 p-2 space-y-1 max-h-48 overflow-y-auto">
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
                                  v
                                    ? [...prev, a.id]
                                    : prev.filter((x) => x !== a.id),
                                );
                              }}
                            />
                            <span className="text-sm">{a.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Super Admin tem acesso a todas as contas
                    automaticamente.
                  </p>
                )}

                {showsTeams && (
                  <div className="space-y-2">
                    <Label>Departamentos que poderá ver</Label>
                    <div className="rounded-lg border border-border bg-muted/20 p-2 space-y-1 max-h-48 overflow-y-auto">
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
                                  v
                                    ? [...prev, t.id]
                                    : prev.filter((x) => x !== t.id),
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
              </>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground text-xs">
                      Nome
                    </span>
                    <span className="text-right">{name}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground text-xs">
                      E-mail
                    </span>
                    <span className="text-right">{email}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground text-xs">
                      Nível
                    </span>
                    <span className="text-right">{role}</span>
                  </div>
                  {showsAccounts && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground text-xs">
                        Contas
                      </span>
                      <span className="text-right text-xs">
                        {accountIds.map(accountName).join(", ") || "—"}
                      </span>
                    </div>
                  )}
                  {showsTeams && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground text-xs">
                        Departamentos
                      </span>
                      <span className="text-right text-xs">
                        {teamIds.map(teamName).join(", ") || "—"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="send-email"
                    checked={sendEmail}
                    onCheckedChange={(v) => setSendEmail(!!v)}
                  />
                  <Label
                    htmlFor="send-email"
                    className="text-xs font-normal cursor-pointer"
                  >
                    Enviar e-mail de boas-vindas com a senha temporária
                  </Label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Uma senha temporária será gerada automaticamente. Você
                  poderá copiá-la na próxima tela.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {createdPassword ? (
            <Button onClick={() => close(false)} className="cursor-pointer">
              Concluir
            </Button>
          ) : (
            <>
              {step > 1 && (
                <Button
                  variant="outline"
                  onClick={prevStep}
                  disabled={pending}
                  className="cursor-pointer"
                >
                  Voltar
                </Button>
              )}
              {step < 3 ? (
                <Button
                  onClick={nextStep}
                  disabled={pending}
                  className="cursor-pointer"
                >
                  Próximo
                </Button>
              ) : (
                <Button
                  onClick={submit}
                  disabled={pending}
                  className="cursor-pointer"
                >
                  {pending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Confirmar
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step }: { step: Step }) {
  const items = [
    { n: 1 as const, label: "Identidade", icon: IdCard },
    { n: 2 as const, label: "Acesso", icon: KeyRound },
    { n: 3 as const, label: "Confirmação", icon: CheckCircle2 },
  ];
  return (
    <div className="flex items-center gap-2 pt-1 pb-2">
      {items.map((it, i) => {
        const Icon = it.icon;
        const active = step === it.n;
        const done = step > it.n;
        return (
          <div key={it.n} className="flex items-center gap-2 flex-1">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition-colors ${
                active
                  ? "border-violet-500/60 bg-violet-500/10 text-violet-500"
                  : done
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                    : "border-border bg-muted/30 text-muted-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
            <span
              className={`text-xs ${active ? "text-foreground" : "text-muted-foreground"}`}
            >
              {it.label}
            </span>
            {i < items.length - 1 && (
              <div className="flex-1 h-px bg-border" />
            )}
          </div>
        );
      })}
    </div>
  );
}
