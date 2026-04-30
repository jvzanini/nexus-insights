"use client";

import { ArrowDown, ArrowUp, X, Zap } from "lucide-react";

import type { FilterState } from "@/lib/reports/filter-state";
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

export function AppliedFiltersChips({
  meta,
  applied,
  onRemove,
  onClearAll,
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
    // Mostra apenas a contagem porque os nomes das etiquetas podem ser
    // longos e poluir o toolbar — o detalhamento é visto no <FiltersDialog>.
    chips.push({
      key: "labelIds",
      label: `Etiquetas (${applied.labelIds.length})`,
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
              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      ))}

      {chips.map((c) => {
        const groupName = c.label.split(":")[0] ?? c.label;
        return (
          <span
            key={c.key}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-foreground"
          >
            <span className="truncate">{c.label}</span>
            <button
              type="button"
              onClick={() => onRemove(c.key)}
              aria-label={`Remover ${groupName}`}
              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="h-3 w-3" aria-hidden="true" />
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
              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      ))}

      {chips.length > 0 ? (
        <button
          type="button"
          onClick={onClearAll}
          className="cursor-pointer text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Limpar filtros
        </button>
      ) : null}

      {sortChips.length > 0 && onClearAllSort ? (
        <button
          type="button"
          onClick={onClearAllSort}
          className="cursor-pointer text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Limpar ordenação
        </button>
      ) : null}
    </div>
  );
}

export default AppliedFiltersChips;
