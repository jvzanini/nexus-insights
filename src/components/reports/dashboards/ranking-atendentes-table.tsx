"use client";

import {
  SortableTable,
  type SortableColumn,
} from "@/components/ui/sortable-table";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils/format-time";
import type { RankingAtendentesRow } from "@/lib/chatwoot/queries/ranking-atendentes";

interface RankingAtendentesTableProps {
  rows: RankingAtendentesRow[];
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Tabela client de Ranking de Atendentes. Recebe apenas dados serializáveis
 * e constrói as colunas (com `render` functions) localmente — necessário
 * porque o pai é Server Component e RSC proíbe passar funções a Client.
 */
export function RankingAtendentesTable({ rows }: RankingAtendentesTableProps) {
  const columns: SortableColumn<RankingAtendentesRow>[] = [
    {
      key: "name",
      label: "Atendente",
      sortable: true,
      align: "left",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600/15 text-xs font-semibold text-violet-300">
            {getInitials(row.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {row.name ?? `User ${row.userId}`}
            </p>
            {row.email ? (
              <p className="truncate text-xs text-muted-foreground">
                {row.email}
              </p>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "volume",
      label: "Volume",
      sortable: true,
      align: "right",
      render: (row) => (
        <Badge variant="secondary">{row.volume.toLocaleString("pt-BR")}</Badge>
      ),
    },
    {
      key: "resolved",
      label: "Resolvidas",
      sortable: true,
      align: "right",
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm font-medium tabular-nums">
          {row.resolved.toLocaleString("pt-BR")}
        </span>
      ),
    },
    {
      key: "p50FirstResponseSec",
      label: "p50 1ª resposta",
      sortable: true,
      align: "right",
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {row.p50FirstResponseSec
            ? formatDuration(row.p50FirstResponseSec)
            : "—"}
        </span>
      ),
    },
  ];

  return (
    <SortableTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.userId}
      initialSort={{ key: "volume", direction: "desc" }}
      emptyMessage="Sem atendentes no período."
    />
  );
}
