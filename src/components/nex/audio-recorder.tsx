"use client";

/**
 * AudioRecorder — UI de gravação de áudio para o chat do Nex.
 *
 * Modos (v0.15.4):
 *  - `standalone` (default): comportamento clássico — botão Mic em idle e
 *    barra completa (pulse + timer + pause/cancel/send) em recording/paused.
 *    O componente gerencia o seu próprio container.
 *  - `embedded`: o pai (NexChatPanel) controla o layout do input bar e o
 *    container externo. O componente expõe via `useImperativeHandle` os
 *    métodos `start/pauseOrResume/cancel/sendNow`. Em idle não renderiza
 *    nada (o pai mostra textarea); em recording/paused renderiza apenas
 *    o conteúdo interno (pulse + texto + timer + pause/cancel) — sem Send
 *    interno (o Send fica externo, no pai, gerido pelo `sendNow`).
 *
 * MediaRecorder API:
 *  - `navigator.mediaDevices.getUserMedia({ audio: true })` para o stream.
 *  - Mime preferido `audio/webm;codecs=opus`, fallback `audio/webm`,
 *    fallback `audio/mp4` (Safari).
 *  - `MediaRecorder.start(250)` (timeslice para coletar blocos rápidos).
 *  - Pause/resume nativos.
 *  - Cap MAX_DURATION_SEC = 300 (5 min) → auto-send + toast aviso.
 *
 * Erros:
 *  - `NotAllowedError` → toast "Acesso ao microfone negado".
 *  - Outros → toast "Não foi possível acessar o microfone".
 *
 * Acessibilidade:
 *  - aria-label nos botões (Gravar/Pausar/Retomar/Cancelar/Enviar).
 *  - Timer em aria-live="polite" para leitores de tela.
 *  - Indicador pulse respeita `prefers-reduced-motion` (motion-reduce).
 */

