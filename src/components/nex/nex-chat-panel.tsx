"use client";

/**
 * Painel de chat do Agente Nex.
 *
 * Layout:
 *  - Desktop: float bottom-right, 420px × 70vh, rounded-2xl, sombra forte.
 *  - Mobile (<sm): full-screen (top-0 bottom-0 left-0 right-0).
 *
 * Animação de abertura (Framer Motion):
 *  - Entrada: scale + slide a partir do canto inferior direito (origem do bubble).
 *  - Saída: ~70% da duração de entrada (HIG/MD: exit faster than enter).
 *
 * Acessibilidade:
 *  - role="dialog" + aria-modal + aria-labelledby
 *  - Esc fecha
 *  - Foco vai pro input ao abrir
 *  - Respeita prefers-reduced-motion
 *
 * v0.15.4 — UX bubble audio refinements:
 *  1. Input bar com layout ESTÁVEL: container externo (`flex items-end gap-2`)
 *     idêntico em idle e gravando. Inner area (a "caixa" com `flex-1`,
 *     `rounded-xl`, `border border-input`, `bg-background`, `min-h-9`) sempre
 *     no mesmo lugar — só o conteúdo interno alterna entre textarea e
 *     `<AudioRecorder mode="embedded">`. Mic externo aparece à esquerda do
 *     Send só em idle. Send externo SEMPRE no mesmo lugar/tamanho/estilo.
 *  2. Send dispara dinamicamente: idle → handleSend(input); recording → recorder.sendNow().
 *  3. Áudio aparece IMEDIATAMENTE ao enviar (player visível antes do Whisper
 *     responder). Loading "Nex pensando" abaixo. Transcrição é injetada na
 *     msg de áudio quando Whisper completa. Resposta da IA substitui loading.
 *  4. Áudios persistem em IndexedDB (saveAudio/getAudio/clearAllAudios) e são
 *     re-hidratados no reload via useEffect que cria URL.createObjectURL para
 *     mensagens kind=audio com hasStoredAudio=true. "Limpar conversa" zera
 *     IDB também.
 */

