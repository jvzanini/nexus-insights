"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  OnboardingWizard,
  type WizardConnection,
} from "./onboarding-wizard";

interface Props {
  connections: WizardConnection[];
  /**
   * v0.41: quando setado, abre o wizard já com a conexão selecionada,
   * pulando direto pra Identidade. Usado na page `/bancos-de-dados/[id]`.
   */
  prefilledConnectionId?: string;
  /** Override opcional do label do botão (ex.: "Cadastrar empresa"). */
  label?: string;
}

/**
 * Wrapper client que segura o open-state do Dialog do wizard. Usado em
 * `/bancos-de-dados` (page server) e na page de detalhe da conexão para
 * abrir o wizard pré-filled com a conexão atual.
 */
export function OnboardingWizardLauncher({
  connections,
  prefilledConnectionId,
  label,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        className="cursor-pointer"
      >
        <Plus className="mr-1 h-4 w-4" aria-hidden />
        {label ?? "Cadastrar empresa"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle className="sr-only">Cadastrar empresa</DialogTitle>
          <DialogDescription className="sr-only">
            {prefilledConnectionId
              ? "Wizard de 2 etapas para vincular uma nova conta do Nexus Chat à conexão atual."
              : "Wizard de 3 etapas para vincular uma conta do Nexus Chat a uma conexão Postgres."}
          </DialogDescription>
          <OnboardingWizard
            connections={connections}
            onClose={() => setOpen(false)}
            prefilledConnectionId={prefilledConnectionId}
            onSuccess={() => {
              // Mantém o wizard aberto na conclusão para mostrar CTAs;
              // o usuário fecha manualmente via X ou Cancelar.
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
