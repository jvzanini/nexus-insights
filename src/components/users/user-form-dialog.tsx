"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import {
  Crown,
  Eye,
  Loader2,
  Shield,
  ShieldCheck,
  UserCheck,
  UserX,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { BadgeSelect, type BadgeOption } from "@/components/ui/badge-select";
import { PasswordInput } from "@/components/ui/password-input";

import type { UserListItem } from "@/lib/actions/users";
import { createUser, regeneratePassword, updateUser } from "@/lib/actions/users";
import type { PlatformRole } from "@/generated/prisma/client";

type RoleValue = PlatformRole;

const ROLE_BG: Record<RoleValue, string> = {
  super_admin:
    "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400",
  admin: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
  manager:
    "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
  viewer:
    "bg-zinc-200 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400",
};

const ROLE_ICON = {
  super_admin: Crown,
  admin: ShieldCheck,
  manager: Shield,
  viewer: Eye,
} as const;

const ROLE_OPTIONS_DATA: Array<{
  value: RoleValue;
  label: string;
  description: string;
}> = [
  {
    value: "super_admin",
    label: "Super Admin",
    description: "Acesso total a toda a plataforma",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Gerencia contas e usuários",
  },
  {
    value: "manager",
    label: "Gerente",
    description: "Gerencia departamentos atribuídos",
  },
  {
    value: "viewer",
    label: "Visualizador",
    description: "Apenas visualização",
  },
];

function getRoleStyle(value: RoleValue) {
  return { bg: ROLE_BG[value], icon: ROLE_ICON[value] };
}

interface UserFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserListItem | null;
  isSuperAdmin: boolean;
  currentUserId: string;
  onSuccess: () => void;
}

interface FormState {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: RoleValue;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "viewer",
  isActive: true,
};