import { motion, useReducedMotion } from "framer-motion";
import {
  Mic,
  MoreVertical,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { sendNexMessage } from "@/lib/actions/nex-chat";
import type { ChatMessage } from "@/lib/llm/types";
import {
  clearAllAudios,
  getAudio,
  saveAudio,
} from "@/lib/nex/audio-storage";
import { cn } from "@/lib/utils";

import { AudioRecorder, type AudioRecorderHandle } from "./audio-recorder";
import { NexMessage, type NexMessageRole } from "./nex-message";

interface NexChatPanelProps {
  open: boolean;
  onClose: () => void;
  /** Quando `true`, exibe o botão de gravação de áudio na input bar. */
  audioInputEnabled?: boolean;
}

interface UiMessage {
  id: string;
  role: NexMessageRole;
  content: string;
  toolName?: string;
  /** Tipo de mensagem; default "text". "audio" renderiza player + transcrição. */
  kind?: "text" | "audio";
  /** Blob URL da gravação — recriado por sessão a partir do IDB. */
  audioBlobUrl?: string | null;
  /** Duração em segundos da gravação original. */
  durationSeconds?: number;
  /**
   * v0.15.4: sinaliza que o blob original foi salvo em IndexedDB e pode ser
   * re-hidratado no reload. Persiste no localStorage; o `audioBlobUrl` é
   * recriado em runtime via `getAudio(id)` → `URL.createObjectURL(blob)`.
   */
  hasStoredAudio?: boolean;
}

const STORAGE_KEY = "nex-history-v1";
const MAX_HISTORY = 40;

const SUGGESTIONS: string[] = [
  "Quantas conversas em aberto agora?",
  "Quais os 5 atendentes mais rápidos esta semana?",
  "Quantas mensagens não respondidas hoje?",
];

export function NexChatPanel({
  open,
  onClose,
  audioInputEnabled = false,
}: NexChatPanelProps) {
  const reduceMotion = useReducedMotion();
  const [messages, setMessages] = React.useState<UiMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [audioFlight, setAudioFlight] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  // True enquanto o AudioRecorder (embedded) está em recording/paused.
  // Em vez de remover o textarea/Send, alternamos só o conteúdo da inner area
  // — o layout do input bar permanece idêntico (v0.15.4 BUG #2).
  const [isRecording, setIsRecording] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const audioControllerRef = React.useRef<AbortController | null>(null);
  const recorderRef = React.useRef<AudioRecorderHandle | null>(null);

  // -------- Persistência em localStorage --------
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as UiMessage[];
        if (Array.isArray(parsed)) setMessages(parsed.slice(-MAX_HISTORY));
      }
    } catch {
      /* noop */
    }
  }, []);

  // v0.15.4: re-hidrata blobs do IndexedDB quando a lista carrega do localStorage.
  // Cada msg `kind="audio"` com `hasStoredAudio=true` mas sem `audioBlobUrl`
  // ganha um novo Blob URL criado a partir do binário salvo.
  React.useEffect(() => {
    let cancelled = false;
    const idsToHydrate = messages
      .filter(
        (m) => m.kind === "audio" && m.hasStoredAudio && !m.audioBlobUrl,
      )
      .map((m) => m.id);
    if (idsToHydrate.length === 0) return;

    void Promise.all(
      idsToHydrate.map(async (id) => {
        const blob = await getAudio(id);
        return blob ? { id, url: URL.createObjectURL(blob) } : null;
      }),
    ).then((results) => {
      if (cancelled) {
        // Se desmontamos no meio, revoga URLs criadas pra não vazar.
        for (const r of results) {
          if (r) URL.revokeObjectURL(r.url);
        }
        return;
      }
      const map = new Map<string, string>();
      for (const r of results) {
        if (r) map.set(r.id, r.url);
      }
      if (map.size === 0) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.kind === "audio" && map.has(m.id)
            ? { ...m, audioBlobUrl: map.get(m.id) ?? null }
            : m,
        ),
      );
    });

    return () => {
      cancelled = true;
    };
    // Roda quando o conjunto de IDs com áudio "stored mas sem url" muda —
    // como são strings, JSON.stringify funciona como key estável o suficiente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    messages
      .filter((m) => m.kind === "audio" && m.hasStoredAudio && !m.audioBlobUrl)
      .map((m) => m.id)
      .join(","),
  ]);

  React.useEffect(() => {
    try {
      // audioBlobUrl é uma URL de objeto (blob:) que vive só na sessão atual
      // — persistir o valor cria um link quebrado depois do reload. Mantemos
      // a transcrição (`content`), o `hasStoredAudio` (que diz se há binário
      // no IDB) e o `durationSeconds`. O blobUrl é re-hidratado no mount.
      const stripped = messages.map((m) =>
        m.kind === "audio" ? { ...m, audioBlobUrl: null } : m,
      );
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(stripped.slice(-MAX_HISTORY)),
      );
    } catch {
      /* noop */
    }
  }, [messages]);

  // -------- ESC fecha + foco no input ao abrir --------
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  // -------- Auto-scroll --------
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const handleSend = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;

      const userMsg: UiMessage = {
        id: `u_${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setPending(true);

      const history: ChatMessage[] = [
        ...messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        { role: "user", content: trimmed },
      ];

      try {
        const res = await sendNexMessage(history);
        if (res.ok) {
          setMessages((prev) => [
            ...prev,
            {
              id: `a_${Date.now()}`,
              role: "assistant",
              content: res.message,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `e_${Date.now()}`,
              role: "assistant",
              content: `**Erro:** ${res.error}`,
            },
          ]);
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `e_${Date.now()}`,
            role: "assistant",
            content: `**Erro inesperado:** ${
              err instanceof Error ? err.message : String(err)
            }`,
          },
        ]);
      } finally {
        setPending(false);
      }
    },
    [messages, pending],
  );

  /**
   * v0.15.4 — fluxo "player imediato":
   *  1. Cria audioMsg (player visível, sem transcrição) + loadingMsg ("Nex
   *     pensando") imediatamente. Salva blob em IndexedDB em paralelo.
   *  2. Faz POST /api/nex/transcribe.
   *  3. Sucesso: injeta `content: text` na audioMsg e despacha o agente.
   *     A loadingMsg permanece visível até a IA responder; quando responde,
   *     SUBSTITUI a loadingMsg pela resposta (não cria outra).
   *  4. Falha: remove loadingMsg + toast erro. Mantém o player do áudio
   *     (UX: o usuário vê que gravou, mesmo que o serviço falhou).
   */
  const handleSendAudio = React.useCallback(
    async (blob: Blob, durationSeconds: number) => {
      if (audioFlight) return;

      audioControllerRef.current?.abort();
      const controller = new AbortController();
      audioControllerRef.current = controller;

      const blobUrl = URL.createObjectURL(blob);
      const ts = Date.now();
      const audioMsgId = `ua_${ts}`;
      const loadingMsgId = `al_${ts}`;

      setAudioFlight(true);
      // Player aparece IMEDIATAMENTE (audioMsg) + loading abaixo.
      setMessages((prev) => [
        ...prev,
        {
          id: audioMsgId,
          role: "user",
          content: "",
          kind: "audio",
          audioBlobUrl: blobUrl,
          durationSeconds,
          hasStoredAudio: true,
        },
        { id: loadingMsgId, role: "loading", content: "" },
      ]);

      // Salva binário em IDB pra sobreviver ao reload (não bloqueia o fluxo).
      void saveAudio(audioMsgId, blob);

      try {
        const fd = new FormData();
        fd.append("audio", blob, "recording.webm");
        fd.append("language", "pt");

        const res = await fetch("/api/nex/transcribe", {
          method: "POST",
          body: fd,
          signal: controller.signal,
        });

        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const data = (await res.json()) as { error?: string };
            if (data?.error) detail = data.error;
          } catch {
            /* noop — resposta sem JSON */
          }
          // Remove só o loading; mantém o player do áudio (gravação preservada).
          setMessages((prev) => prev.filter((m) => m.id !== loadingMsgId));
          toast.error(`Falha ao transcrever áudio: ${detail}`);
          return;
        }

        const data = (await res.json()) as { text?: string };
        const text = (data?.text ?? "").trim();
        if (!text) {
          setMessages((prev) => prev.filter((m) => m.id !== loadingMsgId));
          toast.error("Não conseguimos entender o áudio. Tente de novo.");
          return;
        }

        // Snapshot ANTES da transcrição: serve de base do histórico
        // (não inclui audio/loading novos, evita duplicar).
        const snapshot = messages;
        // Injeta content (transcrição) na audioMsg, mantém loading visível.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === audioMsgId ? { ...m, content: text } : m,
          ),
        );

        const history: ChatMessage[] = [
          ...snapshot
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          { role: "user", content: text },
        ];

        try {
          const agentRes = await sendNexMessage(history);
          if (agentRes.ok) {
            // Substitui o loadingMsg pela resposta — preserva ordem.
            setMessages((prev) =>
              prev.map((m) =>
                m.id === loadingMsgId
                  ? {
                      id: `a_${Date.now()}`,
                      role: "assistant",
                      content: agentRes.message,
                    }
                  : m,
              ),
            );
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === loadingMsgId
                  ? {
                      id: `e_${Date.now()}`,
                      role: "assistant",
                      content: `**Erro:** ${agentRes.error}`,
                    }
                  : m,
              ),
            );
          }
        } catch (err) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === loadingMsgId
                ? {
                    id: `e_${Date.now()}`,
                    role: "assistant",
                    content: `**Erro inesperado:** ${
                      err instanceof Error ? err.message : String(err)
                    }`,
                  }
                : m,
            ),
          );
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setMessages((prev) => prev.filter((m) => m.id !== loadingMsgId));
          return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== loadingMsgId));
        toast.error(
          `Falha ao transcrever áudio: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      } finally {
        setAudioFlight(false);
        audioControllerRef.current = null;
      }
    },
    [audioFlight, messages],
  );

  // Aborta transcrição em voo no unmount.
  React.useEffect(() => {
    return () => {
      audioControllerRef.current?.abort();
      audioControllerRef.current = null;
    };
  }, []);

  const handleClear = React.useCallback(() => {
    setMessages((prev) => {
      for (const m of prev) {
        if (m.kind === "audio" && m.audioBlobUrl) {
          try {
            URL.revokeObjectURL(m.audioBlobUrl);
          } catch {
            /* noop */
          }
        }
      }
      return [];
    });
    setMenuOpen(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
    // v0.15.4: zera IDB de áudios também — "Limpar conversa" deve apagar tudo.
    void clearAllAudios();
  }, []);

  // Send button click handler (dynamic): idle → texto, recording → recorder.sendNow.
  const handleSendClick = React.useCallback(() => {
    if (isRecording) {
      recorderRef.current?.sendNow();
      return;
    }
    void handleSend(input);
  }, [handleSend, input, isRecording]);

  // -------- Animação de entrada/saída --------
  const transition = reduceMotion
    ? { duration: 0 }
    : {
        type: "spring" as const,
        stiffness: 320,
        damping: 28,
      };

  const showSuggestions = messages.length === 0;

  // Send fica habilitado quando: gravando (sempre) OU há texto OU há áudio em voo.
  // Em idle sem texto e sem voo: disabled.
  const sendDisabled = isRecording
    ? false
    : pending || audioFlight || input.trim().length === 0;

  return (
    <>
      {/* Backdrop sutil só no mobile */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] sm:hidden"
        onClick={onClose}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nex-panel-title"
        initial={
          reduceMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.92, y: 24, x: 24 }
        }
        animate={
          reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0, x: 0 }
        }
        exit={
          reduceMotion
            ? { opacity: 0, transition: { duration: 0.12 } }
            : {
                opacity: 0,
                scale: 0.94,
                y: 16,
                x: 16,
                transition: { duration: 0.16, ease: "easeIn" },
              }
        }
        transition={transition}
        style={{ transformOrigin: "bottom right" }}
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden bg-card text-foreground shadow-2xl shadow-black/30",
          "inset-0 rounded-none border-0",
          "sm:inset-auto sm:right-6 sm:bottom-24 sm:h-[70vh] sm:max-h-[640px] sm:w-[420px] sm:rounded-2xl sm:border sm:border-border",
        )}
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-2 border-b border-border bg-background/60 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/40">
              <Sparkles className="h-4.5 w-4.5" strokeWidth={2.25} />
              <span
                aria-hidden
                className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-card"
              />
            </div>
            <div>
              <h2
                id="nex-panel-title"
                className="text-sm leading-tight font-semibold tracking-tight"
              >
                Agente Nex
              </h2>
              <p className="text-xs leading-tight text-muted-foreground">
                Online · pergunte sobre os atendimentos
              </p>
            </div>
          </div>

          <div className="relative flex items-center gap-1">
            <button
              type="button"
              aria-label="Mais opções"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-violet-400/40 focus-visible:outline-none"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Fechar Agente Nex"
              onClick={onClose}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-violet-400/40 focus-visible:outline-none"
            >
              <X className="h-4 w-4" />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute top-full right-0 z-10 mt-1.5 w-48 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Limpar histórico
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {/* Histórico de mensagens */}
        <div
          ref={scrollRef}
          className="group flex-1 overflow-y-auto px-4 py-4"
        >
          {showSuggestions ? (
            <WelcomeBlock onPick={handleSend} suggestions={SUGGESTIONS} />
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <NexMessage
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  toolName={m.toolName}
                  kind={m.kind}
                  audioBlobUrl={m.audioBlobUrl}
                  durationSeconds={m.durationSeconds}
                  hasStoredAudio={m.hasStoredAudio}
                />
              ))}
              {pending ? (
                <NexMessage role="loading" content="" />
              ) : null}
            </div>
          )}
        </div>

        {/* Input bar — layout estável v0.15.4. */}
        <footer className="border-t border-border bg-background/60 px-3 pt-3 pb-3 sm:pb-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendClick();
            }}
            className="flex items-end gap-2"
          >
            {/*
              Mic externo: aparece SÓ em idle (à esquerda da inner area).
              Some quando gravando — pra liberar espaço pro embedded recorder
              e evitar UX confuso (botão Mic ativo durante gravação).
            */}
            {audioInputEnabled && !isRecording && !audioFlight ? (
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
              Inner area: container com mesmas classes em idle e recording.
              `flex-1` + `rounded-xl border border-input bg-background min-h-9`
              garantem altura/borda/cor consistentes. Trocamos só o conteúdo
              dentro: textarea OU AudioRecorder embedded (pulse + timer + pause/cancel).
            */}
            <div
              className={cn(
                "flex min-h-9 flex-1 items-center rounded-xl border border-input bg-background px-3 py-1 transition-colors",
                "focus-within:border-violet-500/60 focus-within:ring-3 focus-within:ring-violet-400/30",
              )}
            >
              {!isRecording ? (
                <textarea
                  ref={inputRef}
                  value={input}
                  disabled={pending}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend(input);
                    }
                  }}
                  rows={1}
                  placeholder="Pergunte algo sobre o atendimento…"
                  aria-label="Mensagem para o Agente Nex"
                  className={cn(
                    "flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground",
                    "max-h-28 outline-none field-sizing-content",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                />
              ) : null}
              {/*
                AudioRecorder embedded: controlado via ref do panel.
                Em idle não renderiza nada (return null). Em recording/paused,
                renderiza só o conteúdo interno (pulse + texto + timer + pause/cancel).
                Send é externo (Send do panel chama recorder.sendNow()).
              */}
              {audioInputEnabled ? (
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
              Send externo: SEMPRE no mesmo lugar/tamanho/estilo. Comportamento
              dinâmico via handleSendClick: idle dispara texto, recording
              dispara recorder.sendNow().
            */}
            <button
              type="submit"
              aria-label={isRecording ? "Enviar áudio" : "Enviar pergunta"}
              disabled={sendDisabled}
              className={cn(
                "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl",
                "bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/30",
                "transition-all hover:from-violet-500 hover:to-violet-400 hover:shadow-lg",
                "focus-visible:ring-3 focus-visible:ring-violet-400/50 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
              )}
            >
              <Send className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </form>
          {!isRecording ? (
            <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
              Enter envia · Shift+Enter quebra linha
            </p>
          ) : null}
        </footer>
      </motion.div>

      {/* Keyframe global usado pelo loading dot */}
      <style jsx global>{`
        @keyframes nexDotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function WelcomeBlock({
  onPick,
  suggestions,
}: {
  onPick: (q: string) => void | Promise<void>;
  suggestions: string[];
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-2 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-lg shadow-violet-600/40">
        <Sparkles className="h-6 w-6" strokeWidth={2.25} />
      </div>
      <h3 className="text-base font-semibold tracking-tight">
        Olá, sou o Nex.
      </h3>
      <p className="mt-1 max-w-[18rem] text-sm text-muted-foreground">
        Pergunte sobre conversas, atendentes, mensagens. Eu consulto o banco em
        tempo real.
      </p>

      <div className="mt-6 flex w-full flex-col gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className={cn(
              "cursor-pointer rounded-xl border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition-all",
              "hover:border-violet-500/40 hover:bg-violet-600/5 hover:shadow-sm",
              "focus-visible:border-violet-500/60 focus-visible:ring-3 focus-visible:ring-violet-400/30 focus-visible:outline-none",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
