"use client";

/**
 * PlaygroundLauncher — botão "Abrir playground" usado no header da página
 * `/agente-nex/prompt`. Acopla um trigger (Button) + estado local (open) +
 * `<PlaygroundSheet>` lateral.
 *
 * Quando provider/modelo não estão configurados, o botão fica disabled com
 * tooltip explicativo "Configure provider e modelo primeiro" — alinhado com
 * a decisão da spec (review #21 do plan v0.16.0).
 */

import { useState } from "react";
import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PlaygroundSheet } from "@/components/agente-nex/playground-sheet";
import type { NexPromptConfig } from "@/lib/nex/prompt";

interface PlaygroundLauncherProps {
  currentConfig: NexPromptConfig;
  /** Label legível do provider (ex.: "OpenAI"). undefined → não configurado. */
  providerLabel?: string;
  /** Label do modelo (ex.: "GPT-5.4"). undefined → não configurado. */
  modelLabel?: string;
}

export function PlaygroundLauncher({
  currentConfig,
  providerLabel,
  modelLabel,
}: PlaygroundLauncherProps) {
  const [open, setOpen] = useState<boolean>(false);
  const ready = !!providerLabel && !!modelLabel;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!ready}
        title={
          ready
            ? "Abrir playground em painel lateral"
            : "Configure provider e modelo primeiro em /agente-nex/configuracao"
        }
        className="cursor-pointer"
      >
        <MessageSquare className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Abrir playground
      </Button>

      <PlaygroundSheet
        open={open}
        onOpenChange={setOpen}
        currentConfig={currentConfig}
        providerLabel={providerLabel}
        modelLabel={modelLabel}
      />
    </>
  );
}
