"use client";

/**
 * ProfileDetailActions — barra de ações no topo da detail page.
 *
 * Botões:
 *  - Conectar (link para /integracoes/power-bi/[id]/conectar) — sempre visível.
 *  - Desativar | Reativar (toggle conforme status). Server action sob `useTransition`.
 *  - Deletar (variant destructive) → abre `<DeleteProfileDialog>`.
 *
 * Mantém a lógica fora dos cards individuais pra centralizar UX e evitar
 * dois pontos de chamada de actions destrutivas (row actions já cuidam da
 * lista; aqui é a versão "página de detalhe").
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  PauseCircle,
  PlayCircle,
  Plug,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  disableProfileAction,
  reactivateProfileAction,
  type ProfileDetail,
} from "@/lib/actions/integrations-power-bi";

import { DeleteProfileDialog } from "./delete-profile-dialog";

interface Props {
  profile: ProfileDetail;
}

export function ProfileDetailActions({ profile }: Props) {
  const router = useRouter();
  const [isToggling, startToggle] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isDisabled = profile.status === "disabled";

  function handleToggle() {
    startToggle(async () => {
      const result = isDisabled
        ? await reactivateProfileAction(profile.id)
        : await disableProfileAction(profile.id);
      if (!result.ok) {
        toast.error(result.error ?? "Falha na operação.");
        return;
      }
      toast.success(
        isDisabled
          ? `Perfil "${profile.name}" reativado.`
          : `Perfil "${profile.name}" desativado.`,
      );
      router.refresh();
    });
  }

  return (
    <>
      <div
        className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end"
        data-testid="profile-detail-actions"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          render={
            <Link href={`/integracoes/power-bi/${profile.id}/conectar`} />
          }
          className="cursor-pointer"
          data-testid="action-connect"
        >
          <Plug className="h-3.5 w-3.5" aria-hidden="true" />
          Conectar
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleToggle}
          disabled={isToggling}
          className="cursor-pointer"
          data-testid="action-toggle-status"
        >
          {isToggling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : isDisabled ? (
            <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {isDisabled ? "Reativar" : "Desativar"}
        </Button>

        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setDeleteOpen(true)}
          className="cursor-pointer"
          data-testid="action-delete"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Deletar
        </Button>
      </div>

      <DeleteProfileDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        profile={{ id: profile.id, name: profile.name, pgUsername: profile.pgUsername }}
      />
    </>
  );
}
