"use client";

import {
  SortableTable,
  type SortableColumn,
} from "@/components/ui/sortable-table";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils/format-time";
import type { PorEstadoRow } from "@/lib/chatwoot/queries/por-estado";

interface PorEstadoTableProps {
  rows: PorEstadoRow[];
}

function extractUf(inboxName: string): string {
  const match = inboxName.match(/^([A-Za-z]{2})\b/);
  if (match) return match[1]!.toUpperCase();
  return inboxName.slice(0, 2).toUpperCase();
}

/**
 * Tabela client de Por Estado. Recebe apenas dados serializáveis e
 * constrói as colunas (com `render` functions) localmente — necessário
 * porque o pai é Server Component e RSC proíbe passar funções a Client.
 */
export function PorEstadoTable({ rows }: PorEstadoTableProps) {
  const columns: SortableColumn<PorEstadoRow>[] = [
    {
      key: "inboxName",
      label: "Estado",
      sortable: true,
      align: "left",
      render: (row) => {
        const uf = extractUf(row.inboxName);
        return (
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="font-mono text-[11px]">
              {uf}
            </Badge>
            <span className="truncate text-sm font-medium">
              {row.inboxName}
            </span>
          </div>
        );
      },
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
      key: "topAgentName",
      label: "Top atendente",
      sortable: true,
      align: "left",
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.topAgentName ?? "—"}
        </span>
      ),
    },
    {
      key: "avgFirstResponseSec",
      label: "Tempo médio 1ª resposta",
      sortable: true,
      align: "right",
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {row.avgFirstResponseSec
            ? formatDuration(row.avgFirstResponseSec)
            : "—"}
        </span>
      ),
    },
  ];

  return (
    <SortableTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.inboxId}
      initialSort={{ key: "volume", direction: "desc" }}
      emptyMessage="Sem estados no período."
    />
  );
}
