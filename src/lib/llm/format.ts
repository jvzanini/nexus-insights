export function formatBrl4(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const rounded = Math.round(v * 1e4) / 1e4;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(rounded);
}

export function formatUsd4(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const rounded = Math.round(v * 1e4) / 1e4;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(rounded);
}
