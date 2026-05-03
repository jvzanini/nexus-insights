"use client";

import { ArrowDown, ArrowUp, X, Zap } from "lucide-react";

import { FilterChipListPopover } from "@/components/reports/filter-chip-list-popover";
import type {
  DocumentTypeFilter,
  FilterState,
} from "@/lib/reports/filter-state";
import type { MetaItem } from "@/lib/chatwoot/queries/meta-cache";
import type {
  SortRule,
  SortRuleOption,
} from "@/components/reports/sorting-dialog";
import {
  QUICK_FILTER_DEFS,
  type QuickFilterKey,
} from "@/lib/reports/quick-filters";

/**
 * AppliedFiltersChips — chips compactos resumindo filtros já aplicados.
 *
 * Comportamento:
 * - Não renderiza nada quando nenhum grupo tem seleção (estado vazio).
 * - Cada categoria com seleção produz 1 chip com formato:
 *     "<Label>: <PrimeiroNome>"        quando 1 selecionado
 *     "<Label>: <PrimeiroNome> +N"     quando 2+ selecionados
 * - Botão X em cada chip remove TODA a seleção do grupo (`onRemove(key)`).
 * - Botão "Limpar tudo" (link sutil) chama `onClearAll`.
 *
 * Decisões de design (ui-ux-pro-max):
 * - touch target: X tem `h-5 w-5` (20px) com hit area expandido pelo padding;
 *   o chip inteiro é selecionável via teclado/leitor de tela.
 * - contraste: bg `muted/40` + border `border/60` mantém >=4.5:1 com texto
 *   `foreground` em ambos os temas.
 * - `aria-label` no X é descritivo ("Remover Caixa de entrada"), evitando
 *   icon-only sem rótulo.
 */

interface Meta {
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  /** Etiquetas (labels) — opcional para preservar compatibilidade. */
  labels?: MetaItem[];
}

interface Props {
  meta: Meta;
  applied: FilterState;
  onRemove: (key: keyof FilterState) => void;
  onClearAll: () => void;
  /** Remove individual de um id de um grupo (popover do chip +N). */
  onRemoveOne?: (key: keyof FilterState, id: number) => void;
  /** Critérios de ordenação aplicados (opcional). */
  sortStack?: SortRule[];
  sortOptions?: SortRuleOption[];
  onRemoveSort?: (key: string) => void;
  onClearAllSort?: () => void;
  /** Atalhos rápidos ativos (opcional). */
  quickFilters?: Set<QuickFilterKey>;
  onRemoveQuick?: (key: QuickFilterKey) => void;
}

const STATUS_LABELS: Record<number, string> = {
  0: "Aberta",
  1: "Resolvida",
  2: "Pendente",
  3: "Adiada",
};

const PRIORITY_LABELS: Record<number, string> = {
  0: "Urgente",
  1: "Alta",
  2: "Média",
  3: "Baixa",
};

// Documento: mantém um mapping bijetor entre id numérico (consumido por
// summarize/popover de chip +N) e DocumentTypeFilter (storage no
// FilterState). Mantido sincronizado com FiltersDialog.
const DOC_TYPE_LABELS: Record<number, string> = {
  1: "Com CPF",
  2: "Com CNPJ",
  3: "Sem documento",
};

const DOC_TYPE_TO_ID_LOCAL: Record<DocumentTypeFilter, number> = {
  cpf: 1,
  cnpj: 2,
  none: 3,
};

const ID_TO_DOC_TYPE_LOCAL: Record<number, DocumentTypeFilter | undefined> = {
  1: "cpf",
  2: "cnpj",
  3: "none",
};

function docTypesToIds(types: DocumentTypeFilter[]): number[] {
  return types.map((t) => DOC_TYPE_TO_ID_LOCAL[t]);
}

function summarize(
  label: string,
  ids: number[],
  items: MetaItem[] | Record<number, string>,
): string {
  if (ids.length === 0) return "";
  const first = ids[0]!;
  const get = (id: number): string => {
    if (Array.isArray(items)) {
      return items.find((i) => i.id === id)?.name ?? `${id}`;
    }
    return items[id] ?? `${id}`;
  };
  if (ids.length === 1) return `${label}: ${get(first)}`;
  return `${label}: ${get(first)} +${ids.length - 1}`;
}

interface ResolvedItem {
  id: number;
  name: string;
}

function resolveItems(
  key: keyof FilterState,
  ids: number[],
  meta: Meta,
): ResolvedItem[] {
  if (key === "inboxIds") {
    return ids.map((id) => ({
      id,
      name: meta.inboxes.find((x) => x.id === id)?.name ?? `${id}`,
    }));
  }
  if (key === "teamIds") {
    return ids.map((id) => ({
      id,
      name: meta.teams.find((x) => x.id === id)?.name ?? `${id}`,
    }));
  }
  if (key === "assigneeIds") {
    return ids.map((id) => ({
      id,
      name: meta.assignees.find((x) => x.id === id)?.name ?? `${id}`,
    }));
  }
  if (key === "labelIds") {
    return ids.map((id) => ({
      id,
      name: meta.labels?.find((x) => x.id === id)?.name ?? `${id}`,
    }));
  }
  if (key === "statuses") {
    return ids.map((id) => ({ id, name: STATUS_LABELS[id] ?? `${id}` }));
  }
  if (key === "priorities") {
    return ids.map((id) => ({ id, name: PRIORITY_LABELS[id] ?? `${id}` }));
  }
  if (key === "documentTypes") {
    return ids.map((id) => ({ id, name: DOC_TYPE_LABELS[id] ?? `${id}` }));
  }
  return [];
}

