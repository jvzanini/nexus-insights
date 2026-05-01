"use client";

/**
 * ProfileRowActions — dropdown de ações por perfil na tabela.
 *
 * Implementação: usa `Popover` (base-ui) com lista de itens roleados
 * `menuitem`. Não há `DropdownMenu` primitive no projeto, então
 * combinamos a11y manualmente: keyboard arrows ficam delegadas ao
 * browser via `tabIndex={-1}` por item — base-ui Popover já gerencia
 * focus trap e escape close.
 *
 * Itens:
 *  - Ver detalhes (link → /integracoes/power-bi/[id])
 *  - Editar whitelist (abre wizard mode=edit)
 *  - Conectar (link → /integracoes/power-bi/[id]/conectar)
 *  - Desativar OU Reativar (toggle conforme status)
 *  - Rotacionar senha (abre confirm + reveal new password)
 *  - Deletar (abre confirm destrutivo)
 *
 * Server actions chamadas via `useTransition`. Cada operação termina
 * com toast + router.refresh().
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Eye,
  Loader2,
  MoreVertical,
  Pencil,
  PauseCircle,
  PlayCircle,
  Plug,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  disableProfileAction,
  reactivateProfileAction,
  deleteProfileAction,
  rotatePasswordAction,
  getProfileByIdAction,
  type ProfileListItem,
} from "@/lib/actions/integrations-power-bi";
import { cn } from "@/lib/utils";

import { ProfileWizardDialog } from "./profile-wizard-dialog";
import { CredentialsRevealDialog } from "./credentials-reveal-dialog";
import type { WizardFormData } from "./wizard-types";

interface Props {
  profile: ProfileListItem;
  /** allowedColumns vem do detail (não do list). Quando null, edit faz fetch
   *  on-demand via getProfileByIdAction antes de abrir o wizard. */
  allowedColumns?: Record<string, string[]>;
}

function toWizardInitial(
  profile: ProfileListItem,
  allowedColumns: Record<string, string[]> | undefined,
): Partial<WizardFormData> {
  return {
    name: profile.name,
    description: profile.description ?? "",
    allowedTables: [...profile.allowedTables],
    allowedColumns: allowedColumns
      ? Object.fromEntries(
          Object.entries(allowedColumns).map(([k, v]) => [k, [...v]]),
        )
      : {},
    accountIdFilter: profile.accountIdFilter
      ? [...profile.accountIdFilter]
      : null,
    teamIdFilter: profile.teamIdFilter ? [...profile.teamIdFilter] : null,
  };
}

