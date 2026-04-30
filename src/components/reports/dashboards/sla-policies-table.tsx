"use client";

import {
  SortableTable,
  type SortableColumn,
} from "@/components/ui/sortable-table";

export interface SlaPolicyRow {
  id: number;
  name: string;
  description: string | null;
  first: number | null;
  next: number | null;
  resolution: number | null;
}

interface SlaPoliciesTableProps {
  rows: SlaPolicyRow[];
}

function formatThreshold(value: number | null): string {
  if (value === null) return "—";
  if (value < 3600) return `${Math.round(value / 60)}min`;
  if (value < 86400) {
    const h = Math.floor(value / 3600);
    const m = Math.round((value % 3600) / 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  return `${Math.floor(value / 86400)}d`;
}

/**
 * Tabela client de políticas de SLA. Recebe apenas dados serializáveis e
 * constrói as colunas (com `render` functions) localmente — necessário
 * porque o pai é Server Component e RSC proíbe passar funções a Client.
 */
export function SlaPoliciesTable({ rows }: SlaPoliciesTableProps) {
  const columns: SortableColumn<SlaPolicyRow>[] = [
    {
      key: "name",
      label: "Nome",
      sortable: true,
      align: "left",
      render: (row) => (
        <div>
          <div className="font-medium">{row.name}</div>
          {row.description ? (
            <div className="text-xs text-muted-foreground">
              {row.description}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "first",
      label: "1ª resposta",
      sortable: true,
      align: "right",
      render: (row) => (
        <span className="tabular-nums">{formatThreshold(row.first)}</span>
      ),
    },
    {
      key: "next",
      label: "Próx. resposta",
      sortable: true,
      align: "right",
      hideOnMobile: true,
      render: (row) => (
        <span className="tabular-nums">{formatThreshold(row.next)}</span>
      ),
    },
    {
      key: "resolution",
      label: "Resolução",
      sortable: true,
      align: "right",
      render: (row) => (
        <span className="tabular-nums">{formatThreshold(row.resolution)}</span>
      ),
    },
  ];

  return (
    <SortableTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      initialSort={{ key: "name", direction: "asc" }}
      emptyMessage="Nenhuma política encontrada."
    />
  );
}
