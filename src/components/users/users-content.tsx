"use client";

import { useEffect, useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Crown,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users as UsersIcon,
  UserX,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
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
import {
  BadgeSelect,
  type BadgeOption,
  type BadgeStyle,
} from "@/components/ui/badge-select";

import {
  deleteUser,
  listUsers,
  setUserActive,
  updateUser,
  type UserListItem,
} from "@/lib/actions/users";
import {
  canDeactivateUser,
  canDeleteUser,
  canEditUser,
} from "@/lib/permissions";
import type { PlatformRole } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth-helpers";

import { UserFormDialog } from "./user-form-dialog";

type RoleValue = PlatformRole;
type StatusValue = "active" | "inactive";

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

const ROLE_LABEL: Record<RoleValue, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Gerente",
  viewer: "Visualizador",
};

const ROLE_DESCRIPTION: Record<RoleValue, string> = {
  super_admin: "Acesso total a toda a plataforma",
  admin: "Gerencia contas e usuários",
  manager: "Gerencia departamentos atribuídos",
  viewer: "Apenas visualização",
};

function getRoleStyle(value: RoleValue): BadgeStyle {
  return { bg: ROLE_BG[value], icon: ROLE_ICON[value] };
}

function getStatusStyle(value: StatusValue): BadgeStyle {
  return value === "active"
    ? {
        bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
        icon: UserCheck,
      }
    : {
        bg: "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
        icon: UserX,
      };
}

const STATUS_OPTIONS: BadgeOption<StatusValue>[] = [
  {
    value: "active",
    label: "Ativo",
    bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
    icon: UserCheck,
  },
  {
    value: "inactive",
    label: "Inativo",
    bg: "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
    icon: UserX,
  },
];

interface UsersContentProps {
  isSuperAdmin: boolean;
  currentUser: AuthUser;
  showHeader?: boolean;
}

