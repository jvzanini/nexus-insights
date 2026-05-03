"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { DollarSign, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getCurrentUsdBrlRateAction } from "@/lib/actions/exchange-rate-refresh";
import type { UsdBrlRate } from "@/lib/llm/exchange-rate";

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

type Source = UsdBrlRate["source"];

interface UsdRateTickerProps {
  /** Cotação comercial (sem spread). Atualiza no refresh. */
  commercialRate: number;
  /** Spread cartão atual — REATIVO. Quando o user altera no Spread form, o pai re-renderiza com novo valor. */
  spread: number;
  source: Source;
  fetchedAt: Date | string;
}

const SOURCE_STYLES: Record<Source, string> = {
  live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cache: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  fallback: "bg-destructive/10 text-destructive",
};

const SOURCE_LABELS: Record<Source, string> = {
  live: "Live",
  cache: "Cache",
  fallback: "Fallback",
};

export function UsdRateTicker({
  commercialRate: commercialInitial,
  spread,
  source: sourceInitial,
  fetchedAt: fetchedAtInitial,
}: UsdRateTickerProps) {
  const [commercial, setCommercial] = useState<number>(commercialInitial);
  const [source, setSource] = useState<Source>(sourceInitial);
  const [fetchedAt, setFetchedAt] = useState<Date>(
    fetchedAtInitial instanceof Date
      ? fetchedAtInitial
      : new Date(fetchedAtInitial),
  );
  const [isRefreshing, startRefresh] = useTransition();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function refresh(silent = false) {
    startRefresh(async () => {
      const result = await getCurrentUsdBrlRateAction();
      if (!result.ok) {
        if (!silent) toast.error(result.error);
        return;
      }
      setCommercial(result.data.commercial);
      setSource(result.data.source);
      setFetchedAt(
        result.data.fetchedAt instanceof Date
          ? result.data.fetchedAt
          : new Date(result.data.fetchedAt),
      );
      if (!silent) toast.success("Cotação atualizada");
    });
  }

  useEffect(() => {
    intervalRef.current = setInterval(() => refresh(true), REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveRate = commercial * spread;

  return (
    <Card className="rounded-xl border border-border bg-muted/30">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500"
          >
            <DollarSign className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              USD/BRL com spread
            </p>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {brlFmt.format(effectiveRate)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
              Comercial {brlFmt.format(commercial)} × Spread {spread.toFixed(2)}{" "}
              · Atualizado às {timeFmt.format(fetchedAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
              SOURCE_STYLES[source],
            )}
          >
            {SOURCE_LABELS[source]}
          </span>
          <button
            type="button"
            onClick={() => refresh(false)}
            disabled={isRefreshing}
            aria-label="Atualizar cotação agora"
            title="Atualiza automaticamente a cada 1 hora"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
