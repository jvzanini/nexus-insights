"use client";

import type { ReactNode } from "react";

import { useFilterTransition } from "@/components/reports/filter-transition";
import { LoadingOverlay } from "@/components/reports/loading-overlay";
import { cn } from "@/lib/utils";

interface ContentLoadingWrapperProps {
  children: ReactNode;
  className?: string;
  label?: string;
}

/**
 * Wrapper que aplica um overlay de loading sobre o conteúdo (tabela/chart)
 * enquanto uma transition de filtros está pendente. Usa o
 * `FilterTransitionProvider` do mesmo escopo.
 */
export function ContentLoadingWrapper({
  children,
  className,
  label,
}: ContentLoadingWrapperProps) {
  const { isPending } = useFilterTransition();
  return (
    <div className={cn("relative", className)}>
      {children}
      <LoadingOverlay show={isPending} label={label} />
    </div>
  );
}
