"use client";

import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RefreshButtonProps {
  className?: string;
  ariaLabel?: string;
}

/**
 * Botão de atualização manual para páginas de relatório.
 * Dispara `router.refresh()` dentro de um `useTransition` para que o ícone
 * gire enquanto o servidor revalida os dados.
 */
export function RefreshButton({
  className,
  ariaLabel = "Atualizar relatório",
}: RefreshButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      aria-label={ariaLabel}
      title={ariaLabel}
      data-tour="refresh"
      className={cn(
        "h-9 w-9 rounded-lg border-border bg-card/80 text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <RefreshCw
        className={cn("h-4 w-4 transition-transform", isPending && "animate-spin")}
        aria-hidden="true"
      />
    </Button>
  );
}
