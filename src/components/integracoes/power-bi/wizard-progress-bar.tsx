"use client";

/**
 * WizardProgressBar — barra de progresso visual com 4 segmentos do wizard
 * de criação/edição de perfil Power BI.
 *
 * Estados por step:
 * - completed  → violet 500/40 + check icon
 * - active     → violet 500 (cor + foco visual com ring)
 * - upcoming   → muted (cinza)
 *
 * Acessibilidade: role="progressbar" com aria-valuenow / aria-valuemin /
 * aria-valuemax. Cada segmento clicável reverte para steps já completos
 * (modo "voltar"); steps futuros são disabled (UI não permite pular sem
 * validação).
 */

import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  key: string;
  label: string;
  shortLabel?: string;
}

export const WIZARD_STEPS: readonly WizardStep[] = [
  { key: "identity", label: "Identificação" },
  { key: "tables", label: "Tabelas" },
  { key: "columns", label: "Colunas" },
  { key: "filters", label: "Filtros" },
] as const;

interface Props {
  /** Step atual (0..3). */
  current: number;
  /** Permitir navegar para steps já completos. Default true. */
  canGoBack?: boolean;
  /** Callback ao clicar num step completo. */
  onStepClick?: (index: number) => void;
}

export function WizardProgressBar({
  current,
  canGoBack = true,
  onStepClick,
}: Props) {
  return (
    <ol
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={WIZARD_STEPS.length}
      aria-valuenow={current + 1}
      aria-label={`Passo ${current + 1} de ${WIZARD_STEPS.length}`}
      className="flex items-center gap-1 text-xs sm:text-sm"
    >
      {WIZARD_STEPS.map((step, index) => {
        const isActive = index === current;
        const isCompleted = index < current;
        const isUpcoming = index > current;
        const interactive = canGoBack && isCompleted && !!onStepClick;

        return (
          <li key={step.key} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              data-step={step.key}
              data-state={
                isActive ? "active" : isCompleted ? "completed" : "upcoming"
              }
              disabled={!interactive}
              onClick={() => {
                if (interactive) onStepClick(index);
              }}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "group flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                interactive && "cursor-pointer hover:bg-muted/40",
                !interactive && "cursor-default",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                  isActive &&
                    "bg-violet-500 text-white ring-2 ring-violet-500/30",
                  isCompleted && "bg-violet-500/40 text-violet-700 dark:text-violet-200",
                  isUpcoming && "bg-muted text-muted-foreground",
                )}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  "truncate font-medium transition-colors",
                  isActive && "text-foreground",
                  isCompleted && "text-foreground/80",
                  isUpcoming && "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </button>
            {index < WIZARD_STEPS.length - 1 ? (
              <ChevronRight
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