export function ProfileRowActions({ profile, allowedColumns }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editInitial, setEditInitial] = useState<
    Partial<WizardFormData> | null
  >(null);
  const [editFetching, setEditFetching] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmRotateOpen, setConfirmRotateOpen] = useState(false);
  const [credsOpen, setCredsOpen] = useState(false);
  const [rotatedPassword, setRotatedPassword] = useState<string | null>(null);

  const [isToggling, startToggle] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [isRotating, startRotate] = useTransition();

  function close() {
    setOpen(false);
  }

  async function handleEdit() {
    close();
    if (allowedColumns) {
      setEditInitial(toWizardInitial(profile, allowedColumns));
      setEditOpen(true);
      return;
    }
    // Fetch on-demand para pegar allowedColumns do detail.
    setEditFetching(true);
    try {
      const result = await getProfileByIdAction(profile.id);
      if (!result.ok || !result.data) {
        toast.error(result.error ?? "Falha ao carregar detalhes do perfil.");
        return;
      }
      setEditInitial(
        toWizardInitial(profile, result.data.allowedColumns),
      );
      setEditOpen(true);
    } finally {
      setEditFetching(false);
    }
  }

  function handleToggleStatus() {
    close();
    startToggle(async () => {
      const result =
        profile.status === "disabled"
          ? await reactivateProfileAction(profile.id)
          : await disableProfileAction(profile.id);
      if (!result.ok) {
        toast.error(result.error ?? "Falha na operação.");
        return;
      }
      toast.success(
        profile.status === "disabled"
          ? `Perfil "${profile.name}" reativado.`
          : `Perfil "${profile.name}" desativado.`,
      );
      router.refresh();
    });
  }

  function handleConfirmDelete() {
    setConfirmDeleteOpen(false);
    startDelete(async () => {
      const result = await deleteProfileAction(profile.id);
      if (!result.ok) {
        toast.error(result.error ?? "Falha ao deletar perfil.");
        return;
      }
      toast.success(`Perfil "${profile.name}" deletado.`);
      router.refresh();
    });
  }

  function handleConfirmRotate() {
    setConfirmRotateOpen(false);
    startRotate(async () => {
      const result = await rotatePasswordAction(profile.id);
      if (!result.ok || !result.data) {
        toast.error(result.error ?? "Falha ao rotacionar senha.");
        return;
      }
      setRotatedPassword(result.data.password);
      setCredsOpen(true);
      toast.success("Senha rotacionada — atualize seus clientes Power BI.");
      router.refresh();
    });
  }

  function handleCredsOpenChange(next: boolean) {
    setCredsOpen(next);
    if (!next) setRotatedPassword(null);
  }

  const isDisabled = profile.status === "disabled";

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Ações do perfil ${profile.name}`}
              data-testid={`row-actions-${profile.id}`}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            />
          }
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={4}
          className="w-56 p-1"
        >
          <ul role="menu" className="flex flex-col">
            <ActionItem
              icon={Eye}
              label="Ver detalhes"
              renderAs="link"
              href={`/integracoes/power-bi/${profile.id}`}
              onClick={close}
            />
            <ActionItem
              icon={Pencil}
              label="Editar whitelist"
              onClick={handleEdit}
              disabled={editFetching}
              loading={editFetching}
            />
            <ActionItem
              icon={Plug}
              label="Conectar"
              renderAs="link"
              href={`/integracoes/power-bi/${profile.id}/conectar`}
              onClick={close}
            />

            <Divider />

            <ActionItem
              icon={isDisabled ? PlayCircle : PauseCircle}
              label={isDisabled ? "Reativar" : "Desativar"}
              onClick={handleToggleStatus}
              disabled={isToggling}
              loading={isToggling}
            />
            <ActionItem
              icon={RefreshCw}
              label="Rotacionar senha"
              onClick={() => {
                close();
                setConfirmRotateOpen(true);
              }}
              disabled={isRotating}
              loading={isRotating}
            />

            <Divider />

            <ActionItem
              icon={Trash2}
              label="Deletar"
              danger
              onClick={() => {
                close();
                setConfirmDeleteOpen(true);
              }}
              disabled={isDeleting}
              loading={isDeleting}
            />
          </ul>
        </PopoverContent>
      </Popover>

      {/* Edit wizard — só monta quando temos initial em mãos pra evitar flash. */}
      {editInitial ? (
        <ProfileWizardDialog
          mode="edit"
          open={editOpen}
          onOpenChange={(next) => {
            setEditOpen(next);
            if (!next) setEditInitial(null);
          }}
          profileId={profile.id}
          expectedUpdatedAt={profile.updatedAt.toISOString()}
          initial={editInitial}
        />
      ) : null}

      {/* Confirm delete */}
      <AlertDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
            <AlertDialogTitle>Deletar perfil?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{profile.name}</strong> será permanentemente removido.
              O usuário PostgreSQL <code>{profile.pgUsername}</code> será
              dropado e qualquer conexão Power BI ativa parará de funcionar.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              Deletar permanentemente
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm rotate */}
      <AlertDialog
        open={confirmRotateOpen}
        onOpenChange={setConfirmRotateOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </span>
            <AlertDialogTitle>Rotacionar senha?</AlertDialogTitle>
            <AlertDialogDescription>
              Uma nova senha será gerada para <strong>{profile.name}</strong>.
              Conexões Power BI atuais pararão de funcionar até atualizarem
              a credencial. Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRotateOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmRotate}
              disabled={isRotating}
            >
              {isRotating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              Rotacionar agora
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reveal credentials post-rotate */}
      <CredentialsRevealDialog
        open={credsOpen}
        onOpenChange={handleCredsOpenChange}
        profile={{
          id: profile.id,
          name: profile.name,
          pgUsername: profile.pgUsername,
          passwordLast4: rotatedPassword
            ? rotatedPassword.slice(-4)
            : profile.passwordLast4,
        }}
        plainPassword={rotatedPassword}
      />
    </>
  );
}

interface ItemProps {
  icon: typeof Eye;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
  renderAs?: "button" | "link";
  href?: string;
}

function ActionItem({
  icon: Icon,
  label,
  onClick,
  disabled,
  loading,
  danger,
  renderAs = "button",
  href,
}: ItemProps) {
  const className = cn(
    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground text-left transition-colors",
    "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
    disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
    danger && "text-destructive hover:bg-destructive/10",
  );

  if (renderAs === "link" && href) {
    return (
      <li role="menuitem">
        <Link href={href} className={className} onClick={onClick}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{label}</span>
        </Link>
      </li>
    );
  }

  return (
    <li role="menuitem">
      <button
        type="button"
        className={className}
        onClick={onClick}
        disabled={disabled}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className="flex-1">{label}</span>
      </button>
    </li>
  );
}

function Divider() {
  return <li className="my-1 h-px bg-border" aria-hidden="true" />;
}
