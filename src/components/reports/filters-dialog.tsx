"use client";

// FiltersDialog — Modal centralizado de filtros avançados (R2 da release Conversas Poderoso).
// Modo Simples: CollapsibleSections para inbox, team, assignee, status, prioridade e
// etiquetas, com Apply explícito. Modo Avançado: query builder via <ConditionalFilters>.

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  Building2,
  Filter,
  Inbox,
  RotateCcw,
  Tag,
  User,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { MultiSelectCheckbox } from "@/components/ui/multi-select-checkbox";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ConditionalFilters,
  type ConditionFieldDef,
} from "@/components/ui/conditional-filters";
import {
  EMPTY_FILTER_STATE,
  diffFilterStates,
  isFilterStateEqual,
  type FilterState,
} from "@/lib/reports/filter-state";
import type { MetaItem } from "@/lib/chatwoot/queries/meta-cache";
import { STATUS_OPTIONS as STATUS_BADGE_OPTIONS } from "./status-badge";

// Mapeia STATUS_OPTIONS (formato {value,label} do badge) para o formato
// MetaItem ({id,name}) esperado pelo MultiSelectCheckbox.
const STATUS_OPTIONS: MetaItem[] = STATUS_BADGE_OPTIONS.map((o) => ({
  id: o.value,
  name: o.label,
}));

const PRIORITY_OPTIONS: MetaItem[] = [
  { id: 0, name: "Urgente" },
  { id: 1, name: "Alta" },
  { id: 2, name: "Média" },
  { id: 3, name: "Baixa" },
];

// Monta a lista de campos do query builder com base nos metadados disponíveis.
// Cada campo declara seu tipo (string|number|select|multi_select|date) que dita
// quais operadores ficam disponíveis no <ConditionalFilters>.
function buildFields({
  inboxes,
  teams,
  assignees,
  labels,
}: {
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  labels: MetaItem[];
}): ConditionFieldDef[] {
  return [
    {
      key: "inbox.id",
      label: "Caixa de entrada",
      type: "multi_select",
      options: inboxes.map((i) => ({ value: i.id, label: i.name })),
    },
    {
      key: "team.id",
      label: "Departamento",
      type: "multi_select",
      options: teams.map((t) => ({ value: t.id, label: t.name })),
    },
    {
      key: "assignee.id",
      label: "Atendente",
      type: "multi_select",
      options: assignees.map((a) => ({ value: a.id, label: a.name })),
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: 0, label: "Aberta" },
        { value: 1, label: "Resolvida" },
        { value: 2, label: "Pendente" },
        { value: 3, label: "Adiada" },
      ],
    },
    {
      key: "priority",
      label: "Prioridade",
      type: "select",
      options: [
        { value: 0, label: "Urgente" },
        { value: 1, label: "Alta" },
        { value: 2, label: "Média" },
        { value: 3, label: "Baixa" },
      ],
    },
    {
      key: "labels",
      label: "Etiquetas",
      type: "multi_select",
      options: labels.map((l) => ({ value: l.id, label: l.name })),
    },
    {
      key: "waiting_seconds",
      label: "Tempo sem resposta (s)",
      type: "number",
    },
    {
      key: "open_seconds",
      label: "Tempo aberta (s)",
      type: "number",
    },
    {
      key: "contact.name",
      label: "Nome do contato",
      type: "string",
    },
    {
      key: "contact.phone_number",
      label: "WhatsApp",
      type: "string",
    },
  ];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applied: FilterState;
  onApply: (next: FilterState) => void;
  onClear: () => void;
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  labels: MetaItem[];
}

export function FiltersDialog({
  open,
  onOpenChange,
  applied,
  onApply,
  onClear,
  inboxes,
  teams,
  assignees,
  labels,
}: Props) {
  const [draft, setDraft] = useState<FilterState>(applied);

  // Reset do draft sempre que o modal abrir, capturando o estado aplicado vigente.
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[920px]">
        <DialogTitle>Filtros avançados</DialogTitle>
        <DialogDescription className="sr-only">
          Refine a lista de conversas combinando filtros nativos.
        </DialogDescription>

        <Tabs
          value={draft.mode}
          onValueChange={(v) => update("mode", v as FilterState["mode"])}
          className="py-4"
        >
          <TabsList>
            <TabsTrigger value="simple">Simples</TabsTrigger>
            <TabsTrigger value="advanced">Avançado</TabsTrigger>
          </TabsList>

          <TabsContent value="simple" className="mt-3 space-y-3">
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

          <CollapsibleSection
            title="Etiquetas"
            count={draft.labelIds.length}
            defaultOpen={draft.labelIds.length > 0}
            icon={<Tag className="h-4 w-4 text-muted-foreground" aria-hidden />}
          >
            <MultiSelectCheckbox
              label="Etiquetas"
              options={labels}
              value={draft.labelIds}
              onChange={(v) => update("labelIds", v)}
              emptyLabel="Nenhuma etiqueta disponível."
              inline
            />
          </CollapsibleSection>
          </TabsContent>

          <TabsContent value="advanced" className="mt-3">
            <ConditionalFilters
              fields={buildFields({ inboxes, teams, assignees, labels })}
              initial={draft.conditionGroup}
              onChange={(g) => update("conditionGroup", g)}
            />
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between border-t border-border pt-4">
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
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FiltersDialog;
