"use client";

/**
 * PlaygroundSheet — versão lateral (Sheet side=right) do Playground do Agente
 * Nex. Substitui o `playground.tsx` antigo (será removido em T6c do plan
 * v0.16.0).
 *
 * Diferenças do antigo:
 *  - Renderiza dentro de um Sheet lateral controlado (open / onOpenChange).
 *  - Mantém HISTÓRICO local efêmero (até 20 msgs FIFO) em vez de substituir a
 *    resposta a cada submit.
 *  - Header expõe provider + modelo selecionados, botões "Limpar histórico" e
 *    "Ver prompt usado", além do close padrão do Sheet.
 *  - Footer sticky com Textarea + Enviar (Loader2 quando sending).
 *  - Erros vêm via toast (sonner) — sem alert inline (Sheet é apertado).
 *  - Não persiste em localStorage; ao desmontar, perde a conversa.
 *
 * Decisões de UI/UX (validadas via ui-ux-pro-max):
 *  - Touch target ≥44px no botão Enviar.
 *  - aria-live="polite" no body pra screen readers acompanharem novas msgs.
 *  - Loader2 com motion-reduce: respeitar prefers-reduced-motion.
 *  - Cap de input: 1000 chars (mesmo do action; valida no client antes).
 *  - FIFO: ao exceder 20 msgs, descartamos do INÍCIO do array (mais antigas).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Eraser, Eye, Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

import { NexMessage } from "@/components/nex/nex-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetBody, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { testNexPromptAction } from "@/lib/actions/nex-chat";
import { previewSystemPromptAction } from "@/lib/actions/nex-prompt";
import type { NexPromptConfig } from "@/lib/nex/prompt";
import { cn } from "@/lib/utils";

/** Cap input do Textarea (alinhado ao backend). */
const MAX_INPUT_LEN = 1000;

/** Cap do histórico exibido no Sheet. Quando ultrapassa, drop FIFO. */
export const MAX_HISTORY_MSGS = 20;

interface ChatItem {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface PlaygroundSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentConfig: NexPromptConfig;
  /** Label legível do provider (ex.: "OpenAI"). */
  providerLabel?: string;
  /** Label legível do modelo (ex.: "GPT-5.4"). */
  modelLabel?: string;
}

function counterClass(current: number, max: number): string {
  const ratio = current / max;
  if (current > max) return "text-destructive";
  if (ratio >= 0.9) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function genId(): string {
  // Suficiente pro key local (efêmero); evitar dependência de crypto p/ jest.
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PlaygroundSheet({
  open,
  onOpenChange,
  currentConfig,
  providerLabel,
  modelLabel,
}: PlaygroundSheetProps) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [message, setMessage] = useState<string>("");
  const [isSending, startSend] = useTransition();
  const [isPreviewLoading, startPreview] = useTransition();

  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewText, setPreviewText] = useState<string>("");

  const bodyRef = useRef<HTMLDivElement | null>(null);

  const trimmed = message.trim();
  const overLimit = message.length > MAX_INPUT_LEN;
  const canSubmit =
    trimmed.length > 0 && !overLimit && !isSending && !isPreviewLoading;

  const cfgSnapshot = useMemo(() => currentConfig, [currentConfig]);

  const headerLabel = useMemo(() => {
    const parts = ["Playground"];
    if (providerLabel) parts.push(providerLabel);
    if (modelLabel) parts.push(modelLabel);
    return parts.join(" · ");
  }, [providerLabel, modelLabel]);

  // Auto-scroll pro fim quando chega mensagem nova.
  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [items]);

  const appendItems = useCallback((next: ChatItem[]) => {
    setItems((prev) => {
      const combined = [...prev, ...next];
      // FIFO: mantém apenas as últimas MAX_HISTORY_MSGS.
      if (combined.length <= MAX_HISTORY_MSGS) return combined;
      return combined.slice(combined.length - MAX_HISTORY_MSGS);
    });
  }, []);

  function handleSubmit() {
    if (!trimmed) return;
    if (overLimit) return;

    const userItem: ChatItem = {
      id: genId(),
      role: "user",
      content: trimmed,
    };
    // Renderiza msg do user imediatamente; resposta vem após o action.
    appendItems([userItem]);
    setMessage("");

    startSend(async () => {
      try {
        const r = await testNexPromptAction(trimmed, cfgSnapshot);
        if (!r.ok) {
          toast.error(
            `Erro: ${r.error}. Verifique chave/modelo em Configuração.`,
          );
          return;
        }
        appendItems([
          { id: genId(), role: "assistant", content: r.message },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(
          `Erro: ${msg}. Verifique chave/modelo em Configuração.`,
        );
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra linha (padrão chat moderno).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) handleSubmit();
    }
  }

  function handleClearHistory() {
    setItems([]);
    setMessage("");
  }

  function handleOpenPreview() {
    startPreview(async () => {
      const result = await previewSystemPromptAction(cfgSnapshot);
      if (!result.ok || !result.data) {
        toast.error(
          `Erro: ${result.error ?? "não foi possível carregar o prompt"}. Verifique chave/modelo em Configuração.`,
        );
        return;
      }
      setPreviewText(result.data.composedPrompt);
      setPreviewOpen(true);
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} width={480}>
        <SheetHeader onClose={() => onOpenChange(false)}>
          <div className="flex flex-col gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <MessageSquare
                className="h-4 w-4 shrink-0 text-violet-500"
                aria-hidden="true"
              />
              <span className="truncate">{headerLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleClearHistory}
                disabled={items.length === 0 || isSending}
                className="cursor-pointer h-8 text-xs"
              >
                <Eraser className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Limpar histórico
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleOpenPreview}
                disabled={isPreviewLoading}
                className="cursor-pointer h-8 text-xs"
              >
                {isPreviewLoading ? (
                  <Loader2
                    className="mr-1.5 h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                )}
                Ver prompt usado
              </Button>
            </div>
          </div>
        </SheetHeader>

        <SheetBody className="space-y-3" >
          <div
            ref={bodyRef}
            aria-live="polite"
            className="flex h-full flex-col gap-3"
          >
            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/30 px-6 py-8 text-center">
                <MessageSquare
                  className="h-6 w-6 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-foreground">
                  Comece uma conversa de teste
                </p>
                <p className="text-xs text-muted-foreground">
                  Mensagens não são salvas no histórico nem logam consumo.
                  Limite de {MAX_HISTORY_MSGS} mensagens por sessão.
                </p>
              </div>
            ) : (
              items.map((item) => (
                <NexMessage
                  key={item.id}
                  role={item.role}
                  content={item.content}
                />
              ))
            )}
            {isSending ? <NexMessage role="loading" content="" /> : null}
          </div>
        </SheetBody>

        <SheetFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_INPUT_LEN}
            rows={2}
            placeholder="Pergunte algo ao Nex…"
            disabled={isSending}
            aria-label="Mensagem para o Nex"
            className="resize-none"
          />
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "text-xs tabular-nums",
                counterClass(message.length, MAX_INPUT_LEN),
              )}
              aria-live="polite"
            >
              {message.length}/{MAX_INPUT_LEN}
            </span>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="cursor-pointer min-h-[44px]"
            >
              {isSending ? (
                <Loader2
                  className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
              )}
              Enviar
            </Button>
          </div>
        </SheetFooter>
      </Sheet>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          className="sm:max-w-3xl"
          aria-label="Prompt usado nesta sessão"
        >
          <DialogHeader>
            <DialogTitle>Prompt usado nesta sessão</DialogTitle>
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
    </>
  );
}
