/**
 * StatusChip — chip visual padrão para o status de um perfil Power BI.
 *
 * Mapping:
 * - active   → violet 500/15  + violet 600 + CheckCircle  + "Ativo"
 * - disabled → zinc   500/10  + zinc   500 + PauseCircle  + "Desativado"
 * - error    → red    500/10  + red    600 + AlertCircle  + "Erro"
 */

import { AlertCircle, CheckCircle, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type IntegrationProfileStatus = "active" | "disabled" | "error";

interface Props {
  status: IntegrationProfileStatus;
  className?: string;
}

const CONFIG: Record<
  IntegrationProfileStatus,
  {
    label: string;
    Icon: typeof CheckCircle;
    classes: string;
  }
> = {
  active: {
    label: "Ativo",
    Icon: CheckCircle,
    classes:
      "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  },
  disabled: {
    label: "Desativado",
    Icon: PauseCircle,
    classes:
      "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  },
  error: {
    label: "Erro",
    Icon: AlertCircle,
    classes:
      "bg-red-500/10 text-red-600 dark:text-red-400",
  },
};

export function StatusChip({ status, className }: Props) {
  const c = CONFIG[status];
  const Icon = c.Icon;
  return (
    <span
      data-status={status}
      data-testid="status-chip"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        c.classes,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {c.label}
    </span>
  );
}
