"use client";

/**
 * AudioRecorder — UI de gravação de áudio para o chat do Nex.
 *
 * Estados:
 *  - `idle`: render apenas botão `<Mic>` (lucide). Click → start.
 *  - `recording` | `paused`: barra completa com indicador pulse, timer mm:ss
 *    (aria-live="polite"), botões pausar/retomar, cancelar e enviar.
 *
 * Integração com MediaRecorder API:
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
 *  - `MediaRecorder` undefined → botão mic em estado disabled (caller normal-
 *    mente já filtra via prop `audioInputEnabled`, mas defendemos aqui também).
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

export interface AudioRecorderProps {
  onSend: (blob: Blob, durationSeconds: number) => void;
  onCancel?: () => void;
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

export function AudioRecorder({
  onSend,
  onCancel,
  className,
}: AudioRecorderProps) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [elapsed, setElapsed] = React.useState(0); // segundos.

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const startedAtRef = React.useRef<number>(0);
  // setInterval id — em browser é number; tipamos como ReturnType para suportar Node em teste.
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  // Flag pra evitar reentrância no auto-send vs send manual.
  const sendingRef = React.useRef(false);

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
    startedAtRef.current = 0;
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

  // ----------------------------------------------------------------------
  // Auto-send quando atinge MAX_DURATION_SEC.
  // ----------------------------------------------------------------------

  // ref-fwd dos callbacks para o tick acessar sem refresh do interval.
  const sendNowRef = React.useRef<() => void>(() => {});

  // ----------------------------------------------------------------------
  // start / pause / resume / cancel / sendNow
  // ----------------------------------------------------------------------

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
      startedAtRef.current = Date.now();
      setElapsed(0);
      setStatus("recording");

      rec.start(250);

      tickRef.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsed(seconds);
        if (seconds >= MAX_DURATION_SEC) {
          // Toast aviso 1x, depois auto-send.
          toast.message("Limite de 5 min — enviando…");
          sendNowRef.current();
        }
      }, 250);
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
  }, [cleanup, pickMimeType, supported]);

  const pauseOrResume = React.useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (status === "recording") {
      try {
        rec.pause();
        setStatus("paused");
      } catch {
        /* alguns browsers não suportam pause — ignora */
      }
    } else if (status === "paused") {
      try {
        rec.resume();
        setStatus("recording");
      } catch {
        /* idem */
      }
    }
  }, [status]);

  const cancel = React.useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null; // não queremos pegar os dados.
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

    // Trava o duration ANTES do stop assíncrono — onstop dispara depois.
    const duration = Math.max(
      1,
      Math.floor((Date.now() - startedAtRef.current) / 1000),
    );
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
        // Caso stop falhe, libera flag e cleanup.
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
  // Render.
  // ----------------------------------------------------------------------

  // Estado idle → apenas o botão mic.
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

  // Recording / paused → barra completa.
  const isRecording = status === "recording";

  return (
    <div
      role="group"
      aria-label="Gravação de áudio"
      className={cn(
        "flex w-full items-center gap-2 rounded-2xl border border-violet-500/30 bg-violet-600/5 px-2.5 py-1.5",
        className,
      )}
    >
      {/* Indicador pulse — vermelho quando recording, cinza quando paused. */}
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
        {/* Pause / Resume */}
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

        {/* Cancel */}
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

        {/* Send */}
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

/* -------------------------------------------------------------------------- */

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const total = Math.floor(totalSeconds);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
