"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Algoritmo v0.23: simplificado.
 * - 1 pág: [1]
 * - 2-4 pág: todas
 * - 5+ atual=1 ou N: [1, "...", N]
 * - 5+ atual no meio: [1, "...", page, "...", N]
 *
 * Reticência → Popover dropdown com páginas do range.
 * Atual no meio → Popover dropdown com 1..N (atual destacada com check).
 */
function buildPageItems(
  page: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 0) return [];
  if (totalPages === 1) return [1];
  if (totalPages === 2) return [1, 2];
  if (totalPages === 3) return [1, 2, 3];
  if (totalPages === 4) return [1, 2, 3, 4];
  if (page === 1 || page === totalPages) return [1, "ellipsis", totalPages];
  return [1, "ellipsis", page, "ellipsis", totalPages];
}

function rangeToPages(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function EllipsisDropdown({
  pages,
  onSelect,
}: {
  pages: number[];
  onSelect: (p: number) => void;
}) {
  const [open, setOpen] = useState(false);
  if (pages.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props) => (
          <button
            {...props}
            type="button"
            aria-label="Selecionar página"
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-border/50 px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
          >
            …
          </button>
        )}
      />
      <PopoverContent className="w-32 p-1">
        <ul role="list" className="max-h-64 overflow-y-auto">
          {pages.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => {
                  onSelect(p);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-center rounded-md px-2 py-1.5 text-sm tabular-nums hover:bg-muted"
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function CurrentPageDropdown({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props) => (
          <button
            {...props}
            type="button"
            aria-current="page"
            aria-label={`Página atual ${page} — selecionar outra`}
            className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/15 px-3 text-sm font-semibold text-violet-500 tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
          >
            {page}
            <ChevronDown className="h-3 w-3" aria-hidden />
          </button>
        )}
      />
      <PopoverContent className="w-32 p-1">
        <ul role="list" className="max-h-64 overflow-y-auto">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => {
                  onPageChange(p);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm tabular-nums hover:bg-muted",
                  p === page &&
                    "bg-violet-500/15 font-semibold text-violet-500",
                )}
              >
                {p}
                {p === page ? <Check className="h-3 w-3" aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Barra de paginação numerada com setinhas, reticência-dropdown e atual-dropdown.
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
  const ellipsisCount = items.filter((it) => it === "ellipsis").length;

  return (
    <nav
      role="navigation"
      aria-label="Paginação de conversas"
      className={cn("flex items-center gap-1.5", className)}
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

      {items.map((it, idx) => {
        if (it === "ellipsis") {
          // Range das páginas a exibir no dropdown.
          let start = 2;
          let end = totalPages - 1;
          if (ellipsisCount === 2) {
            // [1, "ellipsis", page, "ellipsis", N]: idx 1 = esquerda, idx 3 = direita.
            if (idx === 1) {
              start = 2;
              end = page - 1;
            } else {
              start = page + 1;
              end = totalPages - 1;
            }
          }
          const pages = rangeToPages(start, end);
          return (
            <EllipsisDropdown
              key={`e${idx}`}
              pages={pages}
              onSelect={onPageChange}
            />
          );
        }

        const isCurrent = page === it;
        const isEdge = it === 1 || it === totalPages;

        if (isCurrent && !isEdge) {
          return (
            <CurrentPageDropdown
              key={it}
              page={page}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
          );
        }

        return (
          <button
            key={it}
            type="button"
            onClick={() => onPageChange(it)}
            aria-current={isCurrent ? "page" : undefined}
            aria-label={`Ir para página ${it}`}
            className={cn(
              "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
              isCurrent
                ? "border-violet-500/40 bg-violet-500/15 font-semibold text-violet-500"
                : "border-border/50 text-foreground hover:border-border hover:bg-muted",
            )}
          >
            {it}
          </button>
        );
      })}

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
