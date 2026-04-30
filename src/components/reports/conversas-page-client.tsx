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
//
// `conditionGroup` continua vivendo no FilterState (URL serializável); aqui
// nós apenas o roteamos do filterState (server) para a tabela como prop
// dedicada — fora do contrato de `ReportFilters`.

import { AdvancedFilters } from "@/components/reports/advanced-filters";
import { ConversasTable } from "@/components/reports/conversas-table";
import { ContentLoadingWrapper } from "@/components/reports/content-loading-wrapper";
import type { SortRule } from "@/components/reports/sorting-dialog";
import type { FilterState } from "@/lib/reports/filter-state";
import type { MetaItem } from "@/lib/chatwoot/queries/meta-cache";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import type { FetchConversasInput } from "@/lib/actions/reports/conversas";
import type { ConditionGroup } from "@/lib/utils/apply-conditions";
import { useLocalStorageState } from "@/lib/hooks/use-local-storage-state";

const STORAGE_SORT = "conversas-table-sort";

interface Props {
  inboxes: MetaItem[];
  teams: MetaItem[];
  assignees: MetaItem[];
  labels: MetaItem[];
  filterState: FilterState;
  accountId: number;
  initialRows: ConversaRow[];
  initialCursor: string | null;
  reportFilters: FetchConversasInput["filters"];
  /**
   * Grupo de condições do modo Avançado dos filtros — vem do filterState
   * (URL → server). Roteado para a tabela onde é aplicado client-side.
   */
  conditionGroup?: ConditionGroup;
}

export function ConversasPageClient({
  inboxes,
  teams,
  assignees,
  labels,
  filterState,
  accountId,
  initialRows,
  initialCursor,
  reportFilters,
  conditionGroup,
}: Props) {
  const [sortStack, setSortStack] = useLocalStorageState<SortRule[]>(
    STORAGE_SORT,
    [],
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
        />
      </div>

      <ContentLoadingWrapper>
        <div data-tour="table">
          <ConversasTable
            initialRows={initialRows}
            initialCursor={initialCursor}
            accountId={accountId}
            filters={reportFilters}
            sortStack={sortStack}
            onSortStackChange={setSortStack}
            conditionGroup={conditionGroup}
          />
        </div>
      </ContentLoadingWrapper>
    </>
  );
}

export default ConversasPageClient;
