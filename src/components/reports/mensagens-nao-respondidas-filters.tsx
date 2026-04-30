"use client";

import { useCallback, useMemo } from "react";
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
import { useFilterTransition } from "@/components/reports/filter-transition";

interface MetaItem {
  id: number;
  name: string;
}

export interface MensagensFiltersValue {
  inboxIds: number[];
  teamIds: number[];
  assigneeIds: number[];
}

interface Props {
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  initial: MensagensFiltersValue;
}

function serialize(v: MensagensFiltersValue): URLSearchParams {
  const sp = new URLSearchParams();
  if (v.inboxIds.length) sp.set("inbox", v.inboxIds.join(","));
  if (v.teamIds.length) sp.set("team", v.teamIds.join(","));
  if (v.assigneeIds.length) sp.set("assignee", v.assigneeIds.join(","));
  return sp;
}

export function MensagensNaoRespondidasFilters({
  inboxes,
  teams,
  assignees,
  initial,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isPending: pending, startTransition } = useFilterTransition();

  const value = initial;

  const update = useCallback(
    (next: MensagensFiltersValue) => {
      const sp = serialize(next);
      const qs = sp.toString();
      startTransition(() => {
        router.push(qs ? `?${qs}` : "?", { scroll: false });
      });
    },
    [router, startTransition],
  );

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
  const toggleAssignee = (id: number) => {
    const next = value.assigneeIds.includes(id)
      ? value.assigneeIds.filter((x) => x !== id)
      : [...value.assigneeIds, id];
    update({ ...value, assigneeIds: next });
  };

  const hasAnyActive = useMemo(
    () =>
      value.inboxIds.length > 0 ||
      value.teamIds.length > 0 ||
      value.assigneeIds.length > 0,
    [value],
  );

  const clearAll = () => {
    update({ inboxIds: [], teamIds: [], assigneeIds: [] });
  };

  void searchParams;

  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap items-center gap-3",
        pending && "opacity-80",
      )}
    >
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
        label="Atendente"
        options={assignees}
        selected={value.assigneeIds}
        onToggle={toggleAssignee}
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
