"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Filter, RotateCcw, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PeriodPills } from "@/components/reports/period-pills";
import {
  EMPTY_FILTER_STATE,
  type FilterState,
  diffFilterStates,
  isFilterStateEqual,
  serializeFilterState,
} from "@/lib/reports/filter-state";
import type { PeriodKey as CanonicalPeriodKey } from "@/lib/datetime-core";
import { isPeriodKey, type PeriodKey as ExtendedPeriodKey } from "@/lib/reports/period";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface MetaItem {
  id: number;
  name: string;
}

export interface AdvancedFiltersProps {
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  initial: FilterState;
}

// ---------------------------------------------------------------------------
// Status / Prioridade — domínio fechado (Chatwoot enum)
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: MetaItem[] = [
  { id: 0, name: "Aberto" },
  { id: 1, name: "Resolvido" },
  { id: 2, name: "Pendente" },
  { id: 3, name: "Adiado" },
];

const PRIORITY_OPTIONS: MetaItem[] = [
  { id: 0, name: "Urgente" },
  { id: 1, name: "Alta" },
  { id: 2, name: "Média" },
  { id: 3, name: "Baixa" },
];

// ---------------------------------------------------------------------------
// MultiSelectCheckbox — botão + popover com checkboxes
// ---------------------------------------------------------------------------

interface MultiSelectCheckboxProps {
  label: string;
  options: MetaItem[];
  value: number[];
  onChange: (next: number[]) => void;
  emptyLabel?: string;
}

function MultiSelectCheckbox({
  label,
  options,
  value,
  onChange,
  emptyLabel,
}: MultiSelectCheckboxProps) {
  const [open, setOpen] = useState(false);
  const count = value.length;
  const total = options.length;

  const toggle = (id: number) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const clear = () => onChange([]);

  const triggerLabel =
    count === 0
      ? label
      : count === 1
        ? `${label}: ${options.find((o) => o.id === value[0])?.name ?? "1"}`
        : `${label} (${count})`;

  const noOptions = total === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={noOptions}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`${label}: ${count} de ${total} selecionados`}
            className={cn(
              "inline-flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors",
              "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              "data-[state=open]:bg-muted/60",
              count > 0 && "border-primary/50",
              noOptions && "cursor-not-allowed opacity-60",
            )}
          >
            <span className="truncate">
              <span className="text-muted-foreground">{label}</span>
              {count > 0 ? (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                  {count}
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        }
      />
      <PopoverContent
        align="start"
        className="w-72 p-0"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">
            {label}
          </span>
          {count > 0 ? (
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              Limpar
            </button>
          ) : null}
        </div>
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className="max-h-64 overflow-y-auto py-1"
        >
          {options.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              {emptyLabel ?? "Sem opções disponíveis."}
            </p>
          ) : (
            options.map((opt) => {
              const checked = value.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                    "hover:bg-accent",
                    checked && "bg-accent/40",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(opt.id)}
                  />
                  <span className="truncate">{opt.name}</span>
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// AdvancedFilters
// ---------------------------------------------------------------------------

export function AdvancedFilters({
  inboxes,
  teams,
  assignees,
  initial,
}: AdvancedFiltersProps) {
  const router = useRouter();

  const [draft, setDraft] = useState<FilterState>(initial);
  const [applied, setApplied] = useState<FilterState>(initial);

  const pendingDiff = useMemo(
    () => diffFilterStates(draft, applied),
    [draft, applied],
  );
  const hasPending = pendingDiff > 0;
  const isDirty = !isFilterStateEqual(draft, applied);

  const isEmpty = useMemo(
    () => isFilterStateEqual(draft, EMPTY_FILTER_STATE),
    [draft],
  );

  const pushUrl = useCallback(
    (state: FilterState) => {
      const qs = serializeFilterState(state).toString();
      router.push(qs ? `?${qs}` : "?");
    },
    [router],
  );

  // Period aplica direto: muda draft + applied + URL num só clique.
  // PeriodPills tipa onChange com a PeriodKey estendida (inclui chaves legadas),
  // mas só usamos as 4 canônicas — narrowing via isPeriodKey garante runtime safety.
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

  const updateDraft = <K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <section
      aria-label="Filtros avançados"
      className="space-y-4 rounded-2xl border border-border/60 bg-card/50 p-4 shadow-sm"
    >
      {/* Linha 1 — Período */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Período
        </span>
        <PeriodPills
          value={draft.period}
          customRange={draft.customRange}
          onChange={handlePeriodChange}
        />
      </div>

      {/* Linha 2 — Multi-selects + busca */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <MultiSelectCheckbox
          label="Caixa de entrada"
          options={inboxes}
          value={draft.inboxIds}
          onChange={(v) => updateDraft("inboxIds", v)}
          emptyLabel="Nenhuma caixa disponível."
        />
        <MultiSelectCheckbox
          label="Equipe"
          options={teams}
          value={draft.teamIds}
          onChange={(v) => updateDraft("teamIds", v)}
          emptyLabel="Nenhuma equipe disponível."
        />
        <MultiSelectCheckbox
          label="Atendente"
          options={assignees}
          value={draft.assigneeIds}
          onChange={(v) => updateDraft("assigneeIds", v)}
          emptyLabel="Nenhum atendente disponível."
        />
        <MultiSelectCheckbox
          label="Status"
          options={STATUS_OPTIONS}
          value={draft.statuses}
          onChange={(v) => updateDraft("statuses", v)}
        />
        <MultiSelectCheckbox
          label="Prioridade"
          options={PRIORITY_OPTIONS}
          value={draft.priorities}
          onChange={(v) => updateDraft("priorities", v)}
        />
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={draft.search ?? ""}
            onChange={(e) =>
              updateDraft("search", e.currentTarget.value || undefined)
            }
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
      </div>

      {/* Linha 3 — Status + ações */}
      <div className="flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className={cn(
            "inline-flex items-center gap-2 text-sm",
            hasPending ? "text-foreground" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          <Filter
            className={cn(
              "h-4 w-4",
              hasPending ? "text-primary" : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
          {hasPending ? (
            <span>
              <strong className="font-semibold">{pendingDiff}</strong>{" "}
              {pendingDiff === 1 ? "filtro pendente" : "filtros pendentes"}
            </span>
          ) : (
            <span>Todos os filtros aplicados</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={isEmpty}
            aria-label="Limpar todos os filtros"
          >
            <RotateCcw aria-hidden="true" />
            Limpar
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleApply}
            disabled={!isDirty}
            aria-label="Aplicar filtros"
          >
            <Filter aria-hidden="true" />
            Aplicar filtros
          </Button>
        </div>
      </div>
    </section>
  );
}

export default AdvancedFilters;
