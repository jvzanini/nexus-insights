"use client";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  show: boolean;
  label?: string;
  className?: string;
}

/**
 * Overlay sutil moderno (spinner violet + blur médio) para sobrepor o
 * conteúdo enquanto um filtro/busca/export está sendo aplicado.
 *
 * Posicionamento: o container pai precisa ser `relative` para o overlay
 * cobrir apenas o conteúdo desejado.
 *
 * Acessibilidade: role="status" + aria-live="polite" + aria-label.
 * Motion: respeita prefers-reduced-motion via motion-safe:.
 */
export function LoadingOverlay({
  show,
  label = "Carregando conversas...",
  className,
}: LoadingOverlayProps) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-card/70 backdrop-blur-md",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2
          className="h-8 w-8 animate-spin text-violet-400 motion-safe:[animation-duration:1.2s]"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
