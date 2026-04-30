import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface SortIndicatorProps {
  state: "asc" | "desc" | null;
  className?: string;
}

/**
 * Indicador visual de estado de ordenação para colunas de tabela.
 * Renderiza um ícone Lucide de 12px com opacidade dimmed quando inativo.
 */
export function SortIndicator({ state, className }: SortIndicatorProps) {
  const Icon =
    state === "asc"
      ? ChevronUp
      : state === "desc"
        ? ChevronDown
        : ChevronsUpDown;

  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "size-3 shrink-0 transition-opacity",
        state === null ? "opacity-50" : "opacity-100 text-primary",
        className,
      )}
    />
  );
}
