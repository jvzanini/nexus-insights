"use client";

/**
 * NewProfileButton — CTA "Novo perfil" que abre o ProfileWizardDialog em
 * modo "create".
 *
 * Quando `softCapReached=true`, o botão fica disabled com tooltip nativo
 * (title) explicando o limite. Em sucesso, o handler `onSuccess` (do
 * wizard) recebe `{ profile, plainPassword }` e abre o
 * `CredentialsRevealDialog`.
 */

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { ProfileWizardDialog } from "./profile-wizard-dialog";
import { CredentialsRevealDialog } from "./credentials-reveal-dialog";
import type { CreatedProfileResult } from "@/lib/actions/integrations-power-bi";

interface Props {
  softCapReached?: boolean;
  softCap?: number;
  /** Override visual quando usado em empty state. */
  size?: "default" | "lg";
}

export function NewProfileButton({
  softCapReached,
  softCap,
  size = "default",
}: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [created, setCreated] =
    useState<CreatedProfileResult | null>(null);
  const [credsOpen, setCredsOpen] = useState(false);

  function handleSuccess(result: CreatedProfileResult) {
    setCreated(result);
    setCredsOpen(true);
  }

  function handleCredsOpenChange(next: boolean) {
    setCredsOpen(next);
    if (!next) {
      // Limpa o plainPassword imediatamente após fechar.
      setCreated(null);
    }
  }

  const tooltipMsg = softCapReached
    ? `Limite de ${softCap ?? 50} perfis ativos atingido — desative ou delete um existente para criar outro.`
    : "Criar novo perfil de integração Power BI";

  return (
    <>
      <Button
        type="button"
        size={size}
        onClick={() => setWizardOpen(true)}
        disabled={softCapReached}
        title={tooltipMsg}
        aria-label="Criar novo perfil Power BI"
        data-testid="new-profile-btn"
        className="cursor-pointer"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Novo perfil
      </Button>

      <ProfileWizardDialog
        mode="create"
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSuccess={handleSuccess}
      />

      <CredentialsRevealDialog
        open={credsOpen}
        onOpenChange={handleCredsOpenChange}
        profile={
          created
            ? {
                id: created.profile.id,
                name: created.profile.name,
                pgUsername: created.profile.pgUsername,
                passwordLast4: created.profile.passwordLast4,
              }
            : null
        }
        plainPassword={created?.plainPassword ?? null}
      />
    </>
  );
}
