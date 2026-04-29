import { Smile, Star, MessageCircle, ExternalLink } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { chatwootQuery } from "@/lib/chatwoot/pool";

export const metadata = { title: "CSAT | Nexus Insights" };
export const dynamic = "force-dynamic";

const ACCOUNT_ID = 9;
const CSAT_DOCS_URL = "https://www.chatwoot.com/docs/product/features/csat";

interface RowSummary {
  total: string;
  avg: string | null;
}

interface RowDistribution {
  rating: number;
  total: string;
}

interface RowResponse {
  id: number;
  rating: number;
  feedback_message: string | null;
  created_at: Date;
  contact_name: string | null;
}

function formatDateTimePtBR(date: Date): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Resumo (count + avg). Sem cache — query barata.
  const summary = await chatwootQuery<RowSummary>(
    `SELECT COUNT(*)::bigint AS total, AVG(rating)::float AS avg
       FROM csat_survey_responses
      WHERE account_id = $1`,
    [ACCOUNT_ID],
  );
  const totalRespostas = Number(summary[0]?.total ?? 0);
  const avgRating = summary[0]?.avg ?? null;

  if (totalRespostas === 0) {
    return (
      <div>
        <PageHeader
          icon={Smile}
          title="CSAT"
          subtitle="Satisfação dos clientes"
        />

        <div className="rounded-2xl border border-border bg-muted/20 p-12 flex flex-col items-center text-center max-w-2xl mx-auto">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600/10">
            <Smile className="h-16 w-16 text-violet-400/30" />
          </div>
          <h2 className="mt-6 text-lg font-semibold tracking-tight">
            CSAT ainda não está em uso
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Habilite o CSAT (Customer Satisfaction Survey) no Chatwoot para que
            as respostas comecem a aparecer aqui automaticamente. Quando
            ativadas, você verá score médio, distribuição de notas e feedbacks
            recentes.
          </p>
          <a
            href={CSAT_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6"
          >
            <Button variant="outline" size="default">
              <ExternalLink />
              Documentação Chatwoot CSAT
            </Button>
          </a>
        </div>
      </div>
    );
  }

  // Há dados: monta distribuição (1..5) + últimas 10 respostas.
  const [distribution, latest] = await Promise.all([
    chatwootQuery<RowDistribution>(
      `SELECT rating, COUNT(*)::bigint AS total
         FROM csat_survey_responses
        WHERE account_id = $1
        GROUP BY rating
        ORDER BY rating ASC`,
      [ACCOUNT_ID],
    ),
    chatwootQuery<RowResponse>(
      `SELECT csr.id,
              csr.rating,
              csr.feedback_message,
              csr.created_at,
              ct.name AS contact_name
         FROM csat_survey_responses csr
         LEFT JOIN contacts ct ON ct.id = csr.contact_id
        WHERE csr.account_id = $1
        ORDER BY csr.created_at DESC
        LIMIT 10`,
      [ACCOUNT_ID],
    ),
  ]);

  const distMap = new Map<number, number>();
  for (const r of distribution) {
    distMap.set(Number(r.rating), Number(r.total));
  }
  const distFull = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    total: distMap.get(rating) ?? 0,
  }));
  const maxBucket = Math.max(...distFull.map((d) => d.total), 1);

  const avgFormatted =
    avgRating !== null && avgRating !== undefined
      ? Number(avgRating).toFixed(2)
      : "-";

  return (
    <div>
      <PageHeader icon={Smile} title="CSAT" subtitle="Satisfação dos clientes" />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <KpiCard
          icon={Star}
          label="Score médio"
          value={avgFormatted}
          hint="Escala 1 a 5"
        />
        <KpiCard
          icon={MessageCircle}
          label="Total de respostas"
          value={totalRespostas.toLocaleString("pt-BR")}
        />
      </div>

      <div className="mb-6 rounded-2xl border border-border bg-muted/30 p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold tracking-tight">
            Distribuição de notas
          </h2>
          <p className="text-xs text-muted-foreground">
            Quantidade de respostas por nota (1 a 5).
          </p>
        </div>
        <div className="space-y-2">
          {distFull.map((d) => {
            const pct = maxBucket > 0 ? (d.total / maxBucket) * 100 : 0;
            return (
              <div key={d.rating} className="flex items-center gap-3 text-sm">
                <span className="w-10 text-xs text-muted-foreground">
                  {d.rating} ★
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full bg-violet-500/70"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs font-medium tabular-nums">
                  {d.total.toLocaleString("pt-BR")}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold tracking-tight">
            Últimas respostas
          </h2>
          <p className="text-xs text-muted-foreground">
            10 mais recentes com feedback do cliente.
          </p>
        </div>
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
          {latest.map((r) => (
            <li key={r.id} className="bg-background/40 p-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-semibold text-violet-400">
                  {r.rating} ★
                </span>
                <span className="text-sm font-medium">
                  {r.contact_name ?? "(sem nome)"}
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {formatDateTimePtBR(r.created_at)}
                </span>
              </div>
              {r.feedback_message ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.feedback_message}
                </p>
              ) : (
                <p className="mt-1 text-xs italic text-muted-foreground/70">
                  (sem feedback escrito)
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
