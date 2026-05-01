//
// Helpers de formatação de data/duração para charts e KPIs.
// - formatXAxisDate: rótulo curto pt-BR para eixo X (ex.: "30/ABR").
// - formatDuration: granularidade automática (ms / s / min / h).

const monthShortFmt = new Intl.DateTimeFormat("pt-BR", { month: "short" });

export function formatXAxisDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const m = monthShortFmt.format(d).replace(".", "").toUpperCase();
  return `${dd}/${m}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs > 0 ? `${m} min ${rs} s` : `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h} h ${rm} min` : `${h} h`;
}
