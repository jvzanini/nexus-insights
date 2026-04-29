"use client";

const DOW_LABEL = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export interface HeatmapCell {
  dow: number;
  hour: number;
  total: number;
}

interface HeatmapProps {
  data: HeatmapCell[];
}

export function Heatmap({ data }: HeatmapProps) {
  // Normalizamos pelo máximo para gerar opacidade entre 0.05 e 1.
  const max = data.reduce((acc, c) => Math.max(acc, c.total), 0);
  const map = new Map<string, number>();
  for (const c of data) {
    map.set(`${c.dow}-${c.hour}`, c.total);
  }

  const rows = [0, 1, 2, 3, 4, 5, 6];
  const cols = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Header com horas */}
        <div className="flex items-center gap-px pb-1 pl-10">
          {cols.map((h) => (
            <div
              key={h}
              className="w-6 text-center text-[10px] text-muted-foreground"
            >
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
        </div>

        {rows.map((dow) => (
          <div key={dow} className="flex items-center gap-px py-px">
            <div className="w-10 text-right pr-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              {DOW_LABEL[dow]}
            </div>
            {cols.map((hour) => {
              const total = map.get(`${dow}-${hour}`) ?? 0;
              const ratio = max > 0 ? total / max : 0;
              const opacity = total > 0 ? Math.max(0.08, ratio) : 0;
              return (
                <div
                  key={hour}
                  title={`${DOW_LABEL[dow]} ${String(hour).padStart(2, "0")}h: ${total.toLocaleString("pt-BR")} conversa(s)`}
                  className="h-6 w-6 rounded-sm border border-border/40"
                  style={{
                    backgroundColor:
                      total > 0
                        ? `rgba(124, 58, 237, ${opacity.toFixed(3)})`
                        : "rgba(124, 58, 237, 0.04)",
                  }}
                />
              );
            })}
          </div>
        ))}

        <div className="mt-3 flex items-center justify-end gap-2 pr-1 text-[10px] text-muted-foreground">
          <span>menos</span>
          {[0.1, 0.25, 0.5, 0.75, 1].map((o) => (
            <div
              key={o}
              className="h-3 w-3 rounded-sm border border-border/40"
              style={{ backgroundColor: `rgba(124, 58, 237, ${o})` }}
            />
          ))}
          <span>mais</span>
        </div>
      </div>
    </div>
  );
}
