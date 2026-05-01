"use client";

/**
 * ProfileRetryProvisionButton — botão "Repetir provisionamento" usado pelo
 * banner amarelo do summary card quando status=error.
 *
 * Reusa `updateProfileAction(id, payload, expectedUpdatedAt)` com os mesmos
 * configs atuais — re-executa o pipeline do provisioner. Se sucesso, o status
 * volta para "active" e o banner desaparece via router.refresh().
 *
 * Toasts pt-BR. Optimistic concurrency: se o perfil mudar entre o load do
 * server component e o click, o action retorna erro e mostramos toast.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { updateProfileAction } from "@/lib/actions/integrations-power-bi";

interface RetryPayload {
  name: string;
  description: string | null;
  allowedTables: string[];
  allowedColumns: Record<string, string[]>;
  accountIdFilter: number[] | null;
  teamIdFilter: number[] | null;
}

interface Props {
  profileId: string;
  expectedUpdatedAt: string;
  payload: RetryPayload;
}

export function ProfileRetryProvisionButton({
  profileId,
  expectedUpdatedAt,
  payload,
}: Props) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  function handleClick() {
    start(async () => {
      const result = await updateProfileAction(
        profileId,
        payload,
        expectedUpdatedAt,
      );
      if (!result.ok) {
        toast.error(result.error ?? "Falha ao repetir provisionamento.");
        return;
      }
      toast.success("Provisionamento repetido com sucesso.");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className="cursor-pointer border-amber-500/40 bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 hover:text-amber-900 dark:border-amber-500/40 dark:text-amber-200 dark:hover:text-amber-100"
      data-testid="retry-provision-button"
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      Repetir provisionamento
    </Button>
  );
}
