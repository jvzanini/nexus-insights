import { cn } from "@/lib/utils";

const STATUS_MAP: Record<
  number,
  { label: string; className: string }
> = {
  0: { label: "Em aberto", className: "bg-amber-500/15 text-amber-500" },
  1: { label: "Resolvida", className: "bg-emerald-500/15 text-emerald-500" },
  2: { label: "Pendente", className: "bg-violet-500/15 text-violet-500" },
  3: { label: "Adiada", className: "bg-zinc-500/15 text-zinc-400" },
};

export const STATUS_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Em aberto" },
  { value: 1, label: "Resolvida" },
  { value: 2, label: "Pendente" },
  { value: 3, label: "Adiada" },
];

interface StatusBadgeProps {
  status: number;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const meta = STATUS_MAP[status] ?? {
    label: "—",
    className: "bg-zinc-500/15 text-zinc-400",
  };
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
