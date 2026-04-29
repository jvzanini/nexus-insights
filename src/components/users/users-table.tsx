"use client";

import { useState, useTransition } from "react";
import { Users as UsersIcon, Plus, Pencil, Trash2, RefreshCw, Crown } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

interface AccountOption { id: number; name: string }
interface TeamOption { id: number; name: string }

const ALL_ROLES: PlatformRole[] = ["super_admin", "admin", "manager", "viewer"];

export function UsersTable({
  users,
  currentUser,
  accountOptions,
  teamOptions,
}: {
  users: UserListItem[];
  currentUser: AuthUser;
  accountOptions: AccountOption[];
  teamOptions: TeamOption[];
}) {
  const [openDialog, setOpenDialog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const allowedRoles = ALL_ROLES.filter((r) => canCreateRole(currentUser, r));

  function handleToggleActive(u: UserListItem) {
    start(async () => {
      const result = await setUserActive(u.id, !u.isActive);
      if (result.success) {
        toast.success(u.isActive ? "Usuário desativado" : "Usuário ativado");
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

  return (
    <div>
      <PageHeader
        icon={UsersIcon}
        title="Usuários"
        subtitle="Gerencie os usuários da plataforma"
        actions={
          allowedRoles.length > 0 ? (
            <Button onClick={() => setOpenDialog(true)} className="cursor-pointer">
              <Plus className="h-4 w-4 mr-1.5" />
              Novo usuário
            </Button>
          ) : null
        }
      />

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
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  Nenhum usuário cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const editAllowed = canEditUser(currentUser, u);
                const delAllowed = canDeleteUser(currentUser, u);
                const deactAllowed = canDeactivateUser(currentUser, u);

                return (
                  <TableRow key={u.id} className="border-border hover:bg-muted/30">
                    <TableCell className="font-medium text-sm">
                      <span className="flex items-center gap-2">
                        {u.isOwner && <Crown className="h-3.5 w-3.5 text-purple-500" />}
                        {u.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <RoleBadge role={u.platformRole} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={u.isActive}
                          disabled={!deactAllowed.allowed || pending}
                          onCheckedChange={() => handleToggleActive(u)}
                        />
                        <span className={`text-xs ${u.isActive ? "text-emerald-500" : "text-muted-foreground"}`}>
                          {u.isActive ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {u.accountsCount} {u.accountsCount === 1 ? "conta" : "contas"}
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
                        {editAllowed.allowed && (
                          <button
                            type="button"
                            onClick={() => handleRegen(u.id)}
                            disabled={pending}
                            title="Reenviar senha temporária"
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {delAllowed.allowed && (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(u.id)}
                            disabled={pending}
                            title="Excluir"
                            className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
        open={openDialog}
        onOpenChange={setOpenDialog}
        allowedRoles={allowedRoles}
        accountOptions={accountOptions}
        teamOptions={teamOptions}
      />

      <AlertDialog open={confirmDelete !== null} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. O usuário perderá acesso imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
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
