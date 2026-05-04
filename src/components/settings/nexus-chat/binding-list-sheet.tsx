"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit2, Loader2, Plus, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetBody,
  SheetFooter,
  SheetHeader,
} from "@/components/ui/sheet";
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
  softDeleteCompanyChatBinding,
  updateCompanyChatBinding,
} from "@/lib/actions/nexus-chat/bindings";
import { BindingFormDialog } from "./binding-form-dialog";

export interface BindingListItem {
  id: string;
  connectionId: string;
  chatwootAccountId: number;
  displayName: string;
  enabled: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  connectionName: string;
  bindings: BindingListItem[];
}

type FormState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; binding: BindingListItem };

/**
 * Sheet lateral para listar / criar / editar / apagar bindings de uma
 * `nexus_chat_connection`.
 *
 * Toggle do switch dispara update síncrono via `useTransition` com toast
 * de confirmação. Apagar pede confirmação via AlertDialog.
 */
export function BindingListSheet({
  open,
  onOpenChange,
  connectionId,
  connectionName,
  bindings,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BindingListItem | null>(
    null,
  );
  const [form, setForm] = useState<FormState>({ mode: "closed" });

  function handleToggle(b: BindingListItem) {
    setTogglingId(b.id);
    startTransition(async () => {
      const result = await updateCompanyChatBinding(b.id, { enabled: !b.enabled });
      setTogglingId(null);
      if (!result.success) {
        toast.error(result.error ?? "Falha ao atualizar empresa.");
        return;
      }
      toast.success(
        !b.enabled ? "Empresa ativada." : "Empresa desativada.",
      );
      router.refresh();
    });
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      const result = await softDeleteCompanyChatBinding(id);
      setDeleteTarget(null);
      if (!result.success) {
        toast.error(result.error ?? "Falha ao apagar empresa.");
        return;
      }
      toast.success("Empresa removida.");
      router.refresh();
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} width={480}>
        <SheetHeader onClose={() => onOpenChange(false)}>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Empresas em
            </span>
            <span className="truncate font-heading text-base font-semibold text-foreground">
              {connectionName}
            </span>
          </div>
        </SheetHeader>

        <SheetBody className="px-0 py-0">
          <div className="border-b border-border px-5 py-3">
            <Button
              type="button"
              size="sm"
              onClick={() => setForm({ mode: "create" })}
              className="cursor-pointer"
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              Nova empresa
            </Button>
          </div>

          {bindings.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <Building2
                className="h-7 w-7 text-muted-foreground"
                aria-hidden
              />
              <p className="text-sm font-medium text-foreground">
                Nenhuma empresa cadastrada nesta conexão.
              </p>
              <p className="text-xs text-muted-foreground">
                Cada empresa corresponde a um{" "}
                <span className="font-mono">chatwoot_account_id</span> dentro
                da instalação.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => setForm({ mode: "create" })}
                className="mt-2 cursor-pointer"
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                Nova empresa
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {bindings.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {b.displayName}
                      </p>
                      <span
                        data-testid={`binding-account-${b.id}`}
                        className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums ring-1 ring-inset ring-border"
                      >
                        #{b.chatwootAccountId}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {b.enabled ? "Ativa" : "Inativa"}
                    </p>
                  </div>

                  <Switch
                    data-testid={`binding-toggle-${b.id}`}
                    checked={b.enabled}
                    onCheckedChange={() => handleToggle(b)}
                    disabled={pending && togglingId === b.id}
                    aria-label={
                      b.enabled ? "Desativar empresa" : "Ativar empresa"
                    }
                  />

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setForm({ mode: "edit", binding: b })}
                      aria-label="Editar empresa"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Edit2 className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(b)}
                      aria-label="Apagar empresa"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SheetBody>

        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            Fechar
          </Button>
        </SheetFooter>
      </Sheet>

      {form.mode !== "closed" ? (
        <BindingFormDialog
          mode={form.mode}
          open
          onOpenChange={(open) => {
            if (!open) setForm({ mode: "closed" });
          }}
          connectionId={connectionId}
          binding={form.mode === "edit" ? form.binding : null}
        />
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  A empresa <strong>{deleteTarget.displayName}</strong> (account
                  ID #{deleteTarget.chatwootAccountId}) será removida (soft
                  delete). Os dados históricos permanecem.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="binding-delete-confirm"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={pending}
              className="cursor-pointer"
            >
              {pending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
