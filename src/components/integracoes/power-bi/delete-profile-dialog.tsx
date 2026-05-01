"use client";

/**
 * DeleteProfileDialog — confirma deletar o perfil Power BI digitando o
 * nome exato (case-sensitive, sem trim).
 *
 * Comparação: `typed === profile.name` exato. Sem `.trim()`, sem lowercase.
 * Se o usuário digitar com espaço extra ou com case diferente, o botão
 * permanece disabled — proteção contra "click-through" acidental.
 *
 * On confirm:
 *  - Chama `deleteProfileAction(id)`.
 *  - On success → toast + redirect `/integracoes/power-bi`.
 *  - On error → toast vermelho com mensagem.
 */

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteProfileAction } from "@/lib/actions/integrations-power-bi";

interface ProfileShape {
  id: string;
  name: string;
  pgUsername: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProfileShape;
  /** Override do redirect após deletar. Default: /integracoes/power-bi. */
  redirectTo?: string;
}

export function DeleteProfileDialog({
  open,
  onOpenChange,
  profile,
  redirectTo = "/integracoes/power-bi",
}: Props) {
  const router = useRouter();
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const [isDeleting, startDelete] = useTransition();

  // Reset do campo quando dialog (re)abre — segurança UX.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) setTyped("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  // Comparação case-sensitive exato (sem trim) conforme spec/plan Q22.
  const matches = typed === profile.name;
  const isConfirmDisabled = !matches || isDeleting;

  function handleConfirm() {
    if (!matches) return;
    startDelete(async () => {
      const result = await deleteProfileAction(profile.id);
      if (!result.ok) {
        toast.error(result.error ?? "Falha ao deletar perfil.");
        return;
      }
      toast.success(`Perfil "${profile.name}" deletado.`);
      onOpenChange(false);
      router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="delete-profile-dialog">
        <AlertDialogHeader>
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <AlertDialogTitle>Deletar perfil?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="block">
              Esta ação remove o perfil{" "}
              <strong className="text-destructive">permanentemente</strong>{" "}
              (soft-delete). O usuário PostgreSQL{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">
                {profile.pgUsername}
              </code>{" "}
              + views derivadas serão dropados. Conexões Power BI ativas
              cairão.
            </span>
            <span className="mt-3 block text-foreground">
              Para confirmar, digite exatamente:{" "}
              <code
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]"
                data-testid="delete-confirm-name"
              >
                {profile.name}
              </code>
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-2">
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-xs font-medium text-foreground"
          >
            Nome do perfil
          </label>
          <Input
            id={inputId}
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.currentTarget.value)}
            placeholder={profile.name}
            disabled={isDeleting}
            autoComplete="off"
            spellCheck={false}
            data-testid="delete-confirm-input"
            aria-invalid={typed.length > 0 && !matches}
          />
          {typed.length > 0 && !matches ? (
            <p className="mt-1.5 text-[11px] text-destructive">
              O nome digitado não corresponde exatamente ao nome do perfil.
            </p>
          ) : null}
        </div>

        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            className="cursor-pointer"
            data-testid="delete-cancel-button"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className="cursor-pointer"
            data-testid="delete-confirm-button"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
            Deletar permanentemente
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
