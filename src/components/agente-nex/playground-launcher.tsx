"use client";

/**
 * PlaygroundLauncher — botão "Abrir playground" usado no header da página
 * `/agente-nex/prompt`. Acopla um trigger (Button) + estado local (open) +
 * `<PlaygroundSheet>` lateral.
 *
 * v0.26.0:
 *  - Botão destacado (variant=default violet primary + Sparkles + ring sutil).
 *  - Recebe `providerKey` canonic (LlmProvider | null) além de `providerLabel`
 *    pra detecção robusta de OpenAI no PlaygroundSheet (audio gating).
 */

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PlaygroundSheet } from "@/components/agente-nex/playground-sheet";
import type { NexPromptConfig } from "@/lib/nex/prompt";
import type { LlmProvider } from "@/lib/llm/types";

interface PlaygroundLauncherProps {
  currentConfig: NexPromptConfig;
  /** Key canonic do provider — usada pra gating de áudio. null = não configurado. */
  providerKey: LlmProvider | null;
  /** Label legível do provider (ex.: "OpenAI"). undefined → não configurado. */
  providerLabel?: string;
  /** Label do modelo (ex.: "gpt-5.4-nano"). undefined → não configurado. */
  modelLabel?: string;
}

export function PlaygroundLauncher({
  currentConfig,
  providerKey,
  providerLabel,
  modelLabel,
}: PlaygroundLauncherProps) {
  const [open, setOpen] = useState<boolean>(false);
  const ready = !!providerLabel && !!modelLabel && providerKey !== null;

  return (
    <>
      <Button
        type="button"
        variant="default"
        size="default"
        onClick={() => setOpen(true)}
        disabled={!ready}
        title={
          ready
            ? "Abrir playground em painel lateral"
            : "Configure provider e modelo primeiro em /agente-nex/configuracao"
        }
        className="cursor-pointer min-h-[44px] gap-2 shadow-sm shadow-violet-600/20 ring-1 ring-violet-400/20 hover:shadow-md hover:shadow-violet-600/30 hover:ring-violet-400/40"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" strokeWidth={2.25} />
        Abrir playground
      </Button>

      <PlaygroundSheet
        open={open}
        onOpenChange={setOpen}
        currentConfig={currentConfig}
        providerKey={providerKey}
        providerLabel={providerLabel}
        modelLabel={modelLabel}
      />
    </>
  );
}
