"use client";

/**
 * RotatePasswordDialog — confirma a rotação de senha do perfil Power BI.
 *
 * Mensagem de impacto:
 *  - Senha atual invalidada IMEDIATAMENTE.
 *  - Power BI Desktop pedirá nova senha na próxima refresh.
 *  - Conexões abertas podem cair com erro.
 *
 * On confirm:
 *  - Chama `rotatePasswordAction(id)` (rate-limited 10/dia).
 *  - On success → invoca `onSuccess(newPassword)` (parent abre o reveal dialog).
 *  - On error rate limit → toast "Limite de 10 rotações por dia atingido."
 *
 * Variant destructive amber porque: ação irreversível, mas reversível
 * "logicamente" (gera nova senha) e tem impacto operacional sério.
 */

import { useTransition } from "react";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { rotatePasswordAction } from "@/lib/actions/integrations-power-bi";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  profileName: string;
  /** Chamado on success com a nova senha plain (mostrada no reveal dialog). */
  onSuccess: (newPassword: string) => void;
}

export function RotatePasswordDialog({
  open,
  onOpenChange,
  profileId,
  profileName,
  onSuccess,
}: Props) {
  const [isRotating, startRotate] = useTransition();

  function handleConfirm() {
    startRotate(async () => {
      const result = await rotatePasswordAction(profileId);
      if (!result.ok || !result.data) {
        toast.error(result.error ?? "Falha ao rotacionar senha.");
        return;
      }
      toast.success("Senha rotacionada — atualize seus clientes Power BI.");
      onOpenChange(false);
      onSuccess(result.data.password);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="rotate-password-dialog">
        <AlertDialogHeader>
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <AlertDialogTitle>Rotacionar senha?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="block">
              Tem certeza que deseja rotacionar a senha de{" "}
              <strong>{profileName}</strong>?
            </span>
            <span className="mt-2 block">
              A senha atual será invalidada{" "}
              <strong className="text-amber-700 dark:text-amber-300">
                imediatamente
              </strong>
              . Power BI Desktop pedirá a nova senha na próxima refresh.
              Conexões abertas podem cair com erro.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRotating}
            className="cursor-pointer"
            data-testid="rotate-cancel-button"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isRotating}
            className="cursor-pointer border-amber-500/40 bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 hover:text-amber-900 dark:bg-amber-500/25 dark:text-amber-200 dark:hover:bg-amber-500/35 dark:hover:text-amber-100"
            data-testid="rotate-confirm-button"
          >
            {isRotating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            Rotacionar agora
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
