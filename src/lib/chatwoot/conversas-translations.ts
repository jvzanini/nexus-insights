// Mapeamento canônico de status/prioridade (Chatwoot ints) → texto pt-BR.
// Reaproveitado por SQL CASE (busca em filters.ts) e XLSX builder
// (conversas-xlsx.ts). Evita drift entre as duas representações.

export const STATUS_LABELS: Record<number, string> = {
  0: "Aberta",
  1: "Resolvida",
  2: "Pendente",
  3: "Snoozed",
};

export const PRIORITY_LABELS: Record<number, string> = {
  0: "Baixa",
  1: "Media",
  2: "Alta",
  3: "Urgente",
};

export function resolveStatusLabel(status: number | null | undefined): string {
  if (status == null) return "—";
  return STATUS_LABELS[status] ?? "—";
}

export function resolvePriorityLabel(
  priority: number | null | undefined,
): string {
  if (priority == null) return "—";
  return PRIORITY_LABELS[priority] ?? "—";
}
