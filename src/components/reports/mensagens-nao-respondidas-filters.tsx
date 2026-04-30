"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MultiSelectCheckbox } from "@/components/ui/multi-select-checkbox";
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

/**
 * MensagensNaoRespondidasFilters — toolbar leve com 3 multi-selects + Limpar.
 *
 * Diferente do `AdvancedFilters` (toolbar+drawer cheio), este filtro tem layout
 * próprio inline porque a página tem visual mais enxuto. Reusa o
 * `MultiSelectCheckbox` 2.0 (busca interna + selecionar todos/visíveis) para
 * consistência com o restante da plataforma.
 */
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

  const onChangeInboxes = (ids: number[]) =>
    update({ ...value, inboxIds: ids });
  const onChangeTeams = (ids: number[]) => update({ ...value, teamIds: ids });
  const onChangeAssignees = (ids: number[]) =>
    update({ ...value, assigneeIds: ids });

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
        "mb-6 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]",
        pending && "opacity-80",
      )}
    >
      <MultiSelectCheckbox
        label="Estado"
        options={inboxes}
        value={value.inboxIds}
        onChange={onChangeInboxes}
        emptyLabel="Nenhum estado disponível."
      />
      <MultiSelectCheckbox
        label="Departamento"
        options={teams}
        value={value.teamIds}
        onChange={onChangeTeams}
        emptyLabel="Nenhum departamento disponível."
      />
      <MultiSelectCheckbox
        label="Atendente"
        options={assignees}
        value={value.assigneeIds}
        onChange={onChangeAssignees}
        emptyLabel="Nenhum atendente disponível."
      />
      {hasAnyActive ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          aria-label="Limpar filtros"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Limpar filtros
        </Button>
      ) : null}
    </div>
  );
}
