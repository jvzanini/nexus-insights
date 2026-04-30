"use client";

/**
 * Badge de freshness das tabelas pré-agregadas (facts).
 *
 * Mostra o estado da dimensão `by_account` (guarda-chuva) para a conta ativa.
 * Visual alinhado com `src/components/settings/llm-config-card.tsx`
 * (chip `bg-<cor>-500/10 text-<cor>-600 dark:text-<cor>-400` + ícone Lucide).
 *
 * Estados (mapeados em `readFactsMeta`):
 *  - fresh   (lag < 10 min)        → emerald + CheckCircle2
 *  - stale   (10–30 min)           → amber   + Clock
 *  - lagging (> 30 min)            → rose    + AlertCircle
 *  - never   (sem refresh anterior)→ muted   + HelpCircle
 *
 * Auto-refresh: por padrão, repolla a action a cada 30 s.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import { cn } from "@/lib/utils";
import {
  getFreshnessForAccount,
  type FreshnessSummary,
} from "@/lib/actions/freshness";

const POLL_INTERVAL_MS = 30_000;

interface FactsFreshnessProps {
  accountId: number;
  className?: string;
  /** When true, polls every 30s. Default true. */
  autoRefresh?: boolean;
}

interface VisualSpec {
  className: string;
  Icon: LucideIcon;
}

function visualForStatus(status: FreshnessSummary["status"]): VisualSpec {
  switch (status) {
    case "fresh":
      return {
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        Icon: CheckCircle2,
      };
    case "stale":
      return {
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        Icon: Clock,
      };
    case "lagging":
      return {
        className: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
        Icon: AlertCircle,
      };
    case "never":
    default:
      return {
        className: "bg-muted/40 text-muted-foreground",
        Icon: HelpCircle,
      };
  }
}

function buildLabel(summary: FreshnessSummary): string {
  if (summary.status === "never" || !summary.lastRefreshAt) {
    return "Sem dados de pré-agregação";
  }
  const ago = formatDistanceToNow(new Date(summary.lastRefreshAt), {
    locale: ptBR,
    addSuffix: false,
  });
  if (summary.status === "lagging") {
    return `Atualizado há ${ago} — pode estar desatualizado`;
  }
  return `Atualizado há ${ago}`;
}

export function FactsFreshness({
  accountId,
  className,
  autoRefresh = true,
}: FactsFreshnessProps) {
  const [summary, setSummary] = useState<FreshnessSummary | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    async function poll() {
      const r = await getFreshnessForAccount(accountId);
      if (!mounted.current) return;
      if (r.ok && r.data) setSummary(r.data);
    }

    void poll();

    if (!autoRefresh) {
      return () => {
        mounted.current = false;
      };
    }

    const id = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [accountId, autoRefresh]);

  if (!summary) {
    // Placeholder neutro durante o primeiro carregamento — preserva layout.
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground",
          className,
        )}
        aria-hidden="true"
      >
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>Verificando atualização…</span>
      </span>
    );
  }

  const { className: visualClass, Icon } = visualForStatus(summary.status);
  const label = buildLabel(summary);
  const tooltip =
    summary.lastRefreshAt !== null
      ? `Última agregação: ${summary.lastRefreshAt}`
      : "Nenhuma agregação registrada ainda";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-snug",
        visualClass,
        className,
      )}
      role="status"
      aria-live="polite"
      title={tooltip}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
