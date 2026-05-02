"use client";

import { LabelsChips } from "@/components/reports/labels-chips";
import { formatPhone } from "@/lib/utils/format-phone";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const ATTR_CAP = 200;

interface Props {
  row: ConversaRow;
  /** Mantido na interface por retro-compat com chamadas existentes; não usado. */
  accountId?: number;
}

/**
 * ConversaDrillDown — painel inline com 3 seções (WhatsApp / Etiquetas /
 * Atributos). Cada seção é uma linha com rótulo à esquerda (min-w 100px)
 * e conteúdo flex-wrap à direita.
 *
 * v0.19 polish:
 * - border-l-2 violet/30 + bg-muted/20 (marker discreto sem inundar de cor).
 * - space-y-2.5 (mais respiro entre seções).
 * - motion-safe:animate-in fade-in 200ms (entrada suave do region inteiro).
 * - Sem ver-mais/recolher (sempre mostra todos até cap defensivo 200).
 * - Cap 200 com nota "+N atributos não exibidos" em caso patológico.
 */
export function ConversaDrillDown({ row }: Props) {
  const phone = row.contact.phone_number
    ? formatPhone(row.contact.phone_number) || row.contact.phone_number
    : null;

  const attrs = row.custom_attributes ?? {};
  const entries = Object.entries(attrs).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  const visible = entries.slice(0, ATTR_CAP);
  const overflow = Math.max(entries.length - ATTR_CAP, 0);

  return (
    <div
      role="region"
      aria-label={`Detalhes da conversa ${row.display_id}`}
      className="space-y-2.5 rounded-lg border-l-2 border-violet-500/30 bg-muted/20 px-4 py-3 text-[13px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
    >
      {/* WhatsApp */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="min-w-[100px] pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          WhatsApp
        </span>
        <span className="font-mono text-[14px] tabular-nums text-foreground">
          {phone ?? "—"}
        </span>
      </div>

      {/* Etiquetas */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-[100px] pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Etiquetas
        </span>
        {row.labels && row.labels.length > 0 ? (
          <LabelsChips labels={row.labels} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {/* Atributos */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-[100px] pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Atributos{" "}
          <span className="text-muted-foreground/70 tabular-nums">
            ({entries.length})
          </span>
        </span>
        {entries.length === 0 ? (
          <span className="text-muted-foreground">— sem atributos</span>
        ) : (
          <div className="inline-flex flex-wrap items-center gap-1.5">
            {visible.map(([k, v]) => {
              const raw =
                typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean"
                  ? String(v)
                  : JSON.stringify(v);
              return (
                <span
                  key={k}
                  className="inline-flex items-baseline gap-x-1 break-all rounded-md border border-border/40 bg-card/80 px-2 py-1"
                >
                  <span className="text-[11px] font-medium text-muted-foreground/80">
                    {k}:
                  </span>
                  <span className="text-[12px] text-foreground/90">{raw}</span>
                </span>
              );
            })}
            {overflow > 0 ? (
              <span className="ml-1 inline-flex items-center text-[11px] text-muted-foreground/70">
                +{overflow} atributos não exibidos
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default ConversaDrillDown;