export function UsersContent({
  isSuperAdmin,
  currentUser,
  showHeader = true,
}: UsersContentProps) {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<UserListItem | null>(null);
  const [, startTransition] = useTransition();
  const [actionPending, setActionPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  async function load() {
    const result = await listUsers();
    if (result.success && result.data) {
      setUsers(result.data);
    } else {
      toast.error(result.error ?? "Erro ao carregar usuários");
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function openEdit(user: UserListItem) {
    setEditingUser(user);
  }

  function openCreate() {
    setCreateOpen(true);
  }

  function handleInlineRoleChange(userId: string, role: RoleValue) {
    setActionPending(true);
    startTransition(async () => {
      const result = await updateUser({ id: userId, platformRole: role });
      setActionPending(false);
      if (result.success) {
        toast.success("Nível atualizado");
        await load();
      } else {
        toast.error(result.error ?? "Erro ao atualizar nível");
      }
    });
  }

  function handleInlineStatusChange(userId: string, status: StatusValue) {
    setActionPending(true);
    startTransition(async () => {
      const result = await setUserActive(userId, status === "active");
      setActionPending(false);
      if (result.success) {
        toast.success(
          status === "active" ? "Usuário ativado" : "Usuário desativado",
        );
        await load();
      } else {
        toast.error(result.error ?? "Erro ao atualizar status");
      }
    });
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeletePending(true);
    const result = await deleteUser(confirmDelete.id);
    setDeletePending(false);
    if (result.success) {
      toast.success(`Usuário "${confirmDelete.name}" excluído com sucesso`);
      setConfirmDelete(null);
      await load();
    } else {
      toast.error(result.error ?? "Erro ao excluir usuário");
    }
  }

  function buildRoleOptions(): BadgeOption<RoleValue>[] {
    const all: RoleValue[] = isSuperAdmin
      ? ["super_admin", "admin", "manager", "viewer"]
      : ["admin", "manager", "viewer"];
    return all.map((value) => ({
      value,
      label: ROLE_LABEL[value],
      description: ROLE_DESCRIPTION[value],
      bg: ROLE_BG[value],
      icon: ROLE_ICON[value],
    }));
  }

  const roleOptions = buildRoleOptions();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      {/* Header */}
      {showHeader ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-600/10"
              aria-hidden="true"
            >
              <UsersIcon className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Usuários</h1>
              <p className="text-sm text-muted-foreground">
                Gerencie os usuários da plataforma
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={openCreate}
            className="gap-2 bg-violet-600 text-white hover:bg-violet-700 cursor-pointer transition-all duration-200"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo Usuário
          </Button>
        </motion.div>
      ) : (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={openCreate}
            className="gap-2 bg-violet-600 text-white hover:bg-violet-700 cursor-pointer transition-all duration-200"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo Usuário
          </Button>
        </div>
      )}

      {/* Tabela */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05, ease: "easeOut" }}
        className="overflow-hidden overflow-x-auto rounded-xl border border-border bg-card/50"
      >
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={5} columns={7} />
          </div>
        ) : users.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 text-muted-foreground"
            role="status"
          >
            <UsersIcon
              className="mb-3 h-12 w-12 text-muted-foreground/60"
              aria-hidden="true"
            />
            <p className="text-sm">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Nome</TableHead>
                <TableHead className="text-muted-foreground">Email</TableHead>
                <TableHead className="text-center text-muted-foreground">
                  Nível
                </TableHead>
                <TableHead className="text-center text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="text-center text-muted-foreground">
                  Contas
                </TableHead>
                <TableHead className="hidden text-center text-muted-foreground sm:table-cell">
                  Criado em
                </TableHead>
                <TableHead className="text-center text-muted-foreground">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u, index) => {
                const isSelf = u.id === currentUser.id;
                const editAllowed = canEditUser(currentUser, u);
                const deactAllowed = canDeactivateUser(currentUser, u);
                const delAllowed = canDeleteUser(currentUser, u);

                // canEditUser/canDeactivateUser/canDeleteUser já bloqueiam
                // owner e self — refletem a regra suprema: owner é imutável e
                // o próprio usuário se edita via /perfil, não pela tabela.
                const lockRole = !editAllowed.allowed;
                const lockStatus = !deactAllowed.allowed;
                const showEdit = editAllowed.allowed;
                const showDelete = delAllowed.allowed;

                const roleStyle = getRoleStyle(u.platformRole);
                const RoleIcon = roleStyle.icon;

                return (
                  <motion.tr
                    key={u.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.2,
                      delay: index * 0.03,
                      ease: "easeOut",
                    }}
                    className="border-border transition-colors duration-200 hover:bg-accent/30"
                  >
                    <TableCell className="font-medium text-foreground">
                      <span className="flex items-center gap-2">
                        {u.name}
                        {isSelf ? (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            (você)
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.email}
                    </TableCell>

                    {/* Nível */}
                    <TableCell className="text-center">
                      <div className="inline-flex justify-center">
                        {lockRole ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleStyle.bg}`}
                          >
                            <RoleIcon
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            {ROLE_LABEL[u.platformRole]}
                          </span>
                        ) : (
                          <BadgeSelect<RoleValue>
                            useFixed
                            value={u.platformRole}
                            onChange={(val) =>
                              handleInlineRoleChange(u.id, val)
                            }
                            options={roleOptions}
                            getBadgeStyle={getRoleStyle}
                            ariaLabel={`Alterar nível de ${u.name}`}
                            disabled={actionPending}
                          />
                        )}
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="text-center">
                      <div className="inline-flex justify-center">
                        {lockStatus ? (
                          (() => {
                            const style = getStatusStyle(
                              u.isActive ? "active" : "inactive",
                            );
                            const StatusIcon = style.icon;
                            return (
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.bg}`}
                              >
                                <StatusIcon
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                                {u.isActive ? "Ativo" : "Inativo"}
                              </span>
                            );
                          })()
                        ) : (
                          <BadgeSelect<StatusValue>
                            useFixed
                            minWidth={150}
                            value={u.isActive ? "active" : "inactive"}
                            onChange={(val) =>
                              handleInlineStatusChange(u.id, val)
                            }
                            options={STATUS_OPTIONS}
                            getBadgeStyle={getStatusStyle}
                            ariaLabel={`Alterar status de ${u.name}`}
                            disabled={actionPending}
                          />
                        )}
                      </div>
                    </TableCell>

                    {/* Contas */}
                    <TableCell className="text-center text-muted-foreground">
                      {u.accountsCount}
                    </TableCell>

                    {/* Criado em */}
                    <TableCell className="hidden text-center text-sm text-muted-foreground sm:table-cell">
                      {format(new Date(u.createdAt), "dd MMM yyyy HH:mm", {
                        locale: ptBR,
                      })}
                    </TableCell>

                    {/* Ações */}
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {showEdit ? (
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            aria-label={`Editar usuário ${u.name}`}
                            title="Editar usuário"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 cursor-pointer"
                          >
                            <Pencil
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          </button>
                        ) : null}
                        {showDelete ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(u)}
                            aria-label={`Excluir usuário ${u.name}`}
                            title="Excluir usuário"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 cursor-pointer"
                          >
                            <Trash2
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          </button>
                        ) : null}
                      </div>
                    </TableCell>
                  </motion.tr>
                );
              })}
            </TableBody>
          </Table>
        )}
      </motion.div>

      {/* Create */}
      <UserFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        isSuperAdmin={isSuperAdmin}
        currentUserId={currentUser.id}
        onSuccess={() => void load()}
      />

      {/* Edit */}
      <UserFormDialog
        mode="edit"
        open={editingUser !== null}
        onOpenChange={(open) => {
          if (!open) setEditingUser(null);
        }}
        user={editingUser}
        isSuperAdmin={isSuperAdmin}
        currentUserId={currentUser.id}
        onSuccess={() => {
          setEditingUser(null);
          void load();
        }}
      />

      {/* Confirmação de exclusão */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletePending) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle
                className="h-5 w-5 text-red-400"
                aria-hidden="true"
              />
              Excluir usuário
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário{" "}
              <strong className="text-foreground">
                &quot;{confirmDelete?.name}&quot;
              </strong>
              ? Esta ação é irreversível. Todas as associações com contas e
              departamentos serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deletePending}
              className="cursor-pointer"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={handleDelete}
              disabled={deletePending}
              className="gap-2 bg-red-600 text-white hover:bg-red-700 cursor-pointer transition-all duration-200"
            >
              {deletePending ? (
                <Loader2
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

export default UsersContent;
