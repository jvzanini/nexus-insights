"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  createCompanyChatBinding,
  updateCompanyChatBinding,
} from "@/lib/actions/nexus-chat/bindings";
import type { BindingListItem } from "./binding-list-sheet";

type Mode = "create" | "edit";

interface Props {
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  binding: BindingListItem | null;
}

interface FormState {
  chatwootAccountId: string;
  displayName: string;
  enabled: boolean;
}

const DEFAULT_FORM: FormState = {
  chatwootAccountId: "",
  displayName: "",
  enabled: true,
};

/**
 * Dialog para criar/editar binding (empresa) dentro de uma connection.
 *
 * - Em `mode="edit"` o `chatwoot_account_id` fica read-only (constraint
 *   operacional: não permitir mover empresa entre connections via update).
 * - Submit usa `useTransition`; toast Sonner para feedback.
 */
export function BindingFormDialog({
  mode,
  open,
  onOpenChange,
  connectionId,
  binding,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && binding) {
      setForm({
        chatwootAccountId: String(binding.chatwootAccountId),
        displayName: binding.displayName,
        enabled: binding.enabled,
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [open, mode, binding]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const accountId = Number(form.chatwootAccountId);
    if (mode === "create" && (!Number.isInteger(accountId) || accountId <= 0)) {
      toast.error("Account ID deve ser um inteiro positivo.");
      return;
    }

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createCompanyChatBinding({
              connectionId,
              chatwootAccountId: accountId,
              displayName: form.displayName.trim(),
              enabled: form.enabled,
            })
          : await updateCompanyChatBinding(binding!.id, {
              displayName: form.displayName.trim(),
              enabled: form.enabled,
            });

      if (!result.success) {
        toast.error(result.error ?? "Falha ao salvar empresa.");
        return;
      }
      toast.success(
        mode === "create" ? "Empresa cadastrada." : "Empresa atualizada.",
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Nova empresa" : "Editar empresa"}
            </DialogTitle>
            <DialogDescription>
              Vincula um <code className="font-mono">chatwoot_account_id</code>{" "}
              à conexão. Account ID precisa ser único entre conexões ativas.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bind-account">Account ID (Chatwoot)</Label>
              <Input
                id="bind-account"
                type="number"
                min={1}
                value={form.chatwootAccountId}
                onChange={(e) =>
                  update("chatwootAccountId", e.target.value)
                }
                placeholder="42"
                disabled={pending || mode === "edit"}
                required
              />
              {mode === "edit" ? (
                <p className="text-[11px] text-muted-foreground">
                  Account ID não pode ser alterado após criação.
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="bind-name">Nome de exibição</Label>
              <Input
                id="bind-name"
                value={form.displayName}
                onChange={(e) => update("displayName", e.target.value)}
                placeholder="ex.: Matrix Fitness"
                autoComplete="off"
                disabled={pending}
                required
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="min-w-0">
                <Label htmlFor="bind-enabled" className="cursor-pointer">
                  Ativa
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Bindings inativos não aparecem em relatórios nem em jobs.
                </p>
              </div>
              <Switch
                id="bind-enabled"
                checked={form.enabled}
                onCheckedChange={(value) => update("enabled", value)}
                disabled={pending}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="cursor-pointer">
              {pending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
