import { cn } from "@/lib/utils";

/**
 * Mapeamento Chatwoot:
 *   0 = urgent, 1 = high, 2 = medium, 3 = low
 *
 * Visualmente seguimos a mesma família dos demais badges:
 * pill rounded-full + bg-color/15 + texto colorido.
 */
const PRIORITY_MAP: Record<number, { label: string; className: string }> = {
  0: { label: "Urgente", className: "bg-red-500/15 text-red-500" },
  1: { label: "Alta", className: "bg-orange-500/15 text-orange-500" },
  2: { label: "Média", className: "bg-amber-500/15 text-amber-500" },
  3: { label: "Baixa", className: "bg-slate-500/15 text-slate-400" },
};

interface PriorityBadgeProps {
  priority: number | null;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  if (priority === null || priority === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const meta = PRIORITY_MAP[priority];
  if (!meta) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
