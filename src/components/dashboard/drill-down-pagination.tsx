"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DrillDownPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onChange: (page: number) => void;
}

export function DrillDownPagination({
  page,
  pageSize,
  total,
  loading = false,
  onChange,
}: DrillDownPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-2 px-1 pt-3 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {from.toLocaleString("pt-BR")} – {to.toLocaleString("pt-BR")} de{" "}
        <span className="text-foreground font-medium">
          {total.toLocaleString("pt-BR")}
        </span>
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2"
          disabled={loading || page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2"
          disabled={loading || page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
