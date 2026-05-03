"use client";

// FiltersDialog — Modal centralizado de filtros avançados.
// Modo Simples: CollapsibleSections em accordion mutex (1 aberta por vez).
// Modo Avançado: query builder via <ConditionalFilters>.
// Layout: max-w 1100px, max-h 85vh, body com overflow-y-auto interno e footer
// fixo. Apply explícito.

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  Building2,
  FileText,
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
  diffFilterStates,
  isFilterStateEqual,
  type DocumentTypeFilter,
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

// Documento: 3 opções binárias mapeadas pra DocumentTypeFilter.
// MultiSelectCheckbox espera ids numéricos, então mantemos um mapping
// interno bijetor (id ↔ string literal).
const DOC_OPTIONS: MetaItem[] = [
  { id: 1, name: "Com CPF" },
  { id: 2, name: "Com CNPJ" },
  { id: 3, name: "Sem documento" },
];

const ID_TO_DOC_TYPE: Record<number, DocumentTypeFilter | undefined> = {
  1: "cpf",
  2: "cnpj",
  3: "none",
};

const DOC_TYPE_TO_ID: Record<DocumentTypeFilter, number> = {
  cpf: 1,
  cnpj: 2,
  none: 3,
};

type SimpleSectionKey =
  | "inboxIds"
  | "teamIds"
  | "assigneeIds"
  | "statuses"
  | "priorities"
  | "labelIds"
  | "documentTypes";

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
  /**
   * Mantido por compatibilidade com callers existentes (handleReset externo
   * que reseta período + ordenação). v0.23: o botão "Limpar todos" do dialog
   * NÃO chama mais `onClear` — zera apenas os filtros do draft localmente,
   * preservando período/mode e mantendo o modal aberto.
   */
  onClear?: () => void;
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
  inboxes,
  teams,
  assignees,
  labels,
}: Props) {
  const [draft, setDraft] = useState<FilterState>(applied);
  // Accordion mutex: apenas uma seção do Modo Simples aberta por vez.
  // v0.23 — começam todas FECHADAS por padrão (progressive disclosure).
  // Usuário escolhe explicitamente o que abrir; reduz overwhelm visual.
  const [openSection, setOpenSection] = useState<SimpleSectionKey | null>(
    null,
  );

  // Reset do draft sempre que o modal abrir, capturando o estado aplicado vigente.
  // Sections permanecem fechadas — usuário decide o que expandir.
  useEffect(() => {
    if (!open) return;
    setDraft(applied);
    setOpenSection(null);
  }, [open, applied]);

  const isDirty = !isFilterStateEqual(draft, applied);
  const pending = diffFilterStates(draft, applied);

  function update<K extends keyof FilterState>(k: K, v: FilterState[K]) {
    setDraft((p) => ({ ...p, [k]: v }));
  }

  // Handler que mantém apenas uma seção aberta por vez.
  function makeSectionToggle(key: SimpleSectionKey) {
    return (next: boolean) => {
      setOpenSection(next ? key : null);
    };
  }

  // v0.23 — "Limpar todos" zera apenas os filtros do dialog (inboxIds, teamIds,
  // assigneeIds, statuses, priorities, labelIds). NÃO toca período, customRange,
  // mode, conditionGroup, search ou page; também NÃO fecha o modal nem chama
  // onClear (que reseta período fora do dialog). O usuário decide quando aplicar.
  function handleClearOnlyFilters() {
    setDraft((prev) => ({
      ...prev,
      inboxIds: [],
      teamIds: [],
      assigneeIds: [],
      statuses: [],
      priorities: [],
      labelIds: [],
      documentTypes: [],
    }));
  }

  // Botão "Limpar todos" só faz sentido quando há ao menos um filtro selecionado
  // entre os 7 arrays do dialog (independe de período/mode).
  const hasAnyFilter =
    draft.inboxIds.length > 0 ||
    draft.teamIds.length > 0 ||
    draft.assigneeIds.length > 0 ||
    draft.statuses.length > 0 ||
    draft.priorities.length > 0 ||
    draft.labelIds.length > 0 ||
    (draft.documentTypes ?? []).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(96vw,1100px)] max-w-[96vw] flex-col gap-0 p-0 sm:max-w-[1100px]">
        {/* Header — fixo. Título reflete o draft.mode atual (simples vs avançado),
            atualizando ao trocar de tab antes mesmo de aplicar. */}
        <div className="border-b border-border px-6 py-4">
          <DialogTitle>
            Filtros {draft.mode === "advanced" ? "avançados" : "simples"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Refine a lista de conversas combinando filtros nativos no modo
            Simples ou condições E/OU em grupos no modo Avançado.
          </DialogDescription>
        </div>

        {/* Body — scroll interno */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-4">
          <Tabs
            value={draft.mode}
            onValueChange={(v) => update("mode", v as FilterState["mode"])}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList>
              <TabsTrigger value="simple" className="cursor-pointer">
                Simples
              </TabsTrigger>
              <TabsTrigger value="advanced" className="cursor-pointer">
                Avançado
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="simple"
              className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
            >
              <CollapsibleSection
                title="Caixa de entrada"
                count={draft.inboxIds.length}
                open={openSection === "inboxIds"}
                onOpenChange={makeSectionToggle("inboxIds")}
                icon={
                  <Inbox className="h-4 w-4 text-muted-foreground" aria-hidden />
                }
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
                open={openSection === "teamIds"}
                onOpenChange={makeSectionToggle("teamIds")}
                icon={
                  <Building2
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden
                  />
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
                open={openSection === "assigneeIds"}
                onOpenChange={makeSectionToggle("assigneeIds")}
                icon={
                  <User className="h-4 w-4 text-muted-foreground" aria-hidden />
                }
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
                open={openSection === "statuses"}
                onOpenChange={makeSectionToggle("statuses")}
                icon={
                  <Activity
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden
                  />
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
                open={openSection === "priorities"}
                onOpenChange={makeSectionToggle("priorities")}
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
                open={openSection === "labelIds"}
                onOpenChange={makeSectionToggle("labelIds")}
                icon={
                  <Tag className="h-4 w-4 text-muted-foreground" aria-hidden />
                }
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

              <CollapsibleSection
                title="Documento"
                count={(draft.documentTypes ?? []).length}
                open={openSection === "documentTypes"}
                onOpenChange={makeSectionToggle("documentTypes")}
                icon={
                  <FileText
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden
                  />
                }
              >
                <MultiSelectCheckbox
                  label="Documento"
                  options={DOC_OPTIONS}
                  value={(draft.documentTypes ?? []).map(
                    (t) => DOC_TYPE_TO_ID[t],
                  )}
                  onChange={(ids) =>
                    update(
                      "documentTypes",
                      ids
                        .map((id) => ID_TO_DOC_TYPE[id])
                        .filter(
                          (t): t is DocumentTypeFilter => t !== undefined,
                        ),
                    )
                  }
                  inline
                />
              </CollapsibleSection>
            </TabsContent>

            <TabsContent
              value="advanced"
              className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
            >
              <ConditionalFilters
                fields={buildFields({ inboxes, teams, assignees, labels })}
                initial={draft.conditionGroup}
                onChange={(g) => update("conditionGroup", g)}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer — fixo */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearOnlyFilters}
            disabled={!hasAnyFilter}
            aria-label="Limpar todos os filtros"
            className="cursor-pointer disabled:cursor-not-allowed"
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
              className="cursor-pointer"
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
              className="cursor-pointer disabled:cursor-not-allowed"
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
