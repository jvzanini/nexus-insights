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

type PageItem = number | "ellipsis";

/**
 * Algoritmo v0.27 (volta da v0.23 com reticências):
 * - 0 págs: []
 * - 1..4 págs: todas as páginas explícitas
 * - 5+ atual=1 ou N: [1, ellipsis, N]
 * - 5+ atual no meio: [1, ellipsis, page, ellipsis, N]
 *
 * Cada `ellipsis` é renderizada como Popover dropdown com o range
 * adjacente (esquerda ou direita); a página atual no meio também
 * é renderizada como dropdown com 1..N.
 */
export function buildPageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 0) return [];
  if (totalPages === 1) return [1];
  if (totalPages === 2) return [1, 2];
  if (totalPages === 3) return [1, 2, 3];
  if (totalPages === 4) return [1, 2, 3, 4];
  if (page === 1 || page === totalPages) return [1, "ellipsis", totalPages];
  return [1, "ellipsis", page, "ellipsis", totalPages];
}

/**
 * Retorna o array de páginas inteiras dado um range [from, to] inclusivo.
 * Quando `from > to` (range colapsado, ex.: ellipsis esquerda com page=2 e
 * totalPages=5 → range [2..1]), retorna `[]` — o EllipsisDropdown então
 * renderiza null (sem dropdown vazio adjacente a páginas já visíveis).
 * Clamp final aplica [1, totalPages] como segurança.
 */
function rangeToPages(
  from: number,
  to: number,
  totalPages: number,
): number[] {
  const pages: number[] = [];
  const lo = Math.max(1, from);
  const hi = Math.min(totalPages, to);
  for (let p = lo; p <= hi; p++) pages.push(p);
  return pages;
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
            className="inline-flex h-9 min-w-9 cursor-pointer items-center justify-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/15 px-3 text-sm font-semibold text-violet-500 tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
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
                  "flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm tabular-nums hover:bg-muted",
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
 * Dropdown da reticência: abre Popover com o range de páginas passado.
 * Se o range estiver vazio, retorna null pra não renderizar dropdown vazio.
 */
function EllipsisDropdown({
  pages,
  onPageChange,
  ariaLabel,
}: {
  pages: number[];
  onPageChange: (p: number) => void;
  ariaLabel: string;
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
            aria-label={ariaLabel}
            className="inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-md border border-border/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
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
                  onPageChange(p);
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm tabular-nums hover:bg-muted"
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

/**
 * Barra de paginação numerada com setinhas, reticências-dropdown e atual-dropdown.
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
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>

      {items.map((it, idx) => {
        if (it === "ellipsis") {
          // Quando há 1 reticência, ela cobre o miolo entre 2 e N-1.
          // Quando há 2, idx=1 cobre [2..page-1] (esquerda) e
          // idx=3 cobre [page+1..N-1] (direita).
          let pages: number[] = [];
          let ariaLabel = "Selecionar página";
          if (ellipsisCount === 1) {
            pages = rangeToPages(2, totalPages - 1, totalPages);
            ariaLabel = "Selecionar página intermediária";
          } else if (ellipsisCount === 2) {
            if (idx === 1) {
              pages = rangeToPages(2, page - 1, totalPages);
              ariaLabel = "Selecionar página anterior à atual";
            } else {
              pages = rangeToPages(page + 1, totalPages - 1, totalPages);
              ariaLabel = "Selecionar página posterior à atual";
            }
          }
          return (
            <EllipsisDropdown
              key={`ellipsis-${idx}`}
              pages={pages}
              onPageChange={onPageChange}
              ariaLabel={ariaLabel}
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
              "inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-md border px-3 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
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
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  );
}

export default ConversasPagination;
