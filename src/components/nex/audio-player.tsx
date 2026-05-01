"use client";

/**
 * AudioPlayer — player customizado para mensagens de áudio do Nex.
 *
 * Wrappa um `<audio>` HTML5 invisível e expõe controles próprios:
 *  - Play / Pause.
 *  - Barra de progresso (input range bound em audio.currentTime).
 *  - Tempo `mm:ss / mm:ss` em fonte tabular (sem layout shift).
 *  - Dropdown de velocidade com 5 níveis (1×, 1.25×, 1.5×, 1.75×, 2×).
 *
 * Speed memorizada por instância (não persiste entre mensagens).
 * Sem dependência de WebAudio — usa apenas API HTMLMediaElement.
 */

import { Pause, Play } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export const SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;
export type AudioSpeed = (typeof SPEEDS)[number];

export interface AudioPlayerProps {
  src: string;
  /** Duração conhecida em segundos (placeholder até `loadedmetadata`). */
  durationSeconds?: number;
  className?: string;
}

export function AudioPlayer({
  src,
  durationSeconds,
  className,
}: AudioPlayerProps) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState<number>(durationSeconds ?? 0);
  const [speed, setSpeed] = React.useState<AudioSpeed>(1);

  // Sincroniza playbackRate sempre que speed muda OU o elemento aparece.
  React.useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speed;
  }, [speed]);

  const handleTogglePlay = React.useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  }, []);

  const handleSpeedChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const next = Number(event.target.value) as AudioSpeed;
      if (!SPEEDS.includes(next)) return;
      setSpeed(next);
      const el = audioRef.current;
      if (el) el.playbackRate = next;
    },
    [],
  );

  const handleSeek = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const el = audioRef.current;
      if (!el) return;
      const next = Number(event.target.value);
      if (Number.isNaN(next)) return;
      el.currentTime = next;
      setCurrentTime(next);
    },
    [],
  );

  // Eventos do <audio> → estado local. Listeners gerenciados via ref.
  const onLoadedMetadata = React.useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (Number.isFinite(el.duration) && el.duration > 0) {
      setDuration(el.duration);
    }
  }, []);

  const onTimeUpdate = React.useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime);
  }, []);

  const onPlay = React.useCallback(() => setIsPlaying(true), []);
  const onPause = React.useCallback(() => setIsPlaying(false), []);
  const onEnded = React.useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const max = duration > 0 ? duration : Math.max(currentTime, 1);

  return (
    <div
      className={cn(
        "flex w-full max-w-[320px] items-center gap-2 rounded-2xl bg-violet-600/15 px-3 py-2",
        className,
      )}
    >
      {/* HTML5 audio invisível — controles 100% custom. */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        className="sr-only"
      />

      <button
        type="button"
        onClick={handleTogglePlay}
        aria-label={isPlaying ? "Pausar" : "Tocar"}
        className={cn(
          "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-violet-600 text-white transition-colors hover:bg-violet-500",
          "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none",
        )}
      >
        {isPlaying ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="ml-0.5 h-3.5 w-3.5" />
        )}
      </button>

      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={Math.min(currentTime, max)}
        onChange={handleSeek}
        aria-label="Progresso"
        className={cn(
          "h-1 flex-1 cursor-pointer appearance-none rounded-full bg-violet-200/60 accent-violet-600 dark:bg-violet-900/40",
        )}
      />

      <span
        className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
        aria-hidden="true"
      >
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <select
        value={speed}
        onChange={handleSpeedChange}
        aria-label="Velocidade"
        className={cn(
          "h-6 shrink-0 cursor-pointer rounded-md border border-violet-300/50 bg-background/60 px-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-background",
          "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
          "dark:border-violet-700/40",
        )}
      >
        {SPEEDS.map((value) => (
          <option key={value} value={value}>
            {formatSpeed(value)}
          </option>
        ))}
      </select>
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

function formatSpeed(value: AudioSpeed): string {
  // "1×", "1.25×", "1.5×", "1.75×", "2×".
  return `${value.toString()}×`;
}
