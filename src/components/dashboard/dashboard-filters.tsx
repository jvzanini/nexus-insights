"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardPeriod } from "@/lib/actions/dashboard";

interface DashboardFiltersProps {
  selectedPeriod: DashboardPeriod;
  isLoading: boolean;
  onPeriodChange: (period: DashboardPeriod) => void;
  onRefresh: () => void;
}

const periods: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "dia", label: "Dia" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
];

/**
 * Filtros do dashboard (v0.10):
 *  - Pills de período (Hoje / Semana / Mês).
 *  - Botão refresh.
 *
 * O seletor de conta foi removido — vive exclusivamente no sidebar
 * (`AccountSwitcher`) e a escolha é global para a plataforma inteira.
 */
export function DashboardFilters({
  selectedPeriod,
  isLoading,
  onPeriodChange,
  onRefresh,
}: DashboardFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto sm:ml-auto">
        {/* Pills de período */}
        <div className="flex rounded-xl border border-border overflow-hidden bg-card/80">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => onPeriodChange(p.value)}
              className={`px-3.5 py-1.5 text-xs font-medium transition-all duration-200 cursor-pointer ${
                selectedPeriod === p.value
                  ? "bg-violet-600 text-white shadow-[0_0_8px_rgba(124,58,237,0.3)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Botão refresh */}
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isLoading}
          data-tour="dashboard-refresh"
          className="h-9 w-9 rounded-lg border-border bg-card/80 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-all duration-200"
          aria-label="Atualizar dashboard"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
}
