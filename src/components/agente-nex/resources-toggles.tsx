"use client";

/**
 * Card 2 — "Recursos" do Agente Nex (super_admin only).
 *
 * Dois toggles persistidos via `saveNexPromptConfigAction`:
 *
 * 1. Entrada de áudio do usuário — habilita o microfone na bolha do Nex.
 *    Quando o provider ativo da Plataforma não é "openai", exibimos badge
 *    "(inativo — provider atual não suporta)" porque a transcrição roda em
 *    Whisper-1 da OpenAI. O Switch continua clicável (a flag é persistida
 *    mesmo assim — basta voltar para OpenAI para ativar).
 *
 * 2. Base de conhecimento — injeta os documentos da KB no system prompt.
 *
 * Aviso superior amarelo aparece apenas quando a bolha global está
 * desligada (`bubbleEnabled === false`): os recursos só funcionam com a
 * bolha ativa.
 *
 * Estratégia: optimistic update — atualizamos o state local primeiro,
 * disparamos a action; se falhar revertemos e mostramos toast de erro.
 * Após sucesso, chamamos `router.refresh()` para sincronizar com o server.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Info, Loader2, Mic } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { saveNexPromptConfigAction } from "@/lib/actions/nex-prompt";
import type { NexPromptConfig } from "@/lib/nex/prompt";
import { cn } from "@/lib/utils";

interface ResourcesTogglesProps {
  initial: NexPromptConfig;
  /** Slug do provider ativo (ex.: "openai", "anthropic"). `null` se nenhum. */
  providerAtual: string | null;
  /** True se a bolha global do Nex está habilitada na Plataforma. */
  bubbleEnabled: boolean;
}

type Field = "audio" | "kb";

export function ResourcesToggles({
  initial,
  providerAtual,
  bubbleEnabled,
}: ResourcesTogglesProps) {
  const router = useRouter();

  const [audio, setAudio] = useState<boolean>(initial.audioInputEnabled);
  const [kb, setKb] = useState<boolean>(initial.kbEnabled);
  const [pendingField, setPendingField] = useState<Field | null>(null);
  const [, startTransition] = useTransition();

  const audioSupported = providerAtual === "openai";

  function persist(next: { audio: boolean; kb: boolean }, field: Field) {
    const payload: NexPromptConfig = {
      ...initial,
      audioInputEnabled: next.audio,
      kbEnabled: next.kb,
    };
    setPendingField(field);
    startTransition(async () => {
      const result = await saveNexPromptConfigAction(payload);
      setPendingField(null);
      if (!result.ok) {
        // Reverte o optimistic update.
        if (field === "audio") setAudio((prev) => !prev);
        else setKb((prev) => !prev);
        toast.error(result.error ?? "Erro ao salvar recurso");
        return;
      }
      toast.success(
        field === "audio"
          ? next.audio
            ? "Entrada de áudio ativada"
            : "Entrada de áudio desativada"
          : next.kb
            ? "Base de conhecimento ativada"
            : "Base de conhecimento desativada",
      );
      router.refresh();
    });
  }

  function handleAudioChange(v: boolean) {
    setAudio(v);
    persist({ audio: v, kb }, "audio");
  }

  function handleKbChange(v: boolean) {
    setKb(v);
    persist({ audio, kb: v }, "kb");
  }

  return (
    <div className="space-y-3">
      {!bubbleEnabled ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <Info
            className="h-4 w-4 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="leading-snug">
            Bolha desligada — esses recursos só funcionam com a bolha ativa.
            Ative em <span className="font-medium">Configuração</span>.
          </p>
        </div>
      ) : null}

      {/* Entrada de áudio do usuário */}
      <ToggleRow
        icon={<Mic className="h-4 w-4 text-violet-500" aria-hidden="true" />}
        label={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>Entrada de áudio do usuário</span>
            {!audioSupported ? (
              <span className="text-[11px] font-normal text-amber-700 dark:text-amber-300">
                (inativo — provider atual não suporta)
              </span>
            ) : null}
          </span>
        }
        subtitle="Mostra o microfone na bolha do Nex."
        checked={audio}
        onCheckedChange={handleAudioChange}
        loading={pendingField === "audio"}
        controlsId="nex-toggle-audio"
      />

      {/* Base de conhecimento */}
      <ToggleRow
        icon={
          <BookOpen className="h-4 w-4 text-violet-500" aria-hidden="true" />
        }
        label="Base de conhecimento"
        subtitle="Injeta os documentos no prompt do agente."
        checked={kb}
        onCheckedChange={handleKbChange}
        loading={pendingField === "kb"}
        controlsId="nex-toggle-kb"
      />
    </div>
  );
}

interface ToggleRowProps {
  icon: React.ReactNode;
  label: React.ReactNode;
  subtitle: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  loading: boolean;
  controlsId: string;
}

function ToggleRow({
  icon,
  label,
  subtitle,
  checked,
  onCheckedChange,
  loading,
  controlsId,
}: ToggleRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5",
      )}
    >
      <div className="min-w-0 flex-1">
        <div
          id={`${controlsId}-label`}
          className="flex items-center gap-2 text-sm font-medium text-foreground"
        >
          {icon}
          <span className="min-w-0">{label}</span>
        </div>
        <p
          id={`${controlsId}-help`}
          className="mt-0.5 text-xs text-muted-foreground"
        >
          {subtitle}
        </p>
      </div>
      <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center">
        {loading ? (
          <Loader2
            className="absolute -left-6 h-3.5 w-3.5 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : null}
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={loading}
          aria-labelledby={`${controlsId}-label`}
          aria-describedby={`${controlsId}-help`}
        />
      </span>
    </div>
  );
}
