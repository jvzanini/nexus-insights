import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
} from "lucide-react";

import { KpiCard } from "@/components/reports/kpi-card";
import { Button } from "@/components/ui/button";
import {
  SortableTable,
  type SortableColumn,
} from "@/components/ui/sortable-table";
import {
  InteractiveRadialBarChart,
  EmptyChartState,
} from "@/components/charts";
import { chatwootQuery } from "@/lib/chatwoot/pool";
import { CHART_COLORS } from "@/lib/charts/colors";

import type { DashboardContentProps } from "./types";

const SLA_DOCS_URL = "https://www.chatwoot.com/docs/product/features/sla";

interface RowCount {
  total: string;
}

interface RowPolicy {
  id: number;
  name: string | null;
  description: string | null;
  first_response_time_threshold: string | null;
  next_response_time_threshold: string | null;
  resolution_time_threshold: string | null;
  created_at: Date;
}

interface RowAppliedSummary {
  cumpridas: string;
  violadas: string;
  em_risco: string;
}

interface PolicyRow {
  id: number;
  name: string;
  description: string | null;
  first: number | null;
  next: number | null;
  resolution: number | null;
}

function thresholdSeconds(value: string | null): number | null {
  if (!value) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
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

export async function SlaContent({ accountId }: DashboardContentProps) {
  const policiesCountRows = await chatwootQuery<RowCount>(
    `SELECT COUNT(*)::bigint AS total FROM sla_policies WHERE account_id = $1`,
    [accountId],
  );
  const policiesCount = Number(policiesCountRows[0]?.total ?? 0);

  if (policiesCount === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">SLA</h2>
          <p className="text-xs text-muted-foreground">
            Cumprimento de acordos de atendimento.
          </p>
        </div>

        <div className="mx-auto flex max-w-2xl flex-col items-center rounded-2xl border border-border bg-muted/20 p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600/10">
            <Shield className="h-16 w-16 text-violet-400/30" />
          </div>
          <h3 className="mt-6 text-lg font-semibold tracking-tight">
            Nenhuma política de SLA cadastrada
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Crie políticas em Chatwoot → SLA Policies para começar a acompanhar
            cumprimento por aqui.
          </p>
          <a
            href={SLA_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6"
          >
            <Button variant="outline" size="default">
              <ExternalLink />
              Documentação Chatwoot SLA
            </Button>
          </a>
        </div>
      </div>
    );
  }

  const [policies, summaryRows] = await Promise.all([
    chatwootQuery<RowPolicy>(
      `SELECT id,
              name,
              description,
              first_response_time_threshold,
              next_response_time_threshold,
              resolution_time_threshold,
              created_at
         FROM sla_policies
        WHERE account_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [accountId],
    ),
    chatwootQuery<RowAppliedSummary>(
      `SELECT
          COUNT(*) FILTER (WHERE sla_status = 'hit')::bigint AS cumpridas,
          COUNT(*) FILTER (WHERE sla_status = 'missed')::bigint AS violadas,
          COUNT(*) FILTER (WHERE sla_status = 'active_with_misses')::bigint AS em_risco
        FROM applied_slas
        WHERE account_id = $1`,
      [accountId],
    ).catch(() => [] as RowAppliedSummary[]),
  ]);

  const cumpridas = Number(summaryRows[0]?.cumpridas ?? 0);
  const violadas = Number(summaryRows[0]?.violadas ?? 0);
  const emRisco = Number(summaryRows[0]?.em_risco ?? 0);
  const totalApplied = cumpridas + violadas + emRisco;
  const compliance = totalApplied > 0 ? (cumpridas / totalApplied) * 100 : 0;

  const policyRows: PolicyRow[] = policies.map((p) => ({
    id: p.id,
    name: p.name ?? `Política #${p.id}`,
    description: p.description,
    first: thresholdSeconds(p.first_response_time_threshold),
    next: thresholdSeconds(p.next_response_time_threshold),
    resolution: thresholdSeconds(p.resolution_time_threshold),
  }));

  const columns: SortableColumn<PolicyRow>[] = [
    {
      key: "name",
      label: "Nome",
      sortable: true,
      align: "left",
      render: (row) => (
        <div>
          <div className="font-medium">{row.name}</div>
          {row.description ? (
            <div className="text-xs text-muted-foreground">{row.description}</div>
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
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">SLA</h2>
        <p className="text-xs text-muted-foreground">
          Cumprimento de acordos de atendimento.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          icon={CheckCircle2}
          label="SLAs cumpridos"
          value={cumpridas.toLocaleString("pt-BR")}
          tone="success"
        />
        <KpiCard
          icon={AlertTriangle}
          label="SLAs violados"
          value={violadas.toLocaleString("pt-BR")}
          tone="danger"
        />
        <KpiCard
          icon={Clock}
          label="Em risco"
          value={emRisco.toLocaleString("pt-BR")}
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <div className="rounded-2xl border border-border bg-muted/30 p-5">
          <h3 className="mb-2 text-sm font-semibold tracking-tight">
            Compliance
          </h3>
          <p className="mb-4 text-xs text-muted-foreground">
            % de SLAs cumpridos no total aplicado.
          </p>
          {totalApplied === 0 ? (
            <EmptyChartState message="Sem SLAs aplicados ainda" height={200} />
          ) : (
            <div className="flex justify-center">
              <InteractiveRadialBarChart
                value={compliance}
                max={100}
                label="cumpridos"
                color={
                  compliance >= 90
                    ? CHART_COLORS.emerald
                    : compliance >= 70
                      ? CHART_COLORS.amber
                      : CHART_COLORS.red
                }
                size={200}
              />
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold tracking-tight">
              Políticas de SLA
            </h3>
            <p className="text-xs text-muted-foreground">
              {policiesCount.toLocaleString("pt-BR")} política(s) cadastrada(s)
              no Chatwoot.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/60">
            <SortableTable
              columns={columns}
              rows={policyRows}
              rowKey={(r) => r.id}
              initialSort={{ key: "name", direction: "asc" }}
              emptyMessage="Nenhuma política encontrada."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
