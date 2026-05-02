"use client";

import { DonutWithCenter } from "@/components/charts";
import { CHART_COLORS } from "@/lib/charts/colors";
import { formatDuration } from "@/lib/utils/format-time";
import type { NoResponseDrillDownItem } from "@/lib/chatwoot/queries/dashboard-drill-down";

interface WaitingBucketsDonutProps {
  items: NoResponseDrillDownItem[];
  total: number;
  oldestSeconds: number;
}

const HOUR = 3600;
const DAY = 24 * HOUR;

interface BucketDef {
  label: string;
  threshold: number; // upper bound exclusivo, em segundos
  color: string;
}

/**
 * 4 faixas de espera com gradação semântica de cor (yellow → red).
 *
 * `yellow` não existe em `CHART_COLORS` — uso `#fbbf24` (Tailwind yellow-400)
 * como fallback para manter a progressão perceptual amarelo→âmbar→laranja→vermelho.
 */
const BUCKETS: BucketDef[] = [
  { label: "0–4h", threshold: 4 * HOUR, color: "#fbbf24" },
  { label: "4–24h", threshold: DAY, color: CHART_COLORS.amber },
  { label: "1–3 dias", threshold: 3 * DAY, color: CHART_COLORS.orange },
  {
    label: "Mais de 3 dias",
    threshold: Number.POSITIVE_INFINITY,
    color: CHART_COLORS.red,
  },
];

/**
 * Donut com 4 buckets de tempo de espera, calculado client-side a partir de
 * `items[].waitingSeconds`.
 *
 * Reusa `<DonutWithCenter>` (charts genérico). Mostra total no centro e, se
 * houver, a maior espera abaixo do donut em texto âmbar (sinal de atenção).
 */
export function WaitingBucketsDonut({
  items,
  total,
  oldestSeconds,
}: WaitingBucketsDonutProps) {
  // bucketização (cap implícito: items vem com no máximo 100 do backend)
  const counts = BUCKETS.map((b) => ({ ...b, count: 0 }));
  for (const it of items) {
    const idx = counts.findIndex((c) => it.waitingSeconds < c.threshold);
    if (idx >= 0) counts[idx]!.count += 1;
  }

  const sumBuckets = counts.reduce((acc, c) => acc + c.count, 0);

  // Caso `total > 0` mas nenhum item foi bucketizado (ex.: items vazio mas
  // total agregado > 0), usa um placeholder cinza para que o `DonutWithCenter`
  // renderize o center value em vez de cair no EmptyChartState.
  const data =
    sumBuckets === 0 && total > 0
      ? [{ name: "—", value: 1, color: CHART_COLORS.slate }]
      : counts.map((c) => ({
          name: c.label,
          value: c.count,
          color: c.color,
        }));

  return (
    <div className="space-y-3">
      <DonutWithCenter
        data={data}
        centerLabel="aguardando"
        centerValue={total.toLocaleString("pt-BR")}
        height={260}
        emptyMessage="Nada na fila"
        showPercentInTooltip={false}
      />
      <ul
        className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs"
        aria-label="Faixas de espera"
      >
        {counts.map((bucket) => (
          <li
            key={bucket.label}
            className="flex items-center gap-2 text-muted-foreground"
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: bucket.color }}
            />
            <span className="flex-1 truncate">{bucket.label}</span>
            <span className="font-semibold tabular-nums text-foreground">
              {bucket.count}
            </span>
          </li>
        ))}
      </ul>
      {oldestSeconds > 0 ? (
        <p className="text-center text-xs text-amber-400">
          Mais antiga há{" "}
          <span className="font-semibold">{formatDuration(oldestSeconds)}</span>
        </p>
      ) : null}
    </div>
  );
}
