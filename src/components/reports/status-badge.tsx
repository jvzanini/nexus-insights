import { cn } from "@/lib/utils";

const STATUS_MAP: Record<
  number,
  { label: string; className: string }
> = {
  // Status do enum Chatwoot — labels no feminino concordando com "conversa".
  0: { label: "Aberta", className: "bg-amber-500/15 text-amber-500" },
  1: { label: "Resolvida", className: "bg-sky-500/15 text-sky-500" },
  2: { label: "Pendente", className: "bg-violet-500/15 text-violet-500" },
  3: { label: "Adiada", className: "bg-slate-500/15 text-slate-400" },
};

export const STATUS_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Aberta" },
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
    className: "bg-slate-500/15 text-slate-400",
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
