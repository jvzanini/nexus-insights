"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Crown,
  Eye,
  IdCard,
  KeyRound,
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
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordInput } from "@/components/ui/password-input";

import {
  createUser,
  getUserDetails,
  getUserFormOptions,
  setUserActive,
  updateUser,
  type UserFormOptions,
  type UserListItem,
} from "@/lib/actions/users";
import { cn } from "@/lib/utils";
import type { PlatformRole } from "@/generated/prisma/client";

type RoleValue = PlatformRole;
type Step = 1 | 2 | 3;

interface RoleMeta {
  value: RoleValue;
  label: string;
  description: string;
  icon: typeof Crown;
}

const ROLE_META: Record<RoleValue, RoleMeta> = {
  super_admin: {
    value: "super_admin",
    label: "Super Admin",
    description: "Acesso total a toda a plataforma",
    icon: Crown,
  },
  admin: {
    value: "admin",
    label: "Admin",
    description: "Gerencia contas e usuários",
    icon: ShieldCheck,
  },
  manager: {
    value: "manager",
    label: "Gerente",
    description: "Gerencia atendimentos do Chatwoot",
    icon: Shield,
  },
  viewer: {
    value: "viewer",
    label: "Visualizador",
    description: "Apenas visualização",
    icon: Eye,
  },
};

const ROLE_BADGE_BG: Record<RoleValue, string> = {
  super_admin:
    "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400",
  admin: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
  manager:
    "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
  viewer:
    "bg-zinc-200 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400",
};

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
  accountIds: number[];
  teamIds: number[];
  sendWelcomeEmail: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "viewer",
  isActive: true,
  accountIds: [],
  teamIds: [],
  sendWelcomeEmail: true,
};

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  accountIds?: string;
  teamIds?: string;
}

