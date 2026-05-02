"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Lista as páginas a renderizar com "ellipsis" entre lacunas (gap > 1).
 * Sempre inclui: primeira (1), última (totalPages), atual e vizinhos imediatos.
 *
 * Exemplos:
 *   totalPages=5, page=3  → [1,2,3,4,5]
 *   totalPages=12, page=1 → [1,2,"ellipsis",12]
 *   totalPages=12, page=6 → [1,"ellipsis",5,6,7,"ellipsis",12]
 *   totalPages=12, page=12→ [1,"ellipsis",11,12]
 */
function buildPageItems(
  page: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  // Quando o total cabe sem elipsis, lista tudo (1..N).
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const set = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...set]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) result.push("ellipsis");
    result.push(sorted[i]!);
  }
  return result;
}

/**
 * Barra de paginação numerada com setinhas e elipsis.
 * Não renderiza nada quando totalPages <= 1.
 */
export function ConversasPagination({
  page,
  totalPages,
  onPageChange,
  className,
}: Props) {
  if (totalPages <= 1) return null;
  const items = buildPageItems(page, totalPages);

  return (
    <nav
      role="navigation"
      aria-label="Paginação de conversas"
      className={cn(
        "flex items-center justify-center gap-1.5 border-t border-border/40 bg-muted/10 p-3",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        aria-label="Página anterior"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>

      {items.map((it, idx) =>
        it === "ellipsis" ? (
          <span
            key={`e${idx}`}
            className="inline-flex h-9 min-w-9 items-center justify-center px-1 text-sm text-muted-foreground tabular-nums"
            aria-hidden
          >
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            onClick={() => onPageChange(it)}
            aria-current={page === it ? "page" : undefined}
            aria-label={`Ir para página ${it}`}
            className={cn(
              "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
              page === it
                ? "border-violet-500/40 bg-violet-500/15 text-violet-500 font-semibold"
                : "border-border/50 text-foreground hover:bg-muted hover:border-border",
            )}
          >
            {it}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Próxima página"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  );
}

export default ConversasPagination;