export function AppliedFiltersChips({
  meta,
  applied,
  onRemove,
  onClearAll,
  onRemoveOne,
  sortStack,
  sortOptions,
  onRemoveSort,
  onClearAllSort,
  quickFilters,
  onRemoveQuick,
}: Props) {
  const chips: Array<{ key: keyof FilterState; label: string }> = [];

  if (applied.inboxIds.length) {
    chips.push({
      key: "inboxIds",
      label: summarize("Caixa de entrada", applied.inboxIds, meta.inboxes),
    });
  }
  if (applied.teamIds.length) {
    chips.push({
      key: "teamIds",
      label: summarize("Departamento", applied.teamIds, meta.teams),
    });
  }
  if (applied.assigneeIds.length) {
    chips.push({
      key: "assigneeIds",
      label: summarize("Atendente", applied.assigneeIds, meta.assignees),
    });
  }
  if (applied.statuses.length) {
    chips.push({
      key: "statuses",
      label: summarize("Status", applied.statuses, STATUS_LABELS),
    });
  }
  if (applied.priorities.length) {
    chips.push({
      key: "priorities",
      label: summarize("Prioridade", applied.priorities, PRIORITY_LABELS),
    });
  }
  if (applied.labelIds.length) {
    chips.push({
      key: "labelIds",
      label: summarize("Etiquetas", applied.labelIds, meta.labels ?? []),
    });
  }
  if (applied.documentTypes && applied.documentTypes.length) {
    const docIds = docTypesToIds(applied.documentTypes);
    chips.push({
      key: "documentTypes",
      label: summarize("Documento", docIds, DOC_TYPE_LABELS),
    });
  }

  const sortChips = sortStack?.length
    ? sortStack.map((rule, idx) => {
        const opt = sortOptions?.find((o) => o.key === rule.key);
        return {
          key: rule.key,
          direction: rule.direction,
          index: idx + 1,
          label: opt?.label ?? rule.key,
        };
      })
    : [];

  const quickChips =
    quickFilters && quickFilters.size > 0
      ? QUICK_FILTER_DEFS.filter((d) => quickFilters.has(d.key)).map((d) => ({
          key: d.key,
          label: d.label,
        }))
      : [];

  if (
    chips.length === 0 &&
    sortChips.length === 0 &&
    quickChips.length === 0
  )
    return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {quickChips.map((q) => (
        <span
          key={`quick-${q.key}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-foreground"
        >
          <Zap className="h-3 w-3 text-amber-400" aria-hidden="true" />
          <span className="truncate">{q.label}</span>
          {onRemoveQuick ? (
            <button
              type="button"
              onClick={() => onRemoveQuick(q.key)}
              aria-label={`Remover atalho ${q.label}`}
              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      ))}

      {chips.map((c) => {
        const ids = (() => {
          switch (c.key) {
            case "inboxIds":
              return applied.inboxIds;
            case "teamIds":
              return applied.teamIds;
            case "assigneeIds":
              return applied.assigneeIds;
            case "statuses":
              return applied.statuses;
            case "priorities":
              return applied.priorities;
            case "labelIds":
              return applied.labelIds;
            case "documentTypes":
              return docTypesToIds(applied.documentTypes ?? []);
            default:
              return [];
          }
        })();
        const groupName = c.label.split(":")[0]?.trim() ?? c.label;

        // 2+ items + onRemoveOne disponível: usa popover.
        if (ids.length >= 2 && onRemoveOne) {
          return (
            <FilterChipListPopover
              key={c.key as string}
              groupLabel={groupName}
              items={resolveItems(c.key, ids, meta)}
              onRemoveOne={(id) => onRemoveOne(c.key, id)}
              onRemoveAll={() => onRemove(c.key)}
            />
          );
        }

        // 1 item OR sem onRemoveOne: chip simples (X destrutivo).
        return (
          <span
            key={c.key as string}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-foreground"
          >
            <span className="truncate">{c.label}</span>
            <button
              type="button"
              onClick={() => onRemove(c.key)}
              aria-label={`Remover ${groupName}`}
              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        );
      })}

      {sortChips.map((c) => (
        <span
          key={`sort-${c.key}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-xs text-foreground"
        >
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-500/20 text-[9px] font-bold text-violet-300 tabular-nums">
            {c.index}
          </span>
          {c.direction === "asc" ? (
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
          )}
          <span className="truncate">{c.label}</span>
          {onRemoveSort ? (
            <button
              type="button"
              onClick={() => onRemoveSort(c.key)}
              aria-label={`Remover ordenação por ${c.label}`}
              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}

export default AppliedFiltersChips;
