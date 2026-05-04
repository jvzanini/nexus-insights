"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit2, Loader2, Plus, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

export interface BindingTableItem {
  id: string;
  connectionId: string;
  chatwootAccountId: number;
  displayName: string;
  enabled: boolean;
}

type FormState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; binding: BindingTableItem };

interface Props {
  connectionId: string;
  bindings: BindingTableItem[];
}

export function BindingsTable({ connectionId, bindings }: Props) {
  const router = useRouter();
  const [formState, setFormState] = useState<FormState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = useState<BindingTableItem | null>(
    null,
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleToggleEnabled(binding: BindingTableItem, next: boolean) {
    setPendingId(binding.id);
    startTransition(async () => {
      const result = await updateCompanyChatBinding(binding.id, {
        enabled: next,
      });
      setPendingId(null);
      if (!result.success) {
        toast.error(result.error ?? "Falha ao atualizar empresa.");
        return;
      }
      toast.success(next ? "Empresa ativada" : "Empresa desativada");
      router.refresh();
    });
  }

  function handleDelete() {
    if (!pendingDelete) return;
    setPendingId(pendingDelete.id);
    startTransition(async () => {
      const result = await softDeleteCompanyChatBinding(pendingDelete.id);
      setPendingId(null);
      const target = pendingDelete;
      setPendingDelete(null);
      if (!result.success) {
        toast.error(result.error ?? "Falha ao remover empresa.");
        return;
      }
      toast.success(`Empresa "${target.displayName}" removida.`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-500/10 p-2 text-violet-500">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Empresas vinculadas</h3>
              <p className="text-xs text-muted-foreground">
                Cada empresa corresponde a um <code>account_id</code> no Nexus Chat.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setFormState({ mode: "create" })}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova empresa
          </Button>
        </div>

        {bindings.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-background/50 px-4 py-12 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Nenhuma empresa vinculada nesta conexão.
            </p>
            <p className="text-xs text-muted-foreground/70">
              Clique em <strong>Nova empresa</strong> para vincular um <code>account_id</code> do Nexus Chat.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-background/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Empresa</th>
                  <th className="px-3 py-2 font-medium">Account ID</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {bindings.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-border/60 last:border-b-0 hover:bg-muted/20"
                  >
                    <td className="px-3 py-2.5 font-medium">{b.displayName}</td>
                    <td className="px-3 py-2.5">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">
                        #{b.chatwootAccountId}
                      </code>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={b.enabled}
                          disabled={pendingId === b.id}
                          onCheckedChange={(v) => handleToggleEnabled(b, v)}
                          aria-label={
                            b.enabled
                              ? "Desativar empresa"
                              : "Ativar empresa"
                          }
                        />
                        <span className="text-xs text-muted-foreground">
                          {b.enabled ? "Ativa" : "Pausada"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Editar empresa ${b.displayName}`}
                          title="Editar empresa"
                          disabled={pendingId === b.id}
                          onClick={() =>
                            setFormState({ mode: "edit", binding: b })
                          }
                          className="h-8 w-8"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remover empresa ${b.displayName}`}
                          title="Remover empresa"
                          disabled={pendingId === b.id}
                          onClick={() => setPendingDelete(b)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          {pendingId === b.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formState.mode !== "closed" && (
        <BindingFormDialog
          mode={formState.mode}
          open
          onOpenChange={(open) => {
            if (!open) setFormState({ mode: "closed" });
          }}
          connectionId={connectionId}
          binding={formState.mode === "edit" ? formState.binding : null}
        />
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{pendingDelete?.displayName}</strong> será removida
              (soft delete). Você pode recriar com o mesmo <code>account_id</code> depois se precisar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
