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
}

/**
 * Wrapper client que segura o open-state do Dialog do wizard. Usado em
 * `/bancos-de-dados` (page server) — o botão "Onboardar empresa" abre o
 * Dialog que monta `<OnboardingWizard>`.
 */
export function OnboardingWizardLauncher({ connections }: Props) {
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
        Onboardar empresa
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle className="sr-only">Onboardar empresa</DialogTitle>
          <DialogDescription className="sr-only">
            Wizard de 4 etapas para vincular uma conta do Nexus Chat a uma
            conexão Postgres.
          </DialogDescription>
          <OnboardingWizard
            connections={connections}
            onClose={() => setOpen(false)}
            onSuccess={() => {
              // Mantém o wizard aberto no Step 4 para mostrar CTAs;
              // o usuário fecha manualmente via X ou Cancelar.
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
