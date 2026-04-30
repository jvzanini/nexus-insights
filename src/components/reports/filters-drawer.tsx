"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  Building2,
  Filter,
  Inbox,
  RotateCcw,
  User,
} from "lucide-react";

import {
  Sheet,
  SheetBody,
  SheetFooter,
  SheetHeader,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { MultiSelectCheckbox } from "@/components/ui/multi-select-checkbox";
import {
  EMPTY_FILTER_STATE,
  diffFilterStates,
  isFilterStateEqual,
  type FilterState,
} from "@/lib/reports/filter-state";
import type { MetaItem } from "@/lib/chatwoot/queries/meta-cache";

/**
 * FiltersDrawer — drawer lateral com todos os multi-selects de filtro.
 *
 * Decisões de design (ui-ux-pro-max):
 * - Single primary CTA por tela: "Aplicar" no footer; "Limpar" como secundário.
 * - Discloure progressivo: cada filtro vive em uma `<CollapsibleSection>` que
 *   abre por default quando já há seleção (>0). Reduz overload e mantém o foco.
 * - Draft local: mudanças não escapam até clicar Aplicar. Reabrir o drawer
 *   ressincroniza com `applied` (descarta drafts antigos não aplicados).
 * - ESC e clique no overlay descartam o draft (delegado ao `<Sheet>`).
 * - `aria-modal=true`, focus trap nativo do `Dialog` (base-ui).
 */

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applied: FilterState;
  onApply: (next: FilterState) => void;
  onClear: () => void;
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
}

export function FiltersDrawer({
  open,
  onOpenChange,
  applied,
  onApply,
  onClear,
  inboxes,
  teams,
  assignees,
}: Props) {
  const [draft, setDraft] = useState<FilterState>(applied);

  // Sincroniza o draft sempre que o drawer reabre (evita estado obsoleto entre
  // reaberturas após aplicar/limpar externamente).
  useEffect(() => {
    if (open) setDraft(applied);
  }, [open, applied]);

  const isDirty = !isFilterStateEqual(draft, applied);
  const isEmpty = isFilterStateEqual(draft, EMPTY_FILTER_STATE);
  const pending = diffFilterStates(draft, applied);

  function update<K extends keyof FilterState>(k: K, v: FilterState[K]) {
    setDraft((p) => ({ ...p, [k]: v }));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} width={400}>
      <SheetHeader onClose={() => onOpenChange(false)}>
        <span className="inline-flex items-center gap-2">
          Filtros
          {pending > 0 ? (
            <span className="text-xs font-normal text-muted-foreground">
              ({pending} {pending === 1 ? "pendente" : "pendentes"})
            </span>
          ) : null}
        </span>
      </SheetHeader>

      <SheetBody className="space-y-3">
        <CollapsibleSection
          title="Caixa de entrada"
          count={draft.inboxIds.length}
          defaultOpen={draft.inboxIds.length > 0}
          icon={<Inbox className="h-4 w-4 text-muted-foreground" aria-hidden />}
        >
          <MultiSelectCheckbox
            label="Caixa de entrada"
            options={inboxes}
            value={draft.inboxIds}
            onChange={(v) => update("inboxIds", v)}
            emptyLabel="Nenhuma caixa disponível."
            inline
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Departamento"
          count={draft.teamIds.length}
          defaultOpen={draft.teamIds.length > 0}
          icon={
            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          }
        >
          <MultiSelectCheckbox
            label="Departamento"
            options={teams}
            value={draft.teamIds}
            onChange={(v) => update("teamIds", v)}
            emptyLabel="Nenhum departamento disponível."
            inline
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Atendente"
          count={draft.assigneeIds.length}
          defaultOpen={draft.assigneeIds.length > 0}
          icon={<User className="h-4 w-4 text-muted-foreground" aria-hidden />}
        >
          <MultiSelectCheckbox
            label="Atendente"
            options={assignees}
            value={draft.assigneeIds}
            onChange={(v) => update("assigneeIds", v)}
            emptyLabel="Nenhum atendente disponível."
            inline
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Status"
          count={draft.statuses.length}
          defaultOpen={draft.statuses.length > 0}
          icon={
            <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
          }
        >
          <MultiSelectCheckbox
            label="Status"
            options={STATUS_OPTIONS}
            value={draft.statuses}
            onChange={(v) => update("statuses", v)}
            inline
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Prioridade"
          count={draft.priorities.length}
          defaultOpen={draft.priorities.length > 0}
          icon={
            <AlertCircle
              className="h-4 w-4 text-muted-foreground"
              aria-hidden
            />
          }
        >
          <MultiSelectCheckbox
            label="Prioridade"
            options={PRIORITY_OPTIONS}
            value={draft.priorities}
            onChange={(v) => update("priorities", v)}
            inline
          />
        </CollapsibleSection>
      </SheetBody>

      <SheetFooter>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onClear();
            onOpenChange(false);
          }}
          disabled={isEmpty}
          aria-label="Limpar todos os filtros"
        >
          <RotateCcw aria-hidden="true" />
          Limpar todos
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            onApply(draft);
            onOpenChange(false);
          }}
          disabled={!isDirty}
          aria-label="Aplicar filtros"
        >
          <Filter aria-hidden="true" />
          Aplicar{pending > 0 ? ` (${pending})` : ""}
        </Button>
      </SheetFooter>
    </Sheet>
  );
}

export default FiltersDrawer;