export function UserFormDialog({
  mode,
  open,
  onOpenChange,
  user,
  isSuperAdmin,
  currentUserId,
  onSuccess,
}: UserFormDialogProps) {
  const isEdit = mode === "edit";
  const isOwner = !!user?.isOwner;
  const isSelf = user?.id === currentUserId;

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();

  // Opções carregadas server-side
  const [options, setOptions] = useState<UserFormOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);

  // Loading dos detalhes do usuário em edit
  const [editLoading, setEditLoading] = useState(false);

  // Estado pós-criação (mostra senha)
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const passwordErrorId = useId();
  const confirmErrorId = useId();

  const showActiveToggle = isEdit && !isOwner && !isSelf;
  const lockRole = isEdit && (isOwner || isSelf);
  const lockAccess = lockRole;

  // Resetar estado ao abrir
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setErrors({});
    setCreatedPassword(null);
    setCopied(false);

    if (isEdit && user) {
      setForm({
        ...EMPTY_FORM,
        name: user.name,
        email: user.email,
        role: user.platformRole,
        isActive: user.isActive,
      });
      setEditLoading(true);
      void (async () => {
        const result = await getUserDetails(user.id);
        if (result.success && result.data) {
          setForm((f) => ({
            ...f,
            accountIds: result.data!.accountIds,
            teamIds: result.data!.teamIds,
          }));
        } else {
          toast.error(result.error ?? "Erro ao carregar detalhes do usuário");
        }
        setEditLoading(false);
      })();
    } else {
      setForm({ ...EMPTY_FORM });
    }
  }, [open, isEdit, user]);

  // Carregar opções de contas/times ao abrir
  useEffect(() => {
    if (!open) return;
    if (options) return;
    setOptionsLoading(true);
    void (async () => {
      const result = await getUserFormOptions();
      if (result.success && result.data) {
        setOptions(result.data);
      } else {
        toast.error(result.error ?? "Erro ao carregar opções");
      }
      setOptionsLoading(false);
    })();
  }, [open, options]);

  // Roles disponíveis (super_admin só para super_admin)
  const availableRoles = useMemo<RoleMeta[]>(
    () =>
      (Object.values(ROLE_META) as RoleMeta[]).filter((r) =>
        isSuperAdmin ? true : r.value !== "super_admin",
      ),
    [isSuperAdmin],
  );

  // Lógica condicional na etapa Acesso
  const showAccounts = form.role !== "super_admin";
  const showTeams = form.role === "manager";

  // Times derivados das contas selecionadas (merge único)
  const availableTeams = useMemo<Array<{ id: number; name: string }>>(() => {
    if (!options) return [];
    const seen = new Set<number>();
    const list: Array<{ id: number; name: string }> = [];
    for (const accId of form.accountIds) {
      const teams = options.teamsByAccount[accId] ?? [];
      for (const t of teams) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          list.push(t);
        }
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [options, form.accountIds]);

  // Limpa teamIds que não pertencem mais às contas selecionadas
  useEffect(() => {
    if (!options) return;
    if (!showTeams) return;
    const validIds = new Set(availableTeams.map((t) => t.id));
    setForm((f) => {
      const filtered = f.teamIds.filter((id) => validIds.has(id));
      if (filtered.length === f.teamIds.length) return f;
      return { ...f, teamIds: filtered };
    });
  }, [availableTeams, options, showTeams]);

  function validateStep1(): boolean {
    const next: FieldErrors = {};
    if (!form.name.trim()) next.name = "Nome obrigatório";
    else if (form.name.trim().length < 3) next.name = "Mínimo de 3 caracteres";

    if (!isEdit) {
      const e = form.email.trim();
      if (!e) next.email = "E-mail obrigatório";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        next.email = "E-mail inválido";
    }

    const wantsPassword = !isEdit || form.password.length > 0;
    if (wantsPassword) {
      if (!isEdit && form.password.length === 0) {
        // Em create, senha é opcional (server gera). Permitimos vazio.
      } else if (form.password.length > 0 && form.password.length < 8) {
        next.password = "Mínimo de 8 caracteres";
      }
      if (form.password.length > 0 && form.password !== form.confirmPassword) {
        next.confirmPassword = "As senhas não coincidem";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateStep2(): boolean {
    if (lockAccess) return true;
    const next: FieldErrors = {};
    if (showAccounts && form.accountIds.length === 0)
      next.accountIds = "Selecione pelo menos uma conta";
    if (showTeams && form.teamIds.length === 0)
      next.teamIds = "Selecione pelo menos um departamento";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (step === 1) {
      if (!validateStep1()) {
        toast.error("Verifique os campos da etapa Identidade");
        return;
      }
    }
    if (step === 2) {
      if (!validateStep2()) {
        toast.error("Verifique os campos da etapa Acesso");
        return;
      }
    }
    setStep((s) => Math.min(3, s + 1) as Step);
  }

  function goBack() {
    setStep((s) => Math.max(1, s - 1) as Step);
  }

  async function handleSubmit() {
    if (pending) return;
    if (!validateStep1()) {
      setStep(1);
      toast.error("Verifique os campos da etapa Identidade");
      return;
    }
    if (!validateStep2()) {
      setStep(2);
      toast.error("Verifique os campos da etapa Acesso");
      return;
    }

    start(async () => {
      if (!isEdit) {
        const result = await createUser({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password || undefined,
          platformRole: form.role,
          accountIds: showAccounts ? form.accountIds : [],
          teamIds: showTeams ? form.teamIds : [],
          sendWelcomeEmail: form.sendWelcomeEmail,
        });
        if (result.success && result.data) {
          const shownPassword =
            form.password.length > 0
              ? form.password
              : result.data.tempPassword ?? null;
          setCreatedPassword(shownPassword);
          toast.success("Usuário criado com sucesso");
          onSuccess();
        } else {
          toast.error(result.error ?? "Erro ao criar usuário");
        }
        return;
      }

      // EDIT
      if (!user) return;
      const updateResult = await updateUser({
        id: user.id,
        name: form.name.trim(),
        platformRole: lockRole ? undefined : form.role,
        password: form.password.length > 0 ? form.password : undefined,
        accountIds: lockAccess
          ? undefined
          : showAccounts
            ? form.accountIds
            : [],
        teamIds: lockAccess ? undefined : showTeams ? form.teamIds : [],
      });
      if (!updateResult.success) {
        toast.error(updateResult.error ?? "Erro ao atualizar usuário");
        return;
      }

      if (showActiveToggle && form.isActive !== user.isActive) {
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

  function copyPassword() {
    if (!createdPassword) return;
    void navigator.clipboard.writeText(createdPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function close(v: boolean) {
    if (pending) return;
    onOpenChange(v);
  }

  function accountName(id: number) {
    return options?.accounts.find((a) => a.id === id)?.name ?? `Conta ${id}`;
  }
  function teamName(id: number) {
    return availableTeams.find((t) => t.id === id)?.name ?? `Time ${id}`;
  }

  const stepperItems: Array<{ n: Step; label: string; icon: typeof IdCard }> = [
    { n: 1, label: "Identidade", icon: IdCard },
    { n: 2, label: "Acesso", icon: KeyRound },
    { n: 3, label: "Confirmação", icon: CheckCircle2 },
  ];

  const accessSkippedHint =
    form.role === "super_admin"
      ? "Super Admin tem acesso total — nenhuma seleção necessária."
      : null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl overflow-visible">
        <DialogHeader>
          <DialogTitle>
            {createdPassword
              ? "Usuário criado"
              : isEdit
                ? "Editar Usuário"
                : "Novo Usuário"}
          </DialogTitle>
          <DialogDescription>
            {createdPassword
              ? "Compartilhe a senha com o usuário."
              : isEdit
                ? "Atualize as informações em 3 etapas."
                : "Crie um novo usuário em 3 etapas."}
          </DialogDescription>
        </DialogHeader>

        {!createdPassword ? (
          <Stepper
            step={step}
            items={stepperItems}
            superAdminMode={form.role === "super_admin"}
          />
        ) : null}

        {createdPassword ? (
          <CreatedPanel
            password={createdPassword}
            copied={copied}
            onCopy={copyPassword}
            name={form.name}
          />
        ) : (
          <div className="space-y-4 py-1">
            {step === 1 ? (
              <StepIdentity
                form={form}
                setForm={setForm}
                errors={errors}
                clearError={(key) =>
                  setErrors((e) => ({ ...e, [key]: undefined }))
                }
                isEdit={isEdit}
                lockRole={lockRole}
                availableRoles={availableRoles}
                showActiveToggle={showActiveToggle}
                ids={{
                  name: nameId,
                  email: emailId,
                  password: passwordId,
                  confirm: confirmId,
                  passwordError: passwordErrorId,
                  confirmError: confirmErrorId,
                }}
              />
            ) : null}

            {step === 2 ? (
              <StepAccess
                role={form.role}
                accountIds={form.accountIds}
                teamIds={form.teamIds}
                onChangeAccounts={(ids) =>
                  setForm((f) => ({ ...f, accountIds: ids }))
                }
                onChangeTeams={(ids) =>
                  setForm((f) => ({ ...f, teamIds: ids }))
                }
                accounts={options?.accounts ?? []}
                teams={availableTeams}
                showAccounts={showAccounts}
                showTeams={showTeams}
                lockAccess={lockAccess}
                loading={optionsLoading || editLoading}
                errors={errors}
                accessSkippedHint={accessSkippedHint}
              />
            ) : null}

            {step === 3 ? (
              <StepConfirm
                form={form}
                isEdit={isEdit}
                showAccounts={showAccounts}
                showTeams={showTeams}
                accountName={accountName}
                teamName={teamName}
                roleLabel={ROLE_META[form.role].label}
                onToggleSendEmail={(v) =>
                  setForm((f) => ({ ...f, sendWelcomeEmail: v }))
                }
              />
            ) : null}
          </div>
        )}

        <DialogFooter>
          {createdPassword ? (
            <Button
              type="button"
              onClick={() => close(false)}
              className="gap-2 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
            >
              Concluir
            </Button>
          ) : (
            <>
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  disabled={pending}
                  className="gap-2 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Voltar
                </Button>
              ) : null}
              {step < 3 ? (
                <Button
                  type="button"
                  onClick={goNext}
                  disabled={pending || optionsLoading || editLoading}
                  className="gap-2 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
                >
                  Próximo
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={pending}
                  className="gap-2 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
                >
                  {pending ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {isEdit ? "Salvar Alterações" : "Criar Usuário"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Stepper visual
// ─────────────────────────────────────────────────────────────────────────

interface StepperProps {
  step: Step;
  items: Array<{ n: Step; label: string; icon: typeof IdCard }>;
  superAdminMode: boolean;
}

function Stepper({ step, items, superAdminMode }: StepperProps) {
  return (
    <div
      className="flex items-center gap-2 pt-1 pb-2"
      role="list"
      aria-label="Progresso do formulário"
    >
      {items.map((it, i) => {
        const Icon = it.icon;
        const active = step === it.n;
        const done = step > it.n;
        const muted = it.n === 2 && superAdminMode;
        return (
          <div
            key={it.n}
            role="listitem"
            className="flex items-center gap-2 flex-1"
          >
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition-colors",
                active &&
                  "border-violet-500/60 bg-violet-500/10 text-violet-500",
                done &&
                  !active &&
                  "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
                !active &&
                  !done &&
                  "border-border bg-muted/30 text-muted-foreground",
              )}
              aria-current={active ? "step" : undefined}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <span
              className={cn(
                "text-xs",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {it.label}
              {muted ? (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  (sem restrições)
                </span>
              ) : null}
            </span>
            {i < items.length - 1 ? (
              <div className="flex-1 h-px bg-border" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Etapa 1 — Identidade
// ─────────────────────────────────────────────────────────────────────────

interface StepIdentityProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  errors: FieldErrors;
  clearError: (key: keyof FieldErrors) => void;
  isEdit: boolean;
  lockRole: boolean;
  availableRoles: RoleMeta[];
  showActiveToggle: boolean;
  ids: {
    name: string;
    email: string;
    password: string;
    confirm: string;
    passwordError: string;
    confirmError: string;
  };
}

function StepIdentity({
  form,
  setForm,
  errors,
  clearError,
  isEdit,
  lockRole,
  availableRoles,
  showActiveToggle,
  ids,
}: StepIdentityProps) {
  return (
    <>
      {/* Nome */}
      <div className="space-y-1.5">
        <label
          htmlFor={ids.name}
          className="block text-sm font-medium text-foreground/80"
        >
          Nome
        </label>
        <Input
          id={ids.name}
          value={form.name}
          onChange={(e) => {
            setForm((f) => ({ ...f, name: e.target.value }));
            if (errors.name) clearError("name");
          }}
          placeholder="Nome completo"
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
          htmlFor={ids.email}
          className="block text-sm font-medium text-foreground/80"
        >
          Email
        </label>
        <Input
          id={ids.email}
          type="email"
          value={form.email}
          onChange={(e) => {
            setForm((f) => ({ ...f, email: e.target.value }));
            if (errors.email) clearError("email");
          }}
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
          htmlFor={ids.password}
          className="block text-sm font-medium text-foreground/80"
        >
          Senha{" "}
          {isEdit ? (
            <span className="text-muted-foreground">(opcional)</span>
          ) : (
            <span className="text-muted-foreground">(opcional)</span>
          )}
        </label>
        <PasswordInput
          id={ids.password}
          value={form.password}
          onChange={(v) => {
            setForm((f) => ({ ...f, password: v }));
            if (errors.password) clearError("password");
          }}
          placeholder={
            isEdit ? "Deixe vazio para manter" : "Mínimo 8 caracteres"
          }
          ariaInvalid={!!errors.password}
          ariaDescribedBy={errors.password ? ids.passwordError : undefined}
        />
        {!isEdit ? (
          <p className="text-[11px] text-muted-foreground">
            Se vazia, uma senha temporária será gerada automaticamente.
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Deixe vazio para manter a senha atual.
          </p>
        )}
        {errors.password ? (
          <p
            id={ids.passwordError}
            className="text-xs text-red-400"
            role="alert"
          >
            {errors.password}
          </p>
        ) : null}
      </div>

      {/* Confirmar senha (apenas se senha digitada) */}
      {form.password.length > 0 ? (
        <div className="space-y-1.5">
          <label
            htmlFor={ids.confirm}
            className="block text-sm font-medium text-foreground/80"
          >
            Confirmar senha
          </label>
          <PasswordInput
            id={ids.confirm}
            value={form.confirmPassword}
            onChange={(v) => {
              setForm((f) => ({ ...f, confirmPassword: v }));
              if (errors.confirmPassword) clearError("confirmPassword");
            }}
            placeholder="Confirme a senha"
            ariaInvalid={!!errors.confirmPassword}
            ariaDescribedBy={
              errors.confirmPassword ? ids.confirmError : undefined
            }
          />
          {errors.confirmPassword ? (
            <p
              id={ids.confirmError}
              className="text-xs text-red-400"
              role="alert"
            >
              {errors.confirmPassword}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Nível de acesso (dropdown vertical) */}
      <div className="space-y-1.5">
        <p className="block text-sm font-medium text-foreground/80">
          Nível de acesso
        </p>
        {lockRole ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              ROLE_BADGE_BG[form.role],
            )}
          >
            {(() => {
              const Icon = ROLE_META[form.role].icon;
              return <Icon className="h-3 w-3" aria-hidden="true" />;
            })()}
            {ROLE_META[form.role].label}
          </span>
        ) : (
          <RoleDropdown
            value={form.role}
            options={availableRoles}
            onChange={(v) => setForm((f) => ({ ...f, role: v }))}
          />
        )}
      </div>

      {/* Toggle ativo/inativo (apenas em edit) */}
      {showActiveToggle ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            {form.isActive ? (
              <UserCheck
                className="h-4 w-4 text-emerald-400"
                aria-hidden="true"
              />
            ) : (
              <UserX className="h-4 w-4 text-red-400" aria-hidden="true" />
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
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Dropdown vertical de nível
// ─────────────────────────────────────────────────────────────────────────

interface RoleDropdownProps {
  value: RoleValue;
  options: RoleMeta[];
  onChange: (v: RoleValue) => void;
}

function RoleDropdown({ value, options, onChange }: RoleDropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const handler = () => updatePos();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = ROLE_META[value];
  const CurrentIcon = current.icon;

  const popover = open ? (
    <div
      ref={popoverRef}
      role="listbox"
      id={listboxId}
      style={
        pos
          ? {
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 200,
            }
          : undefined
      }
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10",
        "animate-in fade-in-0 zoom-in-95 duration-150 ease-out",
      )}
      data-state="open"
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => {
              onChange(opt.value);
              setOpen(false);
              triggerRef.current?.focus();
            }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors",
              "hover:bg-accent focus:bg-accent focus:outline-none",
              selected && "bg-accent/50",
            )}
          >
            <span
              className={cn(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                ROLE_BADGE_BG[opt.value],
              )}
              aria-hidden="true"
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">
                {opt.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {opt.description}
              </span>
            </div>
            {selected ? (
              <Check
                className="h-4 w-4 shrink-0 text-violet-500"
                aria-hidden="true"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors outline-none",
          "hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
          "cursor-pointer",
        )}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span
            className={cn(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
              ROLE_BADGE_BG[value],
            )}
            aria-hidden="true"
          >
            <CurrentIcon className="h-3.5 w-3.5" />
          </span>
          <span className="flex flex-col items-start min-w-0">
            <span className="text-sm font-medium text-foreground">
              {current.label}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {current.description}
            </span>
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {mounted && popover ? createPortal(popover, document.body) : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Etapa 2 — Acesso
// ─────────────────────────────────────────────────────────────────────────

interface StepAccessProps {
  role: RoleValue;
  accountIds: number[];
  teamIds: number[];
  onChangeAccounts: (ids: number[]) => void;
  onChangeTeams: (ids: number[]) => void;
  accounts: Array<{ id: number; name: string }>;
  teams: Array<{ id: number; name: string }>;
  showAccounts: boolean;
  showTeams: boolean;
  lockAccess: boolean;
  loading: boolean;
  errors: FieldErrors;
  accessSkippedHint: string | null;
}

function StepAccess({
  role,
  accountIds,
  teamIds,
  onChangeAccounts,
  onChangeTeams,
  accounts,
  teams,
  showAccounts,
  showTeams,
  lockAccess,
  loading,
  errors,
  accessSkippedHint,
}: StepAccessProps) {
  if (accessSkippedHint) {
    return (
      <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4 flex items-start gap-3">
        <Crown
          className="h-5 w-5 text-violet-500 shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-medium text-foreground">
            {ROLE_META[role].label}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {accessSkippedHint}
          </p>
        </div>
      </div>
    );
  }

  if (lockAccess) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-foreground/80">
        Este usuário tem o nível de acesso protegido. Edição de contas e
        departamentos não está disponível neste contexto.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showAccounts ? (
        <CheckboxList
          label="Contas que poderá ver"
          items={accounts}
          selected={accountIds}
          onChange={onChangeAccounts}
          loading={loading}
          emptyHint="Nenhuma conta disponível"
          error={errors.accountIds}
        />
      ) : null}

      {showTeams ? (
        <CheckboxList
          label="Departamentos que poderá ver"
          description={
            accountIds.length === 0
              ? "Selecione ao menos uma conta para listar departamentos"
              : undefined
          }
          items={teams}
          selected={teamIds}
          onChange={onChangeTeams}
          loading={loading && accountIds.length > 0}
          emptyHint={
            accountIds.length === 0
              ? "Selecione uma conta antes"
              : "Nenhum departamento disponível para as contas selecionadas"
          }
          error={errors.teamIds}
        />
      ) : null}

      {!showAccounts && !showTeams ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Nenhuma seleção necessária para este nível.
        </div>
      ) : null}
    </div>
  );
}

interface CheckboxListProps {
  label: string;
  description?: string;
  items: Array<{ id: number; name: string }>;
  selected: number[];
  onChange: (ids: number[]) => void;
  loading: boolean;
  emptyHint: string;
  error?: string;
}

function CheckboxList({
  label,
  description,
  items,
  selected,
  onChange,
  loading,
  emptyHint,
  error,
}: CheckboxListProps) {
  return (
    <div className="space-y-1.5">
      <p className="block text-sm font-medium text-foreground/80">{label}</p>
      {description ? (
        <p className="text-[11px] text-muted-foreground">{description}</p>
      ) : null}
      <div
        className={cn(
          "rounded-lg border bg-muted/20 p-1.5 max-h-56 overflow-y-auto",
          error ? "border-destructive/50" : "border-border",
        )}
      >
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center">
            {emptyHint}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((it) => {
              const checked = selected.includes(it.id);
              return (
                <li key={it.id}>
                  <label className="flex items-center gap-3 rounded-md px-2.5 py-2 cursor-pointer hover:bg-muted/40 transition-colors">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = !!v;
                        if (next) onChange([...selected, it.id]);
                        else onChange(selected.filter((id) => id !== it.id));
                      }}
                      aria-label={it.name}
                    />
                    <span className="text-sm text-foreground">{it.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Etapa 3 — Confirmação
// ─────────────────────────────────────────────────────────────────────────

interface StepConfirmProps {
  form: FormState;
  isEdit: boolean;
  showAccounts: boolean;
  showTeams: boolean;
  accountName: (id: number) => string;
  teamName: (id: number) => string;
  roleLabel: string;
  onToggleSendEmail: (v: boolean) => void;
}

function StepConfirm({
  form,
  isEdit,
  showAccounts,
  showTeams,
  accountName,
  teamName,
  roleLabel,
  onToggleSendEmail,
}: StepConfirmProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 text-sm">
        <Row label="Nome" value={form.name || "—"} />
        <Row label="E-mail" value={form.email || "—"} />
        <Row label="Nível" value={roleLabel} />
        {isEdit ? (
          <Row label="Status" value={form.isActive ? "Ativo" : "Inativo"} />
        ) : null}
        {showAccounts ? (
          <Row
            label="Contas"
            value={
              form.accountIds.length === 0
                ? "—"
                : `${form.accountIds.length} selecionada(s)`
            }
            sub={
              form.accountIds.length > 0
                ? form.accountIds.map(accountName).join(", ")
                : undefined
            }
          />
        ) : null}
        {showTeams ? (
          <Row
            label="Departamentos"
            value={
              form.teamIds.length === 0
                ? "—"
                : `${form.teamIds.length} selecionado(s)`
            }
            sub={
              form.teamIds.length > 0
                ? form.teamIds.map(teamName).join(", ")
                : undefined
            }
          />
        ) : null}
        <Row
          label="Senha"
          value={
            form.password.length > 0
              ? "Senha definida"
              : isEdit
                ? "Sem alteração"
                : "Será gerada automaticamente"
          }
        />
      </div>

      {!isEdit ? (
        <label className="flex items-center gap-2.5 px-1 cursor-pointer">
          <Checkbox
            checked={form.sendWelcomeEmail}
            onCheckedChange={(v) => onToggleSendEmail(!!v)}
          />
          <span className="text-xs text-muted-foreground">
            Enviar e-mail de boas-vindas com a senha
          </span>
        </label>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground text-xs uppercase tracking-wide shrink-0">
        {label}
      </span>
      <div className="text-right min-w-0">
        <span className="text-sm text-foreground">{value}</span>
        {sub ? (
          <p className="text-[11px] text-muted-foreground truncate">{sub}</p>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Painel pós-criação (mostra senha)
// ─────────────────────────────────────────────────────────────────────────

interface CreatedPanelProps {
  password: string;
  copied: boolean;
  onCopy: () => void;
  name: string;
}

function CreatedPanel({ password, copied, onCopy, name }: CreatedPanelProps) {
  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-emerald-500 font-medium">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {name || "Usuário"} foi adicionado
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Senha
          </p>
          <div className="flex gap-2">
            <Input
              value={password}
              readOnly
              className="font-mono text-sm"
              aria-label="Senha do novo usuário"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onCopy}
              aria-label="Copiar senha"
              className="cursor-pointer"
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Compartilhe esta senha com o usuário. Ela não será exibida
            novamente. Será solicitada a troca no primeiro login.
          </p>
        </div>
      </div>
    </div>
  );
}

export default UserFormDialog;
