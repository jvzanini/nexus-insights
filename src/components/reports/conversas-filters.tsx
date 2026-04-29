"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  PeriodSelector,
  type PeriodKey,
} from "@/components/reports/period-selector";
import { STATUS_OPTIONS } from "@/components/reports/status-badge";

import {
  type ConversasFiltersValue,
  serializeFilters,
  DEFAULT_PERIOD,
} from "@/lib/reports/conversas-filters";

export {
  type ConversasFiltersValue,
  deserializeFilters,
  serializeFilters,
  DEFAULT_PERIOD,
} from "@/lib/reports/conversas-filters";

interface MetaItem {
  id: number;
  name: string;
}

interface ConversasFiltersProps {
  inboxes: MetaItem[];
  teams: MetaItem[];
  initial: ConversasFiltersValue;
}

export function ConversasFilters({
  inboxes,
  teams,
  initial,
}: ConversasFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const value = initial;

  const update = useCallback(
    (next: ConversasFiltersValue) => {
      const sp = serializeFilters(next);
      const qs = sp.toString();
      startTransition(() => {
        router.push(qs ? `?${qs}` : "?", { scroll: false });
      });
    },
    [router],
  );

  const setPeriod = (period: PeriodKey) => update({ ...value, period });
  const toggleInbox = (id: number) => {
    const next = value.inboxIds.includes(id)
      ? value.inboxIds.filter((x) => x !== id)
      : [...value.inboxIds, id];
    update({ ...value, inboxIds: next });
  };
  const toggleTeam = (id: number) => {
    const next = value.teamIds.includes(id)
      ? value.teamIds.filter((x) => x !== id)
      : [...value.teamIds, id];
    update({ ...value, teamIds: next });
  };
  const toggleStatus = (id: number) => {
    const next = value.statuses.includes(id)
      ? value.statuses.filter((x) => x !== id)
      : [...value.statuses, id];
    update({ ...value, statuses: next });
  };

  const hasAnyActive = useMemo(
    () =>
      value.inboxIds.length > 0 ||
      value.teamIds.length > 0 ||
      value.statuses.length > 0 ||
      value.period !== DEFAULT_PERIOD,
    [value],
  );

  const clearAll = () => {
    update({
      period: DEFAULT_PERIOD,
      inboxIds: [],
      teamIds: [],
      statuses: [],
    });
  };

  // Garantir que o searchParams seja consumido para evitar warning de unused
  // (o pai já passa o initial deserializado, mas mantemos o hook ativo).
  void searchParams;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 mb-6",
        pending && "opacity-80",
      )}
    >
      <PeriodSelector value={value.period} onChange={setPeriod} />

      <MultiSelectFilter
        label="Estado"
        options={inboxes}
        selected={value.inboxIds}
        onToggle={toggleInbox}
      />

      <MultiSelectFilter
        label="Departamento"
        options={teams}
        selected={value.teamIds}
        onToggle={toggleTeam}
      />

      <MultiSelectFilter
        label="Status"
        options={STATUS_OPTIONS.map((o) => ({ id: o.value, name: o.label }))}
        selected={value.statuses}
        onToggle={toggleStatus}
      />

      {hasAnyActive ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          aria-label="Limpar filtros"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Limpar filtros
        </Button>
      ) : null}
    </div>
  );
}

interface MultiSelectFilterProps {
  label: string;
  options: MetaItem[];
  selected: number[];
  onToggle: (id: number) => void;
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onToggle,
}: MultiSelectFilterProps) {
  const count = selected.length;
  return (
    <Popover>
      <PopoverTrigger
        render={(props) => (
          <button
            type="button"
            {...props}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors",
              "hover:border-muted-foreground/30",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
              count > 0 && "border-violet-500/40 text-foreground",
            )}
          >
            <span>{label}</span>
            {count > 0 ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500/20 px-1 text-[10px] text-violet-400">
                {count}
              </span>
            ) : null}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      />
      <PopoverContent align="start" className="w-64 p-0">
        <div className="max-h-72 overflow-y-auto p-1">
          {options.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">
              Nenhuma opção disponível.
            </div>
          ) : (
            options.map((opt) => {
              const checked = selected.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                    "hover:bg-muted/60",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggle(opt.id)}
                  />
                  <span className="flex-1 truncate">{opt.name}</span>
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