import { Mic, Pause, Play, Send, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */

export type AudioRecorderMode = "standalone" | "embedded";

export interface AudioRecorderHandle {
  start: () => Promise<void>;
  pauseOrResume: () => void;
  cancel: () => void;
  sendNow: () => void;
}

export interface AudioRecorderProps {
  onSend: (blob: Blob, durationSeconds: number) => void;
  onCancel?: () => void;
  /**
   * Disparado sempre que o recorder entra/sai do estado ativo
   * (`recording` ou `paused`). Usado pelo NexChatPanel para alternar o
   * conteúdo da inner area do input bar.
   */
  onRecordingStateChange?: (active: boolean) => void;
  /**
   * v0.15.4: "standalone" (default) renderiza container próprio + botão Mic
   * em idle + barra com Send interno em recording/paused. "embedded" expõe
   * controle imperativo (start/pauseOrResume/cancel/sendNow) e renderiza
   * apenas o conteúdo interno (pulse + texto + timer + pause/cancel) sem
   * container nem Send — o Send fica no input bar externo (Send do panel).
   */
  mode?: AudioRecorderMode;
  className?: string;
}

type Status = "idle" | "recording" | "paused";

const MAX_DURATION_SEC = 5 * 60; // 5 min — cap Whisper-friendly e UX-friendly.

/** Mimes em ordem de preferência (Chromium → Safari). */
const PREFERRED_MIMES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

/* -------------------------------------------------------------------------- */

function AudioRecorderImpl(
  {
    onSend,
    onCancel,
    onRecordingStateChange,
    mode = "standalone",
    className,
  }: AudioRecorderProps,
  ref: React.Ref<AudioRecorderHandle>,
) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [elapsed, setElapsed] = React.useState(0); // segundos.

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  // Tempo (ms) acumulado em segmentos de gravação ANTERIORES ao atual.
  // Reseta a cada start() e cresce a cada pause(). Usado pra calcular o
  // elapsed total respeitando pausas (BUG v0.15.1: timer corria mesmo pausado).
  const recordedMsRef = React.useRef<number>(0);
  // Timestamp (ms) em que o segmento ATUAL de gravação começou.
  // Atualizado em start() e em resume(). Quando pausado, fica "congelado"
  // — não somamos delta a partir dele, só do `recordedMsRef`.
  const segmentStartedAtRef = React.useRef<number>(0);
  // setInterval id — em browser é number; tipamos como ReturnType para suportar Node em teste.
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  // Flag pra evitar reentrância no auto-send vs send manual.
  const sendingRef = React.useRef(false);

  // Notifica o pai quando o recorder fica ativo (recording/paused) ou volta a idle.
  React.useEffect(() => {
    onRecordingStateChange?.(status !== "idle");
  }, [status, onRecordingStateChange]);

  // ----------------------------------------------------------------------
  // Cleanup helpers (memoizados pra usar dentro de outros callbacks).
  // ----------------------------------------------------------------------

  const cleanup = React.useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          /* noop — track já parado */
        }
      }
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    recordedMsRef.current = 0;
    segmentStartedAtRef.current = 0;
  }, []);

  // Cleanup no unmount — protege contra leak de stream se o usuário fechar a bolha.
  React.useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // ----------------------------------------------------------------------
  // Detecção de suporte (chamada apenas no client, depois do mount).
  // ----------------------------------------------------------------------

  const [supported, setSupported] = React.useState<boolean>(true);
  React.useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      typeof window.MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;
    setSupported(ok);
  }, []);

  // ----------------------------------------------------------------------
  // Pick mime suportado.
  // ----------------------------------------------------------------------

  const pickMimeType = React.useCallback((): string | undefined => {
    if (typeof window === "undefined") return undefined;
    const MR = window.MediaRecorder;
    if (!MR) return undefined;
    for (const mime of PREFERRED_MIMES) {
      try {
        if (MR.isTypeSupported(mime)) return mime;
      } catch {
        /* alguns browsers throw; ignora e tenta o próximo */
      }
    }
    return undefined;
  }, []);

  // ref-fwd dos callbacks para o tick acessar sem refresh do interval.
  const sendNowRef = React.useRef<() => void>(() => {});

  // ----------------------------------------------------------------------
  // start / pause / resume / cancel / sendNow
  // ----------------------------------------------------------------------

  const startTick = React.useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
    }
    tickRef.current = setInterval(() => {
      const segMs = Date.now() - segmentStartedAtRef.current;
      const totalMs = recordedMsRef.current + segMs;
      const seconds = Math.floor(totalMs / 1000);
      setElapsed(seconds);
      if (seconds >= MAX_DURATION_SEC) {
        toast.message("Limite de 5 min — enviando…");
        sendNowRef.current();
      }
    }, 250);
  }, []);

  const start = React.useCallback(async () => {
    if (!supported) {
      toast.error("Gravação de áudio não suportada neste navegador");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorderRef.current = rec;
      chunksRef.current = [];
      recordedMsRef.current = 0;
      segmentStartedAtRef.current = Date.now();
      setElapsed(0);
      setStatus("recording");

      rec.start(250);

      startTick();
    } catch (err) {
      cleanup();
      setStatus("idle");
      const isPermissionError =
        err instanceof DOMException && err.name === "NotAllowedError";
      toast.error(
        isPermissionError
          ? "Acesso ao microfone negado"
          : "Não foi possível acessar o microfone",
      );
    }
  }, [cleanup, pickMimeType, startTick, supported]);

  const pauseOrResume = React.useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (status === "recording") {
      try {
        rec.pause();
        recordedMsRef.current += Date.now() - segmentStartedAtRef.current;
        if (tickRef.current !== null) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
        setStatus("paused");
      } catch {
        /* alguns browsers não suportam pause — ignora */
      }
    } else if (status === "paused") {
      try {
        rec.resume();
        segmentStartedAtRef.current = Date.now();
        startTick();
        setStatus("recording");
      } catch {
        /* idem */
      }
    }
  }, [startTick, status]);

  const cancel = React.useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    }
    cleanup();
    setElapsed(0);
    setStatus("idle");
    onCancel?.();
  }, [cleanup, onCancel]);

  const sendNow = React.useCallback(() => {
    if (sendingRef.current) return;
    const rec = recorderRef.current;
    if (!rec) return;
    sendingRef.current = true;

    const totalMs =
      recordedMsRef.current +
      (rec.state === "recording"
        ? Date.now() - segmentStartedAtRef.current
        : 0);
    const duration = Math.max(1, Math.floor(totalMs / 1000));
    const mime = rec.mimeType || "audio/webm";

    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      cleanup();
      setElapsed(0);
      setStatus("idle");
      sendingRef.current = false;
      onSend(blob, duration);
    };

    if (rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        sendingRef.current = false;
        cleanup();
        setStatus("idle");
      }
    } else {
      sendingRef.current = false;
    }
  }, [cleanup, onSend]);

  // Mantém a ref atualizada com a versão mais recente do callback.
  React.useEffect(() => {
    sendNowRef.current = sendNow;
  }, [sendNow]);

  // ----------------------------------------------------------------------
  // Imperative handle — usado pelo NexChatPanel no modo "embedded".
  // ----------------------------------------------------------------------
  React.useImperativeHandle(
    ref,
    () => ({
      start,
      pauseOrResume,
      cancel,
      sendNow,
    }),
    [start, pauseOrResume, cancel, sendNow],
  );

  // ----------------------------------------------------------------------
  // Render.
  // ----------------------------------------------------------------------

  const isRecording = status === "recording";

  // ============================================================
  // Modo "embedded": pai controla container e Send. Renderizamos
  // só o conteúdo interno, sem padding/borda própria, sem Mic em
  // idle (pai mostra textarea), sem Send (pai tem um Send externo).
  // ============================================================
  if (mode === "embedded") {
    if (status === "idle") return null;
    return (
      <div
        role="group"
        aria-label="Gravação de áudio"
        className={cn("flex w-full items-center gap-2", className)}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-2 w-2 shrink-0 rounded-full",
            isRecording
              ? "animate-pulse bg-rose-500 motion-reduce:animate-none"
              : "bg-muted-foreground/50",
          )}
        />

        <span className="text-xs font-medium text-foreground">
          {isRecording ? "Gravando" : "Pausado"}
        </span>

        <span
          aria-live="polite"
          aria-atomic="true"
          className="font-mono text-xs tabular-nums text-muted-foreground"
        >
          {formatTime(elapsed)}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={pauseOrResume}
            aria-label={isRecording ? "Pausar gravação" : "Retomar gravação"}
            className={cn(
              "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
            )}
          >
            {isRecording ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="ml-0.5 h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={cancel}
            aria-label="Cancelar gravação"
            className={cn(
              "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors",
              "hover:bg-rose-500/10 hover:text-rose-500",
              "focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none",
            )}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Modo "standalone" (default): comportamento clássico.
  // ============================================================
  if (status === "idle") {
    return (
      <button
        type="button"
        onClick={() => {
          void start();
        }}
        disabled={!supported}
        aria-label="Gravar áudio"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-40",
          "cursor-pointer",
          className,
        )}
      >
        <Mic className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Gravação de áudio"
      className={cn(
        "flex w-full items-center gap-2 rounded-2xl border border-violet-500/30 bg-violet-600/5 px-2.5 py-1.5",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-2 w-2 shrink-0 rounded-full",
          isRecording
            ? "animate-pulse bg-rose-500 motion-reduce:animate-none"
            : "bg-muted-foreground/50",
        )}
      />

      <span className="text-xs font-medium text-foreground">
        {isRecording ? "Gravando" : "Pausado"}
      </span>

      <span
        aria-live="polite"
        aria-atomic="true"
        className="font-mono text-xs tabular-nums text-muted-foreground"
      >
        {formatTime(elapsed)}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={pauseOrResume}
          aria-label={isRecording ? "Pausar gravação" : "Retomar gravação"}
          className={cn(
            "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
          )}
        >
          {isRecording ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="ml-0.5 h-3.5 w-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={cancel}
          aria-label="Cancelar gravação"
          className={cn(
            "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors",
            "hover:bg-rose-500/10 hover:text-rose-500",
            "focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={sendNow}
          aria-label="Enviar áudio"
          className={cn(
            "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-violet-600 text-white transition-colors",
            "hover:bg-violet-500",
            "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 focus-visible:outline-none",
          )}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export const AudioRecorder = React.forwardRef<
  AudioRecorderHandle,
  AudioRecorderProps
>(AudioRecorderImpl);

AudioRecorder.displayName = "AudioRecorder";

/* -------------------------------------------------------------------------- */

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const total = Math.floor(totalSeconds);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
