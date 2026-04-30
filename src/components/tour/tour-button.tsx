"use client";

import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTour, type TourConfig } from "./tour-provider";

interface TourButtonProps {
  tour: TourConfig;
  label?: string;
  className?: string;
}

/**
 * Botão "?" reutilizável que dispara um tour específico. Usa um botão nativo
 * (em vez de `<Button>`) para garantir touch target ≥44px conforme HIG.
 */
export function TourButton({
  tour,
  label = "Como usar este relatório",
  className,
}: TourButtonProps) {
  const { start } = useTour();
  return (
    <button
      type="button"
      onClick={() => start(tour)}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors",
        "hover:bg-violet-500/10 hover:text-violet-400",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60",
        className,
      )}
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  );
}
