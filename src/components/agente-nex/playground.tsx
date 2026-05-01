"use client";

/**
 * Card 4 — "Playground" do Agente Nex (super_admin only).
 *
 * Permite testar o prompt composto a partir do estado atual da configuração
 * (currentConfig) sem persistir mensagens nem afetar o histórico do bubble.
 *
 * Fluxo:
 * 1. Usuário escreve uma mensagem (cap 1000 chars, com contador X/1000).
 * 2. Clica "Enviar" → loading + chama `testNexPromptAction(message, currentConfig)`.
 *    - `isPlayground=true` no orquestrador (não loga consumo).
 * 3. Em sucesso: mostra a resposta usando `<NexMessage role="assistant">` e
 *    libera o link "ver prompt usado" → abre Dialog com `<pre>` do prompt
 *    composto via `previewSystemPromptAction(currentConfig)`.
 * 4. Em erro: exibe mensagem técnica + sugestão "Verifique chave/modelo em
 *    Configuração."
 * 5. Botão "Nova pergunta" reseta input + response + erro.
 *
 * Observação UX:
 * - O contador muda para amarelo a partir de 90% e vermelho ao ultrapassar.
 * - Botão "Enviar" disabled quando vazio, durante loading ou texto > cap.
 * - Não persiste histórico — cada submit substitui a resposta anterior.
 */

import { useMemo, useState, useTransition } from "react";
import { Eye, Loader2, RotateCcw, Send, TriangleAlert } from "lucide-react";

import { NexMessage } from "@/components/nex/nex-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { testNexPromptAction } from "@/lib/actions/nex-chat";
import { previewSystemPromptAction } from "@/lib/actions/nex-prompt";
import type { NexPromptConfig } from "@/lib/nex/prompt";
import { cn } from "@/lib/utils";

const MAX_INPUT_LEN = 1000;

interface PlaygroundProps {
  currentConfig: NexPromptConfig;
}

function counterClass(current: number, max: number): string {
  const ratio = current / max;
  if (current > max) return "text-destructive";
  if (ratio >= 0.9) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export function Playground({ currentConfig }: PlaygroundProps) {
  const [message, setMessage] = useState<string>("");
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSend] = useTransition();
  const [isPreviewLoading, startPreview] = useTransition();
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewText, setPreviewText] = useState<string>("");

  const trimmed = message.trim();
  const overLimit = message.length > MAX_INPUT_LEN;
  const canSubmit =
    trimmed.length > 0 && !overLimit && !isSending && !isPreviewLoading;

  const hasResponse = response !== null;
  const showReset = hasResponse || error !== null;

  // Snapshot do prompt composto, para o link "ver prompt usado".
  // Recalculado por demanda (lazy) ao abrir o dialog.
  const cfgSnapshot = useMemo(() => currentConfig, [currentConfig]);

  function handleSubmit() {
    if (!trimmed) return;
    if (overLimit) return;
    setResponse(null);
    setError(null);
    startSend(async () => {
      try {
        const r = await testNexPromptAction(trimmed, cfgSnapshot);
        if (!r.ok) {
          setError(
            `Erro: ${r.error}. Verifique chave/modelo em Configuração.`,
          );
          return;
        }
        setResponse(r.message);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(
          `Erro: ${msg}. Verifique chave/modelo em Configuração.`,
        );
      }
    });
  }

  function handleReset() {
    setMessage("");
    setResponse(null);
    setError(null);
  }

  function handleOpenPreview() {
    startPreview(async () => {
      const result = await previewSystemPromptAction(cfgSnapshot);
      if (!result.ok || !result.data) {
        setError(
          `Erro: ${result.error ?? "não foi possível carregar o prompt"}. Verifique chave/modelo em Configuração.`,
        );
        return;
      }
      setPreviewText(result.data.composedPrompt);
      setPreviewOpen(true);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="nex-playground-input" className="gap-2">
            Sua pergunta
          </Label>
          <span
            className={cn(
              "text-xs tabular-nums",
              counterClass(message.length, MAX_INPUT_LEN),
            )}
            aria-live="polite"
          >
            {message.length}/{MAX_INPUT_LEN}
          </span>
        </div>
        <Textarea
          id="nex-playground-input"
          value={message}
          onChange={(e) => setMessage(e.currentTarget.value)}
          maxLength={MAX_INPUT_LEN}
          rows={3}
          placeholder="Ex.: Qual a média de tempo de resposta da última semana?"
          disabled={isSending}
          aria-describedby="nex-playground-help"
        />
        <p
          id="nex-playground-help"
          className="text-xs text-muted-foreground"
        >
          Testa o prompt com a configuração atual (não salva no histórico nem
          loga consumo).
        </p>
      </div>

      {/* Ações */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {showReset ? (
          <Button
            type="button"
            variant="ghost"
            onClick={handleReset}
            disabled={isSending}
            className="cursor-pointer min-h-[44px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Nova pergunta
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="cursor-pointer min-h-[44px]"
        >
          {isSending ? (
            <Loader2
              className="mr-1.5 h-4 w-4 animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
          )}
          Enviar
        </Button>
      </div>

      {/* Erro */}
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
        >
          <TriangleAlert
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <p className="leading-snug">{error}</p>
        </div>
      ) : null}

      {/* Resposta */}
      {hasResponse ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <NexMessage role="assistant" content={response ?? ""} />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleOpenPreview}
              disabled={isPreviewLoading}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 text-xs text-violet-600 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-violet-400",
              )}
            >
              {isPreviewLoading ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              ver prompt usado
            </button>
          </div>
        </div>
      ) : null}

      {/* Dialog "ver prompt usado" */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Prompt usado nesta resposta</DialogTitle>
            <DialogDescription>
              Texto enviado ao modelo como system prompt — composto a partir da
              configuração atual.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] rounded-lg border border-border bg-muted/40">
            <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-foreground">
              {previewText}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
