"use client";

import { useEffect, useState, useTransition } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2,
  IdCard,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { PLATFORM_ROLE_OPTIONS } from "@/lib/constants/roles";
import {
  getUserDetails,
  updateUser,
  type UserDetails,
} from "@/lib/actions/users";
import type { PlatformRole } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth-helpers";

interface AccountOption {
  id: number;
  name: string;
}
interface TeamOption {
  id: number;
  name: string;
}

export function EditUserDialog({
  userId,
  onClose,
  currentUser,
  allowedRoles,
  accountOptions,
  teamOptions,
}: {
  userId: string | null;
  onClose: () => void;
  currentUser: AuthUser;
  allowedRoles: PlatformRole[];
  accountOptions: AccountOption[];
  teamOptions: TeamOption[];
}) {
  if (userId === null) return null;
  return (
    <EditUserDialogInner
      key={userId}
      userId={userId}
      onClose={onClose}
      currentUser={currentUser}
      allowedRoles={allowedRoles}
      accountOptions={accountOptions}
      teamOptions={teamOptions}
    />
  );
}

function EditUserDialogInner({
  userId,
  onClose,
  currentUser,
  allowedRoles,
  accountOptions,
  teamOptions,
}: {
  userId: string;
  onClose: () => void;
  currentUser: AuthUser;
  allowedRoles: PlatformRole[];
  accountOptions: AccountOption[];
  teamOptions: TeamOption[];
}) {
  const [tab, setTab] = useState<"info" | "access" | "confirm">("info");
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<UserDetails | null>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState<PlatformRole>("viewer");
  const [accountIds, setAccountIds] = useState<number[]>([]);
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getUserDetails(userId);
      if (cancelled) return;
      if (result.success && result.data) {
        setDetails(result.data);
        setName(result.data.name);
        setRole(result.data.platformRole);
        setAccountIds(result.data.accountIds);
        setTeamIds(result.data.teamIds);
        setLoading(false);
      } else {
        toast.error(result.error ?? "Erro ao carregar usuário");
        onClose();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, onClose]);

  function handleOpenChange(v: boolean) {
    if (!v) onClose();
  }

  function submit() {
    if (!details) return;
    if (!name.trim()) {
      toast.error("Nome obrigatório");
      setTab("info");
      return;
    }
    const showsAccounts = role !== "super_admin";
    const showsTeams = role === "manager" || role === "viewer";
    if (showsAccounts && accountIds.length === 0) {
      toast.error("Selecione pelo menos uma conta");
      setTab("access");
      return;
    }
    if (showsTeams && teamIds.length === 0) {
      toast.error("Selecione pelo menos um departamento");
      setTab("access");
      return;
    }

    start(async () => {
      const result = await updateUser({
        id: details.id,
        name,
        platformRole: role,
        accountIds: showsAccounts ? accountIds : [],
        teamIds: showsTeams ? teamIds : [],
      });
      if (result.success) {
        toast.success("Usuário atualizado");
        onClose();
      } else {
        toast.error(result.error ?? "Erro");
      }
    });
  }

  const selectableRoles = PLATFORM_ROLE_OPTIONS.filter((r) =>
    allowedRoles.includes(r.value),
  );

  // Editar a si mesmo: bloquear mudança de role/escopo
  const isSelf = details?.id === currentUser.id;
  const isOwnerTarget = !!details?.isOwner;
  const lockRole = isSelf || isOwnerTarget;
  const lockAccess = isSelf || isOwnerTarget;

  const showsAccounts = role !== "super_admin";
  const showsTeams = role === "manager" || role === "viewer";

  // Deltas pro preview
  const originalAccountIds = details?.accountIds ?? [];
  const originalTeamIds = details?.teamIds ?? [];
  const addedAccounts = accountIds.filter(
    (id) => !originalAccountIds.includes(id),
  );
  const removedAccounts = originalAccountIds.filter(
    (id) => !accountIds.includes(id),
  );
  const addedTeams = teamIds.filter((id) => !originalTeamIds.includes(id));
  const removedTeams = originalTeamIds.filter((id) => !teamIds.includes(id));
  const nameChanged = details ? name !== details.name : false;
  const roleChanged = details ? role !== details.platformRole : false;
  const hasChanges =
    nameChanged ||
    roleChanged ||
    addedAccounts.length > 0 ||
    removedAccounts.length > 0 ||
    addedTeams.length > 0 ||
    removedTeams.length > 0;

  function accountName(id: number) {
    return accountOptions.find((a) => a.id === id)?.name ?? `Conta ${id}`;
  }
  function teamName(id: number) {
    return teamOptions.find((t) => t.id === id)?.name ?? `Time ${id}`;
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>
            {details
              ? `Atualize as informações de ${details.name}.`
              : "Carregando..."}
          </DialogDescription>
        </DialogHeader>

        {loading || !details ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as typeof tab)}
            className="w-full"
          >
            <TabsList className="mb-4">
              <TabsTrigger value="info">
                <IdCard className="h-3.5 w-3.5" />
                Informações
              </TabsTrigger>
              <TabsTrigger value="access">
                <KeyRound className="h-3.5 w-3.5" />
                Acesso
              </TabsTrigger>
              <TabsTrigger value="confirm">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Confirmação
              </TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-user-name">Nome</Label>
                <Input
                  id="edit-user-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome completo"
                />
              </div>

              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input value={details.email} disabled />
                <p className="text-[11px] text-muted-foreground">
                  O e-mail não pode ser alterado.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Nível de acesso</Label>
                {lockRole ? (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                    {isOwnerTarget
                      ? "O nível do owner não pode ser alterado."
                      : "Você não pode alterar o próprio nível."}
                  </div>
                ) : (
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
                )}
              </div>
            </TabsContent>

            <TabsContent value="access" className="space-y-4">
              {lockAccess ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    {isOwnerTarget
                      ? "O escopo de acesso do owner é total e imutável."
                      : "Você não pode alterar o próprio escopo de acesso."}
                  </div>
                </div>
              ) : (
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
            </TabsContent>

            <TabsContent value="confirm" className="space-y-3">
              {!hasChanges ? (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  Nenhuma alteração para salvar.
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 text-sm">
                  {nameChanged && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Nome
                      </span>
                      <span>
                        <span className="text-muted-foreground line-through">
                          {details.name}
                        </span>{" "}
                        <span className="text-foreground">→ {name}</span>
                      </span>
                    </div>
                  )}
                  {roleChanged && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Nível
                      </span>
                      <span>
                        <span className="text-muted-foreground line-through">
                          {details.platformRole}
                        </span>{" "}
                        <span className="text-foreground">→ {role}</span>
                      </span>
                    </div>
                  )}
                  {(addedAccounts.length > 0 ||
                    removedAccounts.length > 0) && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Contas
                      </span>
                      {addedAccounts.length > 0 && (
                        <span className="text-emerald-500 text-xs">
                          + {addedAccounts.map(accountName).join(", ")}
                        </span>
                      )}
                      {removedAccounts.length > 0 && (
                        <span className="text-red-400 text-xs">
                          − {removedAccounts.map(accountName).join(", ")}
                        </span>
                      )}
                    </div>
                  )}
                  {(addedTeams.length > 0 || removedTeams.length > 0) && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Departamentos
                      </span>
                      {addedTeams.length > 0 && (
                        <span className="text-emerald-500 text-xs">
                          + {addedTeams.map(teamName).join(", ")}
                        </span>
                      )}
                      {removedTeams.length > 0 && (
                        <span className="text-red-400 text-xs">
                          − {removedTeams.map(teamName).join(", ")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          {tab !== "info" && (
            <Button
              variant="outline"
              onClick={() =>
                setTab(tab === "confirm" ? "access" : "info")
              }
              disabled={pending || loading}
              className="cursor-pointer"
            >
              Voltar
            </Button>
          )}
          {tab !== "confirm" ? (
            <Button
              onClick={() =>
                setTab(tab === "info" ? "access" : "confirm")
              }
              disabled={pending || loading || !details}
              className="cursor-pointer"
            >
              Próximo
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={pending || loading || !hasChanges}
              className="cursor-pointer"
            >
              {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar alterações
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
