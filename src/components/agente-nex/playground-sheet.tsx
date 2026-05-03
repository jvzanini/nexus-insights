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
 *  - Footer sticky com input bar idêntico à bubble do Nex (Mic externo + inner
 *    area unificada + Send violet gradient). Suporta áudio via Whisper quando
 *    audioInputEnabled E providerKey === "openai".
 *  - Erros vêm via toast (sonner) — sem alert inline (Sheet é apertado).
 *  - Não persiste em localStorage; ao desmontar, perde a conversa.
 *  - Dialog "Ver prompt usado" abre com z-[60] (DialogContent + overlay) para
 *    sobrepor o Sheet (que é z-50).
 *
 * Decisões de UI/UX (validadas via ui-ux-pro-max):
 *  - Touch target ≥44px no botão Enviar (h-9 w-9 + hit area implícita do form).
 *  - aria-live="polite" no body pra screen readers acompanharem novas msgs.
 *  - Loader2 com motion-reduce: respeitar prefers-reduced-motion.
 *  - Cap de input: 1000 chars (mesmo do action; valida no client antes).
 *  - FIFO: ao exceder 20 msgs, descartamos do INÍCIO do array (mais antigas).
 *  - Send violet gradient: from-violet-600 to-violet-500 (bubble parity).
 *  - Mic externo: só em idle E quando audioEnabled. Some em recording pra
 *    liberar espaço pro embedded recorder.
 *  - Whisper só funciona com OpenAI; gating via providerKey === "openai"
 *    (string-match em providerLabel é frágil, evitado).
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Eraser, Eye, Loader2, MessageSquare, Mic, Send } from "lucide-react";
import { toast } from "sonner";

import { AudioRecorder, type AudioRecorderHandle } from "@/components/nex/audio-recorder";
import { NexMessage } from "@/components/nex/nex-message";
import { SuggestionsBar } from "@/components/nex/suggestions-bar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetBody, SheetHeader } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { sendNexMessage } from "@/lib/actions/nex-chat";
import { previewSystemPromptAction } from "@/lib/actions/nex-prompt";
import type { ChatMessage, LlmProvider } from "@/lib/llm/types";
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
  /** v0.31.0: sugestões clicáveis emitidas pelo agente após a resposta. */
  suggestions?: string[];
}

export interface PlaygroundSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentConfig: NexPromptConfig;
  /** Key canonic do provider — usado pra gating de áudio (Whisper só OpenAI). */
  providerKey: LlmProvider | null;
  /** Label legível do provider (ex.: "OpenAI"). */
  providerLabel?: string;
  /** Label legível do modelo (ex.: "GPT-5.4"). */
  modelLabel?: string;
}

