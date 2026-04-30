"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import { DonutWithCenter } from "@/components/charts";
import { CHART_COLORS } from "@/lib/charts/colors";
import { StatusBadge } from "@/components/reports/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DrillDownSection,
  DrillDownSkeleton,
} from "@/components/ui/drill-down-dialog";
import {
  getByTeamDrillDownAction,
  type DashboardPeriod,
} from "@/lib/actions/dashboard-drill-down";
import type { ByTeamDrillDownData } from "@/lib/chatwoot/queries/dashboard-drill-down";

interface Props {
  accountId: number;
  period: DashboardPeriod;
  teamId: number | null;
  enabled: boolean;
}

const STATUS_COLORS: Record<number, string> = {
  0: CHART_COLORS.amber,
  2: CHART_COLORS.violet,
  3: CHART_COLORS.slate,
};

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <p className="text-sm font-medium text-foreground">
        Não foi possível carregar os dados
      </p>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

export function TeamDrillDownContent({
  accountId,
  period,
  teamId,
  enabled,
}: Props) {
  const [data, setData] = useState<ByTeamDrillDownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      const res = await getByTeamDrillDownAction({
        accountId,
        period,
        teamId,
      });
      if (cancelled) return;
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error ?? "Erro desconhecido");
      }
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [accountId, period, teamId, enabled]);

  if (loading && !data) return <DrillDownSkeleton />;
  if (error && !data) return <ErrorState message={error} />;
  if (!data) return null;

  const donutData = data.byStatus
    .filter((s) => s.count > 0)
    .map((s) => ({
      name: s.label,
      value: s.count,
      color: STATUS_COLORS[s.status] ?? CHART_COLORS.slate,
    }));

  return (
    <div className="space-y-5">
      <DrillDownSection
        title="Distribuição por status"
        description={`${data.teamName} — ${data.total.toLocaleString("pt-BR")} conversas em aberto/pendente/adiado`}
      >
        <DonutWithCenter
          data={donutData}
          centerLabel="Total"
          centerValue={data.total.toLocaleString("pt-BR")}
          height={260}
          emptyMessage="Sem conversas no recorte"
        />
      </DrillDownSection>

      <DrillDownSection
        title={`Conversas (${data.items.length})`}
        description="Ordenadas por última atividade"
      >
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Última atividade
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Contato
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Inbox
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Atendente
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    Nenhuma conversa neste departamento no recorte.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="border-border/50 transition-colors hover:bg-accent/30"
                  >
                    <TableCell className="py-2.5 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.lastActivityAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell className="py-2.5 text-sm text-foreground">
                      {item.contactName ?? "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-sm text-muted-foreground">
                      {item.inboxName ?? "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-sm text-muted-foreground">
                      {item.assigneeName ?? "Sem atendente"}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <StatusBadge status={item.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DrillDownSection>
    </div>
  );
}
