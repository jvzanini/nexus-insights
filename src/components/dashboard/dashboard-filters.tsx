"use client";

import { Building2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import type { DashboardPeriod } from "@/lib/actions/dashboard";

interface DashboardFiltersProps {
  accounts: Array<{ id: number; name: string }>;
  selectedAccountId: number;
  selectedPeriod: DashboardPeriod;
  isLoading: boolean;
  onAccountChange: (accountId: number) => void;
  onPeriodChange: (period: DashboardPeriod) => void;
  onRefresh: () => void;
}

const periods: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

export function DashboardFilters({
  accounts,
  selectedAccountId,
  selectedPeriod,
  isLoading,
  onAccountChange,
  onPeriodChange,
  onRefresh,
}: DashboardFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto sm:ml-auto">
        {/* Filtro de empresa (Conta Chatwoot) */}
        <CustomSelect
          value={String(selectedAccountId)}
          onChange={(val) => {
            const id = Number.parseInt(val, 10);
            if (Number.isFinite(id)) onAccountChange(id);
          }}
          icon={
            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          }
          triggerClassName="h-9 min-w-[180px] sm:min-w-[200px]"
          options={accounts.map((a) => ({
            value: String(a.id),
            label: a.name,
          }))}
        />

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
          className="h-9 w-9 rounded-lg border-border bg-card/80 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-all duration-200"
          aria-label="Atualizar dashboard"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
}
