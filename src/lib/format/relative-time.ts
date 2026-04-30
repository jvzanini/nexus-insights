//
// Formatador relativo CURTO (sem "cerca de"). Usado nas tabelas de drill-down
// do dashboard para evitar que arredondamentos do date-fns deem aparência
// de "fora de ordem" ("cerca de 1h" para item posterior a "cerca de 2h").

export function formatRelativeShort(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);

  if (sec < 60) return "agora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `há ${day}d`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return mon === 1 ? "há 1 mês" : `há ${mon} mês`;
  const yr = Math.floor(mon / 12);
  return yr === 1 ? "há 1 ano" : `há ${yr} anos`;
}