export function UserFormDialog({
  mode,
  open,
  onOpenChange,
  user,
  isSuperAdmin,
  currentUserId,
  onSuccess,
}: UserFormDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [pending, start] = useTransition();

  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const passwordErrorId = useId();
  const confirmErrorId = useId();

  const isEdit = mode === "edit";
  const isOwner = !!user?.isOwner;
  const isSelf = user?.id === currentUserId;
  const showActiveToggle = isEdit && !isOwner && !isSelf;

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    if (isEdit && user) {
      setForm({
        name: user.name,
        email: user.email,
        password: "",
        confirmPassword: "",
        role: user.platformRole,
        isActive: user.isActive,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setErrors({});
  }, [open, isEdit, user]);

  const availableRoles = useMemo(
    () =>
      ROLE_OPTIONS_DATA.filter((r) =>
        isSuperAdmin ? true : r.value !== "super_admin",
      ),
    [isSuperAdmin],
  );

  const roleOptions: BadgeOption<RoleValue>[] = useMemo(
    () =>
      availableRoles.map((r) => ({
        value: r.value,
        label: r.label,
        description: r.description,
        bg: ROLE_BG[r.value],
        icon: ROLE_ICON[r.value],
      })),
    [availableRoles],
  );

  function validate(): boolean {
    const next: typeof errors = {};

    if (!form.name.trim()) {
      next.name = "Nome obrigatório";
    } else if (form.name.trim().length < 2) {
      next.name = "Mínimo de 2 caracteres";
    }

    const emailTrim = form.email.trim();
    if (!emailTrim) {
      next.email = "E-mail obrigatório";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      next.email = "E-mail inválido";
    }

    const wantsPassword = !isEdit || form.password.length > 0;
    if (wantsPassword) {
      if (!form.password) {
        next.password = "Senha obrigatória";
      } else if (form.password.length < 8) {
        next.password = "Mínimo de 8 caracteres";
      }
      if (form.password !== form.confirmPassword) {
        next.confirmPassword = "As senhas não coincidem";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (pending) return;
    if (!validate()) {
      toast.error("Verifique os campos do formulário");
      return;
    }

    start(async () => {
      if (!isEdit) {
        const result = await createUser({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          platformRole: form.role,
          accountIds: [],
          teamIds: [],
          sendWelcomeEmail: false,
        });
        if (result.success) {
          toast.success("Usuário criado com sucesso");
          onOpenChange(false);
          onSuccess();
        } else {
          toast.error(result.error ?? "Erro ao criar usuário");
        }
        return;
      }

      if (!user) return;

      const updateResult = await updateUser({
        id: user.id,
        name: form.name.trim(),
        platformRole: form.role,
      });
      if (!updateResult.success) {
        toast.error(updateResult.error ?? "Erro ao atualizar usuário");
        return;
      }

      // Senha: regenera se preenchida (cria nova hash + envia e-mail)
      if (form.password.trim().length > 0) {
        const pwResult = await regeneratePassword(user.id);
        if (!pwResult.success) {
          toast.error(pwResult.error ?? "Usuário atualizado, mas senha falhou");
          return;
        }
      }

      // Toggle ativo/inativo isolado (a action setUserActive cuida da regra)
      if (showActiveToggle && form.isActive !== user.isActive) {
        const { setUserActive } = await import("@/lib/actions/users");
        const aResult = await setUserActive(user.id, form.isActive);
        if (!aResult.success) {
          toast.error(aResult.error ?? "Erro ao atualizar status");
          return;
        }
      }

      toast.success("Usuário atualizado com sucesso");
      onOpenChange(false);
      onSuccess();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-visible">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualize os dados do usuário"
              : "Crie um novo usuário para a plataforma"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Nome */}
          <div className="space-y-1.5">
            <label
              htmlFor={nameId}
              className="block text-sm font-medium text-foreground/80"
            >
              Nome
            </label>
            <Input
              id={nameId}
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="Nome do usuário"
              aria-invalid={!!errors.name || undefined}
              autoComplete="name"
            />
            {errors.name ? (
              <p className="text-xs text-red-400" role="alert">
                {errors.name}
              </p>
            ) : null}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label
              htmlFor={emailId}
              className="block text-sm font-medium text-foreground/80"
            >
              Email
            </label>
            <Input
              id={emailId}
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              placeholder="email@exemplo.com"
              aria-invalid={!!errors.email || undefined}
              autoComplete="email"
              disabled={isEdit}
            />
            {isEdit ? (
              <p className="text-[11px] text-muted-foreground">
                O e-mail não pode ser alterado.
              </p>
            ) : null}
            {errors.email ? (
              <p className="text-xs text-red-400" role="alert">
                {errors.email}
              </p>
            ) : null}
          </div>

          {/* Senha */}
          <div className="space-y-1.5">
            <label
              htmlFor={passwordId}
              className="block text-sm font-medium text-foreground/80"
            >
              Senha
            </label>
            <PasswordInput
              id={passwordId}
              value={form.password}
              onChange={(v) => {
                setForm((f) => ({ ...f, password: v }));
                if (errors.password) {
                  setErrors((e) => ({ ...e, password: undefined }));
                }
              }}
              placeholder={isEdit ? "••••••••" : "Mínimo 8 caracteres"}
              ariaInvalid={!!errors.password}
              ariaDescribedBy={errors.password ? passwordErrorId : undefined}
            />
            {isEdit ? (
              <p className="text-[11px] text-muted-foreground">
                Deixe vazio para manter a senha atual
              </p>
            ) : null}
            {errors.password ? (
              <p
                id={passwordErrorId}
                className="text-xs text-red-400"
                role="alert"
              >
                {errors.password}
              </p>
            ) : null}
          </div>

          {/* Confirmar senha (always on create; on edit only when typing) */}
          {(!isEdit || form.password.length > 0) && (
            <div className="space-y-1.5">
              <label
                htmlFor={confirmId}
                className="block text-sm font-medium text-foreground/80"
              >
                Confirmar senha
              </label>
              <PasswordInput
                id={confirmId}
                value={form.confirmPassword}
                onChange={(v) => {
                  setForm((f) => ({ ...f, confirmPassword: v }));
                  if (errors.confirmPassword) {
                    setErrors((e) => ({ ...e, confirmPassword: undefined }));
                  }
                }}
                placeholder="Confirme a senha"
                ariaInvalid={!!errors.confirmPassword}
                ariaDescribedBy={
                  errors.confirmPassword ? confirmErrorId : undefined
                }
              />
              {errors.confirmPassword ? (
                <p
                  id={confirmErrorId}
                  className="text-xs text-red-400"
                  role="alert"
                >
                  {errors.confirmPassword}
                </p>
              ) : null}
            </div>
          )}

          {/* Nível de acesso */}
          <div className="space-y-1.5">
            <p className="block text-sm font-medium text-foreground/80">
              Nível de acesso
            </p>
            {isEdit && isOwner ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${ROLE_BG[form.role]}`}
              >
                {(() => {
                  const Icon = ROLE_ICON[form.role];
                  return <Icon className="h-3 w-3" aria-hidden="true" />;
                })()}
                {ROLE_OPTIONS_DATA.find((r) => r.value === form.role)?.label ??
                  form.role}
              </span>
            ) : (
              <BadgeSelect<RoleValue>
                value={form.role}
                onChange={(val) => setForm((f) => ({ ...f, role: val }))}
                options={roleOptions}
                getBadgeStyle={getRoleStyle}
                ariaLabel="Selecionar nível de acesso"
              />
            )}
          </div>

          {/* Toggle ativo/inativo (apenas em edit, não-owner, não-self) */}
          {showActiveToggle ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                {form.isActive ? (
                  <UserCheck
                    className="h-4 w-4 text-emerald-400"
                    aria-hidden="true"
                  />
                ) : (
                  <UserX
                    className="h-4 w-4 text-red-400"
                    aria-hidden="true"
                  />
                )}
                <span className="text-sm text-foreground/80">
                  {form.isActive ? "Ativo" : "Inativo"}
                </span>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, isActive: !!checked }))
                }
                aria-label="Alternar status do usuário"
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {isEdit ? "Salvar Alterações" : "Criar Usuário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UserFormDialog;
