"use client";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  show: boolean;
  label?: string;
  className?: string;
}

/**
 * Overlay simples (spinner + texto) para sobrepor o conteúdo de uma tabela
 * ou card enquanto um filtro está sendo aplicado e o servidor re-renderiza.
 *
 * Posicionamento: o container pai precisa ser `relative` para o overlay
 * cobrir apenas o conteúdo desejado.
 */
export function LoadingOverlay({
  show,
  label = "Carregando relatório...",
  className,
}: LoadingOverlayProps) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-card/80 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
