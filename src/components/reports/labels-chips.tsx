import { cn } from "@/lib/utils";

interface ConversaLabel {
  name: string;
  color?: string;
}

// Paleta determinística para labels — cor baseada em hash do nome
const LABEL_COLORS = [
  "#8b5cf6", // violet
  "#10b981", // emerald
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#22c55e", // green
];

function colorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return LABEL_COLORS[Math.abs(hash) % LABEL_COLORS.length];
}

interface LabelsChipsProps {
  labels: ConversaLabel[];
  /** Quantidade máxima de chips a mostrar inline antes de "+N". */
  max?: number;
  className?: string;
}

/**
 * Calcula luminância relativa (sRGB) de uma cor hex e devolve
 * cor de texto preto/branco com bom contraste.
 *
 * Mantemos o cálculo simples (não-gamma-corrigido) — suficiente
 * para discriminar texto sobre tons saturados típicos do Chatwoot.
 */
function getContrastColor(hex: string): string {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  if (value.length !== 6) return "#fff";
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "#fff";
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f2937" /* slate-800 */ : "#fff";
}

function isHex(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value);
}

export function LabelsChips({
  labels,
  max = 2,
  className,
}: LabelsChipsProps) {
  if (!labels?.length) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const visible = labels.slice(0, max);
  const overflow = labels.slice(max);
  const overflowTitle = overflow.map((l) => l.name).join(", ");

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {visible.map((label, idx) => {
        const bg = label.color && isHex(label.color) ? label.color : colorFromName(label.name);
        const fg = getContrastColor(bg);
        return (
          <span
            key={`${label.name}-${idx}`}
            className="inline-flex max-w-[120px] items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: bg, color: fg }}
            title={label.name}
          >
            <span className="truncate">{label.name}</span>
          </span>
        );
      })}
      {overflow.length > 0 ? (
        <span
          className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
          title={overflowTitle}
        >
          +{overflow.length}
        </span>
      ) : null}
    </div>
  );
}
