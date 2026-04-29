import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { chatwootQuery } from "@/lib/chatwoot/pool";

export const metadata = { title: "SLA | Nexus Insights" };
export const dynamic = "force-dynamic";

const ACCOUNT_ID = 9;
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

function formatThreshold(value: string | null): string {
  if (!value) return "-";
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "-";
  // Chatwoot guarda em segundos.
  if (num < 3600) return `${Math.round(num / 60)}min`;
  if (num < 86400) {
    const h = Math.floor(num / 3600);
    const m = Math.round((num % 3600) / 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  return `${Math.floor(num / 86400)}d`;
}

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const policiesCountRows = await chatwootQuery<RowCount>(
    `SELECT COUNT(*)::bigint AS total FROM sla_policies WHERE account_id = $1`,
    [ACCOUNT_ID],
  );
  const policiesCount = Number(policiesCountRows[0]?.total ?? 0);

  if (policiesCount === 0) {
    return (
      <div>
        <PageHeader
          icon={Shield}
          title="SLA"
          subtitle="Cumprimento de acordos"
        />

        <div className="rounded-2xl border border-border bg-muted/20 p-12 flex flex-col items-center text-center max-w-2xl mx-auto">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600/10">
            <Shield className="h-16 w-16 text-violet-400/30" />
          </div>
          <h2 className="mt-6 text-lg font-semibold tracking-tight">
            Nenhuma política de SLA cadastrada
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhuma política de SLA cadastrada no Chatwoot. Crie políticas em
            Chatwoot → SLA Policies para começar a acompanhar cumprimento por
            aqui.
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

  // Há policies — busca lista + sumário simples de applied_slas.
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
      [ACCOUNT_ID],
    ),
    chatwootQuery<RowAppliedSummary>(
      `SELECT
          COUNT(*) FILTER (WHERE sla_status = 'hit')::bigint AS cumpridas,
          COUNT(*) FILTER (WHERE sla_status = 'missed')::bigint AS violadas,
          COUNT(*) FILTER (WHERE sla_status = 'active_with_misses')::bigint AS em_risco
        FROM applied_slas
        WHERE account_id = $1`,
      [ACCOUNT_ID],
    ).catch(() => [] as RowAppliedSummary[]),
  ]);

  const cumpridas = Number(summaryRows[0]?.cumpridas ?? 0);
  const violadas = Number(summaryRows[0]?.violadas ?? 0);
  const emRisco = Number(summaryRows[0]?.em_risco ?? 0);

  return (
    <div>
      <PageHeader
        icon={Shield}
        title="SLA"
        subtitle="Cumprimento de acordos"
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
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

      <div className="rounded-2xl border border-border bg-muted/30 p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold tracking-tight">
            Políticas de SLA
          </h2>
          <p className="text-xs text-muted-foreground">
            {policiesCount.toLocaleString("pt-BR")} política(s) cadastrada(s) no
            Chatwoot.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Nome</th>
                <th className="px-4 py-2 text-right font-medium">
                  1ª resposta
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  Próx. resposta
                </th>
                <th className="px-4 py-2 text-right font-medium">Resolução</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {policies.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">
                      {p.name ?? `Política #${p.id}`}
                    </div>
                    {p.description ? (
                      <div className="text-xs text-muted-foreground">
                        {p.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatThreshold(p.first_response_time_threshold)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatThreshold(p.next_response_time_threshold)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatThreshold(p.resolution_time_threshold)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
