"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StaleBannerProps {
  cachedAt?: Date | string | null;
}

function formatPtBR(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function StaleBanner({ cachedAt }: StaleBannerProps) {
  const dt =
    cachedAt instanceof Date
      ? cachedAt
      : cachedAt
        ? new Date(cachedAt)
        : null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
      <p className="flex-1 text-amber-100">
        Dados do Chatwoot indisponíveis. Mostrando última atualização:{" "}
        <span className="font-medium">
          {dt ? formatPtBR(dt) : "indisponível"}
        </span>
        .
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => window.location.reload()}
      >
        <RefreshCw />
        Tentar atualizar
      </Button>
    </div>
  );
}
