"use client";

// ConversasPageClient — wrapper client da página /relatorios/conversas que
// host'a o estado compartilhado entre <AdvancedFilters> (toolbar) e
// <ConversasTable> (corpo). A página é Server Component e portanto não
// pode hostear state — esse client wrapper preenche essa lacuna sem
// transformar a page inteira em "use client".
//
// Estado cabeado:
//  - sortStack (persistido em localStorage) — bidirecional entre header
//    da tabela (click/shift+click) e <SortingDialog> do toolbar.
//  - quickFilters (transient) — Set<QuickFilterKey> que compõe AND com o
//    conditionGroup do modo Avançado em runtime.
//  - presetsApi — CRUD localStorage de FilterPresets.
//
// `conditionGroup` continua vivendo no FilterState (URL serializável); aqui
// nós apenas o roteamos do filterState (server) para a tabela como prop
// dedicada — fora do contrato de `ReportFilters`.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AdvancedFilters } from "@/components/reports/advanced-filters";
import { ConversasTable } from "@/components/reports/conversas-table";
import { ContentLoadingWrapper } from "@/components/reports/content-loading-wrapper";
import { PresetsDialog } from "@/components/reports/presets-dialog";
import type { SortRule } from "@/components/reports/sorting-dialog";
import type { FilterState } from "@/lib/reports/filter-state";
import { serializeFilterState } from "@/lib/reports/filter-state";
import { useLocalStorageState } from "@/lib/hooks/use-local-storage-state";
import {
  useFilterPresets,
  type FilterPreset,
} from "@/lib/hooks/use-filter-presets";
import {
  mergeConditionGroups,
  quickFiltersToConditionGroup,
  type QuickFilterKey,
} from "@/lib/reports/quick-filters";
import type { MetaItem } from "@/lib/chatwoot/queries/meta-cache";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import type { FetchConversasInput } from "@/lib/actions/reports/conversas";
import type { ConditionGroup } from "@/lib/utils/apply-conditions";

const STORAGE_SORT = "conversas-table-sort";

interface Props {
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  labels: MetaItem[];
  filterState: FilterState;
  accountId: number;
  initialRows: ConversaRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  reportFilters: FetchConversasInput["filters"];
  /**
   * Grupo de condições do modo Avançado dos filtros — vem do filterState
   * (URL → server). Roteado para a tabela onde é aplicado client-side.
   */
  conditionGroup?: ConditionGroup;
  /**
   * Mapping User Nexus → user Chatwoot. Quando null, atalho "Minhas" fica
   * oculto. Mapping definitivo virá em Configurações > Perfil (futuro).
   */
  currentChatwootUserId: number | null;
}

export function ConversasPageClient({
  inboxes,
  teams,
  assignees,
  labels,
  filterState,
  accountId,
  initialRows,
  total,
  page,
  pageSize,
  totalPages,
  reportFilters,
  conditionGroup,
  currentChatwootUserId,
}: Props) {
  const [sortStack, setSortStack] = useLocalStorageState<SortRule[]>(
    STORAGE_SORT,
    [],
  );

  // ---- Atalhos rápidos (transient) -----
  const [quickFilters, setQuickFilters] = useState<Set<QuickFilterKey>>(
    new Set(),
  );
  const toggleQuick = useCallback((k: QuickFilterKey) => {
    setQuickFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);
  const removeQuick = useCallback((k: QuickFilterKey) => {
    setQuickFilters((prev) => {
      if (!prev.has(k)) return prev;
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
  }, []);

  // Compõe o conditionGroup do modo Avançado com o ConditionGroup virtual
  // dos atalhos (AND). Só roda quando algo muda.
  const composedConditionGroup = useMemo(
    () =>
      mergeConditionGroups(
        conditionGroup,
        quickFiltersToConditionGroup(quickFilters, currentChatwootUserId),
      ) ?? undefined,
    [conditionGroup, quickFilters, currentChatwootUserId],
  );

  // ---- Presets de filtro -----
  const presetsApi = useFilterPresets();
  const [presetsDialogOpen, setPresetsDialogOpen] = useState(false);

  // ---- Row count atual da tabela (pra disable do <ExportButton>) -----
  // T7: inicializa com initialRows.length. T9 sobrepõe via callback
  // bidirecional `onRowCountChange` quando filtros client-side reduzirem.
  const [tableRowCount, setTableRowCount] = useState(initialRows.length);

  // ---- Paginação -----
  const router = useRouter();

  const handlePageChange = useCallback(
    (newPage: number) => {
      const next = { ...filterState, page: newPage > 1 ? newPage : undefined };
      const qs = serializeFilterState(next).toString();
      router.push(qs ? `?${qs}` : "?");
    },
    [filterState, router],
  );

  const handleApplyPreset = useCallback(
    (preset: FilterPreset) => {
      setSortStack(preset.sortStack);
    },
    [setSortStack],
  );

  return (
    <>
      <div data-tour="filters">
        <AdvancedFilters
          inboxes={inboxes}
          teams={teams}
          assignees={assignees}
          labels={labels}
          initial={filterState}
          accountId={accountId}
          sortStack={sortStack}
          onSortStackChange={setSortStack}
          quickFilters={quickFilters}
          onToggleQuick={toggleQuick}
          onRemoveQuick={removeQuick}
          currentChatwootUserId={currentChatwootUserId}
          presetsApi={presetsApi}
          onApplyPreset={handleApplyPreset}
          onOpenPresetsManager={() => setPresetsDialogOpen(true)}
          appliedReportFilters={reportFilters}
          tableRowCount={total}
        />
      </div>

      <ContentLoadingWrapper>
        <div data-tour="table">
          <ConversasTable
            initialRows={initialRows}
            total={total}
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            accountId={accountId}
            filters={reportFilters}
            sortStack={sortStack}
            onSortStackChange={setSortStack}
            conditionGroup={composedConditionGroup}
          />
        </div>
      </ContentLoadingWrapper>

      <PresetsDialog
        open={presetsDialogOpen}
        onOpenChange={setPresetsDialogOpen}
        presets={presetsApi.presets}
        onRename={presetsApi.rename}
        onRemove={presetsApi.remove}
        onApply={(p) => {
          handleApplyPreset(p);
          setPresetsDialogOpen(false);
        }}
        validateName={presetsApi.validateName}
      />
    </>
  );
}

export default ConversasPageClient;