function genId(): string {
  // Suficiente pro key local (efêmero); evitar dependência de crypto p/ jest.
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PlaygroundSheet({
  open,
  onOpenChange,
  currentConfig,
  providerKey,
  providerLabel,
  modelLabel,
}: PlaygroundSheetProps) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [message, setMessage] = useState<string>("");
  const [isSending, startSend] = useTransition();
  const [isPreviewLoading, startPreview] = useTransition();

  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewText, setPreviewText] = useState<string>("");
  // v0.28.0: Sheet suppress quando Dialog "Ver prompt usado" abre — evita
  // dispute de focus + z-index entre Sheet (z-50) e Dialog (z-[70]).
  const [sheetSuppressed, setSheetSuppressed] = useState<boolean>(false);

  // Áudio (paridade com nex-chat-panel).
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [audioFlight, setAudioFlight] = useState<boolean>(false);

  const bodyRef = useRef<HTMLDivElement | null>(null);

  const trimmed = message.trim();
  const overLimit = message.length > MAX_INPUT_LEN;
  const canSubmit =
    trimmed.length > 0 && !overLimit && !isSending && !isPreviewLoading;

  /**
   * Gating de áudio: toggle do prompt + provider OpenAI (único que tem Whisper).
   * String-match em providerLabel seria frágil; usamos a key canonic.
   */
  const audioEnabled =
    currentConfig.audioInputEnabled && providerKey === "openai";

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

  /**
   * Envia uma mensagem de texto direto.
   *
   * v0.28: usa `sendNexMessage` (mesma action da bubble) com histórico completo
   * — substituindo `testNexPromptAction(text, cfg)` que enviava só a msg atual
   * sem contexto. Trade-off: o playground deixou de testar "prompt em edição"
   * (não usa mais cfg do form); usa o prompt do DB direto. User aprovou:
   * prefere qualidade idêntica à bubble do que testar prompt antes de salvar.
   *
   * Construímos o histórico ANTES de `appendItems` pra evitar closure stale —
   * `items` no momento da chamada já reflete o estado correto pré-submit.
   */
  function submitMessage(text: string) {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    if (trimmedText.length > MAX_INPUT_LEN) {
      toast.error(`Mensagem acima de ${MAX_INPUT_LEN} chars.`);
      return;
    }

    // Histórico = msgs já no estado (apenas user/assistant) + nova user msg.
    const history: ChatMessage[] = [
      ...items
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      { role: "user", content: trimmedText },
    ];

    const userItem: ChatItem = {
      id: genId(),
      role: "user",
      content: trimmedText,
    };
    appendItems([userItem]);
    setMessage("");

    startSend(async () => {
      try {
        // v0.31.0: isPlayground=true → log marcado, sem persistência de
        // mensagens no histórico do bubble.
        const r = await sendNexMessage(history, { isPlayground: true });
        if (!r.ok) {
          toast.error(
            `Erro: ${r.error}. Verifique chave/modelo em Configuração.`,
          );
          return;
        }
        appendItems([
          {
            id: genId(),
            role: "assistant",
            content: r.message,
            suggestions: r.suggestions,
          },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(
          `Erro: ${msg}. Verifique chave/modelo em Configuração.`,
        );
      }
    });
  }

  /**
   * v0.31.0 — consume + envia: limpa as sugestões da msg (pra não reaparecerem
   * depois) e dispara `submitMessage(suggestion)` como nova msg do user.
   * Idêntico ao handlePickSuggestion do nex-chat-panel.
   */
  const handlePickSuggestion = useCallback(
    (msgId: string, suggestion: string) => {
      setItems((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, suggestions: undefined } : m,
        ),
      );
      submitMessage(suggestion);
    },
    // submitMessage é declarada inline (não memoizada). useCallback aqui só
    // serve pra dar identidade estável ao handler — submitMessage lê state via
    // closure de cada render, então a dep não muda comportamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function handleSendClick() {
    if (isRecording) {
      recorderRef.current?.sendNow();
      return;
    }
    submitMessage(message);
  }

  async function handleSendAudio(blob: Blob, _durationSeconds: number) {
    if (audioFlight) return;
    setAudioFlight(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "recording.webm");
      fd.append("language", "pt");
      const res = await fetch("/api/nex/transcribe", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) detail = data.error;
        } catch {
          /* noop */
        }
        toast.error(`Falha ao transcrever áudio: ${detail}`);
        return;
      }
      const data = (await res.json()) as { text?: string };
      const text = (data?.text ?? "").trim();
      if (!text) {
        toast.error("Não conseguimos entender o áudio. Tente de novo.");
        return;
      }
      submitMessage(text);
    } catch (err) {
      toast.error(
        `Falha ao transcrever áudio: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setAudioFlight(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra linha (padrão chat moderno).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isSending && !isPreviewLoading && !audioFlight) {
        submitMessage(message);
      }
    }
  }

  function handleClearHistory() {
    setItems([]);
    setMessage("");
  }

  function handleOpenPreview() {
    startPreview(async () => {
      try {
        const result = await previewSystemPromptAction(cfgSnapshot);
        if (!result.ok || !result.data) {
          toast.error(
            `Erro: ${result.error ?? "não foi possível carregar o prompt"}. Verifique chave/modelo em Configuração.`,
          );
          return;
        }
        setPreviewText(result.data.composedPrompt);
        // v0.28.0: Sheet sai do caminho antes do Dialog abrir.
        setSheetSuppressed(true);
        setPreviewOpen(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Erro inesperado: ${msg}`);
      }
    });
  }

  return (
    <>
      <Sheet open={open && !sheetSuppressed} onOpenChange={onOpenChange} width={480}>
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
              items.map((item, idx) => {
                const isLastAssistant =
                  item.role === "assistant" &&
                  idx === items.length - 1 &&
                  !isSending;
                return (
                  <React.Fragment key={item.id}>
                    <NexMessage role={item.role} content={item.content} />
                    {isLastAssistant &&
                    item.suggestions &&
                    item.suggestions.length > 0 ? (
                      <SuggestionsBar
                        suggestions={item.suggestions}
                        onPick={(s) => handlePickSuggestion(item.id, s)}
                      />
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
            {isSending ? <NexMessage role="loading" content="" /> : null}
          </div>
        </SheetBody>

        {/*
          Footer HTML normal (não SheetFooter sticky) — paridade visual com
          nex-chat-panel: Mic externo redondo + inner area unificada + Send
          violet retangular. Counter inline removido (visual mais limpo;
          maxLength do textarea já blocka excesso).
        */}
        <footer className="border-t border-border bg-background/60 px-3 pt-3 pb-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendClick();
            }}
            className="flex items-end gap-2"
          >
            {/*
              Mic externo: aparece SÓ em idle (à esquerda da inner area). Some
              quando gravando ou em flight pra liberar espaço pro embedded
              recorder e evitar UX confuso.
            */}
            {audioEnabled && !isRecording && !audioFlight ? (
              <button
                type="button"
                onClick={() => {
                  void recorderRef.current?.start();
                }}
                aria-label="Gravar áudio"
                className={cn(
                  "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors",
                  "hover:bg-muted hover:text-foreground",
                  "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
                )}
              >
                <Mic className="h-4 w-4" />
              </button>
            ) : null}

            {/*
              Inner area: container unificado idle/recording. Trocamos só o
              conteúdo dentro: Textarea OU AudioRecorder embedded. Mesmo
              padding/borda/focus-within ring da bubble.
            */}
            <div
              className={cn(
                "flex min-h-9 flex-1 items-center rounded-xl border border-input bg-background px-3 py-1 transition-colors",
                "focus-within:border-violet-500/60 focus-within:ring-3 focus-within:ring-violet-400/30",
              )}
            >
              {!isRecording ? (
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={MAX_INPUT_LEN}
                  rows={1}
                  placeholder="Pergunte ao agente Nex…"
                  disabled={isSending}
                  aria-label="Mensagem para o Nex"
                  className="resize-none bg-transparent text-sm leading-relaxed border-0 shadow-none focus-visible:ring-0 px-0 py-1 max-h-28"
                />
              ) : null}
              {audioEnabled ? (
                <AudioRecorder
                  ref={recorderRef}
                  mode="embedded"
                  onSend={(blob, durationSeconds) => {
                    void handleSendAudio(blob, durationSeconds);
                  }}
                  onRecordingStateChange={setIsRecording}
                />
              ) : null}
            </div>

            {/*
              Send violet — sempre no mesmo lugar. Em idle envia texto; em
              recording dispara recorder.sendNow() via handleSendClick.
            */}
            <button
              type="submit"
              aria-label={isRecording ? "Enviar áudio" : "Enviar pergunta"}
              disabled={isRecording ? false : !canSubmit || audioFlight}
              className={cn(
                "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl",
                "bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/30",
                "transition-all hover:from-violet-500 hover:to-violet-400 hover:shadow-lg",
                "focus-visible:ring-3 focus-visible:ring-violet-400/50 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
              )}
            >
              {isSending ? (
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Send className="h-4 w-4" strokeWidth={2.25} />
              )}
            </button>
          </form>
          <p
            className={cn(
              "mt-1.5 px-1 text-[11px] text-muted-foreground transition-opacity",
              isRecording ? "invisible" : "visible",
            )}
          >
            Enter envia · Shift+Enter quebra linha
          </p>
        </footer>
      </Sheet>

      <Dialog
        open={previewOpen}
        onOpenChange={(o) => {
          setPreviewOpen(o);
          // v0.28.0: restaura Sheet quando user fecha o Dialog.
          if (!o) setSheetSuppressed(false);
        }}
      >
        <DialogContent
          className="sm:max-w-3xl z-[70]"
          overlayClassName="z-[70]"
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
