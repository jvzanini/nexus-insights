"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Users as UsersIcon,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Crown,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
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
import { RoleBadge } from "./role-badge";
import { UserFormDialog } from "./user-form-dialog";
import { EditUserDialog } from "./edit-user-dialog";
import {
  deleteUser,
  regeneratePassword,
  setUserActive,
  type UserListItem,
} from "@/lib/actions/users";
import {
  canCreateRole,
  canDeleteUser,
  canDeactivateUser,
  canEditUser,
} from "@/lib/permissions";
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

const ALL_ROLES: PlatformRole[] = [
  "super_admin",
  "admin",
  "manager",
  "viewer",
];

export function UsersTable({
  users,
  currentUser,
  accountOptions,
  teamOptions,
  hideHeader = false,
}: {
  users: UserListItem[];
  currentUser: AuthUser;
  accountOptions: AccountOption[];
  teamOptions: TeamOption[];
  hideHeader?: boolean;
}) {
  const router = useRouter();
  const [openCreate, setOpenCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const allowedRoles = ALL_ROLES.filter((r) => canCreateRole(currentUser, r));
  const isSuperAdmin = currentUser.platformRole === "super_admin";

  function handleStatusChange(u: UserListItem, value: string) {
    const nextActive = value === "ativo";
    if (nextActive === u.isActive) return;
    start(async () => {
      const result = await setUserActive(u.id, nextActive);
      if (result.success) {
        toast.success(nextActive ? "Usuário ativado" : "Usuário desativado");
      } else {
        toast.error(result.error ?? "Erro");
      }
    });
  }

  function handleRegen(id: string) {
    start(async () => {
      const result = await regeneratePassword(id);
      if (result.success && result.data) {
        toast.success("Nova senha enviada por e-mail", {
          description: `Temp: ${result.data.tempPassword}`,
          duration: 12000,
        });
      } else {
        toast.error(result.error ?? "Erro");
      }
    });
  }

  function handleDelete(id: string) {
    start(async () => {
      const result = await deleteUser(id);
      if (result.success) {
        toast.success("Usuário excluído");
        setConfirmDelete(null);
      } else {
        toast.error(result.error ?? "Erro");
      }
    });
  }

  function handlePencil(u: UserListItem) {
    if (u.id === currentUser.id) {
      router.push("/perfil");
      return;
    }
    setEditingId(u.id);
  }

  return (
    <div>
      {hideHeader ? (
        allowedRoles.length > 0 ? (
          <div className="mb-4 flex justify-end">
            <Button
              onClick={() => setOpenCreate(true)}
              className="cursor-pointer"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Novo usuário
            </Button>
          </div>
        ) : null
      ) : (
        <PageHeader
          icon={UsersIcon}
          title="Usuários"
          subtitle="Gerencie os usuários da plataforma"
          actions={
            allowedRoles.length > 0 ? (
              <Button
                onClick={() => setOpenCreate(true)}
                className="cursor-pointer"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Novo usuário
              </Button>
            ) : null
          }
        />
      )}

      <div className="rounded-2xl border border-border bg-muted/20 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs">Nome</TableHead>
              <TableHead className="text-xs">E-mail</TableHead>
              <TableHead className="text-xs">Nível</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Contas</TableHead>
              <TableHead className="text-xs">Criado em</TableHead>
              <TableHead className="text-xs text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-12 text-muted-foreground text-sm"
                >
                  Nenhum usuário cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const editAllowed = canEditUser(currentUser, u);
                const deactAllowed = canDeactivateUser(currentUser, u);
                const delAllowed = canDeleteUser(currentUser, u);
                const isSelf = u.id === currentUser.id;

                const showRegen = !u.isOwner && editAllowed.allowed && !isSelf;
                const showDelete =
                  !u.isOwner && isSuperAdmin && delAllowed.allowed && !isSelf;
                const statusDisabled =
                  u.isOwner || isSelf || !deactAllowed.allowed || pending;

                return (
                  <TableRow
                    key={u.id}
                    className="border-border hover:bg-muted/30"
                  >
                    <TableCell className="font-medium text-sm">
                      <span className="flex items-center gap-2">
                        {u.isOwner && (
                          <Crown className="h-3.5 w-3.5 text-purple-500" />
                        )}
                        {u.name}
                        {isSelf && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            (você)
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={u.platformRole} />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.isActive ? "ativo" : "inativo"}
                        onValueChange={(v) =>
                          handleStatusChange(u, v as string)
                        }
                        disabled={statusDisabled}
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label={`Status de ${u.name}`}
                          className="min-w-[110px]"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ativo">
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              <span className="text-emerald-600 dark:text-emerald-400">
                                Ativo
                              </span>
                            </span>
                          </SelectItem>
                          <SelectItem value="inativo">
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                              <span className="text-muted-foreground">
                                Inativo
                              </span>
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {u.accountsCount}{" "}
                        {u.accountsCount === 1 ? "conta" : "contas"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }).format(new Date(u.createdAt))}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {(editAllowed.allowed || isSelf) && (
                          <button
                            type="button"
                            onClick={() => handlePencil(u)}
                            disabled={pending}
                            aria-label={
                              isSelf
                                ? "Editar meu perfil"
                                : `Editar ${u.name}`
                            }
                            title={isSelf ? "Editar meu perfil" : "Editar"}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {showRegen && (
                          <button
                            type="button"
                            onClick={() => handleRegen(u.id)}
                            disabled={pending}
                            aria-label={`Regenerar senha de ${u.name}`}
                            title="Regenerar senha"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                        )}
                        {showDelete && (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(u.id)}
                            disabled={pending}
                            aria-label={`Excluir ${u.name}`}
                            title="Excluir"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <UserFormDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        allowedRoles={allowedRoles}
        accountOptions={accountOptions}
        teamOptions={teamOptions}
      />

      <EditUserDialog
        userId={editingId}
        onClose={() => setEditingId(null)}
        currentUser={currentUser}
        allowedRoles={allowedRoles}
        accountOptions={accountOptions}
        teamOptions={teamOptions}
      />

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. O usuário perderá acesso imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              className="bg-red-600 hover:bg-red-700 cursor-pointer"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
