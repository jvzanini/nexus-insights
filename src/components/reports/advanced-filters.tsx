"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PeriodPills } from "@/components/reports/period-pills";
import { useFilterTransition } from "@/components/reports/filter-transition";
import { AppliedFiltersChips } from "@/components/reports/applied-filters-chips";
import { FiltersDrawer } from "@/components/reports/filters-drawer";
import {
  EMPTY_FILTER_STATE,
  diffFilterStates,
  isFilterStateEqual,
  serializeFilterState,
  type FilterState,
} from "@/lib/reports/filter-state";
import type { PeriodKey as CanonicalPeriodKey } from "@/lib/datetime-core";
import {
  isPeriodKey,
  type PeriodKey as ExtendedPeriodKey,
} from "@/lib/reports/period";
import type { MetaItem } from "@/lib/chatwoot/queries/meta-cache";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type { MetaItem };

export interface AdvancedFiltersProps {
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  initial: FilterState;
  /** Conta ativa — usada para limitar o calendário ao primeiro registro do banco. */
  accountId?: number;
}

// ---------------------------------------------------------------------------
// AdvancedFilters — toolbar compacto + drawer
// ---------------------------------------------------------------------------
//
// Layout (4 linhas verticais, 8dp rhythm):
//   1. Período → <PeriodPills>
//   2. Busca + chip "Filtros · N"
//   3. Chips de filtros aplicados (condicional)
//   4. Banner "N pendentes — Aplicar agora" (condicional)
//
// O drawer concentra todos os multi-selects em seções colapsáveis. A toolbar
// permanece enxuta, priorizando a leitura rápida do estado atual.
//
// ui-ux-pro-max: primary-action (1 CTA por área), progressive-disclosure,
// state-clarity (chip pulsante quando há pending), spacing-scale 4/8.

export function AdvancedFilters({
  inboxes,
  teams,
  assignees,
  initial,
  accountId,
}: AdvancedFiltersProps) {
  const router = useRouter();
  const { startTransition } = useFilterTransition();

  const [draft, setDraft] = useState<FilterState>(initial);
  const [applied, setApplied] = useState<FilterState>(initial);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pendingDiff = useMemo(
    () => diffFilterStates(draft, applied),
    [draft, applied],
  );
  const hasPending = pendingDiff > 0;
  const isDirty = !isFilterStateEqual(draft, applied);

  const appliedCount = useMemo(
    () =>
      applied.inboxIds.length +
      applied.teamIds.length +
      applied.assigneeIds.length +
      applied.statuses.length +
      applied.priorities.length,
    [applied],
  );

  const pushUrl = useCallback(
    (state: FilterState) => {
      const qs = serializeFilterState(state).toString();
      startTransition(() => {
        router.push(qs ? `?${qs}` : "?");
      });
    },
    [router, startTransition],
  );

  // Period aplica direto: muda draft + applied + URL num só clique.
  const handlePeriodChange = useCallback(
    (
      period: ExtendedPeriodKey,
      customRange?: { start: string; end: string },
    ) => {
      const canonical: CanonicalPeriodKey = isPeriodKey(period)
        ? period
        : "hoje";
      const next: FilterState = {
        ...draft,
        period: canonical,
        customRange: canonical === "custom" ? customRange : undefined,
      };
      setDraft(next);
      setApplied(next);
      pushUrl(next);
    },
    [draft, pushUrl],
  );

  const handleApply = useCallback(() => {
    if (!isDirty) return;
    setApplied(draft);
    pushUrl(draft);
  }, [draft, isDirty, pushUrl]);

  const handleReset = useCallback(() => {
    setDraft(EMPTY_FILTER_STATE);
    setApplied(EMPTY_FILTER_STATE);
    pushUrl(EMPTY_FILTER_STATE);
  }, [pushUrl]);

  // Remove a seleção inteira de um grupo (chip X) e aplica imediatamente.
  const handleRemoveGroup = useCallback(
    (key: keyof FilterState) => {
      const next: FilterState = { ...applied };
      switch (key) {
        case "inboxIds":
          next.inboxIds = [];
          break;
        case "teamIds":
          next.teamIds = [];
          break;
        case "assigneeIds":
          next.assigneeIds = [];
          break;
        case "statuses":
          next.statuses = [];
          break;
        case "priorities":
          next.priorities = [];
          break;
        default:
          return;
      }
      setApplied(next);
      setDraft(next);
      pushUrl(next);
    },
    [applied, pushUrl],
  );

  // Aplicar do drawer: promove draft → applied e atualiza URL.
  const handleDrawerApply = useCallback(
    (next: FilterState) => {
      setDraft(next);
      setApplied(next);
      pushUrl(next);
    },
    [pushUrl],
  );

  const updateSearch = (value: string) => {
    setDraft((prev) => ({ ...prev, search: value || undefined }));
  };

  return (
    <section
      aria-label="Filtros avançados"
      className="space-y-3 rounded-2xl border border-border/60 bg-card/50 p-4 shadow-sm"
    >
      {/* Linha 1 — Período */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Período
        </span>
        <div data-tour="period">
          <PeriodPills
            value={draft.period}
            customRange={draft.customRange}
            onChange={handlePeriodChange}
            accountId={accountId}
          />
        </div>
      </div>

      {/* Linha 2 — Busca + chip Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div data-tour="search" className="relative min-w-[260px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={draft.search ?? ""}
            onChange={(e) => updateSearch(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleApply();
              }
            }}
            placeholder="Buscar..."
            aria-label="Buscar conversas"
            className="h-9 pl-9"
          />
        </div>
        <Button
          data-tour="filters-chip"
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDrawerOpen(true)}
          aria-label={`Abrir filtros${appliedCount > 0 ? ` (${appliedCount} aplicados)` : ""}`}
          className={cn(
            "relative",
            appliedCount > 0 && "border-primary/50 text-foreground",
          )}
        >
          <Filter aria-hidden="true" />
          Filtros
          {appliedCount > 0 ? (
            <Badge
              variant="default"
              className="ml-1 h-5 min-w-5 px-1.5 tabular-nums"
            >
              {appliedCount}
            </Badge>
          ) : null}
          {hasPending ? (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card"
            />
          ) : null}
        </Button>
      </div>

      {/* Linha 3 — Chips aplicados (condicional) */}
      <AppliedFiltersChips
        meta={{ inboxes, teams, assignees }}
        applied={applied}
        onRemove={handleRemoveGroup}
        onClearAll={handleReset}
      />

      {/* Linha 4 — Banner pending (condicional) */}
      {hasPending ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
        >
          <Filter
            className="h-4 w-4 text-primary"
            aria-hidden="true"
          />
          <span className="text-foreground">
            <strong className="font-semibold">{pendingDiff}</strong>{" "}
            {pendingDiff === 1 ? "filtro pendente" : "filtros pendentes"}
          </span>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={handleApply}
            className="h-auto px-1 py-0 font-semibold text-primary"
          >
            Aplicar agora
          </Button>
        </div>
      ) : null}

      <FiltersDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        applied={applied}
        onApply={handleDrawerApply}
        onClear={handleReset}
        inboxes={inboxes}
        teams={teams}
        assignees={assignees}
      />
    </section>
  );
}

export default AdvancedFilters;
