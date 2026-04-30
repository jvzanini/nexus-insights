import { cn } from "@/lib/utils";

interface ConversaLabel {
  name: string;
  color?: string;
}

interface LabelsChipsProps {
  labels: ConversaLabel[];
  /**
   * Quantidade máxima de chips a mostrar antes de "+N".
   * Default `Infinity` (mostra todas).
   */
  max?: number;
  className?: string;
}

/**
 * Chips neutros para labels do Chatwoot. Sem cores semânticas — toda label
 * usa o mesmo tom muted para reduzir ruído visual.
 *
 * Por padrão exibe todas as labels (com `flex-wrap`). Se um cap explícito
 * for desejado, passe `max={N}` que o overflow vira `+M` com tooltip.
 */
export function LabelsChips({
  labels,
  max = Infinity,
  className,
}: LabelsChipsProps) {
  if (!labels?.length) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const visible = max === Infinity ? labels : labels.slice(0, max);
  const overflow = max === Infinity ? [] : labels.slice(max);
  const overflowTitle = overflow.map((l) => l.name).join(", ");

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {visible.map((label, idx) => (
        <span
          key={`${label.name}-${idx}`}
          title={label.name}
          className="inline-flex max-w-[140px] items-center rounded-full border border-border/40 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          <span className="truncate">{label.name}</span>
        </span>
      ))}
      {overflow.length > 0 ? (
        <span
          className="inline-flex items-center rounded-full border border-border/40 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
          title={overflowTitle}
        >
          +{overflow.length}
        </span>
      ) : null}
    </div>
  );
}
