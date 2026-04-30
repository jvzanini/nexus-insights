"use client";

// AdvancedFilters — toolbar sticky com Período + Busca + 2 chips de modal:
// "Filtros · N" (FiltersDialog Simples/Avançado) e "Ordenação · N"
// (SortingDialog).
//
// O toolbar mede sua própria altura via ResizeObserver e expõe `--toolbar-h`
// como CSS var no <html>, consumida pelo `sticky thead` da tabela em
// `top-[var(--toolbar-h,132px)]`.
//
// ui-ux-pro-max: primary-action (1 CTA por área), progressive-disclosure,
// state-clarity (chip pulsante quando há pending), spacing-scale 4/8.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Filter, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PeriodPills } from "@/components/reports/period-pills";
import { useFilterTransition } from "@/components/reports/filter-transition";
import { AppliedFiltersChips } from "@/components/reports/applied-filters-chips";
import { FiltersDialog } from "@/components/reports/filters-dialog";
import {
  SortingDialog,
  type SortRule,
  type SortRuleOption,
} from "@/components/reports/sorting-dialog";
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

// Critérios de ordenação disponíveis na tabela de conversas — espelha as
// colunas com `compareFn` definidos em <ConversasTable>.
const SORT_OPTIONS: SortRuleOption[] = [
  { key: "display_id", label: "#" },
  { key: "name", label: "Nome" },
  { key: "phone", label: "WhatsApp" },
  { key: "inbox", label: "Estado" },
  { key: "team", label: "Departamento" },
  { key: "assignee", label: "Atendente" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Prioridade" },
  { key: "waiting_seconds", label: "Sem resposta há" },
  { key: "open_seconds", label: "Aberta há" },
  { key: "created_at", label: "Criado em" },
  { key: "last_activity_at", label: "Última atualização" },
];

export interface AdvancedFiltersProps {
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  /** Etiquetas (labels) da conta — usadas tanto no modo Simples como no Avançado. */
  labels: MetaItem[];
  initial: FilterState;
  /** Conta ativa — usada para limitar o calendário ao primeiro registro do banco. */
  accountId?: number;
  /** Stack de critérios de ordenação. Cabeada bidirecionalmente com a tabela. */
  sortStack: SortRule[];
  onSortStackChange: (next: SortRule[]) => void;
}

export function AdvancedFilters({
  inboxes,
  teams,
  assignees,
  labels,
  initial,
  accountId,
  sortStack,
  onSortStackChange,
}: AdvancedFiltersProps) {
  const router = useRouter();
  const { startTransition } = useFilterTransition();

  const [draft, setDraft] = useState<FilterState>(initial);
  const [applied, setApplied] = useState<FilterState>(initial);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortingOpen, setSortingOpen] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);

  // Mede a altura do toolbar e exporta como `--toolbar-h` no <html>. O thead
  // sticky da tabela usa esse valor como `top: var(--toolbar-h, fallback)`.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = Math.ceil(entries[0]?.contentRect.height ?? 0);
      document.documentElement.style.setProperty("--toolbar-h", `${h}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pendingDiff = useMemo(
    () => diffFilterStates(draft, applied),
    [draft, applied],
  );
  const hasPending = pendingDiff > 0;

  const appliedCount = useMemo(
    () =>
      applied.inboxIds.length +
      applied.teamIds.length +
      applied.assigneeIds.length +
      applied.statuses.length +
      applied.priorities.length +
      applied.labelIds.length +
      (applied.mode === "advanced" &&
      applied.conditionGroup?.conditions?.length
        ? 1
        : 0),
    [applied],
  );

  const sortCount = sortStack.length;

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
    if (isFilterStateEqual(draft, applied)) return;
    setApplied(draft);
    pushUrl(draft);
  }, [draft, applied, pushUrl]);

  const handleReset = useCallback(() => {
    setDraft(EMPTY_FILTER_STATE);
    setApplied(EMPTY_FILTER_STATE);
    pushUrl(EMPTY_FILTER_STATE);
  }, [pushUrl]);

  // Aplicar do dialog: promove draft → applied e atualiza URL.
  const handleDialogApply = useCallback(
    (next: FilterState) => {
      setDraft(next);
      setApplied(next);
      pushUrl(next);
    },
    [pushUrl],
  );

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
        case "labelIds":
          next.labelIds = [];
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

  const updateSearch = (value: string) => {
    setDraft((prev) => ({ ...prev, search: value || undefined }));
  };

  return (
    <section
      ref={sectionRef}
      role="toolbar"
      aria-label="Filtros avançados"
      data-toolbar="conversas"
      className="sticky top-0 z-[var(--z-toolbar,30)] -mx-4 space-y-3 border-b border-border/60 bg-card/95 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      {/* Linha 1 — Período */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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

      {/* Linha 2 — Busca + chip Filtros + chip Ordenação */}
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
            className="h-10 pl-9"
          />
        </div>

        <Button
          data-tour="filters-chip"
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setFiltersOpen(true)}
          aria-label={`Abrir filtros${
            appliedCount > 0 ? ` (${appliedCount} aplicados)` : ""
          }`}
          className={cn(
            "relative h-10 px-4",
            appliedCount > 0 && "border-violet-500/40 text-foreground",
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

        <Button
          data-tour="sorting-chip"
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSortingOpen(true)}
          aria-label={`Abrir ordenação${
            sortCount > 0 ? ` (${sortCount} critérios)` : ""
          }`}
          className={cn(
            "relative h-10 px-4",
            sortCount > 0 && "border-violet-500/40 text-foreground",
          )}
        >
          <ArrowUpDown aria-hidden="true" />
          Ordenação
          {sortCount > 0 ? (
            <Badge
              variant="default"
              className="ml-1 h-5 min-w-5 px-1.5 tabular-nums"
            >
              {sortCount}
            </Badge>
          ) : null}
        </Button>
      </div>

      {/* Linha 3 — Chips aplicados (condicional) */}
      <AppliedFiltersChips
        meta={{ inboxes, teams, assignees, labels }}
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
          <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
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

      <FiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        applied={applied}
        onApply={handleDialogApply}
        onClear={handleReset}
        inboxes={inboxes}
        teams={teams}
        assignees={assignees}
        labels={labels}
      />

      <SortingDialog
        open={sortingOpen}
        onOpenChange={setSortingOpen}
        applied={sortStack}
        options={SORT_OPTIONS}
        onApply={onSortStackChange}
        onClear={() => onSortStackChange([])}
      />
    </section>
  );
}

export default AdvancedFilters;
